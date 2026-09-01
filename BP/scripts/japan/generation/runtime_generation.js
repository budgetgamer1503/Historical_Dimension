import { CELL_SIZE, GRID_SIZE } from "../config.js";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import { BLOCKS } from "../runtime/blocks.js";
import { buildCellColumnTileIncremental, buildCellColumnsIncremental, cellLocalOrigin, createActiveCellSampler } from "./cell_data.js";
import { generateVegetationCandidatesIncremental } from "./vegetation.js";
import { compressProfiles, planTerrainLayers } from "./volume_planner.js";
import { AUTHORED_BRIDGE_SEGMENT_ID, bridgeDetailsForCell } from "./bridge_geometry.js";
import { blockForMaterial, fillVolume, fillVolumeSlices, clearVolumeSlices, persistentLeafPermutation } from "./volume_writer.js";

const recentColumnCache = new Map();

function columnCacheKey(cx, cz, seed) {
    return `${seed}|${cx}|${cz}`;
}

function rememberColumns(key, columns) {
    if (recentColumnCache.has(key))
        recentColumnCache.delete(key);
    recentColumnCache.set(key, columns);
    while (recentColumnCache.size > terrainMetrics.columnCacheLimit) {
        const oldest = recentColumnCache.keys().next().value;
        if (oldest === undefined)
            break;
        recentColumnCache.delete(oldest);
    }
}

function* columnsForCell(cx, cz, seed, plan) {
    const key = columnCacheKey(cx, cz, seed);
    const cached = recentColumnCache.get(key);
    if (cached) {
        recentColumnCache.delete(key);
        recentColumnCache.set(key, cached);
        terrainMetrics.recordColumnCache(true);
        return cached;
    }
    terrainMetrics.recordColumnCache(false);
    const { columns } = yield* buildCellColumnsIncremental(cx, cz, seed, plan, terrainMetrics.columnsPerYield);
    rememberColumns(key, columns);
    return columns;
}

export function releaseCellColumns(cx, cz, seed) {
    recentColumnCache.delete(columnCacheKey(cx, cz, seed));
}

export function clearCellColumnCache() {
    recentColumnCache.clear();
}

export function cellWorldOrigin(cx, cz, origin) {
    const local = cellLocalOrigin(cx, cz);
    return { x: origin.x + local.x, z: origin.z + local.z };
}

function translatedRectangle(rectangle, cellOrigin) {
    return {
        x0: cellOrigin.x + rectangle.x0,
        z0: cellOrigin.z + rectangle.z0,
        x1: cellOrigin.x + rectangle.x1,
        z1: cellOrigin.z + rectangle.z1,
    };
}

function internSupportProfiles(columns) {
    const keys = [];
    const profiles = new Map();
    for (const column of columns) {
        const topY = column.bottomY - 1;
        const key = column.supportBottomY < column.bottomY
            ? `${column.supportBottomY}|${topY}|${column.deepMaterial}`
            : "";
        keys.push(key);
        if (key && !profiles.has(key))
            profiles.set(key, { bottomY: column.supportBottomY, topY, block: column.deepMaterial });
    }
    return { keys, profiles };
}

function* fillTerrainSupports(dimension, columns, worldOrigin, width = CELL_SIZE, height = CELL_SIZE) {
    const interned = internSupportProfiles(columns);
    const rectangles = compressProfiles(interned.keys, width, height);
    for (const rectangle of rectangles) {
        if (!rectangle.profile)
            continue;
        const profile = interned.profiles.get(rectangle.profile);
        if (!profile || profile.bottomY > profile.topY)
            continue;
        const world = translatedRectangle(rectangle, worldOrigin);
        yield* fillVolumeSlices(
            dimension,
            { x: world.x0, y: profile.bottomY, z: world.z0 },
            { x: world.x1, y: profile.topY, z: world.z1 },
            blockForMaterial(profile.block),
        );
    }
}

function* fillTerrainLayers(dimension, columns, worldOrigin, width = CELL_SIZE, height = CELL_SIZE) {
    const plan = planTerrainLayers(columns, width, height);
    for (const rectangle of plan.bodyRectangles) {
        if (!rectangle.profile)
            continue;
        const profile = plan.bodyProfiles.get(rectangle.profile);
        if (!profile || profile.bottomY > profile.topY)
            continue;
        const world = translatedRectangle(rectangle, worldOrigin);
        yield* fillVolumeSlices(
            dimension,
            { x: world.x0, y: profile.bottomY, z: world.z0 },
            { x: world.x1, y: profile.topY, z: world.z1 },
            blockForMaterial(profile.block),
        );
    }
    for (const rectangle of plan.topRectangles) {
        const profile = plan.topProfiles.get(rectangle.profile);
        if (!profile)
            throw new Error(`missing terrain top profile ${rectangle.profile}`);
        const world = translatedRectangle(rectangle, worldOrigin);
        yield* fillVolumeSlices(
            dimension,
            { x: world.x0, y: profile.y, z: world.z0 },
            { x: world.x1, y: profile.y, z: world.z1 },
            blockForMaterial(profile.block),
        );
    }
}

function bridgeDeckMask(columns) {
    return columns.map(column =>
        column.road?.bridge && column.road.bridge.segmentId !== AUTHORED_BRIDGE_SEGMENT_ID && column.road.distance <= column.road.width + 0.4
            ? `${column.road.bridge.id}|${column.road.bridge.center.y}`
            : "",
    );
}

function* generateBridgeDetails(dimension, columns, worldOrigin) {
    const mask = bridgeDeckMask(columns);
    const rectangles = compressProfiles(mask, CELL_SIZE, CELL_SIZE);
    for (const rectangle of rectangles) {
        if (!rectangle.profile)
            continue;
        const [, rawY] = rectangle.profile.split("|");
        const y = Number(rawY);
        const world = translatedRectangle(rectangle, worldOrigin);
        yield* fillVolumeSlices(
            dimension,
            { x: world.x0, y, z: world.z0 },
            { x: world.x1, y, z: world.z1 },
            BLOCKS.SprucePlanks,
        );
        yield* clearVolumeSlices(
            dimension,
            { x: world.x0, y: y + 1, z: world.z0 },
            { x: world.x1, y: y + 3, z: world.z1 },
        );
    }

    const bridgeIds = new Set(columns.flatMap(column => column.road?.bridge ? [column.road.bridge.id] : []));
    const localOrigin = { x: columns[0].x, z: columns[0].z };
    for (const bridgeId of bridgeIds) {
        const bridge = columns.find(item => item.road?.bridge?.id === bridgeId)?.road?.bridge;
        if (!bridge || bridge.segmentId === AUTHORED_BRIDGE_SEGMENT_ID)
            continue;
        for (const detail of bridgeDetailsForCell(bridge, localOrigin.x, localOrigin.z)) {
            const x = worldOrigin.x + (detail.x - localOrigin.x);
            const z = worldOrigin.z + (detail.z - localOrigin.z);
            const block = detail.kind === "rail"
                ? BLOCKS.SpruceFence
                : detail.kind === "pier"
                    ? BLOCKS.SpruceLog
                    : BLOCKS.Cobblestone;
            fillVolume(dimension, { x, y: detail.fromY, z }, { x, y: detail.toY, z }, block);
            yield;
        }
    }
}

export function* generateDryLandscapeCell(dimension, cx, cz, seed, plan, origin) {
    const worldOrigin = cellWorldOrigin(cx, cz, origin);
    const columns = new Array(CELL_SIZE * CELL_SIZE);
    const tileSize = 8;
    const sampler = createActiveCellSampler(seed, plan);
    terrainMetrics.recordColumnCache(false);

    for (let tileZ = 0; tileZ < CELL_SIZE; tileZ += tileSize) {
        for (let tileX = 0; tileX < CELL_SIZE; tileX += tileSize) {
            const width = Math.min(tileSize, CELL_SIZE - tileX);
            const height = Math.min(tileSize, CELL_SIZE - tileZ);
            const result = yield* buildCellColumnTileIncremental(
                cx, cz, seed, plan,
                tileX, tileZ, width, height,
                terrainMetrics.columnsPerYield,
                sampler,
            );
            const tileColumns = result.columns;
            for (let z = 0; z < height; z++)
                for (let x = 0; x < width; x++)
                    columns[(tileZ + z) * CELL_SIZE + tileX + x] = tileColumns[z * width + x];
            const tileWorldOrigin = { x: worldOrigin.x + tileX, z: worldOrigin.z + tileZ };
            yield* fillTerrainLayers(dimension, tileColumns, tileWorldOrigin, width, height);
            yield* fillTerrainSupports(dimension, tileColumns, tileWorldOrigin, width, height);
        }
    }
    rememberColumns(columnCacheKey(cx, cz, seed), columns);
    yield* generateBridgeDetails(dimension, columns, worldOrigin);
}

function internWaterProfiles(columns) {
    const keys = [];
    const profiles = new Map();
    for (const column of columns) {
        const key = column.waterBottomY === undefined || column.waterTopY === undefined
            ? ""
            : `${column.waterBottomY}|${column.waterTopY}|${column.waterClearTopY ?? ""}`;
        keys.push(key);
        if (key && !profiles.has(key))
            profiles.set(key, { bottom: column.waterBottomY, top: column.waterTopY, clearTop: column.waterClearTopY });
    }
    return { keys, profiles };
}

export function* generateWaterCell(dimension, cx, cz, seed, plan, origin) {
    const columns = yield* columnsForCell(cx, cz, seed, plan);
    const worldOrigin = cellWorldOrigin(cx, cz, origin);
    const interned = internWaterProfiles(columns);
    const rectangles = compressProfiles(interned.keys, CELL_SIZE, CELL_SIZE);
    for (const rectangle of rectangles) {
        if (!rectangle.profile)
            continue;
        const profile = interned.profiles.get(rectangle.profile);
        if (!profile)
            continue;
        if (profile.bottom > profile.top)
            throw new Error(`invalid water profile ${profile.bottom}>${profile.top} for cell ${cx},${cz}`);
        const world = translatedRectangle(rectangle, worldOrigin);
        if (profile.clearTop !== undefined && profile.clearTop > profile.top) {
            yield* clearVolumeSlices(
                dimension,
                { x: world.x0, y: profile.top + 1, z: world.z0 },
                { x: world.x1, y: profile.clearTop, z: world.z1 },
            );
        }
        yield* fillVolumeSlices(
            dimension,
            { x: world.x0, y: profile.bottom, z: world.z0 },
            { x: world.x1, y: profile.top, z: world.z1 },
            BLOCKS.Water,
        );
    }
    releaseCellColumns(cx, cz, seed);
}

function* fillCross(dimension, x, y, z, radius, block) {
    fillVolume(dimension, { x: x - radius, y, z: z - 1 }, { x: x + radius, y, z: z + 1 }, block);
    yield;
    fillVolume(dimension, { x: x - 1, y, z: z - radius }, { x: x + 1, y, z: z + radius }, block);
    yield;
}

function* placeShrub(dimension, x, y, z) {
    const leaves = persistentLeafPermutation(BLOCKS.OakLeaves);
    yield* fillCross(dimension, x, y, z, 1, leaves);
    fillVolume(dimension, { x, y: y + 1, z }, { x, y: y + 1, z }, leaves);
    yield;
}

export function* generateVegetationCell(dimension, cx, cz, seed, plan, origin) {
    const candidates = yield* generateVegetationCandidatesIncremental(
        cx,
        cz,
        seed,
        plan,
        terrainMetrics.vegetationCandidatesPerYield,
    );
    yield;
    for (const candidate of candidates) {
        const x = origin.x + candidate.x;
        const z = origin.z + candidate.z;
        const y = candidate.y;
        switch (candidate.kind) {
            case "bamboo":
                fillVolume(dimension, { x, y, z }, { x, y: y + 3 + candidate.cluster, z }, BLOCKS.Bamboo);
                yield;
                break;
            case "fern":
                fillVolume(dimension, { x, y, z }, { x, y, z }, BLOCKS.Fern);
                yield;
                break;
            case "shrub":
                yield* placeShrub(dimension, x, y, z);
                break;
        }
    }
}

export function nextIncompleteCell(ledger) {
    for (let z = 0; z < GRID_SIZE; z++)
        for (let x = 0; x < GRID_SIZE; x++)
            if (!ledger.isComplete(x, z))
                return { x, z };
    return undefined;
}
