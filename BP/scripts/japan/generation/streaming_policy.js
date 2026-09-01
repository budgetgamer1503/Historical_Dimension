import {
    ACTIVE_CELL_MAX_X,
    ACTIVE_CELL_MAX_Z,
    ACTIVE_CELL_MIN_X,
    ACTIVE_CELL_MIN_Z,
    CELL_SIZE,
    HARD_MIN,
} from "../config.js";

export const STREAM_MIN_CELL = -64;
export const STREAM_MAX_CELL = 95;
export const STREAM_GRID_SIZE = STREAM_MAX_CELL - STREAM_MIN_CELL + 1;

export function isAuthoredTerrainCell(cx, cz) {
    return cx >= ACTIVE_CELL_MIN_X && cx <= ACTIVE_CELL_MAX_X &&
        cz >= ACTIVE_CELL_MIN_Z && cz <= ACTIVE_CELL_MAX_Z;
}

export function worldToTerrainCell(worldX, worldZ, origin = { x: 0, z: 0 }) {
    return {
        x: Math.floor((worldX - origin.x - HARD_MIN) / CELL_SIZE),
        z: Math.floor((worldZ - origin.z - HARD_MIN) / CELL_SIZE),
    };
}

export function terrainCellWorldOrigin(cx, cz, origin = { x: 0, z: 0 }) {
    return {
        x: origin.x + HARD_MIN + cx * CELL_SIZE,
        z: origin.z + HARD_MIN + cz * CELL_SIZE,
    };
}

export function streamLedgerCoordinates(cx, cz) {
    if (cx < STREAM_MIN_CELL || cx > STREAM_MAX_CELL || cz < STREAM_MIN_CELL || cz > STREAM_MAX_CELL)
        return undefined;
    return { x: cx - STREAM_MIN_CELL, z: cz - STREAM_MIN_CELL };
}

export function streamRadiusForMemoryTier(memoryTier) {
    const tier = Math.max(0, Math.min(4, Math.floor(Number(memoryTier) || 0)));
    if (tier <= 1)
        return 2;
    if (tier === 2)
        return 3;
    if (tier === 3)
        return 4;
    return 5;
}

export function outerTileSizeForMemoryTier(memoryTier) {
    const tier = Math.max(0, Math.min(4, Math.floor(Number(memoryTier) || 0)));
    return tier <= 1 ? 8 : 4;
}

function cellKey(cell) {
    return `${cell.x},${cell.z}`;
}

function focusDistanceSquared(cell, focusPoints, origin) {
    const cellOrigin = terrainCellWorldOrigin(cell.x, cell.z, origin);
    const centerX = cellOrigin.x + CELL_SIZE / 2;
    const centerZ = cellOrigin.z + CELL_SIZE / 2;
    let best = Number.POSITIVE_INFINITY;
    for (const point of focusPoints) {
        const dx = centerX - point.x;
        const dz = centerZ - point.z;
        best = Math.min(best, dx * dx + dz * dz);
    }
    return best;
}

export function buildStreamingCandidates(focusPoints, origin, completedKeys = new Set(), radiusCells = 2) {
    const radius = Math.max(1, Math.floor(radiusCells));
    const seen = new Set();
    const output = [];
    for (const point of focusPoints) {
        const focus = worldToTerrainCell(point.x, point.z, origin);
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const cell = { x: focus.x + dx, z: focus.z + dz };
                if (isAuthoredTerrainCell(cell.x, cell.z))
                    continue;
                if (!streamLedgerCoordinates(cell.x, cell.z))
                    continue;
                const key = cellKey(cell);
                if (seen.has(key) || completedKeys.has(key))
                    continue;
                seen.add(key);
                output.push(cell);
            }
        }
    }
    output.sort((a, b) => {
        const da = focusDistanceSquared(a, focusPoints, origin);
        const db = focusDistanceSquared(b, focusPoints, origin);
        return da - db || a.z - b.z || a.x - b.x;
    });
    return output;
}

export function streamingCellKey(cx, cz) {
    return `${cx},${cz}`;
}

export function outerStreamingAllowed({ stage, activeJob }) {
    return stage === "complete" && !activeJob;
}
