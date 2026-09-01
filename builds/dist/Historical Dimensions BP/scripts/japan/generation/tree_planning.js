import { deterministicNoise2D } from "./noise.js";
import { ACTIVE_CELL_MAX_X, ACTIVE_CELL_MAX_Z, ACTIVE_CELL_MIN_X, ACTIVE_CELL_MIN_Z, ACTIVE_MAX_X, ACTIVE_MAX_Z, ACTIVE_MIN_X, ACTIVE_MIN_Z, ARRIVAL, CELL_SIZE, HARD_MIN } from "../config.js";
import { distanceToProtectedStructure } from "../structures/protected_volumes.js";
import { nearestRoadSample } from "./road_network.js";
import { terrainHeight } from "./terrain.js";
import { VegetationCellSampler } from "./vegetation.js";
import { pondTreeConflict } from "./pond_planning.js";

export const TREE_TEMPLATES = [
    { key: "birch_tree", expectedRuntimeIdentifier: "historyjam/sengoku_japan/trees:birch_tree", size: { x: 23, y: 22, z: 23 }, anchor: { x: 11, z: 11 }, yOffset: 0, trunkRadius: 1.75, solidRadius: 4.5, roadClearance: 5, structureClearance: 7, arrivalClearance: 40, maxTerrainVariation: 5 },
    { key: "bonsaitree", expectedRuntimeIdentifier: "historyjam/sengoku_japan/trees:bonsaitree", size: { x: 56, y: 36, z: 29 }, anchor: { x: 44, z: 14 }, yOffset: 0, trunkRadius: 3.5, solidRadius: 8.0, roadClearance: 8, structureClearance: 12, arrivalClearance: 58, maxTerrainVariation: 6 },
    { key: "oak_tree", expectedRuntimeIdentifier: "historyjam/sengoku_japan/trees:oak_tree", size: { x: 8, y: 10, z: 11 }, anchor: { x: 4, z: 5 }, yOffset: 0, trunkRadius: 1.25, solidRadius: 2.5, roadClearance: 3, structureClearance: 4, arrivalClearance: 32, maxTerrainVariation: 3 },
    { key: "oak_tree2", expectedRuntimeIdentifier: "historyjam/sengoku_japan/trees:oak_tree2", size: { x: 7, y: 13, z: 10 }, anchor: { x: 3, z: 4 }, yOffset: -1, trunkRadius: 1.5, solidRadius: 2.5, roadClearance: 3, structureClearance: 4, arrivalClearance: 32, maxTerrainVariation: 2 },
    { key: "oak_tree3", expectedRuntimeIdentifier: "historyjam/sengoku_japan/trees:oak_tree3", size: { x: 7, y: 10, z: 13 }, anchor: { x: 3, z: 4 }, yOffset: 0, trunkRadius: 1.25, solidRadius: 2.75, roadClearance: 3, structureClearance: 4, arrivalClearance: 32, maxTerrainVariation: 3 },
    { key: "spruce_tree", expectedRuntimeIdentifier: "historyjam/sengoku_japan/trees:spruce_tree", size: { x: 27, y: 69, z: 26 }, anchor: { x: 11, z: 14 }, yOffset: 0, trunkRadius: 2.5, solidRadius: 5.5, roadClearance: 6, structureClearance: 9, arrivalClearance: 46, maxTerrainVariation: 6 },
];

export const TREE_TEMPLATE_BY_KEY = new Map(TREE_TEMPLATES.map(template => [template.key, template]));

function unitNoise(x, z, seed) {
    return (deterministicNoise2D(x, z, seed) + 1) * 0.5;
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

export function compactTreeTarget(cover) {
    switch (cover) {
        case "dense_forest": return 10;
        case "sacred_grove": return 9;
        case "foothill_woodland": return 8;
        case "meadow": return 4;
        case "open_grass": return 3;
        case "riverbank": return 2;
        default: return 2;
    }
}

export function preferredTreeClass(x, z, seed, allowLandmark) {
    if (!allowLandmark)
        return "compact";
    return unitNoise(x / 19, z / 23, seed + 9401) < 0.12 ? "landmark" : "compact";
}

export function deterministicRotation(x, z, seed, key) {
    let keyHash = 0;
    for (const ch of key)
        keyHash = Math.imul(keyHash ^ ch.charCodeAt(0), 16777619) >>> 0;
    const roll = unitNoise(x / 11 + (keyHash & 255), z / 13 - ((keyHash >>> 8) & 255), seed + 9419);
    if (roll < 0.25) return "None";
    if (roll < 0.50) return "Rotate90";
    if (roll < 0.75) return "Rotate180";
    return "Rotate270";
}


const FOREST_STAND_SPACING = 88;
const FOREST_STAND_RADIUS = 56;
const FOREST_STAND_POINTS = 82;
const FOREST_MIN_TRUNK_SPACING = 6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function standStyleFor(sx, sz, seed) {
    const roll = hashUnit(sx, sz, seed, 9511);
    if (roll < 0.35)
        return "oak";
    if (roll < 0.65)
        return "mixed_birch";
    if (roll < 0.81)
        return "birch";
    if (roll < 0.93)
        return "spruce";
    return "sacred";
}

function standCenterFor(sx, sz, seed) {
    const half = FOREST_STAND_SPACING * 0.5;
    const jitter = FOREST_STAND_SPACING * 0.22;
    const baseX = HARD_MIN + sx * FOREST_STAND_SPACING + half;
    const baseZ = HARD_MIN + sz * FOREST_STAND_SPACING + half;
    return {
        x: baseX + (unitNoise(sx * 1.37, sz * 1.91, seed + 9521) * 2 - 1) * jitter,
        z: baseZ + (unitNoise(sx * 1.73, sz * 1.29, seed + 9533) * 2 - 1) * jitter,
    };
}

function standLandmarkKey(style) {
    switch (style) {
        case "mixed_birch":
        case "birch":
            return "birch_tree";
        case "spruce":
            return "spruce_tree";
        case "sacred":
            return "bonsaitree";
        default:
            return undefined;
    }
}

function landmarkExclusionRadius(style) {
    switch (style) {
        case "sacred": return 15;
        case "spruce": return 12;
        case "birch":
        case "mixed_birch": return 10;
        default: return 0;
    }
}

function preferredKeyForStand(style, index, x, z, radius, seed) {
    if (index === 0) {
        const landmark = standLandmarkKey(style);
        if (landmark)
            return landmark;
    }
    if (radius > 20 && style === "birch" && index % 9 === 0)
        return "birch_tree";
    if (radius > 22 && style === "mixed_birch" && index % 11 === 0)
        return "birch_tree";
    if (radius > 28 && style === "spruce" && (index === 29 || index === 57))
        return "spruce_tree";
    if (radius > 34 && style === "sacred" && index === 43)
        return "bonsaitree";
    if (radius > 26 && style === "sacred" && index % 23 === 0)
        return "birch_tree";
    return smallOakKey(x, z, seed);
}

function* rawForestCandidatesForCellIncremental(cx, cz, seed, candidatesPerYield = 48) {
    const cellMinX = HARD_MIN + cx * CELL_SIZE;
    const cellMinZ = HARD_MIN + cz * CELL_SIZE;
    const cellMaxX = cellMinX + CELL_SIZE - 1;
    const cellMaxZ = cellMinZ + CELL_SIZE - 1;
    const minSx = Math.floor((cellMinX - FOREST_STAND_RADIUS - HARD_MIN) / FOREST_STAND_SPACING) - 1;
    const maxSx = Math.floor((cellMaxX + FOREST_STAND_RADIUS - HARD_MIN) / FOREST_STAND_SPACING) + 1;
    const minSz = Math.floor((cellMinZ - FOREST_STAND_RADIUS - HARD_MIN) / FOREST_STAND_SPACING) - 1;
    const maxSz = Math.floor((cellMaxZ + FOREST_STAND_RADIUS - HARD_MIN) / FOREST_STAND_SPACING) + 1;
    const raw = [];
    const batchSize = Math.max(1, Math.floor(candidatesPerYield));
    let processed = 0;
    for (let sz = minSz; sz <= maxSz; sz++) {
        for (let sx = minSx; sx <= maxSx; sx++) {
            const center = standCenterFor(sx, sz, seed);
            const style = standStyleFor(sx, sz, seed);
            const standId = `${sx},${sz}`;
            const phase = unitNoise(sx * 2.11, sz * 1.57, seed + 9547) * Math.PI * 2;
            const exclusion = landmarkExclusionRadius(style);
            for (let index = 0; index < FOREST_STAND_POINTS; index++) {
                let radius = 0;
                let angle = phase;
                if (index > 0) {
                    const radialJitter = unitNoise(sx * 41 + index, sz * 37 - index, seed + 9551);
                    const normalized = Math.max(0.015, Math.min(1, (index - 0.35 + radialJitter * 0.7) / (FOREST_STAND_POINTS - 0.3)));
                    radius = FOREST_STAND_RADIUS * Math.pow(normalized, 0.78);
                    radius += (unitNoise(sx * 17 + index, sz * 23 + index, seed + 9563) * 2 - 1) * 2.2;
                    angle = phase + index * GOLDEN_ANGLE + (unitNoise(sx * 31 - index, sz * 29 + index, seed + 9571) - 0.5) * 0.32;
                }
                if (index > 0 && exclusion > 0 && radius < exclusion) {
                    processed++;
                    if (processed >= batchSize && batchSize < Number.MAX_SAFE_INTEGER) {
                        processed = 0;
                        yield;
                    }
                    continue;
                }
                const x = Math.round(center.x + Math.cos(angle) * radius);
                const z = Math.round(center.z + Math.sin(angle) * radius);
                if (x >= ACTIVE_MIN_X && x <= ACTIVE_MAX_X && z >= ACTIVE_MIN_Z && z <= ACTIVE_MAX_Z) {
                    const preferredKey = preferredKeyForStand(style, index, x, z, radius, seed);
                    const isLandmark = index === 0 && Boolean(standLandmarkKey(style));
                    const rank = isLandmark
                        ? -1
                        : unitNoise(x / 7 + sx * 3, z / 7 + sz * 5, seed + 9587);
                    raw.push({
                        x,
                        z,
                        standId,
                        standStyle: style,
                        standIndex: index,
                        standRadius: radius,
                        standInfluence: clamp01(1 - radius / FOREST_STAND_RADIUS),
                        preferredKey,
                        isLandmark,
                        rank,
                    });
                }
                processed++;
                if (processed >= batchSize && batchSize < Number.MAX_SAFE_INTEGER) {
                    processed = 0;
                    yield;
                }
            }
        }
    }
    return { raw, cellMinX, cellMinZ, cellMaxX, cellMaxZ };
}

function rawForestCandidatesForCell(cx, cz, seed) {
    const generator = rawForestCandidatesForCellIncremental(cx, cz, seed, Number.MAX_SAFE_INTEGER);
    let step = generator.next();
    while (!step.done)
        step = generator.next();
    return step.value;
}

function candidateTieKey(candidate) {
    return `${candidate.standId}:${String(candidate.standIndex).padStart(3, "0")}`;
}

function candidateWins(a, b) {
    if (a.rank !== b.rank)
        return a.rank < b.rank;
    return candidateTieKey(a) < candidateTieKey(b);
}

function thinForestCandidates(raw) {
    const bucketSize = FOREST_MIN_TRUNK_SPACING;
    const buckets = new Map();
    for (const candidate of raw) {
        const bx = Math.floor((candidate.x - ACTIVE_MIN_X) / bucketSize);
        const bz = Math.floor((candidate.z - ACTIVE_MIN_Z) / bucketSize);
        const key = `${bx},${bz}`;
        const existing = buckets.get(key);
        if (!existing || candidateWins(candidate, existing))
            buckets.set(key, candidate);
    }
    const winners = [...buckets.values()];
    const byBucket = new Map();
    for (const candidate of winners) {
        const bx = Math.floor((candidate.x - ACTIVE_MIN_X) / bucketSize);
        const bz = Math.floor((candidate.z - ACTIVE_MIN_Z) / bucketSize);
        byBucket.set(`${bx},${bz}`, candidate);
    }
    return winners.filter(candidate => {
        const bx = Math.floor((candidate.x - ACTIVE_MIN_X) / bucketSize);
        const bz = Math.floor((candidate.z - ACTIVE_MIN_Z) / bucketSize);
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const other = byBucket.get(`${bx + dx},${bz + dz}`);
                if (!other || other === candidate)
                    continue;
                if (Math.hypot(other.x - candidate.x, other.z - candidate.z) >= FOREST_MIN_TRUNK_SPACING)
                    continue;
                if (candidateWins(other, candidate))
                    return false;
            }
        }
        return true;
    });
}

function coverForestScale(cover) {
    switch (cover) {
        case "dense_forest": return 1.18;
        case "sacred_grove": return 1.15;
        case "foothill_woodland": return 1.02;
        case "meadow": return 0.52;
        case "open_grass": return 0.42;
        case "riverbank": return 0.24;
        default: return 0.30;
    }
}

function structureForestAcceptance(candidate, site, seed) {
    if (candidate.isLandmark)
        return true;
    const radial = 0.70 + candidate.standInfluence * 0.35;
    const chance = clamp01(0.08 + site.density * coverForestScale(site.cover) * radial);
    const roll = unitNoise(candidate.x / 9 + candidate.standIndex, candidate.z / 11 - candidate.standIndex, seed + 9601);
    return roll <= chance;
}

export function* generateStructureForestCandidatesIncremental(cx, cz, seed, plan, candidatesPerYield = 2) {
    const rawInfo = yield* rawForestCandidatesForCellIncremental(cx, cz, seed, 48);
    const thinned = thinForestCandidates(rawInfo.raw);
    const sampler = new VegetationCellSampler(seed, plan);
    const result = [];
    const batchSize = Math.max(1, Math.floor(candidatesPerYield));
    let processed = 0;
    if (batchSize < Number.MAX_SAFE_INTEGER)
        yield;
    for (const candidate of thinned) {
        if (candidate.x < rawInfo.cellMinX || candidate.x > rawInfo.cellMaxX ||
            candidate.z < rawInfo.cellMinZ || candidate.z > rawInfo.cellMaxZ)
            continue;
        const site = sampler.site(candidate.x, candidate.z);
        if (site.allowed && structureForestAcceptance(candidate, site, seed)) {
            result.push({
                ...candidate,
                y: site.terrain.height + 1,
                cover: site.cover,
                density: site.density,
                structureDistance: site.structureDistance,
            });
        }
        processed++;
        if (processed >= batchSize) {
            processed = 0;
            yield;
        }
    }
    return result;
}

export function generateStructureForestCandidates(cx, cz, seed, plan) {
    const generator = generateStructureForestCandidatesIncremental(cx, cz, seed, plan, Number.MAX_SAFE_INTEGER);
    let step = generator.next();
    while (!step.done)
        step = generator.next();
    return step.value;
}

export function rotatedTemplateGeometry(template, rotation) {
    const sx = template.size.x, sz = template.size.z;
    const ax = template.anchor.x, az = template.anchor.z;
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

export function safetyFootprints(template) {
    const west = template.anchor.x;
    const east = template.size.x - 1 - template.anchor.x;
    const north = template.anchor.z;
    const south = template.size.z - 1 - template.anchor.z;
    return {
        trunkRadius: template.trunkRadius,
        solidRadius: template.solidRadius,
        canopyRadius: Math.hypot(Math.max(west, east), Math.max(north, south)),
    };
}


export function customTreeChance(cover) {
    switch (cover) {
        case "dense_forest": return 0.99;
        case "sacred_grove": return 0.99;
        case "foothill_woodland": return 0.95;
        case "meadow": return 0.60;
        case "open_grass": return 0.48;
        default: return 0.38;
    }
}

export function smallOakKey(x, z, seed) {
    const roll = hashUnit(Math.round(x), Math.round(z), seed, 9317);
    if (roll < 1 / 3)
        return "oak_tree";
    if (roll < 2 / 3)
        return "oak_tree2";
    return "oak_tree3";
}

export function largeTemplateCellEligible(cx, cz) {
    return cx % 4 === 0 && cz % 4 === 0;
}

export function preferredTemplateKey(candidate, seed, allowLandmarkTemplate, allowBirchTemplate = false) {
    if (allowLandmarkTemplate) {
        const roll = unitNoise(candidate.x / 13, candidate.z / 17, seed + 9307);
        // Landmark cells deliberately sample all three large supplied templates.
        // Safety checks still reject terrain/road/village conflicts and fall back
        // to compact oaks, so uncommon does not mean guaranteed.
        if (roll < 0.46)
            return "birch_tree";
        if (roll < 0.73)
            return "spruce_tree";
        return "bonsaitree";
    }
    if (allowBirchTemplate && unitNoise(candidate.x / 17, candidate.z / 19, seed + 9431) < 0.16)
        return "birch_tree";
    return smallOakKey(candidate.x, candidate.z, seed);
}

export function fullTreeBounds(template, geometry, candidate) {
    const minX = candidate.x - geometry.anchor.x;
    const minZ = candidate.z - geometry.anchor.z;
    return {
        minX,
        minZ,
        maxX: minX + geometry.size.x - 1,
        maxZ: minZ + geometry.size.z - 1,
    };
}

export function terrainDependencyCellsForTreePlan(planned) {
    const cells = new Map();
    for (const entry of planned) {
        const bounds = entry.bounds;
        if (!bounds)
            continue;
        const minCellX = Math.floor((bounds.minX - HARD_MIN) / CELL_SIZE);
        const maxCellX = Math.floor((bounds.maxX - HARD_MIN) / CELL_SIZE);
        const minCellZ = Math.floor((bounds.minZ - HARD_MIN) / CELL_SIZE);
        const maxCellZ = Math.floor((bounds.maxZ - HARD_MIN) / CELL_SIZE);
        for (let z = Math.max(ACTIVE_CELL_MIN_Z, minCellZ); z <= Math.min(ACTIVE_CELL_MAX_Z, maxCellZ); z++) {
            for (let x = Math.max(ACTIVE_CELL_MIN_X, minCellX); x <= Math.min(ACTIVE_CELL_MAX_X, maxCellX); x++)
                cells.set(`${x},${z}`, { x, z });
        }
    }
    return [...cells.values()].sort((a, b) => (a.z - b.z) || (a.x - b.x));
}

export function solidTreeBounds(candidate, radius) {
    return {
        minX: candidate.x - radius,
        minZ: candidate.z - radius,
        maxX: candidate.x + radius,
        maxZ: candidate.z + radius,
    };
}

export function terrainVariationForTree(template, candidate, seed) {
    const radius = Math.max(1, Math.ceil(template.solidRadius));
    const samples = [
        { x: candidate.x, z: candidate.z },
        { x: candidate.x - radius, z: candidate.z - radius },
        { x: candidate.x + radius, z: candidate.z - radius },
        { x: candidate.x - radius, z: candidate.z + radius },
        { x: candidate.x + radius, z: candidate.z + radius },
    ];
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const sample of samples) {
        const height = terrainHeight(sample.x, sample.z, seed);
        minimum = Math.min(minimum, height);
        maximum = Math.max(maximum, height);
    }
    return maximum - minimum;
}

export function treeSafetyFailureReason(template, geometry, candidate, seed, plan) {
    const bounds = fullTreeBounds(template, geometry, candidate);
    if (bounds.minX < ACTIVE_MIN_X || bounds.maxX > ACTIVE_MAX_X ||
        bounds.minZ < ACTIVE_MIN_Z || bounds.maxZ > ACTIVE_MAX_Z)
        return "bounds";

    const safety = safetyFootprints(template);
    if (Math.hypot(candidate.x - ARRIVAL.x, candidate.z - ARRIVAL.z) < template.arrivalClearance + safety.solidRadius)
        return "protection";
    if (distanceToProtectedStructure(candidate.x, candidate.z) < template.structureClearance + safety.solidRadius)
        return "protection";

    const road = nearestRoadSample(candidate.x, candidate.z, plan, Math.ceil(safety.solidRadius + template.roadClearance + 8));
    if (road && road.distance <= safety.solidRadius + road.width + template.roadClearance)
        return "protection";

    return terrainVariationForTree(template, candidate, seed) <= template.maxTerrainVariation ? undefined : "ground";
}

export function fallbackTemplateKey(candidate, seed) {
    return smallOakKey(candidate.x + 19, candidate.z - 23, seed + 17);
}

export function treeBoundsOverlap(a, b, margin = 1) {
    return a.minX - margin <= b.maxX && a.maxX + margin >= b.minX &&
        a.minZ - margin <= b.maxZ && a.maxZ + margin >= b.minZ;
}

/**
 * Pure deterministic tree selection. Runtime code supplies optional telemetry
 * callbacks, while offline validation can execute the identical selection logic.
 */
export function planTreePlacements(candidates, cx, cz, seed, plan, resolvedTemplates, options = {}, telemetry = {}) {
    if (candidates.length === 0)
        return [];

    const cellTarget = Math.max(...candidates.map(candidate => compactTreeTarget(candidate.cover)));
    const ordered = [...candidates].sort((a, b) => {
        if (Boolean(a.isLandmark) !== Boolean(b.isLandmark))
            return a.isLandmark ? -1 : 1;
        if ((a.rank ?? 1) !== (b.rank ?? 1))
            return (a.rank ?? 1) - (b.rank ?? 1);
        return (a.standId ?? "").localeCompare(b.standId ?? "") || (a.standIndex ?? 0) - (b.standIndex ?? 0);
    });
    const planned = [];
    const allowedLargeKeys = Array.isArray(options.allowedLargeTemplateKeys)
        ? new Set(options.allowedLargeTemplateKeys)
        : undefined;

    for (const candidate of ordered) {
        if (planned.length >= cellTarget)
            break;
        telemetry.candidate?.();

        let key = candidate.preferredKey ?? smallOakKey(candidate.x, candidate.z, seed);
        const requestedLarge = key === "birch_tree" || key === "spruce_tree" || key === "bonsaitree";
        if (requestedLarge && (options.allowLargeTemplates === false || allowedLargeKeys && !allowedLargeKeys.has(key)))
            key = fallbackTemplateKey(candidate, seed);

        let template = resolvedTemplates.get(key);
        let rotation = template ? deterministicRotation(candidate.x, candidate.z, seed, template.key) : "None";
        let geometry = template ? rotatedTemplateGeometry(template, rotation) : undefined;
        let rejection = template && geometry ? treeSafetyFailureReason(template, geometry, candidate, seed, plan) : "missing";

        // Large grove/landmark structures are accents. If the authored large
        // template cannot safely fit at its deterministic stand position, keep
        // the forest continuous with a compact authored oak rather than leaving
        // a conspicuous hole or using a script-built fallback tree.
        if (!template || !geometry || rejection) {
            key = fallbackTemplateKey(candidate, seed);
            template = resolvedTemplates.get(key);
            rotation = template ? deterministicRotation(candidate.x, candidate.z, seed, template.key) : "None";
            geometry = template ? rotatedTemplateGeometry(template, rotation) : undefined;
            rejection = template && geometry ? treeSafetyFailureReason(template, geometry, candidate, seed, plan) : "missing";
        }
        if (!template || !geometry)
            continue;
        if (rejection) {
            if (rejection === "protection")
                telemetry.protectionRejection?.();
            else if (rejection === "ground")
                telemetry.groundRejection?.();
            continue;
        }

        const bounds = fullTreeBounds(template, geometry, candidate);
        const solidBounds = solidTreeBounds(candidate, template.solidRadius);
        if (pondTreeConflict(bounds, seed, plan, 2)) {
            telemetry.protectionRejection?.();
            continue;
        }
        if (planned.some(existing => treeBoundsOverlap(solidBounds, existing.solidBounds, 1))) {
            telemetry.protectionRejection?.();
            continue;
        }
        planned.push({ candidate, template, rotation, geometry, bounds, solidBounds });
    }
    return planned;
}

