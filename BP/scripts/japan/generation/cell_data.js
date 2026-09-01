import { ACTIVE_MAX_X, ACTIVE_MAX_Z, ACTIVE_MIN_X, ACTIVE_MIN_Z, CELL_SIZE, HARD_MAX, HARD_MIN } from "../config.js";
import { isInsideProtectedStructure } from "../structures/protected_volumes.js";
import { classifyAgriculture, classifyAgricultureFromInputs } from "./agriculture.js";
import { nearestRoadSample } from "./road_network.js";
import { arrivalClearingMask, classifyRegion, forestDensityFromFields, sacredGroveMask, sampleHydrology, sampleTerrainColumn, terrainSlope, WATER_LEVEL, } from "./terrain.js";
import { deterministicNoise2D } from "./noise.js";
export function cellLocalOrigin(cx, cz) {
    return { x: HARD_MIN + cx * CELL_SIZE, z: HARD_MIN + cz * CELL_SIZE };
}
function pointKey(x, z) { return `${x},${z}`; }
const channelCellCache = new Map();
export function cellMayContainChannel(cx, cz, seed) {
    const cacheKey = `${seed}|${cx}|${cz}`;
    const cached = channelCellCache.get(cacheKey);
    if (cached !== undefined)
        return cached;
    const origin = cellLocalOrigin(cx, cz);
    const offsets = [0, 4, 8, 12, 16, 20, 24, 28, 31];
    let contains = false;
    outer: for (const zOffset of offsets)
        for (const xOffset of offsets)
            if (sampleHydrology(origin.x + xOffset, origin.z + zOffset, seed).channel) {
                contains = true;
                break outer;
            }
    channelCellCache.set(cacheKey, contains);
    return contains;
}
export class ActiveCellSampler {
    seed;
    plan;
    terrainCache = new Map();
    slopeCache = new Map();
    protectedCache = new Map();
    roadCache = new Map();
    agricultureCache = new Map();
    rawSurfaceCache = new Map();
    stats = { terrainColumnEvaluations: 0, slopeEvaluations: 0, protectedChecks: 0, roadQueries: 0, generatedColumns: 0 };
    constructor(seed, plan) {
        this.seed = seed;
        this.plan = plan;
    }
    terrain(x, z) {
        const key = pointKey(x, z);
        let value = this.terrainCache.get(key);
        if (!value) {
            value = sampleTerrainColumn(x, z, this.seed);
            this.terrainCache.set(key, value);
            this.stats.terrainColumnEvaluations++;
        }
        return value;
    }
    slope(x, z) {
        const key = pointKey(x, z);
        const cached = this.slopeCache.get(key);
        if (cached !== undefined)
            return cached;
        const center = this.terrain(x, z).height;
        let maximum = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const neighborX = Math.max(HARD_MIN, Math.min(HARD_MAX, x + dx));
            const neighborZ = Math.max(HARD_MIN, Math.min(HARD_MAX, z + dz));
            maximum = Math.max(maximum, Math.abs(center - this.terrain(neighborX, neighborZ).height));
        }
        this.slopeCache.set(key, maximum);
        this.stats.slopeEvaluations++;
        return maximum;
    }
    protected(x, z, margin) {
        const key = `${x},${z},${margin}`;
        const cached = this.protectedCache.get(key);
        if (cached !== undefined)
            return cached;
        const value = isInsideProtectedStructure(x, z, margin);
        this.protectedCache.set(key, value);
        this.stats.protectedChecks++;
        return value;
    }
    road(x, z) {
        const key = pointKey(x, z);
        if (this.roadCache.has(key))
            return this.roadCache.get(key);
        this.stats.roadQueries++;
        const value = nearestRoadSample(x, z, this.plan, 8);
        this.roadCache.set(key, value);
        return value;
    }
    agriculture(x, z) {
        const key = pointKey(x, z);
        const cached = this.agricultureCache.get(key);
        if (cached)
            return cached;
        const terrain = this.terrain(x, z);
        const value = classifyAgricultureFromInputs(x, z, this.seed, {
            terrain: terrain.height,
            slope: this.slope(x, z),
            hydrology: terrain.hydrology,
            protectedStructure: this.protected(x, z, 5),
        });
        this.agricultureCache.set(key, value);
        return value;
    }
    rawSurface(x, z) {
        const key = pointKey(x, z);
        const cached = this.rawSurfaceCache.get(key);
        if (cached)
            return cached;
        const terrain = this.terrain(x, z);
        const slope = this.slope(x, z);
        const road = this.road(x, z);
        const protectedPoint = this.protected(x, z, 0);
        const agriculture = this.agriculture(x, z);
        let surfaceY = terrain.height;
        if (!protectedPoint && !terrain.hydrology.channel && agriculture.suitability > 0.34 && (!road || road.distance > road.width + 2))
            surfaceY = agriculture.terraceY;
        surfaceY = gradeRoadSurface(surfaceY, terrain, road, protectedPoint);
        const value = { terrain, slope, road, protectedPoint, agriculture, surfaceY };
        this.rawSurfaceCache.set(key, value);
        return value;
    }
}

export function createActiveCellSampler(seed, plan) {
    return new ActiveCellSampler(seed, plan);
}

export function buildCellHeightmap(cx, cz, seed) {
    const origin = cellLocalOrigin(cx, cz);
    const heights = [];
    for (let z = 0; z < CELL_SIZE; z++)
        for (let x = 0; x < CELL_SIZE; x++)
            heights.push(sampleTerrainColumn(origin.x + x, origin.z + z, seed).height);
    return heights;
}
function materialCluster(x, z, seed) {
    return deterministicNoise2D(x / 64, z / 64, seed + 7101);
}
export function landcoverFromInputs(x, z, seed, inputs) {
    const hydro = inputs.terrain.hydrology;
    const raisedFord = hydro.channel && inputs.road && inputs.surfaceY !== undefined &&
        inputs.surfaceY >= WATER_LEVEL && inputs.road.distance <= inputs.road.width + 2;
    if (raisedFord)
        return "road";
    if (hydro.channel)
        return "river";
    if (inputs.road && inputs.road.distance <= inputs.road.width + 3)
        return "road";
    if (inputs.protectedPoint)
        return "settlement";
    if (inputs.agriculture.kind === "irrigation")
        return "irrigation_channel";
    if (inputs.agriculture.kind === "flooded_paddy")
        return "flooded_paddy";
    if (inputs.agriculture.kind === "dry_field" || inputs.agriculture.kind === "berm")
        return "dry_field";
    if (inputs.agriculture.kind === "vegetable_plot")
        return "vegetable_plot";
    if (inputs.agriculture.kind === "meadow" && inputs.agriculture.suitability > 0.18)
        return "meadow";
    if (arrivalClearingMask(x, z) > 0.18)
        return "arrival_clearing";
    if (hydro.bankMask > 0.18)
        return "riverbank";
    if (inputs.slope > 3.5)
        return "rocky_slope";
    const sacred = sacredGroveMask(x, z) > 0.25;
    const density = forestDensityFromFields(x, z, seed, inputs.terrain.height, inputs.slope, hydro, inputs.terrain.structureBlend.influence);
    if (sacred && density > 0.34)
        return "sacred_grove";
    if (density > 0.67)
        return "dense_forest";
    if (density > 0.48)
        return "foothill_woodland";
    return "open_grass";
}
export function landcoverAt(x, z, seed, plan) {
    const terrain = sampleTerrainColumn(x, z, seed);
    const road = nearestRoadSample(x, z, plan, 8);
    const protectedPoint = isInsideProtectedStructure(x, z, 3);
    const slope = terrainSlope(x, z, seed);
    const agriculture = classifyAgriculture(x, z, seed);
    return landcoverFromInputs(x, z, seed, { terrain, slope, road, agriculture, protectedPoint });
}
function selectMaterials(x, z, seed, surfaceY, landcover, slope, road) {
    const region = classifyRegion(x, z);
    const cluster = materialCluster(x, z, seed);
    const deep = region === "mountain_frontier" || surfaceY > 92 ? (cluster > 0.35 ? "andesite" : "stone") : "stone";
    let sub = "dirt";
    let top = "grass";
    let subDepth = 4;
    switch (landcover) {
        case "river":
            sub = cluster > 0.25 ? "gravel" : "clay";
            top = cluster > 0.42 ? "gravel" : cluster < -0.35 ? "clay" : "stone";
            subDepth = 3;
            break;
        case "riverbank":
            sub = "packed_mud";
            top = cluster > 0.42 ? "gravel" : cluster < -0.34 ? "clay" : cluster > 0.08 ? "mud" : "grass";
            subDepth = 4;
            break;
        case "irrigation_channel":
            sub = "clay";
            top = "gravel";
            subDepth = 3;
            break;
        case "flooded_paddy":
            sub = "packed_mud";
            top = "mud";
            subDepth = 3;
            break;
        case "dry_field":
            sub = "dirt";
            top = "coarse_dirt";
            subDepth = 3;
            break;
        case "vegetable_plot":
            sub = "dirt";
            top = "dirt";
            subDepth = 4;
            break;
        case "road":
            sub = "coarse_dirt";
            if (!road) {
                top = "coarse_dirt";
            }
            else {
                const centerRatio = road.width <= 0 ? 1 : road.distance / road.width;
                const formal = road.roadClass === "main" || road.roadClass === "secondary" || road.roadClass === "castle";
                if (centerRatio <= 0.58)
                    top = formal ? "gravel" : "coarse_dirt";
                else if (road.distance <= road.width + 0.75)
                    top = cluster > 0.35 && formal ? "gravel" : "coarse_dirt";
                else
                    top = cluster > 0.2 ? "coarse_dirt" : "grass";
            }
            subDepth = 4;
            break;
        case "rocky_slope":
            sub = deep;
            top = cluster > 0 ? "andesite" : "stone";
            subDepth = 2;
            break;
        case "dense_forest":
        case "foothill_woodland":
        case "sacred_grove":
            sub = "dirt";
            top = cluster > 0.1 ? "podzol" : "grass";
            subDepth = 5;
            break;
        case "settlement":
            sub = "coarse_dirt";
            top = cluster > 0.38 ? "gravel" : cluster < -0.42 ? "coarse_dirt" : "grass";
            subDepth = 5;
            break;
        case "arrival_clearing":
            sub = "coarse_dirt";
            top = cluster > 0.44 ? "gravel" : cluster < -0.22 ? "coarse_dirt" : "grass";
            subDepth = 4;
            break;
        case "meadow":
            sub = "dirt";
            top = cluster < -0.55 ? "coarse_dirt" : "grass";
            subDepth = 4;
            break;
        default:
            sub = "dirt";
            top = slope > 2.5 ? "coarse_dirt" : "grass";
            subDepth = 4;
    }
    return { deep, sub, top, subDepth };
}
function gradeRoadSurface(surfaceY, terrain, road, protectedPoint) {
    if (!road || road.distance > road.width + 3 || protectedPoint)
        return surfaceY;
    if (road.bridge) {
        if (terrain.hydrology.channel)
            return surfaceY;
        const influence = 1 - Math.min(1, Math.max(0, (road.distance - road.width) / 3));
        const approachY = road.bridge.center.y - 1;
        return Math.round(surfaceY + (approachY - surfaceY) * influence);
    }
    const influence = 1 - Math.min(1, Math.max(0, (road.distance - road.width) / 3));
    return Math.round(surfaceY + (road.targetY - surfaceY) * influence);
}
export function terrainShellThickness(terrain, structureInfluence) {
    if (terrain.hydrology.channel)
        return 4;
    return structureInfluence > 0.15 ? 4 : 3;
}
function minimumSupportSurface(sampler, x, z, surfaceY) {
    let minimum = surfaceY;
    for (const [dx, dz] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
    ]) {
        const nx = x + dx, nz = z + dz;
        if (nx < ACTIVE_MIN_X || nx > ACTIVE_MAX_X || nz < ACTIVE_MIN_Z || nz > ACTIVE_MAX_Z)
            continue;
        const neighbor = sealRiverBank(sampler.rawSurface(nx, nz));
        minimum = Math.min(minimum, neighbor.surfaceY);
    }
    return minimum;
}
function roadOccupiesColumn(state) {
    return Boolean(state.road && state.road.distance <= state.road.width + 2);
}
function sameWetPaddyTerrace(state, targetSurfaceY) {
    return state.agriculture.kind === "flooded_paddy" && state.surfaceY === targetSurfaceY && !roadOccupiesColumn(state);
}
function sealRiverBank(state) {
    const hydro = state.terrain.hydrology;
    if (hydro.channel || state.protectedPoint)
        return state;
    const nearChannel = hydro.distance <= hydro.halfWidth + 3.5;
    if (!nearChannel || state.surfaceY >= WATER_LEVEL + 2)
        return state;
    return { ...state, surfaceY: WATER_LEVEL + 2 };
}
function sealAgriculturalWater(sampler, x, z, state) {
    const agriculture = state.agriculture;
    if (agriculture.kind !== "flooded_paddy" && agriculture.kind !== "irrigation")
        return state;
    const waterTop = state.surfaceY + 1;
    let sealed = true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const neighbor = sampler.rawSurface(x + dx, z + dz);
        const connectedWater = agriculture.kind === "flooded_paddy"
            ? sameWetPaddyTerrace(neighbor, state.surfaceY)
            : neighbor.agriculture.kind === "irrigation" && neighbor.surfaceY + 1 === waterTop && !roadOccupiesColumn(neighbor);
        if (!connectedWater && neighbor.surfaceY < waterTop) {
            sealed = false;
            break;
        }
    }
    if (sealed && !roadOccupiesColumn(state))
        return state;
    return {
        ...state,
        agriculture: { ...agriculture, kind: "berm", wet: false, terraceY: waterTop },
        surfaceY: Math.max(state.surfaceY, waterTop),
    };
}
function riverWaterIsContained(sampler, x, z, state) {
    if (!state.terrain.hydrology.channel || state.protectedPoint || state.surfaceY > WATER_LEVEL - 1)
        return false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const neighbor = sealRiverBank(sampler.rawSurface(x + dx, z + dz));
        if (!neighbor.terrain.hydrology.channel && neighbor.surfaceY < WATER_LEVEL + 1)
            return false;
    }
    return true;
}
function buildColumn(sampler, x, z, seed) {
    const raw = sampler.rawSurface(x, z);
    const riverSealed = sealRiverBank(raw);
    const state = sealAgriculturalWater(sampler, x, z, riverSealed);
    const { terrain, slope, road, protectedPoint, agriculture } = state;
    const surfaceY = state.surfaceY;
    const landcover = landcoverFromInputs(x, z, seed, { terrain, slope, road, agriculture, protectedPoint, surfaceY });
    const materials = selectMaterials(x, z, seed, surfaceY, landcover, slope, road);
    const site = terrain.structureBlend.influence;
    const supportFloorY = minimumSupportSurface(sampler, x, z, surfaceY);
    const perimeter = x === ACTIVE_MIN_X || x === ACTIVE_MAX_X || z === ACTIVE_MIN_Z || z === ACTIVE_MAX_Z;
    const shellThickness = terrainShellThickness(terrain, site);
    const bottomY = surfaceY - shellThickness;

    let supportBottomY = Math.min(bottomY, supportFloorY - 1);
    if (terrain.hydrology.channel || terrain.hydrology.distance <= terrain.hydrology.halfWidth + 2.5)
        supportBottomY = Math.min(supportBottomY, WATER_LEVEL - 9);
    if (perimeter)
        supportBottomY = Math.min(supportBottomY, 48);

    const channelWaterBottom = riverWaterIsContained(sampler, x, z, state)
        ? surfaceY + 1
        : undefined;
    const agricultureWaterBottom = agriculture.kind === "irrigation" || agriculture.kind === "flooded_paddy" ? surfaceY + 1 : undefined;
    const waterBottomY = channelWaterBottom ?? agricultureWaterBottom;
    const waterTopY = channelWaterBottom !== undefined ? WATER_LEVEL : agricultureWaterBottom;
    const waterClearTopY = undefined;
    return {
        x, z, surfaceY, bottomY, supportBottomY,
        subDepth: Math.min(materials.subDepth, shellThickness),
        deepMaterial: materials.deep, subMaterial: materials.sub, topMaterial: materials.top,
        waterBottomY, waterTopY, waterClearTopY, agricultureKind: agriculture.kind,
        road, landcover, slope, protected: protectedPoint,
    };
}
export function buildCellColumnsWithStats(cx, cz, seed, plan) {
    const origin = cellLocalOrigin(cx, cz);
    const sampler = new ActiveCellSampler(seed, plan);
    const columns = [];
    for (let zOffset = 0; zOffset < CELL_SIZE; zOffset++)
        for (let xOffset = 0; xOffset < CELL_SIZE; xOffset++) {
            const x = origin.x + xOffset, z = origin.z + zOffset;
            columns.push(buildColumn(sampler, x, z, seed));
            sampler.stats.generatedColumns++;
        }
    return { columns, stats: { ...sampler.stats } };
}
export function buildCellColumns(cx, cz, seed, plan) {
    return buildCellColumnsWithStats(cx, cz, seed, plan).columns;
}

export function* buildCellColumnTileIncremental(cx, cz, seed, plan, tileX, tileZ, width, height, columnsPerYield = 4, sharedSampler = undefined) {
    const startX = Math.max(0, Math.floor(tileX));
    const startZ = Math.max(0, Math.floor(tileZ));
    const tileWidth = Math.max(1, Math.floor(width));
    const tileHeight = Math.max(1, Math.floor(height));
    if (startX + tileWidth > CELL_SIZE || startZ + tileHeight > CELL_SIZE)
        throw new Error(`terrain tile outside cell: ${startX},${startZ} ${tileWidth}x${tileHeight}`);
    const origin = cellLocalOrigin(cx, cz);
    const sampler = sharedSampler ?? new ActiveCellSampler(seed, plan);
    const columns = [];
    let pending = 0;
    const yieldLimit = Math.max(1, Math.floor(columnsPerYield));
    for (let zOffset = startZ; zOffset < startZ + tileHeight; zOffset++)
        for (let xOffset = startX; xOffset < startX + tileWidth; xOffset++) {
            const x = origin.x + xOffset, z = origin.z + zOffset;
            columns.push(buildColumn(sampler, x, z, seed));
            sampler.stats.generatedColumns++;
            pending++;
            if (pending >= yieldLimit) {
                pending = 0;
                yield;
            }
        }
    if (pending > 0)
        yield;
    return { columns, stats: { ...sampler.stats } };
}

export function* buildCellColumnsIncremental(cx, cz, seed, plan, columnsPerYield = 2) {
    const origin = cellLocalOrigin(cx, cz);
    const sampler = new ActiveCellSampler(seed, plan);
    const columns = [];
    let pending = 0;
    for (let zOffset = 0; zOffset < CELL_SIZE; zOffset++)
        for (let xOffset = 0; xOffset < CELL_SIZE; xOffset++) {
            const x = origin.x + xOffset, z = origin.z + zOffset;
            columns.push(buildColumn(sampler, x, z, seed));
            sampler.stats.generatedColumns++;
            pending++;
            if (pending >= Math.max(1, columnsPerYield)) {
                pending = 0;
                yield;
            }
        }
    if (pending > 0)
        yield;
    return { columns, stats: { ...sampler.stats } };
}
