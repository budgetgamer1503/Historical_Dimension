import { system, world } from "@minecraft/server";
import { CELL_SIZE, DIMENSION_ID, DYNAMIC } from "../config.js";
import { logError, logInfo } from "../diagnostics/logging.js";
import { tryAcquireManagedTickingArea } from "../runtime/ticking_areas.js";
import { getNumber, getStage, getString, getTerrainOrigin, setValue } from "../state/dynamic_properties.js";
import { CellLedger } from "./cell_ledger.js";
import { generateOuterTerrainCell } from "./outer_terrain.js";
import {
    buildStreamingCandidates,
    isAuthoredTerrainCell,
    outerStreamingAllowed,
    outerTileSizeForMemoryTier,
    STREAM_GRID_SIZE,
    streamLedgerCoordinates,
    streamRadiusForMemoryTier,
    terrainCellWorldOrigin,
} from "./streaming_policy.js";

const OUTER_TERRAIN_VERSION = 1;
const STREAM_INTERVAL_TICKS = 6;
const CELL_LOAD_MIN_Y = 32;
const CELL_LOAD_MAX_Y = 128;

let registered = false;
let workerActive = false;
let cachedLedger;
let cachedLedgerVersion = -1;
let lastErrorText = "";
let lastErrorTick = -100000;

function newLedger() {
    return new CellLedger(STREAM_GRID_SIZE, STREAM_GRID_SIZE);
}

function loadLedger() {
    const persistedVersion = getNumber(DYNAMIC.outerTerrainVersion, 0);
    if (cachedLedger && cachedLedgerVersion === persistedVersion && persistedVersion === OUTER_TERRAIN_VERSION)
        return cachedLedger;

    const encoded = getString(DYNAMIC.outerTerrainLedger, "");
    if (persistedVersion === OUTER_TERRAIN_VERSION && encoded) {
        try {
            cachedLedger = CellLedger.decode(STREAM_GRID_SIZE, STREAM_GRID_SIZE, encoded);
            cachedLedgerVersion = persistedVersion;
            return cachedLedger;
        }
        catch (error) {
            logError("outer-terrain-ledger-decode", error);
        }
    }

    cachedLedger = newLedger();
    cachedLedgerVersion = OUTER_TERRAIN_VERSION;
    setValue(DYNAMIC.outerTerrainVersion, OUTER_TERRAIN_VERSION);
    setValue(DYNAMIC.outerTerrainLedger, cachedLedger.encode());
    return cachedLedger;
}

function saveLedger(ledger) {
    setValue(DYNAMIC.outerTerrainVersion, OUTER_TERRAIN_VERSION);
    setValue(DYNAMIC.outerTerrainLedger, ledger.encode());
}

function ledgerIsComplete(ledger, cell) {
    const coords = streamLedgerCoordinates(cell.x, cell.z);
    return coords ? ledger.isComplete(coords.x, coords.z) : true;
}

function markLedgerComplete(ledger, cell) {
    const coords = streamLedgerCoordinates(cell.x, cell.z);
    if (!coords)
        return;
    ledger.markComplete(coords.x, coords.z);
    saveLedger(ledger);
}

function cellBounds(cell, origin) {
    const start = terrainCellWorldOrigin(cell.x, cell.z, origin);
    return {
        from: { x: start.x, y: CELL_LOAD_MIN_Y, z: start.z },
        to: { x: start.x + CELL_SIZE - 1, y: CELL_LOAD_MAX_Y, z: start.z + CELL_SIZE - 1 },
    };
}

function cellChunksLoaded(dimension, bounds) {
    const minChunkX = Math.floor(bounds.from.x / 16);
    const maxChunkX = Math.floor(bounds.to.x / 16);
    const minChunkZ = Math.floor(bounds.from.z / 16);
    const maxChunkZ = Math.floor(bounds.to.z / 16);
    for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ++) {
        for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
            if (!dimension.isChunkLoaded({ x: chunkX * 16 + 8, y: 72, z: chunkZ * 16 + 8 }))
                return false;
        }
    }
    return true;
}

function runGeneratorJob(generator) {
    return new Promise((resolve, reject) => {
        function* wrapped() {
            try {
                yield* generator;
                resolve();
            }
            catch (error) {
                reject(error);
            }
        }
        system.runJob(wrapped());
    });
}

async function generateCell(dimension, cell, seed, origin, memoryTier) {
    if (isAuthoredTerrainCell(cell.x, cell.z))
        return false;

    const bounds = cellBounds(cell, origin);
    let release;
    if (!cellChunksLoaded(dimension, bounds)) {
        const acquired = await tryAcquireManagedTickingArea({
            id: `historyjam_outer_${cell.x}_${cell.z}`,
            dimension,
            from: bounds.from,
            to: bounds.to,
            priority: "normal",
            loadTimeoutTicks: memoryTier <= 1 ? 80 : 120,
        });
        if (!acquired.acquired)
            return false;
        release = acquired.release;
    }

    try {
        await runGeneratorJob(generateOuterTerrainCell(
            dimension,
            cell.x,
            cell.z,
            seed,
            origin,
            outerTileSizeForMemoryTier(memoryTier),
        ));
        return true;
    }
    finally {
        if (release)
            await release();
    }
}

function reportStreamingError(error) {
    const text = String(error);
    if (text !== lastErrorText || system.currentTick - lastErrorTick >= 200) {
        lastErrorText = text;
        lastErrorTick = system.currentTick;
        logError("outer-terrain-streaming", error);
    }
}

async function streamNearestCell() {
    if (workerActive)
        return;

    const dimension = world.getDimension(DIMENSION_ID);
    const players = dimension.getPlayers();
    if (players.length === 0)
        return;

    if (!outerStreamingAllowed({
        stage: getStage(),
        activeJob: getString(DYNAMIC.activeJob, ""),
    }))
        return;

    if (getNumber(DYNAMIC.generationVersion, 0) <= 0)
        return;

    const origin = getTerrainOrigin();
    const seed = getNumber(DYNAMIC.seed, 0);
    const memoryTier = Number(system.serverSystemInfo?.memoryTier ?? 1);
    const ledger = loadLedger();
    const focusPoints = players.map(player => player.location);
    const candidates = buildStreamingCandidates(
        focusPoints,
        origin,
        new Set(),
        streamRadiusForMemoryTier(memoryTier),
    );
    const next = candidates.find(cell => !ledgerIsComplete(ledger, cell));
    if (!next)
        return;

    workerActive = true;
    try {
        if (await generateCell(dimension, next, seed, origin, memoryTier)) {
            markLedgerComplete(ledger, next);
            system.run(() => { void streamNearestCell().catch(reportStreamingError); });
        }
    }
    catch (error) {
        reportStreamingError(error);
    }
    finally {
        workerActive = false;
    }
}

export function registerOuterTerrainStreaming() {
    if (registered)
        return;
    registered = true;
    logInfo("Continuation terrain streaming enabled for historyjam:sengoku_japan.");
    system.runInterval(() => {
        void streamNearestCell().catch(reportStreamingError);
    }, STREAM_INTERVAL_TICKS);
}
