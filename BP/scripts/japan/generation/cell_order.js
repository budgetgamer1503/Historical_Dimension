import { ACTIVE_CELL_MAX_X, ACTIVE_CELL_MAX_Z, ACTIVE_CELL_MIN_X, ACTIVE_CELL_MIN_Z, ARRIVAL, ARRIVAL_BACKGROUND_HORIZON_RADIUS, ARRIVAL_HORIZON_RADIUS, CELL_SIZE, GRID_SIZE, HARD_MIN } from "../config.js";
import { mainRiverCenterX } from "./terrain.js";
function clampCell(value) { return Math.max(0, Math.min(GRID_SIZE - 1, value)); }
export function worldToCell(x, z) { return { x: clampCell(Math.floor((x - HARD_MIN) / CELL_SIZE)), z: clampCell(Math.floor((z - HARD_MIN) / CELL_SIZE)) }; }
function key(cell) { return `${cell.x},${cell.z}`; }
function addCell(target, cell) { target.set(key(cell), cell); }
function addBounds(target, minX, minZ, maxX, maxZ) {
    const min = worldToCell(minX, minZ), max = worldToCell(maxX, maxZ);
    for (let z = min.z; z <= max.z; z++)
        for (let x = min.x; x <= max.x; x++)
            addCell(target, { x, z });
}
function addCellHalo(target, cell, radius = 1) {
    for (let z = Math.max(0, cell.z - radius); z <= Math.min(GRID_SIZE - 1, cell.z + radius); z++)
        for (let x = Math.max(0, cell.x - radius); x <= Math.min(GRID_SIZE - 1, cell.x + radius); x++)
            addCell(target, { x, z });
}
function sortFromArrival(cells) {
    const arrival = worldToCell(ARRIVAL.x, ARRIVAL.z);
    return [...cells].sort((a, b) => {
        const da = (a.x - arrival.x) ** 2 + (a.z - arrival.z) ** 2, db = (b.x - arrival.x) ** 2 + (b.z - arrival.z) ** 2;
        return da - db || a.z - b.z || a.x - b.x;
    });
}
export function sortCellsByFocusPoints(cells, focusPoints, origin = { x: 0, z: 0 }) {
    if (!focusPoints || focusPoints.length === 0)
        return [...cells];
    const indexed = [...cells].map((cell, index) => ({ cell, index }));
    const distanceSquared = cell => cellFocusDistanceSquared(cell, focusPoints, origin);
    indexed.sort((a, b) => distanceSquared(a.cell) - distanceSquared(b.cell) || a.index - b.index);
    return indexed.map(entry => entry.cell);
}
export function selectFocusedBatchCells(batch, focusPoints, origin = { x: 0, z: 0 }, maximumCells = 1) {
    const count = Math.max(1, Math.floor(maximumCells));
    if (!focusPoints || focusPoints.length === 0)
        return [...batch].slice(0, count);
    return sortCellsByFocusPoints(batch, focusPoints, origin).slice(0, count);
}
function cellFocusDistanceSquared(cell, focusPoints, origin) {
    const centerX = origin.x + HARD_MIN + cell.x * CELL_SIZE + (CELL_SIZE - 1) / 2;
    const centerZ = origin.z + HARD_MIN + cell.z * CELL_SIZE + (CELL_SIZE - 1) / 2;
    let best = Number.POSITIVE_INFINITY;
    for (const point of focusPoints) {
        const dx = centerX - point.x;
        const dz = centerZ - point.z;
        best = Math.min(best, dx * dx + dz * dz);
    }
    return best;
}
export function filterFocusPointsToActiveTerrain(focusPoints, origin = { x: 0, z: 0 }, margin = CELL_SIZE) {
    if (!focusPoints || focusPoints.length === 0)
        return [];
    const minX = origin.x + HARD_MIN + ACTIVE_CELL_MIN_X * CELL_SIZE - margin;
    const maxX = origin.x + HARD_MIN + (ACTIVE_CELL_MAX_X + 1) * CELL_SIZE - 1 + margin;
    const minZ = origin.z + HARD_MIN + ACTIVE_CELL_MIN_Z * CELL_SIZE - margin;
    const maxZ = origin.z + HARD_MIN + (ACTIVE_CELL_MAX_Z + 1) * CELL_SIZE - 1 + margin;
    return focusPoints.filter(point => point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ);
}

export function sortCellBatchesByFocusPoints(batches, focusPoints, origin = { x: 0, z: 0 }) {
    if (!focusPoints || focusPoints.length === 0)
        return [...batches];
    return [...batches]
        .map((batch, index) => ({
            batch,
            index,
            distance: batch.reduce((best, cell) => Math.min(best, cellFocusDistanceSquared(cell, focusPoints, origin)), Number.POSITIVE_INFINITY),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)
        .map(entry => entry.batch);
}
function buildArrivalBounds(radius) {
    const cells = new Map();
    addBounds(cells,
        ARRIVAL.x - radius,
        ARRIVAL.z - radius,
        ARRIVAL.x + radius - 1,
        ARRIVAL.z + radius - 1);
    return sortFromArrival(cells.values());
}
export function buildArrivalCellOrder() {
    return buildArrivalBounds(ARRIVAL_HORIZON_RADIUS);
}
export function buildArrivalBackgroundHorizonOrder() {
    return buildArrivalBounds(ARRIVAL_BACKGROUND_HORIZON_RADIUS);
}

export function buildWaterSafeDryOrder(core, seed) {
    const cells = new Map(core.map(cell => [key(cell), cell]));
    for (const cell of core) {
        for (let z = Math.max(ACTIVE_CELL_MIN_Z, cell.z - 1); z <= Math.min(ACTIVE_CELL_MAX_Z, cell.z + 1); z++)
            for (let x = Math.max(ACTIVE_CELL_MIN_X, cell.x - 1); x <= Math.min(ACTIVE_CELL_MAX_X, cell.x + 1); x++)
                addCell(cells, { x, z });
    }
    return sortFromArrival(cells.values());
}

export function buildPriorityCellOrder(records, plan) {
    const cells = new Map();
    for (const cell of buildArrivalBackgroundHorizonOrder())
        addCell(cells, cell);
    addBounds(cells, -300, 100, 90, 300);
    for (const placement of records) {
        const bounds = placement.protectedVolume;
        addBounds(cells, bounds.min.x - 8, bounds.min.z - 8, bounds.max.x + 8, bounds.max.z + 8);
    }
    for (const segment of plan.segments) {
        for (const point of segment.points)
            addCell(cells, worldToCell(point.x, point.z));
    }
    for (let z = -150; z <= 390; z += 24) {
        const x = mainRiverCenterX(z, plan.seed);
        addBounds(cells, x - 24, z - 16, x + 24, z + 16);
    }
    return sortFromArrival(cells.values());
}
export function buildFullCellOrder(priority) {
    const activePriority = priority.filter(cell => cell.x >= ACTIVE_CELL_MIN_X && cell.x <= ACTIVE_CELL_MAX_X && cell.z >= ACTIVE_CELL_MIN_Z && cell.z <= ACTIVE_CELL_MAX_Z);
    const seen = new Set(activePriority.map(key));
    const remainder = [];
    for (let z = ACTIVE_CELL_MIN_Z; z <= ACTIVE_CELL_MAX_Z; z++)
        for (let x = ACTIVE_CELL_MIN_X; x <= ACTIVE_CELL_MAX_X; x++) {
            const cell = { x, z };
            if (!seen.has(key(cell)))
                remainder.push(cell);
        }
    return [...activePriority, ...sortFromArrival(remainder)];
}

export function selectArrivalDistrictStructures(records, radius = 120) {
    return records
        .filter(record => record.region === "A" && Math.hypot(record.entrance.x - ARRIVAL.x, record.entrance.z - ARRIVAL.z) <= radius)
        .sort((a, b) => a.placementOrder - b.placementOrder);
}
function addPolylineCells(target, points, halo = 0) {
    for (let index = 0; index < points.length - 1; index++) {
        const a = points[index], b = points[index + 1];
        const length = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 12));
        for (let step = 0; step <= length; step++) {
            const t = step / length;
            addCellHalo(target, worldToCell(
                Math.round(a.x + (b.x - a.x) * t),
                Math.round(a.z + (b.z - a.z) * t),
            ), halo);
        }
    }
}
export function buildArrivalDistrictCellOrder(records, plan) {
    const cells = new Map();
    for (const cell of buildArrivalCellOrder())
        addCell(cells, cell);
    const selected = selectArrivalDistrictStructures(records);
    for (const placement of selected) {
        const bounds = placement.protectedVolume;
        addBounds(cells, bounds.min.x - 8, bounds.min.z - 8, bounds.max.x + 8, bounds.max.z + 8);
        addPolylineCells(cells, placement.road, 0);
    }
    return sortFromArrival(cells.values());
}

export function buildArrivalForestCellOrder(records, plan) {
    const cells = new Map();
    for (const cell of buildArrivalBackgroundHorizonOrder())
        addCell(cells, cell);
    const selected = selectArrivalDistrictStructures(records);
    for (const placement of selected) {
        const bounds = placement.protectedVolume;
        addBounds(cells, bounds.min.x - 32, bounds.min.z - 32, bounds.max.x + 32, bounds.max.z + 32);
        addPolylineCells(cells, placement.road, 1);
    }
    return sortFromArrival(cells.values());
}

export function buildStructureBootstrapCellOrder(placement, margin = 8) {
    const bounds = placement?.protectedVolume ?? placement?.boundingBox;
    if (!bounds)
        return [];
    const cells = new Map();
    addBounds(
        cells,
        bounds.min.x - margin,
        bounds.min.z - margin,
        bounds.max.x + margin,
        bounds.max.z + margin,
    );
    return sortFromArrival(cells.values());
}

