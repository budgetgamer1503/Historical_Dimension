import {
    StructureAnimationMode,
    StructureMirrorAxis,
    StructureRotation,
    world,
} from "@minecraft/server";
import { logError, logInfo } from "../diagnostics/logging.js";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import { POND_TEMPLATE } from "./pond_planning.js";

let pondStructureIdLogged = false;

const NATURAL_GROUND_BLOCKS = new Set([
    "minecraft:stone",
    "minecraft:andesite",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:grass_block",
    "minecraft:gravel",
    "minecraft:packed_mud",
    "minecraft:mud",
    "minecraft:podzol",
    "minecraft:sand",
    "minecraft:clay",
]);

const REPLACEABLE_ABOVE_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:water",
    "minecraft:short_grass",
    "minecraft:tall_grass",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:bamboo",
    "minecraft:dandelion",
    "minecraft:poppy",
    "minecraft:cornflower",
    "minecraft:azure_bluet",
    "minecraft:oxeye_daisy",
    "minecraft:white_tulip",
    "minecraft:red_tulip",
    "minecraft:orange_tulip",
    "minecraft:pink_tulip",
]);
const LOW_SHRUB_BLOCKS = new Set([
    "minecraft:oak_leaves",
    "minecraft:birch_leaves",
    "minecraft:spruce_leaves",
    "minecraft:dark_oak_leaves",
    "minecraft:azalea_leaves",
    "minecraft:azalea_leaves_flowered",
]);

function resolvePondIdentifier(available) {
    const exact = available.find(id => id === POND_TEMPLATE.expectedRuntimeIdentifier);
    if (exact)
        return exact;
    const candidates = available.filter(id => id.endsWith("/pond") || id.endsWith(":pond"));
    return candidates.length === 1 ? candidates[0] : undefined;
}

export function resolvePondStructure(available = world.structureManager.getPackStructureIds()) {
    const actualIdentifier = resolvePondIdentifier(available);
    if (!pondStructureIdLogged) {
        pondStructureIdLogged = true;
        logInfo(`Discovered pond structure ID: ${actualIdentifier ?? "none"}`);
    }
    if (!actualIdentifier) {
        logError("pond-structure-id", `Missing supplied pond structure; expected pack path identifier ${POND_TEMPLATE.expectedRuntimeIdentifier}`, 1);
        return undefined;
    }
    return { ...POND_TEMPLATE, actualIdentifier };
}

function rotationEnum(rotation) {
    return StructureRotation[rotation] ?? StructureRotation.None;
}

function* pondSiteIsReplaceable(dimension, pond, origin) {
    const worldMinX = origin.x + pond.bounds.minX;
    const worldMaxX = origin.x + pond.bounds.maxX;
    const worldMinZ = origin.z + pond.bounds.minZ;
    const worldMaxZ = origin.z + pond.bounds.maxZ;
    const surfaceY = pond.candidate.y;
    let checked = 0;

    for (let x = worldMinX; x <= worldMaxX; x++) {
        for (let z = worldMinZ; z <= worldMaxZ; z++) {
            const surface = dimension.getBlock({ x, y: surfaceY, z });
            if (!surface || (!NATURAL_GROUND_BLOCKS.has(surface.typeId) && !REPLACEABLE_ABOVE_BLOCKS.has(surface.typeId)))
                return false;
            checked++;
            if (checked >= 96) {
                checked = 0;
                yield;
            }
        }
    }

    const topY = Math.min(319, pond.location.y + pond.geometry.size.y - 1);
    for (let y = surfaceY + 1; y <= topY; y++) {
        for (let x = worldMinX; x <= worldMaxX; x++) {
            for (let z = worldMinZ; z <= worldMaxZ; z++) {
                const block = dimension.getBlock({ x, y, z });
                const oneBlockTerrainStep = y === surfaceY + 1 && block && NATURAL_GROUND_BLOCKS.has(block.typeId);
                const lowShrub = y <= surfaceY + 2 && block && LOW_SHRUB_BLOCKS.has(block.typeId);
                if (!block || (!REPLACEABLE_ABOVE_BLOCKS.has(block.typeId) && !oneBlockTerrainStep && !lowShrub))
                    return false;
                checked++;
                if (checked >= 96) {
                    checked = 0;
                    yield;
                }
            }
        }
    }
    return true;
}

export function* placePondPlan(dimension, cx, cz, seed, origin, resolvedPond, planned) {
    let placed = 0;
    let skipped = 0;
    let failures = 0;
    for (const pond of planned) {
        const replaceable = yield* pondSiteIsReplaceable(dimension, pond, origin);
        if (!replaceable) {
            skipped++;
            continue;
        }
        const location = {
            x: origin.x + pond.location.x,
            y: pond.location.y,
            z: origin.z + pond.location.z,
        };
        try {
            world.structureManager.place(
                resolvedPond.actualIdentifier,
                dimension,
                location,
                {
                    includeBlocks: true,
                    includeEntities: false,
                    integrity: 1,
                    integritySeed: `sengoku-pond-${seed}-${cx}-${cz}-${pond.candidate.x}-${pond.candidate.z}`,
                    mirror: StructureMirrorAxis.None,
                    rotation: rotationEnum(pond.rotation),
                    animationMode: StructureAnimationMode.None,
                    animationSeconds: 0,
                    waterlogged: false,
                },
            );
            terrainMetrics.recordStructure();
            placed++;
        }
        catch (error) {
            failures++;
            logError(
                `pond-place-${location.x}-${location.y}-${location.z}`,
                `${resolvedPond.actualIdentifier} at ${location.x},${location.y},${location.z}: ${String(error)}`,
                1,
            );
        }
        yield;
    }
    return { planned: planned.length, placed, skipped, failures };
}
