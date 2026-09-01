import {
    ACTIVE_CELL_MAX_X,
    ACTIVE_CELL_MAX_Z,
    ACTIVE_CELL_MIN_X,
    ACTIVE_CELL_MIN_Z,
    ACTIVE_MAX_X,
    ACTIVE_MAX_Z,
    ACTIVE_MIN_X,
    ACTIVE_MIN_Z,
    ARRIVAL,
    CELL_SIZE,
    HARD_MIN,
} from "../config.js";
import { VegetationCellSampler } from "./vegetation.js";

export const POND_TEMPLATE = {
    key: "pond",
    expectedRuntimeIdentifier: "historyjam:sengoku_japan/pond",
    size: { x: 14, y: 12, z: 24 },
    anchor: { x: 6, z: 11 },
    yOffset: -1,
};

const POND_REGION_CELL_SPAN = 2;
const POND_OWNER_CELL_OFFSET = 1;
const POND_SPAWN_CHANCE = 0.50;
const POND_CELL_EDGE_BUFFER = 2;
const POND_MAX_TERRAIN_VARIATION = 1;
const POND_MIN_HEIGHT = 58;
const POND_MAX_HEIGHT = 110;
const POND_MIN_STRUCTURE_DISTANCE = 22;
const POND_MIN_ARRIVAL_DISTANCE = 88;
const POND_ROAD_CLEARANCE = 11;
const POND_MAX_AGRICULTURE_SUITABILITY = 0.34;
const POND_MAX_BANK_MASK = 0.34;
const POND_TREE_CLEARANCE = 4;
const POND_CENTER_COVERS = new Set(["open_grass", "meadow", "foothill_woodland"]);
const planCache = new Map();

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


function hashUnit(x, z, seed, salt = 0) {
    let h = (Math.floor(seed) ^ Math.imul(Math.floor(x), 0x45d9f3b) ^ Math.imul(Math.floor(z), 0x119de1f3) ^ salt) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function ownerCell(value) {
    return value % POND_REGION_CELL_SPAN === POND_OWNER_CELL_OFFSET;
}

function pondRotation(cx, cz, seed) {
    const roll = hashUnit(cx, cz, seed, 10037);
    if (roll < 0.25)
        return "None";
    if (roll < 0.50)
        return "Rotate90";
    if (roll < 0.75)
        return "Rotate180";
    return "Rotate270";
}

export function rotatedPondGeometry(rotation) {
    const template = POND_TEMPLATE;
    const sx = template.size.x;
    const sz = template.size.z;
    const ax = template.anchor.x;
    const az = template.anchor.z;
    switch (rotation) {
        case "Rotate90":
            return { size: { x: sz, y: template.size.y, z: sx }, anchor: { x: sz - 1 - az, z: ax } };
        case "Rotate180":
            return { size: { ...template.size }, anchor: { x: sx - 1 - ax, z: sz - 1 - az } };
        case "Rotate270":
            return { size: { x: sz, y: template.size.y, z: sx }, anchor: { x: az, z: sx - 1 - ax } };
        default:
            return { size: { ...template.size }, anchor: { ...template.anchor } };
    }
}

function candidateRange(cellMin, geometrySize, anchor) {
    const before = anchor;
    const after = geometrySize - 1 - anchor;
    return {
        min: cellMin + POND_CELL_EDGE_BUFFER + before,
        max: cellMin + CELL_SIZE - 1 - POND_CELL_EDGE_BUFFER - after,
    };
}

function deterministicCoordinate(min, max, roll) {
    if (max <= min)
        return min;
    return min + Math.floor(roll * (max - min + 1));
}

function footprintSamples(bounds) {
    const midX = Math.floor((bounds.minX + bounds.maxX) / 2);
    const midZ = Math.floor((bounds.minZ + bounds.maxZ) / 2);
    return [
        { x: bounds.minX, z: bounds.minZ },
        { x: midX, z: bounds.minZ },
        { x: bounds.maxX, z: bounds.minZ },
        { x: bounds.minX, z: midZ },
        { x: midX, z: midZ },
        { x: bounds.maxX, z: midZ },
        { x: bounds.minX, z: bounds.maxZ },
        { x: midX, z: bounds.maxZ },
        { x: bounds.maxX, z: bounds.maxZ },
    ];
}

function boundsOverlap(a, b, margin = 0) {
    return a.minX - margin <= b.maxX && a.maxX + margin >= b.minX &&
        a.minZ - margin <= b.maxZ && a.maxZ + margin >= b.minZ;
}

function cacheKey(cx, cz, seed) {
    return `${seed}|${cx},${cz}`;
}

function makePondPlan(cx, cz, seed, plan) {
    if (cx < ACTIVE_CELL_MIN_X || cx > ACTIVE_CELL_MAX_X || cz < ACTIVE_CELL_MIN_Z || cz > ACTIVE_CELL_MAX_Z)
        return [];
    if (!ownerCell(cx) || !ownerCell(cz))
        return [];
    if (hashUnit(cx, cz, seed, 10009) >= POND_SPAWN_CHANCE)
        return [];

    const rotation = pondRotation(cx, cz, seed);
    const geometry = rotatedPondGeometry(rotation);
    const cellMinX = HARD_MIN + cx * CELL_SIZE;
    const cellMinZ = HARD_MIN + cz * CELL_SIZE;
    const xRange = candidateRange(cellMinX, geometry.size.x, geometry.anchor.x);
    const zRange = candidateRange(cellMinZ, geometry.size.z, geometry.anchor.z);
    if (xRange.max < xRange.min || zRange.max < zRange.min)
        return [];

    const x = deterministicCoordinate(xRange.min, xRange.max, hashUnit(cx, cz, seed, 10061));
    const z = deterministicCoordinate(zRange.min, zRange.max, hashUnit(cx, cz, seed, 10067));
    if (Math.hypot(x - ARRIVAL.x, z - ARRIVAL.z) < POND_MIN_ARRIVAL_DISTANCE)
        return [];

    const bounds = {
        minX: x - geometry.anchor.x,
        minZ: z - geometry.anchor.z,
        maxX: x - geometry.anchor.x + geometry.size.x - 1,
        maxZ: z - geometry.anchor.z + geometry.size.z - 1,
    };
    if (bounds.minX < ACTIVE_MIN_X || bounds.maxX > ACTIVE_MAX_X || bounds.minZ < ACTIVE_MIN_Z || bounds.maxZ > ACTIVE_MAX_Z)
        return [];

    const sampler = new VegetationCellSampler(seed, plan);
    const center = sampler.site(x, z);
    if (!center.allowed || !POND_CENTER_COVERS.has(center.cover))
        return [];
    if (center.suitability > POND_MAX_AGRICULTURE_SUITABILITY || center.structureDistance < POND_MIN_STRUCTURE_DISTANCE)
        return [];
    if (center.terrain.height < POND_MIN_HEIGHT || center.terrain.height > POND_MAX_HEIGHT)
        return [];
    if (center.slope > 1)
        return [];

    const heights = [];
    for (const sample of footprintSamples(bounds)) {
        const site = sampler.site(sample.x, sample.z);
        if (!site.allowed)
            return [];
        if (site.terrain.hydrology.channel || site.terrain.hydrology.bankMask > POND_MAX_BANK_MASK)
            return [];
        if (site.suitability > POND_MAX_AGRICULTURE_SUITABILITY || site.structureDistance < POND_MIN_STRUCTURE_DISTANCE)
            return [];
        if (site.road && site.road.distance <= site.road.width + POND_ROAD_CLEARANCE)
            return [];
        if (site.terrain.height < POND_MIN_HEIGHT || site.terrain.height > POND_MAX_HEIGHT)
            return [];
        heights.push(site.terrain.height);
    }
    const minimum = Math.min(...heights);
    const maximum = Math.max(...heights);
    if (maximum - minimum > POND_MAX_TERRAIN_VARIATION)
        return [];

    return [{
        cell: { x: cx, z: cz },
        candidate: { x, y: minimum, z },
        rotation,
        geometry,
        bounds,
        location: { x: bounds.minX, y: minimum + POND_TEMPLATE.yOffset, z: bounds.minZ },
    }];
}

export function planPondsForCell(cx, cz, seed, plan) {
    const key = cacheKey(cx, cz, seed);
    const cached = planCache.get(key);
    if (cached)
        return cached;
    const planned = makePondPlan(cx, cz, seed, plan);
    planCache.set(key, planned);
    if (planCache.size > 4096) {
        const oldest = planCache.keys().next().value;
        if (oldest !== undefined)
            planCache.delete(oldest);
    }
    return planned;
}

export function pondTreeConflict(treeBounds, seed, plan, margin = POND_TREE_CLEARANCE) {
    const minCellX = clamp(Math.floor((treeBounds.minX - HARD_MIN) / CELL_SIZE), ACTIVE_CELL_MIN_X, ACTIVE_CELL_MAX_X);
    const maxCellX = clamp(Math.floor((treeBounds.maxX - HARD_MIN) / CELL_SIZE), ACTIVE_CELL_MIN_X, ACTIVE_CELL_MAX_X);
    const minCellZ = clamp(Math.floor((treeBounds.minZ - HARD_MIN) / CELL_SIZE), ACTIVE_CELL_MIN_Z, ACTIVE_CELL_MAX_Z);
    const maxCellZ = clamp(Math.floor((treeBounds.maxZ - HARD_MIN) / CELL_SIZE), ACTIVE_CELL_MIN_Z, ACTIVE_CELL_MAX_Z);
    for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        for (let cx = minCellX; cx <= maxCellX; cx++) {
            for (const pond of planPondsForCell(cx, cz, seed, plan)) {
                if (boundsOverlap(treeBounds, pond.bounds, margin))
                    return true;
            }
        }
    }
    return false;
}

