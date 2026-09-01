import { BLOCKS } from "../runtime/blocks.js";
import { CELL_SIZE, HARD_MIN } from "../config.js";
import { deterministicNoise2D } from "./noise.js";
import { VegetationCellSampler } from "./vegetation.js";

const TREE_LOG_TYPES = new Set([BLOCKS.OakLog, BLOCKS.DarkOakLog, BLOCKS.SpruceLog]);

function legacyUnitNoise(x, z, seed) {
    return (deterministicNoise2D(x, z, seed) + 1) * 0.5;
}

function legacyIsTreeKind(kind) {
    return kind === "oak" || kind === "spruce" || kind === "dark_oak";
}

function legacyProfileFor(cover) {
    switch (cover) {
        case "dense_forest": return { clusters: 5, candidates: 7, cap: 20, densityScale: 1.15, treeCap: 18 };
        case "sacred_grove": return { clusters: 5, candidates: 7, cap: 18, densityScale: 1.10, treeCap: 16 };
        case "foothill_woodland": return { clusters: 4, candidates: 7, cap: 16, densityScale: 0.98, treeCap: 14 };
        case "riverbank": return { clusters: 2, candidates: 5, cap: 7, densityScale: 0.65, treeCap: 0 };
        case "meadow": return { clusters: 2, candidates: 6, cap: 6, densityScale: 0.45, treeCap: 2 };
        default: return { clusters: 2, candidates: 6, cap: 6, densityScale: 0.42, treeCap: 2 };
    }
}

function legacyKindFor(x, z, seed, cluster, cover) {
    const value = legacyUnitNoise(x / 17 + cluster, z / 19 - cluster, seed + 8101);
    if (cover === "riverbank")
        return value > 0.72 ? "bamboo" : value > 0.34 ? "fern" : "shrub";
    if (cover === "open_grass" || cover === "meadow") {
        if (value < 0.42) return "fern";
        if (value < 0.84) return "shrub";
        if (value < 0.96) return "none";
        return "oak";
    }
    if (value < 0.10) return "fern";
    if (value < 0.20) return "shrub";
    if (x < -130 && z < -80)
        return value > 0.66 ? "dark_oak" : "spruce";
    if (cover === "sacred_grove")
        return value > 0.57 ? "dark_oak" : "oak";
    return value > 0.82 ? "spruce" : "oak";
}

function legacyEvaluateCandidate({ cx, cz, cluster, candidate, origin, seed, sampler }) {
    const angle = legacyUnitNoise(cx * 31 + candidate, cz * 29 + cluster, seed + 8221) * Math.PI * 2;
    const radius = 2 + legacyUnitNoise(cx * 23 + candidate, cz * 37 - cluster, seed + 8231) * 10;
    const centerX = origin.x + 4 + Math.floor(legacyUnitNoise(cx * 13 + cluster, cz * 17 - cluster, seed + 8201) * 24);
    const centerZ = origin.z + 4 + Math.floor(legacyUnitNoise(cx * 19 - cluster, cz * 11 + cluster, seed + 8211) * 24);
    const x = Math.max(origin.x, Math.min(origin.x + CELL_SIZE - 1, Math.round(centerX + Math.cos(angle) * radius)));
    const z = Math.max(origin.z, Math.min(origin.z + CELL_SIZE - 1, Math.round(centerZ + Math.sin(angle) * radius)));
    const site = sampler.site(x, z);
    if (!site.allowed)
        return undefined;
    const profile = legacyProfileFor(site.cover);
    const density = site.density * profile.densityScale;
    if (legacyUnitNoise(x / 5, z / 5, seed + 8241) > Math.max(0.08, density))
        return undefined;
    const kind = legacyKindFor(x, z, seed, cluster, site.cover);
    if (kind === "none")
        return undefined;
    const tree = legacyIsTreeKind(kind);
    const size = kind === "fern" || kind === "shrub" || kind === "bamboo"
        ? 1
        : 3 + Math.floor(legacyUnitNoise(x / 9, z / 9, seed + 8251) * 3);
    return {
        item: { x, y: site.terrain.height + 1, z, kind, size, cluster, cover: site.cover },
        tree,
        profile,
        structureDistance: site.structureDistance,
    };
}

function legacyTryAccept(result, evaluated, treeCount) {
    if (evaluated.tree && (treeCount >= evaluated.profile.treeCap || evaluated.structureDistance < 14))
        return { accepted: false, treeCount };
    const spacing = evaluated.tree ? 6 : 2;
    if (result.some(existing => Math.hypot(existing.x - evaluated.item.x, existing.z - evaluated.item.z) < Math.max(spacing, legacyIsTreeKind(existing.kind) ? 5 : 2)))
        return { accepted: false, treeCount };
    result.push(evaluated.item);
    return { accepted: true, treeCount: evaluated.tree ? treeCount + 1 : treeCount };
}

export function generateLegacyProceduralTreeCandidates(cx, cz, seed, plan) {
    const origin = { x: HARD_MIN + cx * CELL_SIZE, z: HARD_MIN + cz * CELL_SIZE };
    const result = [];
    const sampler = new VegetationCellSampler(seed, plan);
    let treeCount = 0;
    const centerSite = sampler.site(origin.x + CELL_SIZE / 2, origin.z + CELL_SIZE / 2);
    const cellProfile = legacyProfileFor(centerSite.cover);
    for (let cluster = 0; cluster < cellProfile.clusters; cluster++) {
        for (let candidate = 0; candidate < cellProfile.candidates; candidate++) {
            const evaluated = legacyEvaluateCandidate({ cx, cz, cluster, candidate, origin, seed, sampler });
            if (!evaluated)
                continue;
            const decision = legacyTryAccept(result, evaluated, treeCount);
            treeCount = decision.treeCount;
            if (decision.accepted && result.length >= Math.min(cellProfile.cap, evaluated.profile.cap))
                return result.filter(item => legacyIsTreeKind(item.kind));
        }
    }
    return result.filter(item => legacyIsTreeKind(item.kind));
}

function key(x, y, z) {
    return `${x},${y},${z}`;
}

function addBlock(blocks, x, y, z, typeId, role) {
    blocks.set(key(x, y, z), { x, y, z, typeId, role });
}

function addCross(blocks, x, y, z, radius, typeId) {
    for (let xx = x - radius; xx <= x + radius; xx++)
        for (let zz = z - 1; zz <= z + 1; zz++)
            addBlock(blocks, xx, y, zz, typeId, "leaf");
    for (let xx = x - 1; xx <= x + 1; xx++)
        for (let zz = z - radius; zz <= z + radius; zz++)
            addBlock(blocks, xx, y, zz, typeId, "leaf");
}

export function legacyProceduralTreeShape(candidate) {
    const blocks = new Map();
    let logType;
    let leafType;
    let trunkTop;
    let canopyMinY;
    let canopyMaxY;

    if (candidate.kind === "oak") {
        const height = candidate.size + 1;
        const crown = candidate.y + height - 2;
        logType = BLOCKS.OakLog;
        leafType = BLOCKS.OakLeaves;
        addCross(blocks, candidate.x, crown, candidate.z, 2, leafType);
        addCross(blocks, candidate.x, crown + 1, candidate.z, 2, leafType);
        for (let x = candidate.x - 1; x <= candidate.x + 1; x++)
            for (let z = candidate.z - 1; z <= candidate.z + 1; z++)
                addBlock(blocks, x, crown + 2, z, leafType, "leaf");
        trunkTop = candidate.y + height;
        canopyMinY = crown;
        canopyMaxY = crown + 2;
    }
    else if (candidate.kind === "dark_oak") {
        const height = candidate.size + 1;
        const crown = candidate.y + height - 2;
        logType = BLOCKS.DarkOakLog;
        leafType = BLOCKS.DarkOakLeaves;
        addCross(blocks, candidate.x, crown, candidate.z, 2, leafType);
        addCross(blocks, candidate.x, crown + 1, candidate.z, 2, leafType);
        addCross(blocks, candidate.x, crown + 2, candidate.z, 1, leafType);
        trunkTop = candidate.y + height + 1;
        canopyMinY = crown;
        canopyMaxY = crown + 2;
    }
    else if (candidate.kind === "spruce") {
        const height = candidate.size + 2;
        const crown = candidate.y + height - 3;
        logType = BLOCKS.SpruceLog;
        leafType = BLOCKS.SpruceLeaves;
        addCross(blocks, candidate.x, crown, candidate.z, 2, leafType);
        addCross(blocks, candidate.x, crown + 1, candidate.z, 2, leafType);
        addCross(blocks, candidate.x, crown + 2, candidate.z, 1, leafType);
        addCross(blocks, candidate.x, crown + 3, candidate.z, 1, leafType);
        addBlock(blocks, candidate.x, crown + 4, candidate.z, leafType, "leaf");
        trunkTop = candidate.y + height + 1;
        canopyMinY = crown;
        canopyMaxY = crown + 4;
    }
    else {
        return { blocks: [], logType: undefined, leafType: undefined, canopyMinY: candidate.y, canopyMaxY: candidate.y };
    }

    for (let y = candidate.y; y <= trunkTop; y++)
        addBlock(blocks, candidate.x, y, candidate.z, logType, "log");

    return {
        blocks: [...blocks.values()],
        logType,
        leafType,
        canopyMinY,
        canopyMaxY,
        trunkTop,
    };
}

function worldBlock(block, origin) {
    return { x: origin.x + block.x, y: block.y, z: origin.z + block.z };
}

export function* removeLegacyProceduralTreeIfExact(dimension, candidate, origin = { x: 0, z: 0 }) {
    const shape = legacyProceduralTreeShape(candidate);
    if (!shape.logType || shape.blocks.length === 0)
        return { removed: false, reason: "not-tree" };

    const expected = new Map(shape.blocks.map(block => [key(block.x, block.y, block.z), block]));
    let reads = 0;
    for (const block of shape.blocks) {
        const current = dimension.getBlock(worldBlock(block, origin));
        if (!current || current.typeId !== block.typeId)
            return { removed: false, reason: "signature" };
        reads++;
        if (reads % 8 === 0)
            yield;
    }

    for (let y = shape.canopyMinY; y <= shape.canopyMaxY; y++) {
        for (let z = candidate.z - 3; z <= candidate.z + 3; z++) {
            for (let x = candidate.x - 3; x <= candidate.x + 3; x++) {
                if (expected.has(key(x, y, z)))
                    continue;
                const current = dimension.getBlock({ x: origin.x + x, y, z: origin.z + z });
                if (!current)
                    return { removed: false, reason: "unloaded" };
                if (TREE_LOG_TYPES.has(current.typeId) || current.typeId === shape.leafType)
                    return { removed: false, reason: "ambiguous" };
                reads++;
                if (reads % 8 === 0)
                    yield;
            }
        }
    }

    let writes = 0;
    for (const block of shape.blocks) {
        dimension.setBlockType(worldBlock(block, origin), BLOCKS.Air);
        writes++;
        if (writes % 4 === 0)
            yield;
    }
    return { removed: true, removedBlocks: shape.blocks.length };
}

export function* removeLegacyProceduralTreesCell(dimension, cx, cz, seed, plan, origin = { x: 0, z: 0 }) {
    const candidates = generateLegacyProceduralTreeCandidates(cx, cz, seed, plan);
    let removed = 0;
    let preserved = 0;
    for (const candidate of candidates) {
        const result = yield* removeLegacyProceduralTreeIfExact(dimension, candidate, origin);
        if (result.removed)
            removed++;
        else
            preserved++;
        yield;
    }
    return { candidates: candidates.length, removed, preserved };
}
