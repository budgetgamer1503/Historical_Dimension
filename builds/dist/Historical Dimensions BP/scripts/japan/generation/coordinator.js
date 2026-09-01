import { system, world } from "@minecraft/server";
import { ACTIVE_CELL_COUNT, ACTIVE_CELL_MAX_X, ACTIVE_CELL_MAX_Z, ACTIVE_CELL_MIN_X, ACTIVE_CELL_MIN_Z, BRIDGE_STRUCTURE_VERSION, CELL_SIZE, DIMENSION_ID, DYNAMIC, ENTRY_BOOTSTRAP_VERSION, GRID_SIZE } from "../config.js";
import { broadcast, logError, logInfo } from "../diagnostics/logging.js";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import { STRUCTURE_COUNT, STRUCTURE_PLACEMENTS, requiredStructureLedgersComplete, validateLayout } from "../structures/layout.js";
import { blendStructureTerrain, placeStructure, prepareStructureFootprint, verifyStructurePlacement } from "../structures/placement.js";
import { ensureVillageVillagers } from "../structures/village_villagers.js";
import { ensureBanditFortBandits, isBanditFortPlacement } from "../structures/bandit_forts.js";
import { resolvePackStructures } from "../structures/registry.js";
import { ensureBaseState, getBoolean, getNumber, getPreviousTerrainOrigin, getStage, getString, getTerrainOrigin, resetTerrainGeneration, setFailure, setStage, setValue, writeJson, } from "../state/dynamic_properties.js";
import { JobGuard } from "../state/job_guard.js";
import { nextTerrainOrigin } from "../state/migrations.js";
import { GenerationStage } from "../state/state_machine.js";
import { encodeStringLedger, parseStringLedger } from "../state/string_ledger.js";
import { buildArrival, verifyArrival } from "./arrival_runtime.js";
import { CellLedger } from "./cell_ledger.js";
import { buildArrivalCellOrder, buildArrivalDistrictCellOrder, buildArrivalForestCellOrder, buildFullCellOrder, buildPriorityCellOrder, buildWaterSafeDryOrder, filterFocusPointsToActiveTerrain } from "./cell_order.js";
import { cellWorldOrigin, generateDryLandscapeCell, generateVegetationCell, generateWaterCell } from "./runtime_generation.js";
import { generateStructureTreePlan, placeStructureTreePlan, resolveTreeStructures, treePlanWorldBounds } from "./tree_structures.js";
import { terrainDependencyCellsForTreePlan } from "./tree_planning.js";
import { planPondsForCell } from "./pond_planning.js";
import { placePondPlan, resolvePondStructure } from "./pond_structures.js";
import { removeLegacyProceduralTreesCell } from "./legacy_tree_cleanup.js";
import { buildRoadNetworkIncremental, restoreRoadNetworkPlan, serializeRoadNetworkPlan } from "./road_network.js";
import { bridgePlacementSpec, bridgeTerrainCells, cleanupLegacyProceduralBridge, placeAuthoredBridge, prepareAuthoredBridgeApproaches, resolveBridgeStructure, verifyAuthoredBridge } from "./bridge_structures.js";
import { AUTHORED_BRIDGE_SEGMENT_ID } from "./bridge_geometry.js";
import { generationChunkBudget, partitionCellGroups, tickingChunkCount } from "./ticking_capacity.js";
import { canPreloadTickingArea, tickingAreaCapacitySnapshot, tryAcquireManagedTickingArea, withLoadedChunksOrTickingArea } from "../runtime/ticking_areas.js";
import { isManagedTickingAreaUnavailable } from "../runtime/ticking_area_errors.js";
import { BLOCKS } from "../runtime/blocks.js";
import { terrainHeight } from "./terrain.js";
import { coreBootstrapRequired, entryTileSampleOffsets, groundVerificationRange, isGroundLikeBlock } from "./entry_verification.js";
import { isInsideProtectedStructure } from "../structures/protected_volumes.js";
import { BOSS_ROAD_ANCHORS } from "../boss/catalog.js";
import { GenerationDemandTracker } from "./generation_demand.js";
import { buildTieredTerrainQueue, connectedTerrainFrontier, removeQueuedCell, requeueTerrainCell, selectNextTerrainCell, shouldPipelinePreload } from "./background_queue.js";
import { markDimensionReady, setDimensionProgress } from "../../dimension/preparationProgress.js";
const guard = new JobGuard();
let activeReject;
let cancelRequested = false;
let pendingReset;
let lastMetricsPersistTick = -1000;
let lastMetricsLogTick = -2000;
let scheduledResume;
let healthMonitor;
let resumeAfterFinish = false;
let resumeDelayAfterFinish = 40;
let travelPauseDepth = 0;
let activeGenerationMode = "idle";
let cancelReason = "Terrain generation cancelled";
let entryReadyThisSession = false;
const generationDemand = new GenerationDemandTracker(40);
const HEALTH_MONITOR_INTERVAL_TICKS = 40;
const ROAD_DESTINATIONS = Object.freeze([
    ...STRUCTURE_PLACEMENTS,
    ...BOSS_ROAD_ANCHORS,
]);
function sengokuPlayers() {
    try {
        return world.getDimension(DIMENSION_ID).getPlayers();
    }
    catch {
        return [];
    }
}
function hasSengokuPlayers() {
    return sengokuPlayers().length > 0;
}
function throwIfBackgroundDemandGone() {
    if (activeGenerationMode !== "background")
        return;
    if (travelPauseDepth > 0)
        throw new GenerationCancelledError("Background terrain generation paused at a safe terrain boundary for player travel");
    if (!hasSengokuPlayers())
        throw new GenerationCancelledError("Background terrain generation paused because no players are currently in Sengoku");
}
class GenerationCancelledError extends Error {
    constructor(message) { super(message); this.name = "GenerationCancelledError"; }
}
class GenerationDeferredError extends Error {
    constructor(message, retryTicks = 20) { super(message); this.name = "GenerationDeferredError"; this.retryTicks = retryTicks; }
}
function seedFromWorld() {
    let hash = 2166136261;
    for (const character of String(world.seed)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function throwIfCancelled() {
    if (cancelRequested)
        throw new GenerationCancelledError(cancelReason);
}
function runGenerator(generator) {
    throwIfCancelled();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
            if (settled)
                return;
            settled = true;
            activeReject = undefined;
            guard.clearRunJob("generation");
            if (error === undefined)
                resolve(value);
            else
                reject(error);
        };
        function* wrapped() {
            try {
                while (true) {
                    throwIfCancelled();
                    const step = generator.next();
                    if (step.done) {
                        finish(undefined, step.value);
                        return;
                    }
                    yield;
                }
            }
            catch (error) {
                finish(error);
            }
        }
        activeReject = (error) => finish(error);
        try {
            const handle = system.runJob(wrapped());
            guard.attachRunJob("generation", handle);
        }
        catch (error) {
            finish(error);
        }
    });
}
function cancelActiveRunJob(reason) {
    cancelRequested = true;
    cancelReason = reason;
    const handle = guard.runJobHandle;
    if (handle !== undefined) {
        try {
            system.clearJob(handle);
        }
        catch (error) {
            logError("clear-generation-job", error);
        }
        guard.clearRunJob("generation");
    }
    activeReject?.(new GenerationCancelledError(reason));
}
function isEngineInterruption(error) { const text = String(error).toLowerCase(); return text.includes("internalerror: interrupted") || text === "interrupted" || text.includes("script interrupted"); }
function isUnloadedError(error) {
    const text = String(error).toLowerCase();
    return text.includes("unloaded") || text.includes("chunk") || text.includes("locationinunloadedchunk");
}
function capacitySafeCellGroups(group, origin, margin, minY, maxY) {
    const manager = world.tickingAreaManager;
    const budget = generationChunkBudget(manager.maxChunkCount, terrainMetrics.tickingChunkReserve, 4);
    return partitionCellGroups(group, cells => batchBounds(cells, origin, margin, minY, maxY), budget)
        .map(item => ({ core: item.cells, bounds: item.bounds, chunks: item.chunks }));
}
async function withTickingArea(id, dimension, from, to, work, priority = "normal") {
    try {
        const loadTimeoutTicks = priority === "travel" ? 120 : 200;
        return await withLoadedChunksOrTickingArea({
            id, dimension, from, to,
            priority,
            loadTimeoutTicks,
            maxAttempts: 8,
            retryDelayTicks: 5,
            checkCancelled: throwIfCancelled,
            onRetry: error => terrainMetrics.recordRetry(isUnloadedError(error)),
        }, work);
    }
    catch (error) {
        if (isManagedTickingAreaUnavailable(error))
            throw new GenerationDeferredError(`Ticking-area capacity deferred ${id} (${error.reason})`, 40);
        throw error;
    }
}
function loadLedger(key) {
    const raw = getString(key);
    return raw ? CellLedger.decode(GRID_SIZE, GRID_SIZE, raw) : new CellLedger(GRID_SIZE, GRID_SIZE);
}
function saveLedger(key, ledger) { setValue(key, ledger.encode()); }
function nameLedger(key) { try {
    return parseStringLedger(getString(key) || undefined);
}
catch (error) {
    throw new Error(`Dynamic-property corruption in ${key}: ${String(error)}`);
} }
function saveNameLedger(key, values) { setValue(key, encodeStringLedger(values)); }
async function ensureReadyAuthoredBridges(dimension, plan, origin, terrainReady, seed) {
    if (!Array.isArray(plan?.bridges) || plan.bridges.length === 0)
        return;
    const authoredBridges = plan.bridges.filter(bridge => bridge.segmentId === AUTHORED_BRIDGE_SEGMENT_ID);
    if (authoredBridges.length === 0)
        return;
    const storedVersion = getNumber(DYNAMIC.bridgeStructureVersion, 0);
    if (storedVersion !== BRIDGE_STRUCTURE_VERSION) {
        setValue(DYNAMIC.bridgeStructureLedger, undefined);
        setValue(DYNAMIC.bridgeStructureVersion, BRIDGE_STRUCTURE_VERSION);
    }
    const placed = nameLedger(DYNAMIC.bridgeStructureLedger);
    const resolvedBridge = resolveBridgeStructure();
    if (!resolvedBridge)
        throw new Error(`Required authored bridge structure ${BRIDGE_STRUCTURE_VERSION} is unavailable`);
    let areaIndex = 0;
    for (const bridge of authoredBridges) {
        if (placed.has(bridge.id))
            continue;
        const spec = bridgePlacementSpec(bridge, origin);
        const dependencies = bridgeTerrainCells(spec);
        if (!dependencies.every(cell => terrainReady.isComplete(cell.x, cell.z)))
            continue;
        const id = `historyjam_sengoku_bridge_${areaIndex++}`;
        await withTickingArea(
            id,
            dimension,
            { x: spec.bounds.min.x - 3, y: Math.max(-64, spec.bounds.min.y - 8), z: spec.bounds.min.z - 3 },
            { x: spec.bounds.max.x + 3, y: Math.min(319, spec.bounds.max.y + 8), z: spec.bounds.max.z + 3 },
            async () => {
                if (verifyAuthoredBridge(dimension, spec))
                    return;
                await runGenerator(cleanupLegacyProceduralBridge(dimension, bridge, origin));
                await runGenerator(prepareAuthoredBridgeApproaches(dimension, spec));
                placeAuthoredBridge(dimension, resolvedBridge, spec, seed);
                if (!verifyAuthoredBridge(dimension, spec))
                    throw new Error(`Authored bridge verification failed for ${bridge.id}`);
            },
        );
        placed.add(bridge.id);
        saveNameLedger(DYNAMIC.bridgeStructureLedger, placed);
        logInfo(`Placed authored medieval bridge ${bridge.id} at ${spec.location.x},${spec.location.y},${spec.location.z} rotation=${spec.rotation}`);
    }
}
function regionACells(order) {
    return order.filter(cell => {
        const localX = -512 + cell.x * CELL_SIZE + CELL_SIZE / 2, localZ = -512 + cell.z * CELL_SIZE + CELL_SIZE / 2;
        return !(localX < -125 && localZ < -95) && !(localX > 155 && localZ < -95);
    });
}
function cellBatchKey(cell, span) { return `${Math.floor(cell.x / span)},${Math.floor(cell.z / span)}`; }
function buildCellBatches(order, include) {
    const span = terrainMetrics.cellBatchSpan;
    const batches = new Map();
    for (const cell of order) {
        if (!include(cell))
            continue;
        const key = cellBatchKey(cell, span);
        const batch = batches.get(key) ?? [];
        batch.push(cell);
        batches.set(key, batch);
    }
    return [...batches.values()];
}
function batchBounds(batch, origin, margin, minY, maxY) {
    let minX = Number.POSITIVE_INFINITY, minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY;
    for (const cell of batch) {
        const cellOrigin = cellWorldOrigin(cell.x, cell.z, origin);
        minX = Math.min(minX, cellOrigin.x);
        minZ = Math.min(minZ, cellOrigin.z);
        maxX = Math.max(maxX, cellOrigin.x + CELL_SIZE - 1);
        maxZ = Math.max(maxZ, cellOrigin.z + CELL_SIZE - 1);
    }
    return { from: { x: minX - margin, y: minY, z: minZ - margin }, to: { x: maxX + margin, y: maxY, z: maxZ + margin } };
}
function* generateDryBatch(dimension, batch, seed, plan, origin, complete) {
    for (const cell of batch) {
        terrainMetrics.beginCell(`dry:${cell.x},${cell.z}`);
        yield* generateDryLandscapeCell(dimension, cell.x, cell.z, seed, plan, origin);
        complete(cell);
        yield;
    }
}
function* generateWaterBatch(dimension, batch, seed, plan, origin, complete) {
    for (const cell of batch) {
        terrainMetrics.beginCell(`water:${cell.x},${cell.z}`);
        yield* generateWaterCell(dimension, cell.x, cell.z, seed, plan, origin);
        complete(cell);
        yield;
    }
}
function* generateVegetationBatch(dimension, batch, seed, plan, origin, complete) {
    for (const cell of batch) {
        terrainMetrics.beginCell(`vegetation:${cell.x},${cell.z}`);
        yield* generateVegetationCell(dimension, cell.x, cell.z, seed, plan, origin);
        complete(cell);
        yield;
    }
}
async function getRoadPlan(seed) {
    const restored = restoreRoadNetworkPlan(
        getString(DYNAMIC.roadPlanCache),
        seed,
        ROAD_DESTINATIONS.length,
    );
    if (restored) {
        logInfo("Restored cached deterministic road plan; skipped startup route recomputation.");
        return restored;
    }
    const plan = await runGenerator(buildRoadNetworkIncremental(seed, ROAD_DESTINATIONS));
    const serialized = serializeRoadNetworkPlan(plan);
    if (serialized.length <= 32000)
        setValue(DYNAMIC.roadPlanCache, serialized);
    else
        logInfo(`Road-plan cache skipped because ${serialized.length} bytes exceeds the conservative 32 KB property budget.`);
    return plan;
}

function scheduleResume(delay = 40) {
    if (!hasSengokuPlayers() || scheduledResume !== undefined || guard.activeJob || travelPauseDepth > 0 || getStage() === GenerationStage.Complete || getStage() === GenerationStage.FailedRecoverable)
        return;
    scheduledResume = system.runTimeout(() => {
        scheduledResume = undefined;
        if (hasSengokuPlayers() && !guard.activeJob && travelPauseDepth === 0 && getStage() !== GenerationStage.Complete && getStage() !== GenerationStage.FailedRecoverable)
            void initializeDimension(true);
    }, Math.max(1, delay));
}
function requestResumeForSengokuPlayer(playerId, delay = 1) {
    if (getStage() === GenerationStage.Complete || getStage() === GenerationStage.FailedRecoverable)
        return;
    generationDemand.requestResume(playerId);
    if (travelPauseDepth > 0 || guard.activeJob)
        return;
    generationDemand.consumePendingResume();
    scheduleResume(delay);
}
export function requestSengokuTerrainStreaming(playerId, delay = 1) {
    requestResumeForSengokuPlayer(playerId, delay);
}
export function handlePlayerDimensionChange(event) {
    const playerId = event?.player?.id;
    const fromSengoku = event?.fromDimension?.id === DIMENSION_ID;
    const toSengoku = event?.toDimension?.id === DIMENSION_ID;
    if (toSengoku) {
        generationDemand.noteEntered(playerId, system.currentTick);
        requestResumeForSengokuPlayer(playerId, 1);
        return;
    }
    if (fromSengoku)
        generationDemand.noteLeft(playerId);
}
export function handlePlayerLeave(event) {
    generationDemand.noteLeft(event?.playerId);
}
export function startGenerationHealthMonitor() {
    if (healthMonitor !== undefined)
        return;
    const check = () => {
        healthMonitor = undefined;
        const stage = getStage();
        if (stage !== GenerationStage.Complete &&
            stage !== GenerationStage.FailedRecoverable &&
            hasSengokuPlayers() &&
            !guard.activeJob && travelPauseDepth === 0) {
            generationDemand.consumePendingResume();
            scheduleResume(1);
        }
        healthMonitor = system.runTimeout(check, HEALTH_MONITOR_INTERVAL_TICKS);
    };
    healthMonitor = system.runTimeout(check, HEALTH_MONITOR_INTERVAL_TICKS);
}
function persistMetrics(force = false) {
    const tick = system.currentTick;
    if (!force && tick - lastMetricsPersistTick < 200)
        return;
    lastMetricsPersistTick = tick;
    const snapshot = terrainMetrics.snapshot();
    writeJson(DYNAMIC.performanceMetrics, snapshot);
    if (force || tick - lastMetricsLogTick >= 1200) {
        lastMetricsLogTick = tick;
        logInfo(`Generation summary: dry=${ledgerProgress(DYNAMIC.cellLedger)}, hydrated=${ledgerProgress(DYNAMIC.terrainReadyLedger)}, ${snapshot.queuedTerrainRegions} queued, ${snapshot.loadingTerrainRegions} loading, active=${snapshot.generatingTerrainRegion}; remote=${snapshot.remoteTerrainRegions}; ticking=${snapshot.observedChunkCount}/${snapshot.observedMaxChunkCount}, loads=${snapshot.tickingAreaLoadAttempts}, capacityDeferrals=${snapshot.tickingAreaCapacityDeferrals}, failures=${snapshot.terrainGenerationFailures}; trees ${snapshot.treeRegionsCompleted} complete, ${snapshot.treeRegionsQueued} queued, placed=${snapshot.treesPlaced}, placementFailures=${snapshot.treeStructurePlacementFailures}.`);
    }
}
function dryNeighborsComplete(cell, base) {
    for (let z = Math.max(ACTIVE_CELL_MIN_Z, cell.z - 1); z <= Math.min(ACTIVE_CELL_MAX_Z, cell.z + 1); z++)
        for (let x = Math.max(ACTIVE_CELL_MIN_X, cell.x - 1); x <= Math.min(ACTIVE_CELL_MAX_X, cell.x + 1); x++)
            if (!base.isComplete(x, z))
                return false;
    return true;
}

function activeLedgerCellComplete(ledger, x, z) {
    if (x < ACTIVE_CELL_MIN_X || x > ACTIVE_CELL_MAX_X || z < ACTIVE_CELL_MIN_Z || z > ACTIVE_CELL_MAX_Z)
        return false;
    return ledger.isComplete(x, z);
}

function activeLedgerCount(ledger) {
    let completed = 0;
    for (let z = ACTIVE_CELL_MIN_Z; z <= ACTIVE_CELL_MAX_Z; z++)
        for (let x = ACTIVE_CELL_MIN_X; x <= ACTIVE_CELL_MAX_X; x++)
            if (ledger.isComplete(x, z))
                completed++;
    return completed;
}
function currentFocusPoints(dimension, origin) {
    return filterFocusPointsToActiveTerrain(
        dimension.getPlayers().map(player => ({ x: player.location.x, z: player.location.z })),
        origin,
    );
}
function terrainRegionDescriptor(queue, focusPoints, origin, margin = 0, minY = 16, maxY = 160, singleCell = false) {
    const selected = selectNextTerrainCell(queue, focusPoints, origin);
    if (!selected)
        return undefined;
    if (singleCell) {
        const bounds = batchBounds([selected], origin, margin, minY, maxY);
        return {
            cells: [selected],
            bounds,
            chunks: tickingChunkCount(bounds.from, bounds.to),
            key: `single:${selected.x},${selected.z}`,
        };
    }
    const span = terrainMetrics.cellBatchSpan;
    const bucket = cellBatchKey(selected, span);
    const candidates = queue.filter(cell => cellBatchKey(cell, span) === bucket);
    const groups = capacitySafeCellGroups(candidates, origin, margin, minY, maxY);
    const group = groups.find(item => item.core.some(cell => cell.x === selected.x && cell.z === selected.z)) ?? groups[0];
    if (!group)
        return undefined;
    const firstIndex = Math.min(...group.core.map(cell => cell.deterministicIndex ?? 0));
    return {
        cells: group.core,
        bounds: group.bounds,
        chunks: group.chunks,
        key: `${bucket}:${firstIndex}`,
    };
}
function removeRegionFromQueue(queue, descriptor) {
    for (const cell of descriptor.cells)
        removeQueuedCell(queue, cell);
}
function requeueRegion(queue, descriptor) {
    for (const cell of descriptor.cells)
        requeueTerrainCell(queue, cell);
}
function regionIsRemote(cells, focusPoints, origin, radius = 192) {
    if (!focusPoints.length)
        return true;
    for (const cell of cells) {
        const worldOrigin = cellWorldOrigin(cell.x, cell.z, origin);
        const x = worldOrigin.x + CELL_SIZE / 2;
        const z = worldOrigin.z + CELL_SIZE / 2;
        if (focusPoints.some(point => Math.hypot(point.x - x, point.z - z) <= radius))
            return false;
    }
    return true;
}
async function acquireTerrainWindow(descriptor, dimension, id, preloading = false, priority = "background") {
    terrainMetrics.beginTerrainRegion(descriptor.key, true);
    try {
        const result = await tryAcquireManagedTickingArea({
            id,
            dimension,
            from: descriptor.bounds.from,
            to: descriptor.bounds.to,
            checkCancelled: throwIfCancelled,
            priority,
        });
        terrainMetrics.recordTickingAreaAttempt(result.chunkCount, result.maxChunkCount);
        if (!result.acquired) {
            terrainMetrics.recordCapacityDeferral();
            terrainMetrics.finishTerrainLoad(descriptor.key, false);
            if (!preloading)
                terrainMetrics.endTerrainRegion();
            return result;
        }
        terrainMetrics.finishTerrainLoad(descriptor.key, !preloading);
        return result;
    }
    catch (error) {
        terrainMetrics.finishTerrainLoad(descriptor.key, false);
        if (!preloading)
            terrainMetrics.endTerrainRegion();
        throw error;
    }
}
async function acquireDecorationWindow(descriptor, dimension, id) {
    const result = await tryAcquireManagedTickingArea({
        id,
        dimension,
        from: descriptor.bounds.from,
        to: descriptor.bounds.to,
        checkCancelled: throwIfCancelled,
        priority: "background",
    });
    terrainMetrics.recordTickingAreaAttempt(result.chunkCount, result.maxChunkCount);
    if (!result.acquired)
        terrainMetrics.recordCapacityDeferral();
    return result;
}
function markTerrainReadyIfComplete(cell, base, surface, roads, water, terrainReady) {
    if (base.isComplete(cell.x, cell.z) && surface.isComplete(cell.x, cell.z) &&
        roads.isComplete(cell.x, cell.z) && water.isComplete(cell.x, cell.z)) {
        terrainReady.markComplete(cell.x, cell.z);
        return true;
    }
    return false;
}
async function runLandscapeOrder(dimension, order, seed, plan, origin, options = {}) {
    const base = loadLedger(DYNAMIC.cellLedger);
    const surface = loadLedger(DYNAMIC.riverLedger);
    const roads = loadLedger(DYNAMIC.roadLedger);
    const water = loadLedger(DYNAMIC.waterLedger);
    const terrainReady = loadLedger(DYNAMIC.terrainReadyLedger);
    const decorationEnabled = Boolean(options.resolvedTrees && options.resolvedPond);
    const vegetation = decorationEnabled ? loadLedger(DYNAMIC.vegetationLedger) : undefined;
    const trees = decorationEnabled ? loadLedger(DYNAMIC.treeStructureLedger) : undefined;
    const needsDry = cell => !base.isComplete(cell.x, cell.z) || !surface.isComplete(cell.x, cell.z) || !roads.isComplete(cell.x, cell.z);
    const needsWater = cell => !water.isComplete(cell.x, cell.z);
    const waterOrder = options.waterOrder ?? order;
    const allowDeferredWater = options.allowDeferredWater === true;
    const priority1 = options.priority1Order ?? [];
    const priority2 = options.priority2Order ?? [];
    const terrainPriority = options.terrainPriority === "travel" ? "travel" : "background";
    const disablePreload = options.disablePreload === true;
    const singleCellRegions = options.singleCellRegions === true;
    let dryQueue = buildTieredTerrainQueue(priority1, priority2, order).filter(needsDry);
    let pendingWater = waterOrder.filter(needsWater);
    let areaIndex = 0;
    let preloaded;
    let terrainRegionsSinceDecoration = 0;
    const dryFailures = new Map();
    const waterFailures = new Map();

    const updateProgress = () => {
        const completedReady = activeLedgerCount(terrainReady);
        terrainMetrics.setTerrainProgress(ACTIVE_CELL_COUNT, completedReady, Math.max(0, ACTIVE_CELL_COUNT - completedReady));
        terrainMetrics.setQueue(order.length + waterOrder.length, dryQueue.length + pendingWater.length);
        if (trees)
            terrainMetrics.setTreeProgress(order.filter(cell => terrainReady.isComplete(cell.x, cell.z) && !trees.isComplete(cell.x, cell.z)).length, activeLedgerCount(trees));
    };
    updateProgress();

    try {
    while (dryQueue.length > 0 || preloaded) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        const focusPoints = currentFocusPoints(dimension, origin);
        let activeDescriptor;
        let activeResult;

        if (preloaded) {
            activeDescriptor = preloaded.descriptor;
            try {
                activeResult = await preloaded.promise;
            }
            catch (error) {
                requeueRegion(dryQueue, activeDescriptor);
                terrainMetrics.recordTerrainFailure();
                logError(`terrain-preload-${activeDescriptor.key}`, error);
                preloaded = undefined;
                continue;
            }
            preloaded = undefined;
            if (!activeResult.acquired) {
                requeueRegion(dryQueue, activeDescriptor);
                continue;
            }
            terrainMetrics.recordPipelinePromotion();
            terrainMetrics.promoteTerrainRegion(activeDescriptor.key);
        }
        else {
            const connectedQueue = connectedTerrainFrontier(dryQueue, (x, z) => activeLedgerCellComplete(base, x, z));
            if (connectedQueue.length === 0)
                throw new GenerationDeferredError("No connected dry-terrain frontier is available yet; keeping remote cells queued", 20);
            activeDescriptor = terrainRegionDescriptor(connectedQueue, focusPoints, origin, 0, 16, 160, singleCellRegions);
            if (!activeDescriptor)
                break;
            removeRegionFromQueue(dryQueue, activeDescriptor);
            try {
                activeResult = await acquireTerrainWindow(
                    activeDescriptor,
                    dimension,
                    `historyjam_sengoku_terrain_${areaIndex++}`,
                    false,
                    terrainPriority,
                );
            }
            catch (error) {
                requeueRegion(dryQueue, activeDescriptor);
                terrainMetrics.recordTerrainFailure();
                logError(`terrain-load-${activeDescriptor.key}`, error);
                throw new GenerationDeferredError(`Terrain window ${activeDescriptor.key} load failed recoverably`, 40);
            }
            if (!activeResult.acquired) {
                requeueRegion(dryQueue, activeDescriptor);
                throw new GenerationDeferredError(`Terrain window ${activeDescriptor.key} deferred for ticking-area ${activeResult.reason}`, 20);
            }
        }

        const remoteRegion = regionIsRemote(activeDescriptor.cells, focusPoints, origin);
        if (remoteRegion)
            terrainMetrics.recordRemoteTerrainRegion();

        const decorationDueAfterCurrent = Boolean(options.resolvedTrees && options.resolvedPond && vegetation && trees && terrainRegionsSinceDecoration >= 5);
        if (!disablePreload && dryQueue.length > 0 && !decorationDueAfterCurrent) {
            const nextFocus = currentFocusPoints(dimension, origin);
            const nextConnectedQueue = connectedTerrainFrontier(dryQueue, (x, z) => activeLedgerCellComplete(base, x, z));
            const nextDescriptor = terrainRegionDescriptor(nextConnectedQueue, nextFocus, origin, 0, 16, 160, singleCellRegions);
            if (nextDescriptor) {
                const capacity = canPreloadTickingArea(dimension, nextDescriptor.bounds.from, nextDescriptor.bounds.to);
                if (shouldPipelinePreload({
                    hasCapacity: capacity.canPreload,
                    chunkCount: capacity.chunkCount,
                    maxChunkCount: capacity.maxChunkCount,
                    requestedChunks: capacity.requestedChunks,
                })) {
                    removeRegionFromQueue(dryQueue, nextDescriptor);
                    terrainMetrics.recordPipelinePreload();
                    preloaded = {
                        descriptor: nextDescriptor,
                        promise: acquireTerrainWindow(
                            nextDescriptor,
                            dimension,
                            `historyjam_sengoku_terrain_preload_${areaIndex++}`,
                            true,
                            terrainPriority,
                        ),
                    };
                }
            }
        }

        let activeFailed = false;
        try {
            const cells = activeDescriptor.cells.filter(needsDry);
            if (cells.length > 0) {
                await runGenerator(generateDryBatch(dimension, cells, seed, plan, origin, completed => {
                    base.markComplete(completed.x, completed.z);
                    surface.markComplete(completed.x, completed.z);
                    roads.markComplete(completed.x, completed.z);
                    terrainMetrics.completeCell();
                }));
                saveLedger(DYNAMIC.cellLedger, base);
                saveLedger(DYNAMIC.riverLedger, surface);
                saveLedger(DYNAMIC.roadLedger, roads);

                if (remoteRegion) {
                    const remoteResults = new Map();
                    await runGenerator(validateTerrainBatch(dimension, cells, origin, seed, remoteResults));
                    let remoteInvalid = false;
                    for (const cell of cells) {
                        const valid = remoteResults.get(`${cell.x},${cell.z}`) === true;
                        terrainMetrics.recordRemoteTerrainValidation(valid);
                        if (valid)
                            continue;
                        remoteInvalid = true;
                        base.markIncomplete(cell.x, cell.z);
                        surface.markIncomplete(cell.x, cell.z);
                        roads.markIncomplete(cell.x, cell.z);
                        requeueTerrainCell(dryQueue, cell);
                        logInfo(`Remote terrain validation failed at ${cell.x},${cell.z}; physical terrain was not accepted and the cell was requeued.`);
                    }
                    if (remoteInvalid) {
                        saveLedger(DYNAMIC.cellLedger, base);
                        saveLedger(DYNAMIC.riverLedger, surface);
                        saveLedger(DYNAMIC.roadLedger, roads);
                        throw new GenerationDeferredError(`Remote terrain region ${activeDescriptor.key} failed physical validation and remains queued`, 20);
                    }
                }
            }

            for (const cell of activeDescriptor.cells) {
                if (!needsWater(cell) || !dryNeighborsComplete(cell, base))
                    continue;
                terrainMetrics.setStage(GenerationStage.WaterGenerating);
                terrainMetrics.beginCell(`water:${cell.x},${cell.z}`);
                try {
                    await runGenerator(generateWaterBatch(dimension, [cell], seed, plan, origin, completed => {
                        water.markComplete(completed.x, completed.z);
                        terrainMetrics.completeCell();
                    }));
                    saveLedger(DYNAMIC.waterLedger, water);
                    waterFailures.delete(`${cell.x},${cell.z}`);
                }
                catch (error) {
                    if (error instanceof GenerationCancelledError)
                        throw error;
                    const key = `${cell.x},${cell.z}`;
                    const failures = (waterFailures.get(key) ?? 0) + 1;
                    waterFailures.set(key, failures);
                    terrainMetrics.recordTerrainFailure();
                    logError(`water-region-${key}`, error);
                    if (failures >= 3)
                        throw new GenerationDeferredError(`Water cell ${key} deferred after ${failures} recoverable failures`, 100);
                }
                finally {
                    terrainMetrics.setStage(GenerationStage.BaseTerrainGenerating);
                }
            }

            for (const cell of activeDescriptor.cells)
                markTerrainReadyIfComplete(cell, base, surface, roads, water, terrainReady);
            saveLedger(DYNAMIC.terrainReadyLedger, terrainReady);
            pendingWater = waterOrder.filter(needsWater);
            terrainRegionsSinceDecoration++;

            if (options.resolvedTrees && options.resolvedPond && vegetation && trees && terrainRegionsSinceDecoration >= 4) {
                for (const candidate of activeDescriptor.cells) {
                    if (!terrainReady.isComplete(candidate.x, candidate.z) || trees.isComplete(candidate.x, candidate.z))
                        continue;
                    const decorated = await tryDecorateLoadedTerrainCell(
                        dimension, candidate, seed, plan, origin, options.resolvedTrees, options.resolvedPond,
                        activeDescriptor.bounds, terrainReady, vegetation, trees,
                    );
                    if (decorated) {
                        terrainRegionsSinceDecoration = 0;
                        break;
                    }
                }
            }
        }
        catch (error) {
            activeFailed = true;
            if (error instanceof GenerationDeferredError || error instanceof GenerationCancelledError)
                throw error;
            terrainMetrics.recordTerrainFailure();
            logError(`terrain-region-${activeDescriptor.key}`, error);
            for (const cell of activeDescriptor.cells) {
                if (!needsDry(cell))
                    continue;
                const key = `${cell.x},${cell.z}`;
                const failures = (dryFailures.get(key) ?? 0) + 1;
                dryFailures.set(key, failures);
                requeueTerrainCell(dryQueue, cell);
                if (failures >= 3)
                    throw new GenerationDeferredError(`Terrain cell ${key} deferred after ${failures} recoverable failures`, 100);
            }
        }
        finally {
            try {
                await activeResult.release();
            }
            catch (error) {
                logError(`terrain-release-${activeDescriptor.key}`, error);
            }
            terrainMetrics.endTerrainRegion();
            saveLedger(DYNAMIC.cellLedger, base);
            saveLedger(DYNAMIC.riverLedger, surface);
            saveLedger(DYNAMIC.roadLedger, roads);
            saveLedger(DYNAMIC.waterLedger, water);
            saveLedger(DYNAMIC.terrainReadyLedger, terrainReady);
            updateProgress();
            persistMetrics();
        }
        if (activeFailed)
            continue;

        if (options.resolvedTrees && options.resolvedPond && vegetation && trees && !preloaded && terrainRegionsSinceDecoration >= 6) {
            const candidate = order.find(cell => terrainReady.isComplete(cell.x, cell.z) && !trees.isComplete(cell.x, cell.z));
            if (candidate)
                await tryDecorateTerrainCellWithWindow(dimension, candidate, seed, plan, origin, options.resolvedTrees, options.resolvedPond, terrainReady, vegetation, trees, areaIndex++);
            terrainRegionsSinceDecoration = 0;
            updateProgress();
        }
    }
    }
    finally {
        if (preloaded) {
            const stranded = preloaded;
            preloaded = undefined;
            try {
                const result = await stranded.promise;
                if (result?.acquired)
                    await result.release();
            }
            catch (error) {
                logError(`terrain-preload-cleanup-${stranded.descriptor.key}`, error);
            }
        }
    }

    pendingWater = waterOrder.filter(needsWater);
    while (pendingWater.length > 0) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        const ready = pendingWater.filter(cell => dryNeighborsComplete(cell, base));
        if (ready.length === 0) {
            const blocked = pendingWater[0];
            if (allowDeferredWater) {
                logInfo(`Deferred ${pendingWater.length} water cells because ${blocked.x},${blocked.z} still needs dry neighbors; they remain queued.`);
                break;
            }
            throw new GenerationDeferredError(`Water cell ${blocked.x},${blocked.z} still needs dry neighbors; keeping it queued`, 40);
        }
        let group;
        if (singleCellRegions) {
            const cell = ready[0];
            const bounds = batchBounds([cell], origin, 0, 16, 160);
            group = { core: [cell], bounds, chunks: tickingChunkCount(bounds.from, bounds.to) };
        }
        else {
            const batches = buildCellBatches(ready, cell => needsWater(cell));
            const batch = batches[0] ?? [ready[0]];
            const groups = capacitySafeCellGroups(batch, origin, 0, 16, 160);
            group = groups[0];
        }
        if (!group)
            throw new GenerationDeferredError("No capacity-safe water group could be constructed", 40);
        const descriptor = { cells: group.core, bounds: group.bounds, chunks: group.chunks, key: `water:${group.core.map(c => `${c.x},${c.z}`).join(";")}` };
        let acquired;
        try {
            acquired = await acquireTerrainWindow(descriptor, dimension, `historyjam_sengoku_water_${areaIndex++}`, false, terrainPriority);
        }
        catch (error) {
            terrainMetrics.recordTerrainFailure();
            logError(`water-load-${descriptor.key}`, error);
            throw new GenerationDeferredError(`Water window ${descriptor.key} load failed recoverably`, 40);
        }
        if (!acquired.acquired)
            throw new GenerationDeferredError(`Water window ${descriptor.key} deferred for ticking-area ${acquired.reason}`, 20);
        try {
            terrainMetrics.setStage(GenerationStage.WaterGenerating);
            await runGenerator(generateWaterBatch(dimension, descriptor.cells.filter(needsWater), seed, plan, origin, completed => {
                water.markComplete(completed.x, completed.z);
                terrainMetrics.completeCell();
            }));
            saveLedger(DYNAMIC.waterLedger, water);
            for (const cell of descriptor.cells)
                markTerrainReadyIfComplete(cell, base, surface, roads, water, terrainReady);
            saveLedger(DYNAMIC.terrainReadyLedger, terrainReady);
        }
        catch (error) {
            terrainMetrics.recordTerrainFailure();
            logError(`water-region-${descriptor.key}`, error);
            for (const cell of descriptor.cells.filter(needsWater)) {
                const key = `${cell.x},${cell.z}`;
                const failures = (waterFailures.get(key) ?? 0) + 1;
                waterFailures.set(key, failures);
                if (failures >= 3)
                    throw new GenerationDeferredError(`Water cell ${key} deferred after ${failures} recoverable failures`, 100);
            }
        }
        finally {
            terrainMetrics.setStage(GenerationStage.BaseTerrainGenerating);
            await acquired.release();
            terrainMetrics.endTerrainRegion();
            pendingWater = waterOrder.filter(needsWater);
            updateProgress();
            persistMetrics();
        }
    }

    if (options.validateLegacyReady)
        await validateLegacyTerrainReady(dimension, order, seed, origin, base, surface, roads, water, terrainReady);
    if (options.skipAuthoredBridgeMaintenance !== true)
        await ensureReadyAuthoredBridges(dimension, plan, origin, terrainReady, seed);
    updateProgress();
}
function hasGroundNearExpectedHeight(dimension, worldX, worldZ, expectedY) {
    const probe = { x: worldX, y: expectedY, z: worldZ };
    if (!dimension.isChunkLoaded(probe))
        return false;
    const range = groundVerificationRange(expectedY, 10, 16, 160);
    for (let y = range.maxY; y > range.minY; y--) {
        const current = dimension.getBlock({ x: worldX, y, z: worldZ });
        const below = dimension.getBlock({ x: worldX, y: y - 1, z: worldZ });
        if (!current || !below)
            return false;
        if (isGroundLikeBlock(current.typeId, BLOCKS.Air, BLOCKS.Water)
            && isGroundLikeBlock(below.typeId, BLOCKS.Air, BLOCKS.Water))
            return true;
    }
    return false;
}
function verifyDryCellWritten(dimension, cell, origin, seed) {
    const cellOrigin = cellWorldOrigin(cell.x, cell.z, origin);
    const localOrigin = { x: cellOrigin.x - origin.x, z: cellOrigin.z - origin.z };
    for (const [dx, dz] of entryTileSampleOffsets(CELL_SIZE, 8)) {
        const localX = localOrigin.x + dx;
        const localZ = localOrigin.z + dz;
        if (isInsideProtectedStructure(localX, localZ, 0))
            continue;
        const expectedY = terrainHeight(localX, localZ, seed);
        if (!hasGroundNearExpectedHeight(dimension, cellOrigin.x + dx, cellOrigin.z + dz, expectedY))
            return false;
    }
    return true;
}
function* verifyDryCellWrittenIncremental(dimension, cell, origin, seed) {
    const cellOrigin = cellWorldOrigin(cell.x, cell.z, origin);
    const localOrigin = { x: cellOrigin.x - origin.x, z: cellOrigin.z - origin.z };
    for (const [dx, dz] of entryTileSampleOffsets(CELL_SIZE, 8)) {
        const localX = localOrigin.x + dx;
        const localZ = localOrigin.z + dz;
        if (isInsideProtectedStructure(localX, localZ, 0))
            continue;
        const expectedY = terrainHeight(localX, localZ, seed);
        if (!hasGroundNearExpectedHeight(dimension, cellOrigin.x + dx, cellOrigin.z + dz, expectedY))
            return false;
        yield;
    }
    return true;
}
function* validateTerrainBatch(dimension, cells, origin, seed, results) {
    for (const cell of cells) {
        const valid = yield* verifyDryCellWrittenIncremental(dimension, cell, origin, seed);
        results.set(`${cell.x},${cell.z}`, valid);
        yield;
    }
}
function allTerrainComponentsComplete(cell, base, surface, roads, water) {
    return base.isComplete(cell.x, cell.z) && surface.isComplete(cell.x, cell.z) &&
        roads.isComplete(cell.x, cell.z) && water.isComplete(cell.x, cell.z);
}
async function validateLegacyTerrainReady(dimension, order, seed, origin, base, surface, roads, water, terrainReady) {
    const vegetation = loadLedger(DYNAMIC.vegetationLedger);
    const trees = loadLedger(DYNAMIC.treeStructureLedger);
    const legacy = order.filter(cell => allTerrainComponentsComplete(cell, base, surface, roads, water) && !terrainReady.isComplete(cell.x, cell.z));
    if (!legacy.length)
        return;
    const batches = buildCellBatches(legacy, () => true);
    let areaIndex = 0;
    for (const batch of batches) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        const groups = capacitySafeCellGroups(batch, origin, 0, 16, 160);
        for (const group of groups) {
            const descriptor = { cells: group.core, bounds: group.bounds, chunks: group.chunks, key: `legacy:${areaIndex}` };
            const acquired = await acquireTerrainWindow(descriptor, dimension, `historyjam_sengoku_legacy_validate_${areaIndex++}`);
            if (!acquired.acquired)
                throw new GenerationDeferredError(`Legacy terrain validation deferred for ticking-area ${acquired.reason}`, 20);
            const results = new Map();
            try {
                await runGenerator(validateTerrainBatch(dimension, descriptor.cells, origin, seed, results));
                let stale = false;
                for (const cell of descriptor.cells) {
                    if (results.get(`${cell.x},${cell.z}`)) {
                        terrainReady.markComplete(cell.x, cell.z);
                        continue;
                    }
                    stale = true;
                    base.markIncomplete(cell.x, cell.z);
                    surface.markIncomplete(cell.x, cell.z);
                    roads.markIncomplete(cell.x, cell.z);
                    water.markIncomplete(cell.x, cell.z);
                    terrainReady.markIncomplete(cell.x, cell.z);
                    vegetation.markIncomplete(cell.x, cell.z);
                    trees.markIncomplete(cell.x, cell.z);
                    logInfo(`Terrain ledger repair: ${cell.x},${cell.z} was recorded complete but failed physical terrain verification; terrain and its dependent decoration were requeued without resetting the province.`);
                }
                saveLedger(DYNAMIC.cellLedger, base);
                saveLedger(DYNAMIC.riverLedger, surface);
                saveLedger(DYNAMIC.roadLedger, roads);
                saveLedger(DYNAMIC.waterLedger, water);
                saveLedger(DYNAMIC.terrainReadyLedger, terrainReady);
                saveLedger(DYNAMIC.vegetationLedger, vegetation);
                saveLedger(DYNAMIC.treeStructureLedger, trees);
                if (stale)
                    throw new GenerationDeferredError("One or more stale terrain-completion markers were physically missing and have been requeued", 1);
            }
            finally {
                await acquired.release();
                terrainMetrics.endTerrainRegion();
                persistMetrics();
            }
        }
    }
}
function boundsContain(outer, inner) {
    return inner.from.x >= outer.from.x && inner.to.x <= outer.to.x &&
        inner.from.y >= outer.from.y && inner.to.y <= outer.to.y &&
        inner.from.z >= outer.from.z && inner.to.z <= outer.to.z;
}
function requiredCompactTreesResolved(resolvedTrees) {
    return resolvedTrees.has("oak_tree") && resolvedTrees.has("oak_tree2") && resolvedTrees.has("oak_tree3");
}
function cellDecorationDependenciesReady(cell, terrainReady) {
    for (let z = Math.max(ACTIVE_CELL_MIN_Z, cell.z - 1); z <= Math.min(ACTIVE_CELL_MAX_Z, cell.z + 1); z++)
        for (let x = Math.max(ACTIVE_CELL_MIN_X, cell.x - 1); x <= Math.min(ACTIVE_CELL_MAX_X, cell.x + 1); x++)
            if (!terrainReady.isComplete(x, z))
                return false;
    return true;
}
function treePlanTerrainDependenciesReady(cell, planned, terrainReady) {
    if (!cellDecorationDependenciesReady(cell, terrainReady))
        return false;
    for (const dependency of terrainDependencyCellsForTreePlan(planned))
        if (!terrainReady.isComplete(dependency.x, dependency.z))
            return false;
    return true;
}
async function tryDecorateLoadedTerrainCell(dimension, cell, seed, plan, origin, resolvedTrees, resolvedPond, loadedBounds, terrainReady, vegetation, trees) {
    if (!requiredCompactTreesResolved(resolvedTrees) || !resolvedPond)
        return false;
    const plannedPonds = planPondsForCell(cell.x, cell.z, seed, plan);
    const planned = await runGenerator(generateStructureTreePlan(cell.x, cell.z, seed, plan, resolvedTrees));
    if (!treePlanTerrainDependenciesReady(cell, planned, terrainReady))
        return false;
    const cellOrigin = cellWorldOrigin(cell.x, cell.z, origin);
    const needed = treePlanWorldBounds(planned, origin, {
        minX: cellOrigin.x,
        minZ: cellOrigin.z,
        maxX: cellOrigin.x + CELL_SIZE - 1,
        maxZ: cellOrigin.z + CELL_SIZE - 1,
        minY: 18,
        maxY: 158,
    }, 0);
    if (!boundsContain(loadedBounds, needed))
        return false;
    const legacyCleanupBounds = {
        from: { x: cellOrigin.x - 3, y: 16, z: cellOrigin.z - 3 },
        to: { x: cellOrigin.x + CELL_SIZE + 2, y: 170, z: cellOrigin.z + CELL_SIZE + 2 },
    };
    if (!boundsContain(loadedBounds, legacyCleanupBounds))
        return false;
    await runGenerator(removeLegacyProceduralTreesCell(dimension, cell.x, cell.z, seed, plan, origin));
    if (!vegetation.isComplete(cell.x, cell.z)) {
        terrainMetrics.beginCell(`vegetation:${cell.x},${cell.z}`);
        await runGenerator(generateVegetationCell(dimension, cell.x, cell.z, seed, plan, origin));
        vegetation.markComplete(cell.x, cell.z);
        saveLedger(DYNAMIC.vegetationLedger, vegetation);
        terrainMetrics.completeCell();
    }
    const pondResult = await runGenerator(placePondPlan(dimension, cell.x, cell.z, seed, origin, resolvedPond, plannedPonds));
    if (pondResult.failures > 0)
        return false;
    terrainMetrics.beginCell(`tree-structure:${cell.x},${cell.z}`);
    const result = await runGenerator(placeStructureTreePlan(dimension, cell.x, cell.z, seed, origin, planned));
    if (result.failures > 0)
        return false;
    trees.markComplete(cell.x, cell.z);
    saveLedger(DYNAMIC.treeStructureLedger, trees);
    terrainMetrics.recordTreeRegionComplete();
    terrainMetrics.completeCell();
    persistMetrics();
    return true;
}
async function tryDecorateTerrainCellWithWindow(dimension, cell, seed, plan, origin, resolvedTrees, resolvedPond, terrainReady, vegetation, trees, areaIndex) {
    if (!requiredCompactTreesResolved(resolvedTrees) || !resolvedPond)
        return false;
    const plannedPonds = planPondsForCell(cell.x, cell.z, seed, plan);
    const planned = await runGenerator(generateStructureTreePlan(cell.x, cell.z, seed, plan, resolvedTrees));
    if (!treePlanTerrainDependenciesReady(cell, planned, terrainReady))
        return false;
    const cellOrigin = cellWorldOrigin(cell.x, cell.z, origin);
    const bounds = treePlanWorldBounds(planned, origin, {
        minX: cellOrigin.x,
        minZ: cellOrigin.z,
        maxX: cellOrigin.x + CELL_SIZE - 1,
        maxZ: cellOrigin.z + CELL_SIZE - 1,
        minY: 16,
        maxY: 170,
    }, 3);
    const descriptor = {
        cells: [cell],
        bounds,
        chunks: tickingChunkCount(bounds.from, bounds.to),
        key: `tree-progressive:${cell.x},${cell.z}`,
    };
    let acquired;
    try {
        acquired = await acquireDecorationWindow(descriptor, dimension, `historyjam_sengoku_tree_progressive_${areaIndex}`);
    }
    catch (error) {
        logError(`tree-progressive-window-${cell.x},${cell.z}`, error);
        return false;
    }
    if (!acquired.acquired)
        return false;
    try {
        await runGenerator(removeLegacyProceduralTreesCell(dimension, cell.x, cell.z, seed, plan, origin));
        if (!vegetation.isComplete(cell.x, cell.z)) {
            terrainMetrics.beginCell(`vegetation:${cell.x},${cell.z}`);
            await runGenerator(generateVegetationCell(dimension, cell.x, cell.z, seed, plan, origin));
            vegetation.markComplete(cell.x, cell.z);
            saveLedger(DYNAMIC.vegetationLedger, vegetation);
            terrainMetrics.completeCell();
        }
        const pondResult = await runGenerator(placePondPlan(dimension, cell.x, cell.z, seed, origin, resolvedPond, plannedPonds));
        if (pondResult.failures > 0)
            return false;
        terrainMetrics.beginCell(`tree-structure:${cell.x},${cell.z}`);
        const result = await runGenerator(placeStructureTreePlan(dimension, cell.x, cell.z, seed, origin, planned));
        if (result.failures > 0)
            return false;
        trees.markComplete(cell.x, cell.z);
        saveLedger(DYNAMIC.treeStructureLedger, trees);
        terrainMetrics.recordTreeRegionComplete();
        terrainMetrics.completeCell();
        persistMetrics();
        return true;
    }
    catch (error) {
        logError(`tree-progressive-${cell.x},${cell.z}`, error);
        return false;
    }
    finally {
        try {
            await acquired.release();
        }
        catch (error) {
            logError(`tree-progressive-release-${cell.x},${cell.z}`, error);
        }
    }
}
async function verifyEntryTerrain(dimension, seed, origin) {
    const cells = buildArrivalCellOrder();
    let areaIndex = 0;
    for (const cell of cells) {
        throwIfCancelled();
        const bounds = batchBounds([cell], origin, 0, 16, 160);
        const id = `historyjam_sengoku_v3_entry_verify_${areaIndex++}`;
        const valid = await withTickingArea(id, dimension, bounds.from, bounds.to, async () => verifyDryCellWritten(dimension, cell, origin, seed));
        if (!valid)
            return false;
    }
    return true;
}
async function runEntryBootstrap(dimension, seed, plan, origin) {
    const base = loadLedger(DYNAMIC.cellLedger);
    const surface = loadLedger(DYNAMIC.riverLedger);
    const roads = loadLedger(DYNAMIC.roadLedger);
    const cells = buildArrivalCellOrder();
    let areaIndex = 0;

    for (const cell of cells) {
        throwIfCancelled();
        const bounds = batchBounds([cell], origin, 0, 16, 160);
        const id = `historyjam_sengoku_v3_entry_bootstrap_${areaIndex++}`;
        await withTickingArea(id, dimension, bounds.from, bounds.to, async () => {
            const ledgerReady = base.isComplete(cell.x, cell.z) && surface.isComplete(cell.x, cell.z) && roads.isComplete(cell.x, cell.z);
            if (!ledgerReady || !verifyDryCellWritten(dimension, cell, origin, seed)) {
                await runGenerator(generateDryBatch(dimension, [cell], seed, plan, origin, () => {
                    terrainMetrics.completeCell();
                }));
            }
            if (!verifyDryCellWritten(dimension, cell, origin, seed))
                throw new Error(`Entry terrain cell ${cell.x},${cell.z} remained empty after generation`);
        });
        base.markComplete(cell.x, cell.z);
        surface.markComplete(cell.x, cell.z);
        roads.markComplete(cell.x, cell.z);
        saveLedger(DYNAMIC.cellLedger, base);
        saveLedger(DYNAMIC.riverLedger, surface);
        saveLedger(DYNAMIC.roadLedger, roads);
        persistMetrics();
    }

    const center = cellWorldOrigin(16, 16, origin);
    await withTickingArea(
        "historyjam_sengoku_v3_entry_pad_restore",
        dimension,
        { x: center.x - 4, y: 24, z: center.z - 4 },
        { x: center.x + 16, y: 145, z: center.z + 4 },
        async () => runGenerator(buildArrival(dimension, origin, seed)),
    );
    if (!verifyArrival(dimension, origin, seed))
        throw new Error("Unsafe mixed-province arrival after entry terrain bootstrap");
}

async function runVegetationOrder(dimension, order, seed, plan, origin) {
    const vegetation = loadLedger(DYNAMIC.vegetationLedger);
    const terrainReady = loadLedger(DYNAMIC.terrainReadyLedger);
    let waiting = order.filter(cell => !vegetation.isComplete(cell.x, cell.z)).length;
    terrainMetrics.setQueue(order.length, waiting);
    const batches = buildCellBatches(order, cell => !vegetation.isComplete(cell.x, cell.z));
    let areaIndex = 0;
    for (const batch of batches) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        const requested = batch.filter(cell => !vegetation.isComplete(cell.x, cell.z) && cellDecorationDependenciesReady(cell, terrainReady));
        for (const group of capacitySafeCellGroups(requested, origin, 4, 32, 170)) {
            const cells = group.core.filter(cell => !vegetation.isComplete(cell.x, cell.z));
            if (cells.length === 0)
                continue;
            const descriptor = { cells, bounds: group.bounds, chunks: group.chunks, key: `vegetation:${areaIndex}` };
            const acquired = await acquireDecorationWindow(descriptor, dimension, `historyjam_sengoku_v3_vegetation_batch_${areaIndex++}`);
            if (!acquired.acquired)
                throw new GenerationDeferredError(`Vegetation window ${descriptor.key} deferred for ticking-area ${acquired.reason}; terrain remains higher priority`, 40);
            try {
                await runGenerator(generateVegetationBatch(dimension, cells, seed, plan, origin, cell => {
                    vegetation.markComplete(cell.x, cell.z);
                    saveLedger(DYNAMIC.vegetationLedger, vegetation);
                    waiting--;
                    terrainMetrics.setQueue(order.length, waiting);
                    terrainMetrics.completeCell();
                    persistMetrics();
                }));
            }
            finally {
                await acquired.release();
            }
        }
    }
}
async function runTreeStructureOrder(dimension, order, seed, plan, origin, resolvedTrees, resolvedPond, options = {}) {
    const trees = loadLedger(DYNAMIC.treeStructureLedger);
    const vegetation = loadLedger(DYNAMIC.vegetationLedger);
    const terrainReady = loadLedger(DYNAMIC.terrainReadyLedger);
    const base = loadLedger(DYNAMIC.cellLedger);
    const surface = loadLedger(DYNAMIC.riverLedger);
    const roads = loadLedger(DYNAMIC.roadLedger);
    const water = loadLedger(DYNAMIC.waterLedger);
    const failures = new Map();
    let deferredRegions = 0;
    let terrainRepairNeeded = false;
    const treeDecorationQueue = order.filter(cell => terrainReady.isComplete(cell.x, cell.z) && !trees.isComplete(cell.x, cell.z));
    let waiting = treeDecorationQueue.length;
    terrainMetrics.setTreeProgress(waiting, activeLedgerCount(trees));
    terrainMetrics.setQueue(order.length, waiting);
    if (!requiredCompactTreesResolved(resolvedTrees)) {
        logInfo("Tree decoration deferred because one or more compact supplied oak structures were not discovered by getPackStructureIds(). Terrain generation remains unaffected.");
        throw new GenerationDeferredError("Supplied compact tree structures are not currently available", 200);
    }
    if (!resolvedPond) {
        logInfo("Authored decoration deferred because the supplied pond structure was not discovered by getPackStructureIds(). Terrain generation remains unaffected.");
        throw new GenerationDeferredError("Supplied pond structure is not currently available", 200);
    }
    let areaIndex = 0;
    for (const cell of treeDecorationQueue) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        if (trees.isComplete(cell.x, cell.z) || !terrainReady.isComplete(cell.x, cell.z))
            continue;

        const plannedPonds = planPondsForCell(cell.x, cell.z, seed, plan);
        const planned = await runGenerator(generateStructureTreePlan(cell.x, cell.z, seed, plan, resolvedTrees, options));
        if (!treePlanTerrainDependenciesReady(cell, planned, terrainReady)) {
            if (!options.allowDependencyDeferral)
                deferredRegions++;
            continue;
        }
        const cellOrigin = cellWorldOrigin(cell.x, cell.z, origin);
        const bounds = treePlanWorldBounds(planned, origin, {
            minX: cellOrigin.x,
            minZ: cellOrigin.z,
            maxX: cellOrigin.x + CELL_SIZE - 1,
            maxZ: cellOrigin.z + CELL_SIZE - 1,
            minY: 16,
            maxY: 170,
        }, 3);
        const requestedChunks = tickingChunkCount(bounds.from, bounds.to);
        const descriptor = { cells: [cell], bounds, chunks: requestedChunks, key: `tree:${cell.x},${cell.z}` };
        let acquired;
        try {
            acquired = await acquireDecorationWindow(descriptor, dimension, `historyjam_sengoku_tree_${areaIndex++}`);
        }
        catch (error) {
            logError(`tree-window-${cell.x},${cell.z}`, error);
            terrainMetrics.recordTreePlacementFailure();
            deferredRegions++;
            continue;
        }
        if (!acquired.acquired) {
            deferredRegions++;
            continue;
        }
        try {
            const physicallyReady = await runGenerator(verifyDryCellWrittenIncremental(dimension, cell, origin, seed));
            if (!physicallyReady) {
                base.markIncomplete(cell.x, cell.z);
                surface.markIncomplete(cell.x, cell.z);
                roads.markIncomplete(cell.x, cell.z);
                water.markIncomplete(cell.x, cell.z);
                terrainReady.markIncomplete(cell.x, cell.z);
                saveLedger(DYNAMIC.cellLedger, base);
                saveLedger(DYNAMIC.riverLedger, surface);
                saveLedger(DYNAMIC.roadLedger, roads);
                saveLedger(DYNAMIC.waterLedger, water);
                saveLedger(DYNAMIC.terrainReadyLedger, terrainReady);
                logInfo(`Tree pass found missing physical terrain at ${cell.x},${cell.z}; terrain was requeued before any structure placement.`);
                terrainRepairNeeded = true;
                continue;
            }

            await runGenerator(removeLegacyProceduralTreesCell(dimension, cell.x, cell.z, seed, plan, origin));
            if (!vegetation.isComplete(cell.x, cell.z)) {
                terrainMetrics.beginCell(`vegetation:${cell.x},${cell.z}`);
                await runGenerator(generateVegetationCell(dimension, cell.x, cell.z, seed, plan, origin));
                vegetation.markComplete(cell.x, cell.z);
                saveLedger(DYNAMIC.vegetationLedger, vegetation);
                terrainMetrics.completeCell();
            }
            const pondResult = await runGenerator(placePondPlan(dimension, cell.x, cell.z, seed, origin, resolvedPond, plannedPonds));
            let result = { failures: pondResult.failures };
            if (pondResult.failures === 0) {
                terrainMetrics.beginCell(`tree-structure:${cell.x},${cell.z}`);
                result = await runGenerator(placeStructureTreePlan(dimension, cell.x, cell.z, seed, origin, planned));
            }
            if (result.failures === 0) {
                trees.markComplete(cell.x, cell.z);
                saveLedger(DYNAMIC.treeStructureLedger, trees);
                failures.delete(`${cell.x},${cell.z}`);
                waiting = Math.max(0, waiting - 1);
                terrainMetrics.recordTreeRegionComplete();
                terrainMetrics.completeCell();
            }
            else {
                const key = `${cell.x},${cell.z}`;
                failures.set(key, (failures.get(key) ?? 0) + 1);
            }
        }
        catch (error) {
            const key = `${cell.x},${cell.z}`;
            failures.set(key, (failures.get(key) ?? 0) + 1);
            logError(`tree-region-${key}`, error);
        }
        finally {
            await acquired.release();
            terrainMetrics.setTreeProgress(waiting, activeLedgerCount(trees));
            terrainMetrics.setQueue(order.length, waiting);
            persistMetrics();
        }
    }
    if (terrainRepairNeeded)
        throw new GenerationDeferredError("Tree validation requeued terrain that was physically missing; terrain repair takes priority over decoration", 1);
    if (failures.size > 0 || deferredRegions > 0)
        throw new GenerationDeferredError(`${failures.size + deferredRegions} tree-decoration region(s) remain queued after isolated failure/capacity deferral`, 100);
}

function lockVerifiedStructureTerrain(item, origin) {
    const volume = item.placement.protectedVolume;
    const minX = origin.x + volume.min.x;
    const maxX = origin.x + volume.max.x;
    const minZ = origin.z + volume.min.z;
    const maxZ = origin.z + volume.max.z;
    const base = loadLedger(DYNAMIC.cellLedger);
    const surface = loadLedger(DYNAMIC.riverLedger);
    const roads = loadLedger(DYNAMIC.roadLedger);
    for (let z = ACTIVE_CELL_MIN_Z; z <= ACTIVE_CELL_MAX_Z; z++) {
        for (let x = ACTIVE_CELL_MIN_X; x <= ACTIVE_CELL_MAX_X; x++) {
            const cellOrigin = cellWorldOrigin(x, z, origin);
            const cellMaxX = cellOrigin.x + CELL_SIZE - 1;
            const cellMaxZ = cellOrigin.z + CELL_SIZE - 1;
            if (cellOrigin.x > maxX || cellMaxX < minX || cellOrigin.z > maxZ || cellMaxZ < minZ)
                continue;
            if (!base.isComplete(x, z) || !surface.isComplete(x, z) || !roads.isComplete(x, z))
                throw new Error(`Refusing to protect ${item.placement.name}: supporting terrain cell ${x},${z} is not destructively complete`);
        }
    }
}
async function ensureCompletedBanditForts(dimension, origin, seed) {
    const availableStructureIds = world.structureManager.getPackStructureIds();
    const resolved = resolvePackStructures(availableStructureIds).filter(item => isBanditFortPlacement(item.placement));
    if (resolved.length === 0)
        return;
    await runStructureItems(dimension, resolved, origin);
    await blendStructureItems(dimension, resolved, origin, seed);
}
async function ensureCompletedVillageVillagers(dimension, origin) {
    const placement = STRUCTURE_PLACEMENTS.find(entry => entry.name === "village_e2990");
    if (!placement)
        return;
    const local = placement.boundingBox;
    const bounds = {
        min: { x: origin.x + local.min.x, y: local.min.y, z: origin.z + local.min.z },
        max: { x: origin.x + local.max.x, y: local.max.y, z: origin.z + local.max.z },
    };
    const item = { placement };
    await withTickingArea(
        "historyjam_sengoku_village_villagers",
        dimension,
        { x: bounds.min.x - 8, y: 24, z: bounds.min.z - 8 },
        { x: bounds.max.x + 8, y: 160, z: bounds.max.z + 8 },
        async () => {
            if (verifyStructurePlacement(dimension, item, origin))
                ensureVillageVillagers(dimension, item, origin);
        },
    );
}
async function runStructureItems(dimension, items, origin) {
    const placed = nameLedger(DYNAMIC.structureLedger);
    for (const item of items) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        const local = item.placement.boundingBox;
        const bounds = { min: { x: origin.x + local.min.x, y: local.min.y, z: origin.z + local.min.z }, max: { x: origin.x + local.max.x, y: local.max.y, z: origin.z + local.max.z } };
        const id = `historyjam_sengoku_v2_structure_${item.placement.placementOrder}`;
        let physicallyVerified = false;
        await withTickingArea(id, dimension, { x: bounds.min.x - 8, y: 24, z: bounds.min.z - 8 }, { x: bounds.max.x + 8, y: 160, z: bounds.max.z + 8 }, async () => {
            if (placed.has(item.placement.name) && verifyStructurePlacement(dimension, item, origin)) {
                ensureVillageVillagers(dimension, item, origin);
                ensureBanditFortBandits(dimension, item, origin);
                physicallyVerified = true;
                return;
            }
            if (placed.has(item.placement.name)) {
                placed.delete(item.placement.name);
                saveNameLedger(DYNAMIC.structureLedger, placed);
                logInfo(`Structure ledger repair: ${item.placement.name} was recorded but its physical signature was missing; replacing it in place.`);
            }
            await runGenerator(prepareStructureFootprint(dimension, item, origin));
            throwIfCancelled();
            placeStructure(dimension, item, origin);
            if (!verifyStructurePlacement(dimension, item, origin))
                throw new Error(`Structure ${item.placement.name} did not pass physical verification after placement`);
            ensureVillageVillagers(dimension, item, origin);
            ensureBanditFortBandits(dimension, item, origin);
            physicallyVerified = true;
        });
        if (!physicallyVerified)
            throw new Error(`Structure ${item.placement.name} could not be physically verified`);
        placed.add(item.placement.name);
        saveNameLedger(DYNAMIC.structureLedger, placed);
        lockVerifiedStructureTerrain(item, origin);
        persistMetrics();
    }
}
async function runStructureRegion(dimension, resolved, region, origin) {
    await runStructureItems(dimension, resolved.filter(entry => entry.placement.region === region), origin);
}
async function blendStructureItems(dimension, items, origin, seed) {
    const blended = nameLedger(DYNAMIC.blendLedger);
    for (const item of items) {
        throwIfCancelled();
        throwIfBackgroundDemandGone();
        if (blended.has(item.placement.name))
            continue;
        const local = item.placement.boundingBox;
        const bounds = { min: { x: origin.x + local.min.x, y: local.min.y, z: origin.z + local.min.z }, max: { x: origin.x + local.max.x, y: local.max.y, z: origin.z + local.max.z } };
        const id = `historyjam_sengoku_v2_blend_${item.placement.placementOrder}`;
        await withTickingArea(id, dimension, { x: bounds.min.x - 18, y: 20, z: bounds.min.z - 18 }, { x: bounds.max.x + 18, y: 165, z: bounds.max.z + 18 }, async () => runGenerator(blendStructureTerrain(dimension, item, origin, seed)));
        blended.add(item.placement.name);
        saveNameLedger(DYNAMIC.blendLedger, blended);
        persistMetrics();
    }
}
async function blendStructureRegion(dimension, resolved, region, origin, seed) {
    await blendStructureItems(dimension, resolved.filter(entry => entry.placement.region === region), origin, seed);
}
function ledgerProgress(key) { try {
    const ledger = loadLedger(key);
    let completed = 0;
    for (let z = ACTIVE_CELL_MIN_Z; z <= ACTIVE_CELL_MAX_Z; z++)
        for (let x = ACTIVE_CELL_MIN_X; x <= ACTIVE_CELL_MAX_X; x++)
            if (ledger.isComplete(x, z))
                completed++;
    return `${completed}/${ACTIVE_CELL_COUNT}`;
}
catch {
    return "corrupt";
} }
function activeLedgerComplete(key) {
    const ledger = loadLedger(key);
    for (let z = ACTIVE_CELL_MIN_Z; z <= ACTIVE_CELL_MAX_Z; z++)
        for (let x = ACTIVE_CELL_MIN_X; x <= ACTIVE_CELL_MAX_X; x++)
            if (!ledger.isComplete(x, z))
                return false;
    return true;
}
function delayTicks(ticks) {
    return new Promise(resolve => system.runTimeout(resolve, Math.max(1, ticks)));
}
export async function pauseBackgroundGenerationForTravel() {
    travelPauseDepth++;
    return true;
}
export function resumeBackgroundGenerationAfterTravel() {
    travelPauseDepth = Math.max(0, travelPauseDepth - 1);
    if (travelPauseDepth !== 0 || getStage() === GenerationStage.Complete || getStage() === GenerationStage.FailedRecoverable)
        return;
    for (const player of sengokuPlayers())
        generationDemand.requestResume(player.id);
    generationDemand.consumePendingResume();
    if (!guard.activeJob)
        scheduleResume(1);
}
export function getGenerationStatus() {
    const origin = getTerrainOrigin();
    const metrics = terrainMetrics.snapshot();
    const liveTicking = tickingAreaCapacitySnapshot();
    const bootstrapVersion = getNumber(DYNAMIC.entryBootstrapVersion, 0);
    return `stage=${getStage()} origin=${origin.x},${origin.z} arrival=${getBoolean(DYNAMIC.arrivalReady)} content=${getBoolean(DYNAMIC.contentReady)} bootstrap=${bootstrapVersion}/${ENTRY_BOOTSTRAP_VERSION} dry=${ledgerProgress(DYNAMIC.cellLedger)} water=${ledgerProgress(DYNAMIC.waterLedger)} terrainReady=${ledgerProgress(DYNAMIC.terrainReadyLedger)} vegetation=${ledgerProgress(DYNAMIC.vegetationLedger)} trees=${ledgerProgress(DYNAMIC.treeStructureLedger)} structures=${nameLedger(DYNAMIC.structureLedger).size}/${STRUCTURE_COUNT} active=${getString(DYNAMIC.activeJob) || "none"} queue=${metrics.cellsWaiting} remote=${metrics.remoteTerrainRegions} remoteVerified=${metrics.remoteTerrainValidations - metrics.remoteTerrainValidationFailures}/${metrics.remoteTerrainValidations} pipeline=${metrics.pipelineEnabled ? "on" : "off"} ticking=${liveTicking.chunkCount}/${liveTicking.maxChunkCount}`;
}
export async function initializeDimension(forceRecovery = false, entryOnly = false) {
    if (!guard.tryStart("generation")) {
        logInfo("Duplicate initialization request ignored; all players share the active terrain coordinator.");
        return false;
    }
    activeGenerationMode = entryOnly ? "foreground" : "background";
    cancelRequested = false;
    cancelReason = "Terrain generation cancelled";
    setDimensionProgress(DIMENSION_ID, 5);
    terrainMetrics.startSession();
    try {
        const baseState = ensureBaseState(seedFromWorld());
        setValue(DYNAMIC.activeJob, "generation");
        const origin = baseState.origin;
        const seed = getNumber(DYNAMIC.seed);
        const stageAtStart = getStage();
        const wasComplete = stageAtStart === GenerationStage.Complete &&
            activeLedgerComplete(DYNAMIC.terrainReadyLedger) &&
            activeLedgerComplete(DYNAMIC.treeStructureLedger);
        if (baseState.migrated && baseState.previousGenerationVersion > 0)
            broadcast(`Mixed-province migration preserved the previous landscape at ${baseState.previousOrigin?.x ?? 0},${baseState.previousOrigin?.z ?? 0} and selected the new origin ${origin.x},${origin.z}.`);
        if (baseState.bridgeCompatibilityRecovered)
            broadcast("Recovered the v1.0.65 authored-bridge compatibility failure; province generation will resume automatically from the saved stage.");
        const dimension = world.getDimension(DIMENSION_ID);
        setStage(GenerationStage.DimensionRegistered);
        terrainMetrics.setStage(GenerationStage.DimensionRegistered);
        const layoutErrors = validateLayout(STRUCTURE_PLACEMENTS);
        if (layoutErrors.length)
            throw new Error(`Invalid placement manifest: ${layoutErrors.join(", ")}`);
        setStage(GenerationStage.LayoutValidated);
        terrainMetrics.setStage(GenerationStage.LayoutValidated);

        let plan;
        const reuseVerifiedEntry = entryOnly && entryReadyThisSession && persistedEntryStateReady();
        if (!reuseVerifiedEntry) {
            const center = cellWorldOrigin(16, 16, origin);
            let arrivalValid = false;
            await withTickingArea(
                "historyjam_sengoku_v3_arrival_verify",
                dimension,
                { x: center.x - 4, y: 24, z: center.z - 4 },
                { x: center.x + 16, y: 145, z: center.z + 4 },
                async () => {
                    arrivalValid = verifyArrival(dimension, origin, seed);
                    if (!arrivalValid) {
                        setStage(GenerationStage.ArrivalPreparing);
                        terrainMetrics.setStage(GenerationStage.ArrivalPreparing);
                        await runGenerator(buildArrival(dimension, origin, seed));
                        arrivalValid = verifyArrival(dimension, origin, seed);
                    }
                },
            );
            if (!arrivalValid)
                throw new Error("Unsafe mixed-province arrival after landing preparation");
            setValue(DYNAMIC.arrivalReady, true);
            setDimensionProgress(DIMENSION_ID, 40);

            const bootstrapVersion = getNumber(DYNAMIC.entryBootstrapVersion, 0);
            const contentReady = getBoolean(DYNAMIC.contentReady);
            let physicalTerrainReady = false;
            if (contentReady && bootstrapVersion >= ENTRY_BOOTSTRAP_VERSION) {
                physicalTerrainReady = await verifyEntryTerrain(dimension, seed, origin);
                if (!physicalTerrainReady)
                    logInfo("Stored entry-ready state failed physical 64x64 verification; rebuilding only missing entry terrain in place.");
            }
            const bootstrapRequired = coreBootstrapRequired({
                contentReady,
                bootstrapVersion,
                requiredVersion: ENTRY_BOOTSTRAP_VERSION,
                physicalTerrainReady,
            });
            if (bootstrapRequired) {
                setValue(DYNAMIC.contentReady, false);
                setStage(GenerationStage.BaseTerrainGenerating);
                terrainMetrics.setStage(GenerationStage.BaseTerrainGenerating);
                plan = await getRoadPlan(seed);
                await runEntryBootstrap(dimension, seed, plan, origin);
                if (!await verifyEntryTerrain(dimension, seed, origin))
                    throw new Error("Entry terrain failed full 8x8-tile verification after bootstrap repair");
                setValue(DYNAMIC.entryBootstrapVersion, ENTRY_BOOTSTRAP_VERSION);
                setValue(DYNAMIC.contentReady, true);
                physicalTerrainReady = true;
                setStage(GenerationStage.ArrivalReady);
                terrainMetrics.setStage(GenerationStage.ArrivalReady);
                broadcast("Sengoku Japan entry terrain is ready. Every 8x8 tile in the 64x64 arrival district was physically verified; the rest of the province will stream in while players explore.");
            }
            if (!getBoolean(DYNAMIC.arrivalReady)
                || !getBoolean(DYNAMIC.contentReady)
                || getNumber(DYNAMIC.entryBootstrapVersion, 0) < ENTRY_BOOTSTRAP_VERSION
                || !physicalTerrainReady)
                throw new Error("Entry terrain readiness could not be physically established");
            entryReadyThisSession = true;
            markDimensionReady(DIMENSION_ID);
        }

        if (entryOnly) {
            const restoreStage = stageAtStart === GenerationStage.FailedRecoverable
                ? GenerationStage.FailedRecoverable
                : stageAtStart === GenerationStage.Uninitialized
                    || stageAtStart === GenerationStage.DimensionRegistered
                    || stageAtStart === GenerationStage.LayoutValidated
                    || stageAtStart === GenerationStage.ArrivalPreparing
                    ? GenerationStage.ArrivalReady
                    : stageAtStart;
            setStage(restoreStage);
            terrainMetrics.setStage(restoreStage);
            return true;
        }


        const availableStructureIds = world.structureManager.getPackStructureIds();
        const resolved = resolvePackStructures(availableStructureIds);
        const resolvedTrees = resolveTreeStructures(availableStructureIds);
        const resolvedPond = resolvePondStructure(availableStructureIds);
        if (!plan)
            plan = await getRoadPlan(seed);
        const priorityOrder = buildPriorityCellOrder(STRUCTURE_PLACEMENTS, plan);
        const fullOrder = buildFullCellOrder(priorityOrder);

        const arrivalDistrict = buildArrivalDistrictCellOrder(STRUCTURE_PLACEMENTS, plan);
        const arrivalDistrictTerrain = buildWaterSafeDryOrder(arrivalDistrict, seed);
        if (wasComplete) {
            if (!plan)
                plan = await getRoadPlan(seed);
            await ensureReadyAuthoredBridges(dimension, plan, origin, loadLedger(DYNAMIC.terrainReadyLedger), seed);
            await ensureCompletedBanditForts(dimension, origin, seed);
            await ensureCompletedVillageVillagers(dimension, origin);
            setStage(GenerationStage.Complete);
            terrainMetrics.setStage(GenerationStage.Complete);
            return true;
        }
        setStage(GenerationStage.BaseTerrainGenerating);
        terrainMetrics.setStage(GenerationStage.BaseTerrainGenerating);
        await runLandscapeOrder(dimension, arrivalDistrictTerrain, seed, plan, origin, { waterOrder: [] });
        setStage(GenerationStage.RegionAStructures);
        terrainMetrics.setStage(GenerationStage.RegionAStructures);
        await runStructureRegion(dimension, resolved, "A", origin);
        setValue(DYNAMIC.regionAComplete, true);
        setStage(GenerationStage.TerrainBlending);
        terrainMetrics.setStage(GenerationStage.TerrainBlending);
        await blendStructureRegion(dimension, resolved, "A", origin, seed);
        broadcast("The replacement Sengoku village is physically placed and verified. The nearby forest belt is filling next.");

        const arrivalForest = buildArrivalForestCellOrder(STRUCTURE_PLACEMENTS, plan);
        const arrivalForestTerrain = buildWaterSafeDryOrder(arrivalForest, seed);
        setStage(GenerationStage.BaseTerrainGenerating);
        terrainMetrics.setStage(GenerationStage.BaseTerrainGenerating);
        await runLandscapeOrder(dimension, arrivalForestTerrain, seed, plan, origin, { waterOrder: [] });
        await runLandscapeOrder(dimension, arrivalForestTerrain, seed, plan, origin, {
            waterOrder: arrivalForest,
            allowDeferredWater: true,
        });
        setStage(GenerationStage.VegetationGenerating);
        terrainMetrics.setStage(GenerationStage.VegetationGenerating);
        await runVegetationOrder(dimension, arrivalForest, seed, plan, origin);
        await runTreeStructureOrder(dimension, arrivalForest, seed, plan, origin, resolvedTrees, resolvedPond, {
            allowLargeTemplates: true,
            allowedLargeTemplateKeys: ["birch_tree", "spruce_tree", "bonsaitree"],
            allowDependencyDeferral: true,
        });
        broadcast("The arrival district forest is ready. Outer provinces continue streaming while you explore.");

        setStage(GenerationStage.BaseTerrainGenerating);
        terrainMetrics.setStage(GenerationStage.BaseTerrainGenerating);
        await runLandscapeOrder(dimension, fullOrder, seed, plan, origin, {
            priority1Order: arrivalDistrictTerrain,
            priority2Order: priorityOrder,
            resolvedTrees,
            resolvedPond,
            validateLegacyReady: true,
        });
        if (!verifyArrival(dimension, origin, seed))
            throw new Error("Arrival became unsafe during the full mixed-province terrain pass");
        broadcast("The full mixed-province surface is ready. Outer forest landmarks are now being completed in the background.");

        setStage(GenerationStage.RegionAStructures);
        terrainMetrics.setStage(GenerationStage.RegionAStructures);
        await runStructureRegion(dimension, resolved, "A", origin);
        setValue(DYNAMIC.regionAComplete, true);
        setStage(GenerationStage.TerrainBlending);
        terrainMetrics.setStage(GenerationStage.TerrainBlending);
        await blendStructureRegion(dimension, resolved, "A", origin, seed);
        setStage(GenerationStage.RegionBStructures);
        terrainMetrics.setStage(GenerationStage.RegionBStructures);
        await runStructureRegion(dimension, resolved, "B", origin);
        setValue(DYNAMIC.regionBComplete, true);
        setStage(GenerationStage.RegionCStructures);
        terrainMetrics.setStage(GenerationStage.RegionCStructures);
        await runStructureRegion(dimension, resolved, "C", origin);
        setValue(DYNAMIC.regionCComplete, true);
        setStage(GenerationStage.TerrainBlending);
        terrainMetrics.setStage(GenerationStage.TerrainBlending);
        await blendStructureRegion(dimension, resolved, "B", origin, seed);
        await blendStructureRegion(dimension, resolved, "C", origin, seed);
        setStage(GenerationStage.VegetationGenerating);
        terrainMetrics.setStage(GenerationStage.VegetationGenerating);
        await runTreeStructureOrder(dimension, fullOrder, seed, plan, origin, resolvedTrees, resolvedPond);
        setStage(GenerationStage.Validation);
        terrainMetrics.setStage(GenerationStage.Validation);
        if (!requiredStructureLedgersComplete(
                STRUCTURE_PLACEMENTS,
                nameLedger(DYNAMIC.structureLedger),
                nameLedger(DYNAMIC.blendLedger),
            ) ||
            !activeLedgerComplete(DYNAMIC.terrainReadyLedger) ||
            !activeLedgerComplete(DYNAMIC.treeStructureLedger) ||
            !verifyArrival(dimension, origin, seed) ||
            !getBoolean(DYNAMIC.contentReady))
            throw new Error("Final mixed-province runtime validation failed");
        setStage(GenerationStage.Complete);
        setValue(DYNAMIC.initialized, true);
        setValue(DYNAMIC.failureState, "");
        terrainMetrics.setStage(GenerationStage.Complete);
        persistMetrics(true);
        broadcast("Sengoku Japan mixed-province initialization complete.");
        return true;
    }
    catch (error) {
        if (error instanceof GenerationDeferredError) {
            logInfo(`${error.message}; background province generation will retry without losing queue state.`);
            resumeAfterFinish = true;
            resumeDelayAfterFinish = Math.max(1, error.retryTicks ?? 20);
        }
        else if (error instanceof GenerationCancelledError || isEngineInterruption(error)) {
            logInfo(error instanceof GenerationCancelledError ? error.message : "Terrain generation was interrupted; persisted ledgers will resume automatically.");
            if (!(error instanceof GenerationCancelledError)) {
                resumeAfterFinish = true;
                resumeDelayAfterFinish = 40;
            }
        }
        else {
            setFailure(getStage(), error);
            logError("generation-stage-failure", error);
            broadcast("Mixed-province generation paused in a recoverable state. Check the content log and use /historyjam:sengoku_recover after correcting the issue.");
        }
        return false;
    }
    finally {
            terrainMetrics.endSession();
        persistMetrics(true);
        setValue(DYNAMIC.activeJob, "");
        activeGenerationMode = "idle";
        guard.finish("generation");
        if (generationDemand.hasPendingResume() &&
            hasSengokuPlayers() &&
            travelPauseDepth === 0 &&
            getStage() !== GenerationStage.Complete &&
            getStage() !== GenerationStage.FailedRecoverable) {
            generationDemand.consumePendingResume();
            scheduleResume(1);
        }
        if (resumeAfterFinish) {
            const delay = resumeDelayAfterFinish;
            resumeAfterFinish = false;
            resumeDelayAfterFinish = 40;
            if (getStage() !== GenerationStage.Complete && getStage() !== GenerationStage.FailedRecoverable)
                scheduleResume(delay);
        }
        if (pendingReset) {
            const reset = pendingReset;
            pendingReset = undefined;
            cancelRequested = false;
            resetTerrainGeneration(reset.origin, reset.previous);
            broadcast(`Mixed-province reset abandoned the previous origin ${reset.previous.x},${reset.previous.z} without overwriting it. New generation origin: ${reset.origin.x},${reset.origin.z}.`);
            system.run(() => { void initializeDimension(true); });
        }
    }
}
function persistedEntryStateReady() {
    return Boolean(getBoolean(DYNAMIC.arrivalReady)
        && getBoolean(DYNAMIC.contentReady)
        && getNumber(DYNAMIC.entryBootstrapVersion, 0) >= ENTRY_BOOTSTRAP_VERSION);
}
export function sengokuEntryPersistedReady() {
    return persistedEntryStateReady();
}
export async function ensureEntryTerrainReadyForTravel() {
    if (entryReadyThisSession && persistedEntryStateReady())
        return true;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        while (guard.activeJob) {
            if (entryReadyThisSession && persistedEntryStateReady())
                return true;
            await delayTicks(1);
        }
        if (entryReadyThisSession && persistedEntryStateReady())
            return true;
        const ready = await initializeDimension(true, true);
        if (ready && entryReadyThisSession && persistedEntryStateReady())
            return true;
        await delayTicks(40);
    }
    return Boolean(entryReadyThisSession && persistedEntryStateReady());
}
export function requestTerrainReset() {
    entryReadyThisSession = false;
    const previous = getTerrainOrigin();
    const next = nextTerrainOrigin(previous);
    pendingReset = { origin: next, previous };
    if (guard.activeJob)
        cancelActiveRunJob("Administrator requested mixed-province terrain reset");
    else {
        const reset = pendingReset;
        pendingReset = undefined;
        resetTerrainGeneration(reset.origin, reset.previous);
        system.run(() => { void initializeDimension(true); });
    }
    return { previous, next };
}
export function previousTerrainOrigin() { return getPreviousTerrainOrigin(); }
