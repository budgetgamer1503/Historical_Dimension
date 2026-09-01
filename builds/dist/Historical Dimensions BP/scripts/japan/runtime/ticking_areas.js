import { system, world } from "@minecraft/server";
import { tickingChunkCount } from "../generation/ticking_capacity.js";
import { ManagedTickingAreaUnavailableError } from "./ticking_area_errors.js";

let acquisitionTail = Promise.resolve();
let travelAcquisitionWaiters = 0;
let acquisitionSerial = 0;

function physicalTickingAreaId(logicalId) {
    acquisitionSerial = (acquisitionSerial + 1) >>> 0;
    const safe = String(logicalId ?? "historyjam_area").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 36);
    return `${safe}_${system.currentTick.toString(36)}_${acquisitionSerial.toString(36)}`;
}

function delayTicks(ticks) {
    return new Promise(resolve => system.runTimeout(resolve, Math.max(1, ticks)));
}

async function withAcquisitionLock(work) {
    const previous = acquisitionTail;
    let release;
    acquisitionTail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
        return await work();
    }
    finally {
        release();
    }
}

function boundsAreLoaded(dimension, from, to) {
    const minChunkX = Math.floor(Math.min(from.x, to.x) / 16);
    const maxChunkX = Math.floor(Math.max(from.x, to.x) / 16);
    const minChunkZ = Math.floor(Math.min(from.z, to.z) / 16);
    const maxChunkZ = Math.floor(Math.max(from.z, to.z) / 16);
    const y = Math.floor((from.y + to.y) / 2);
    for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++)
        for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++)
            if (!dimension.isChunkLoaded({ x: chunkX * 16 + 8, y, z: chunkZ * 16 + 8 }))
                return false;
    return true;
}

function isUnloadedChunkError(error) {
    const text = String(error).toLowerCase();
    return text.includes("unloaded") || text.includes("locationinunloadedchunk");
}

async function removeArea(manager, id) {
    await withAcquisitionLock(() => {
        if (manager.hasTickingArea(id))
            manager.removeTickingArea(id);
    });
}

function capacitySnapshot(manager, requestedChunks) {
    return {
        requestedChunks,
        chunkCount: manager.chunkCount,
        maxChunkCount: manager.maxChunkCount,
    };
}

function loadedArea(manager, id) {
    try {
        return manager.getTickingArea(id);
    }
    catch {
        return undefined;
    }
}

function cleanupLateCreate(manager, id, promise) {
    void promise.then(
        () => removeArea(manager, id).catch(() => {}),
        () => removeArea(manager, id).catch(() => {}),
    );
}

async function waitForCreateOrLoaded(manager, id, createPromise, loadTimeoutTicks) {
    const timeoutTicks = Math.max(1, Math.floor(loadTimeoutTicks));
    const createOutcome = createPromise.then(
        () => ({ kind: "loaded" }),
        error => ({ kind: "error", error }),
    );
    let waited = 0;
    while (waited < timeoutTicks) {
        if (loadedArea(manager, id)?.isFullyLoaded)
            return { kind: "loaded" };
        const slice = Math.min(2, timeoutTicks - waited);
        const outcome = await Promise.race([
            createOutcome,
            system.waitTicks(slice).then(() => ({ kind: "tick" })),
        ]);
        if (outcome.kind !== "tick")
            return outcome;
        waited += slice;
    }
    if (loadedArea(manager, id)?.isFullyLoaded)
        return { kind: "loaded" };
    return { kind: "timeout" };
}

/**
 * Single-attempt background acquisition. A capacity shortage or a chunk-load
 * timeout is returned as a deferral rather than converted into a fatal error,
 * so callers can keep the terrain region queued and retry later.
 */
export async function tryAcquireManagedTickingArea(options) {
    const {
        id, dimension, from, to,
        checkCancelled = () => {},
        priority = "normal",
        loadTimeoutTicks = priority === "travel" ? 80 : 200,
    } = options;
    const manager = world.tickingAreaManager;
    const physicalId = physicalTickingAreaId(id);
    const requestedChunks = tickingChunkCount(from, to);
    const travelPriority = priority === "travel";
    const reportedMaximum = Math.max(0, Number(manager.maxChunkCount) || 0);
    if (reportedMaximum > 0 && requestedChunks > reportedMaximum) {
        return {
            acquired: false,
            reason: "area_too_large",
            ...capacitySnapshot(manager, requestedChunks),
        };
    }
    if (travelPriority)
        travelAcquisitionWaiters++;
    try {
        checkCancelled();

        // Serialize only the atomic capacity-check/create START. Do not hold the
        // global lock while createTickingArea awaits chunk loading: Microsoft Learn
        // documents that this Promise resolves only after every chunk is loaded and
        // ticking, which can span many ticks. Holding the lock across that wait can
        // otherwise block a priority travel request behind a slow background load.
        const start = await withAcquisitionLock(() => {
            checkCancelled();
            if (!travelPriority && travelAcquisitionWaiters > 0) {
                return {
                    acquired: false,
                    reason: "travel_waiting",
                    ...capacitySnapshot(manager, requestedChunks),
                };
            }
            if (manager.hasTickingArea(physicalId))
                manager.removeTickingArea(physicalId);
            const areaOptions = { dimension, from, to };
            if (!manager.hasCapacity(areaOptions)) {
                return {
                    acquired: false,
                    reason: "capacity",
                    ...capacitySnapshot(manager, requestedChunks),
                };
            }
            try {
                return {
                    createPromise: manager.createTickingArea(physicalId, areaOptions),
                    areaOptions,
                };
            }
            catch (error) {
                if (manager.hasTickingArea(physicalId))
                    manager.removeTickingArea(physicalId);
                throw error;
            }
        });

        if (!start.createPromise)
            return start;

        const createPromise = Promise.resolve(start.createPromise);
        const outcome = await waitForCreateOrLoaded(manager, physicalId, createPromise, loadTimeoutTicks);

        if (outcome.kind === "error") {
            await removeArea(manager, physicalId);
            throw outcome.error;
        }

        if (outcome.kind === "timeout") {
            const area = loadedArea(manager, physicalId);
            // isFullyLoaded is the documented direct state check. If the manager
            // says the area is already fully loaded, the Promise lag itself must
            // not block terrain/travel progress.
            if (!area?.isFullyLoaded) {
                await removeArea(manager, physicalId);
                cleanupLateCreate(manager, physicalId, createPromise);
                return {
                    acquired: false,
                    reason: "load_timeout",
                    ...capacitySnapshot(manager, requestedChunks),
                };
            }
        }

        let released = false;
        const release = async () => {
            if (released)
                return;
            released = true;
            await removeArea(manager, physicalId);
        };
        return {
            acquired: true,
            release,
            ...capacitySnapshot(manager, requestedChunks),
        };
    }
    finally {
        if (travelPriority)
            travelAcquisitionWaiters = Math.max(0, travelAcquisitionWaiters - 1);
    }
}

export async function acquireManagedTickingArea(options) {
    const {
        id,
        maxAttempts = 8,
        retryDelayTicks = 4,
        checkCancelled = () => {},
        onRetry = () => {},
    } = options;
    let lastError;
    let lastUnavailable;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        checkCancelled();
        try {
            const result = await tryAcquireManagedTickingArea(options);
            if (result.acquired)
                return result.release;
            lastUnavailable = result;
            lastError = new Error(`insufficient ticking-area capacity (${result.reason}): requested=${result.requestedChunks} active=${result.chunkCount} max=${result.maxChunkCount}`);
        }
        catch (error) {
            lastError = error;
            if (error?.reason === "OverChunkLimit") {
                lastUnavailable = {
                    reason: "capacity",
                    requestedChunks: tickingChunkCount(options.from, options.to),
                    chunkCount: world.tickingAreaManager.chunkCount,
                    maxChunkCount: world.tickingAreaManager.maxChunkCount,
                };
            }
        }
        onRetry(lastError, attempt);
        if (attempt < maxAttempts)
            await delayTicks(Math.min(60, retryDelayTicks * attempt));
    }
    if (lastUnavailable && ["capacity", "load_timeout", "travel_waiting"].includes(lastUnavailable.reason))
        throw new ManagedTickingAreaUnavailableError(lastUnavailable.reason, lastUnavailable, lastError);
    throw new Error(`Ticking area ${id} unavailable after ${maxAttempts} attempts: ${String(lastError)}`);
}

export function tickingAreaCapacitySnapshot() {
    const manager = world.tickingAreaManager;
    return { chunkCount: manager.chunkCount, maxChunkCount: manager.maxChunkCount };
}

export function canPreloadTickingArea(dimension, from, to) {
    const manager = world.tickingAreaManager;
    const requestedChunks = tickingChunkCount(from, to);
    const reportedMaximum = Math.max(0, Number(manager.maxChunkCount) || 0);
    if (reportedMaximum > 0 && requestedChunks > reportedMaximum)
        return { canPreload: false, requestedChunks, chunkCount: manager.chunkCount, maxChunkCount: manager.maxChunkCount };
    const canPreload = manager.hasCapacity({ dimension, from, to });
    return { canPreload, requestedChunks, chunkCount: manager.chunkCount, maxChunkCount: manager.maxChunkCount };
}

export async function clearManagedTickingAreas() {
    await withAcquisitionLock(() => {
        world.tickingAreaManager.removeAllTickingAreas();
    });
}

export async function withManagedTickingArea(options, work) {
    const release = await acquireManagedTickingArea(options);
    try {
        return await work();
    }
    finally {
        await release();
    }
}

export async function withLoadedChunksOrTickingArea(options, work) {
    if (boundsAreLoaded(options.dimension, options.from, options.to)) {
        try {
            return await work();
        }
        catch (error) {
            if (!isUnloadedChunkError(error))
                throw error;
        }
    }
    return withManagedTickingArea(options, work);
}
