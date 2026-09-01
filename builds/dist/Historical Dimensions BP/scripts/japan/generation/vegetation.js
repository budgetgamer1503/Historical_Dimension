import { CELL_SIZE, HARD_MAX, HARD_MIN } from "../config.js";
import { distanceToProtectedStructure, isInsideProtectedStructure } from "../structures/protected_volumes.js";
import { agricultureSuitabilityFromInputs, classifyAgricultureFromInputs } from "./agriculture.js";
import { landcoverFromInputs } from "./cell_data.js";
import { deterministicNoise2D } from "./noise.js";
import { nearestRoadSample } from "./road_network.js";
import {
    arrivalClearingMask,
    forestDensityFromFields,
    sampleTerrainColumn,
} from "./terrain.js";

function unitNoise(x, z, seed) {
    return (deterministicNoise2D(x, z, seed) + 1) * 0.5;
}

function pointKey(x, z) {
    return `${x},${z}`;
}

export class VegetationCellSampler {
    constructor(seed, plan) {
        this.seed = seed;
        this.plan = plan;
    }

    terrainCache = new Map();
    slopeCache = new Map();
    protectedCache = new Map();
    roadCache = new Map();
    siteCache = new Map();

    terrain(x, z) {
        const key = pointKey(x, z);
        let value = this.terrainCache.get(key);
        if (!value) {
            value = sampleTerrainColumn(x, z, this.seed);
            this.terrainCache.set(key, value);
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
        return maximum;
    }

    protected(x, z, margin) {
        const key = `${x},${z},${margin}`;
        const cached = this.protectedCache.get(key);
        if (cached !== undefined)
            return cached;
        const value = isInsideProtectedStructure(x, z, margin);
        this.protectedCache.set(key, value);
        return value;
    }

    road(x, z, searchRadius) {
        const key = `${x},${z},${searchRadius}`;
        if (this.roadCache.has(key))
            return this.roadCache.get(key);
        const value = nearestRoadSample(x, z, this.plan, searchRadius);
        this.roadCache.set(key, value);
        return value;
    }

    site(x, z) {
        const key = pointKey(x, z);
        let value = this.siteCache.get(key);
        if (value)
            return value;
        const terrain = this.terrain(x, z);
        const slope = this.slope(x, z);
        const roadForExclusion = this.road(x, z, 10);
        const roadForCover = this.road(x, z, 8);
        const protected3 = this.protected(x, z, 3);
        const protected5 = this.protected(x, z, 5);
        const protected8 = this.protected(x, z, 8);
        const agriculture = classifyAgricultureFromInputs(x, z, this.seed, {
            terrain: terrain.height,
            slope,
            hydrology: terrain.hydrology,
            protectedStructure: protected5,
        });
        const cover = landcoverFromInputs(x, z, this.seed, {
            terrain,
            slope,
            road: roadForCover,
            agriculture,
            protectedPoint: protected3,
        });
        const suitability = agricultureSuitabilityFromInputs(x, z, this.seed, {
            terrain: terrain.height,
            slope,
            hydrology: terrain.hydrology,
            protectedStructure: protected5,
        });
        const density = forestDensityFromFields(
            x,
            z,
            this.seed,
            terrain.height,
            slope,
            terrain.hydrology,
            terrain.structureBlend.influence,
        );
        value = {
            terrain,
            slope,
            road: roadForExclusion,
            cover,
            suitability,
            density,
            structureDistance: distanceToProtectedStructure(x, z),
            allowed: arrivalClearingMask(x, z) <= 0.05 &&
                !protected8 &&
                !terrain.hydrology.channel &&
                terrain.hydrology.bankMask <= 0.74 &&
                (!roadForExclusion || roadForExclusion.distance > roadForExclusion.width + 4) &&
                suitability < 0.44 &&
                (cover === "dense_forest" || cover === "foothill_woodland" || cover === "sacred_grove" ||
                    cover === "riverbank" || cover === "open_grass" || cover === "meadow"),
        };
        this.siteCache.set(key, value);
        return value;
    }
}

export function isVegetationAllowed(x, z, seed, plan) {
    return new VegetationCellSampler(seed, plan).site(x, z).allowed;
}

function profileFor(cover) {
    switch (cover) {
        case "dense_forest": return { clusters: 5, candidates: 7, cap: 20, densityScale: 1.15 };
        case "sacred_grove": return { clusters: 5, candidates: 7, cap: 18, densityScale: 1.10 };
        case "foothill_woodland": return { clusters: 4, candidates: 7, cap: 16, densityScale: 0.98 };
        case "riverbank": return { clusters: 2, candidates: 5, cap: 7, densityScale: 0.65 };
        case "meadow": return { clusters: 2, candidates: 6, cap: 6, densityScale: 0.45 };
        default: return { clusters: 2, candidates: 6, cap: 6, densityScale: 0.42 };
    }
}

function kindFor(x, z, seed, cluster, cover) {
    const value = unitNoise(x / 17 + cluster, z / 19 - cluster, seed + 8101);
    if (cover === "riverbank")
        return value > 0.72 ? "bamboo" : value > 0.34 ? "fern" : "shrub";
    if (cover === "open_grass" || cover === "meadow") {
        if (value < 0.48)
            return "fern";
        if (value < 0.90)
            return "shrub";
        return "none";
    }
    if (value < 0.34)
        return "fern";
    if (value < 0.78)
        return "shrub";
    if (cover === "sacred_grove" && value < 0.88)
        return "fern";
    return "none";
}

function evaluateCandidate({ cx, cz, cluster, candidate, origin, seed, sampler }) {
    const angle = unitNoise(cx * 31 + candidate, cz * 29 + cluster, seed + 8221) * Math.PI * 2;
    const radius = 2 + unitNoise(cx * 23 + candidate, cz * 37 - cluster, seed + 8231) * 10;
    const centerX = origin.x + 4 + Math.floor(unitNoise(cx * 13 + cluster, cz * 17 - cluster, seed + 8201) * 24);
    const centerZ = origin.z + 4 + Math.floor(unitNoise(cx * 19 - cluster, cz * 11 + cluster, seed + 8211) * 24);
    const x = Math.max(origin.x, Math.min(origin.x + CELL_SIZE - 1, Math.round(centerX + Math.cos(angle) * radius)));
    const z = Math.max(origin.z, Math.min(origin.z + CELL_SIZE - 1, Math.round(centerZ + Math.sin(angle) * radius)));
    const site = sampler.site(x, z);
    if (!site.allowed)
        return undefined;
    const profile = profileFor(site.cover);
    const density = site.density * profile.densityScale;
    if (unitNoise(x / 5, z / 5, seed + 8241) > Math.max(0.08, density))
        return undefined;
    const kind = kindFor(x, z, seed, cluster, site.cover);
    if (kind === "none")
        return undefined;
    return {
        item: { x, y: site.terrain.height + 1, z, kind, size: 1, cluster, cover: site.cover },
        profile,
    };
}

export function tryAcceptVegetationCandidate(result, evaluated) {
    const spacing = 2;
    if (result.some(existing => Math.hypot(existing.x - evaluated.item.x, existing.z - evaluated.item.z) < spacing))
        return false;
    result.push(evaluated.item);
    return true;
}

export function* generateVegetationCandidatesIncremental(cx, cz, seed, plan, candidatesPerYield = 1) {
    const origin = { x: HARD_MIN + cx * CELL_SIZE, z: HARD_MIN + cz * CELL_SIZE };
    const result = [];
    const sampler = new VegetationCellSampler(seed, plan);
    let processedSinceYield = 0;
    const centerSite = sampler.site(origin.x + CELL_SIZE / 2, origin.z + CELL_SIZE / 2);
    const cellProfile = profileFor(centerSite.cover);
    const batchSize = Math.max(1, Math.floor(candidatesPerYield));

    if (batchSize < Number.MAX_SAFE_INTEGER)
        yield;

    for (let cluster = 0; cluster < cellProfile.clusters; cluster++) {
        for (let candidate = 0; candidate < cellProfile.candidates; candidate++) {
            const evaluated = evaluateCandidate({
                cx,
                cz,
                cluster,
                candidate,
                origin,
                seed,
                sampler,
            });
            if (evaluated) {
                const accepted = tryAcceptVegetationCandidate(result, evaluated);
                if (accepted && result.length >= Math.min(cellProfile.cap, evaluated.profile.cap))
                    return result;
            }
            processedSinceYield++;
            if (processedSinceYield >= batchSize) {
                processedSinceYield = 0;
                yield;
            }
        }
    }
    return result;
}

export function generateVegetationCandidates(cx, cz, seed, plan) {
    const generator = generateVegetationCandidatesIncremental(cx, cz, seed, plan, Number.MAX_SAFE_INTEGER);
    let step = generator.next();
    while (!step.done)
        step = generator.next();
    return step.value;
}
