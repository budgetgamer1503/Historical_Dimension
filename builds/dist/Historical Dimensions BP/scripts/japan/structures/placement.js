import { StructureAnimationMode, StructureMirrorAxis, StructureRotation, world } from "@minecraft/server";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import { BLOCKS } from "../runtime/blocks.js";
import { terrainHeight } from "../generation/terrain.js";
import { clearVolume, fillVolume, fillVolumeSlices, clearVolumeSlices } from "../generation/volume_writer.js";
import { worldBounds, worldVec } from "../generation/origin.js";
import { structureFoundationDepth } from "./foundation.js";

const STRUCTURE_SIGNATURES = new Map([
    // This spruce-plank block is 20 blocks above the supplied village origin,
    // so terrain generation can never satisfy it accidentally. It gives upgrades
    // a cheap physical check instead of trusting a stale structure ledger.
    ["village_e2990", [
        { offset: { x: 26, y: 20, z: 81 }, block: BLOCKS.SprucePlanks },
    ]],
    ["bandit_fort_mountain", [
        { offset: { x: 43, y: 0, z: 0 }, block: "minecraft:yellow_wool" },
    ]],
    ["bandit_fort_citadel", [
        { offset: { x: 43, y: 0, z: 0 }, block: "minecraft:yellow_wool" },
    ]],
]);

export function structureVerificationLocations(item, origin) {
    const checks = STRUCTURE_SIGNATURES.get(item.placement.name);
    if (!checks || checks.length === 0)
        return [];
    const placementOrigin = worldVec(item.placement.origin, origin);
    return checks.map(check => ({
        location: {
            x: placementOrigin.x + check.offset.x,
            y: placementOrigin.y + check.offset.y,
            z: placementOrigin.z + check.offset.z,
        },
        block: check.block,
    }));
}
export function structureVerificationChunksLoaded(dimension, item, origin) {
    return structureVerificationLocations(item, origin)
        .every(check => dimension.isChunkLoaded(check.location));
}
export function verifyStructurePlacement(dimension, item, origin) {
    for (const check of structureVerificationLocations(item, origin)) {
        if (!dimension.isChunkLoaded(check.location))
            return false;
        if (dimension.getBlock(check.location)?.typeId !== check.block)
            return false;
    }
    return true;
}

function rotationEnum(rotation) {
    switch (rotation) {
        case 90: return StructureRotation.Rotate90;
        case 180: return StructureRotation.Rotate180;
        case 270: return StructureRotation.Rotate270;
        default: return StructureRotation.None;
    }
}
export function* prepareStructureFootprint(dimension, item, origin, clip = undefined) {
    const placement = item.placement;
    const bounds = worldBounds(placement.boundingBox, origin);
    const minX = clip ? Math.max(bounds.min.x, Math.floor(clip.minX)) : bounds.min.x;
    const maxX = clip ? Math.min(bounds.max.x, Math.floor(clip.maxX)) : bounds.max.x;
    const minZ = clip ? Math.max(bounds.min.z, Math.floor(clip.minZ)) : bounds.min.z;
    const maxZ = clip ? Math.min(bounds.max.z, Math.floor(clip.maxZ)) : bounds.max.z;
    if (minX > maxX || minZ > maxZ)
        return;
    const siteSurface = placement.groundElevation - 1;
    const foundationDepth = structureFoundationDepth(placement);
    for (let x = minX; x <= maxX; x += 16) {
        for (let z = minZ; z <= maxZ; z += 16) {
            const x2 = Math.min(x + 15, maxX), z2 = Math.min(z + 15, maxZ);
            yield* fillVolumeSlices(dimension, { x, y: siteSurface - foundationDepth, z }, { x: x2, y: siteSurface - 1, z: z2 }, placement.region === "B" ? BLOCKS.Andesite : BLOCKS.Stone);
            yield* clearVolumeSlices(dimension, { x, y: siteSurface + 1, z }, { x: x2, y: Math.min(180, bounds.max.y + 5), z: z2 });
        }
    }
}
export function placeStructure(dimension, item, origin, options = {}) {
    const placementOrigin = worldVec(item.placement.origin, origin);
    world.structureManager.place(item.actualIdentifier, dimension, placementOrigin, {
        includeBlocks: true, includeEntities: false, integrity: 1, integritySeed: `sengoku-v2-${item.placement.placementOrder}`,
        mirror: StructureMirrorAxis.None, rotation: rotationEnum(item.placement.rotation), animationMode: StructureAnimationMode.None,
        animationSeconds: 0, waterlogged: false
    });
    if (options.recordMetrics !== false)
        terrainMetrics.recordStructure();
}
function perimeterSamples(item) {
    const bounds = item.placement.boundingBox;
    const samples = [];
    for (let x = bounds.min.x; x <= bounds.max.x; x += 4) {
        samples.push({ x, z: bounds.min.z - 1 }, { x, z: bounds.max.z + 1 });
    }
    for (let z = bounds.min.z; z <= bounds.max.z; z += 4) {
        samples.push({ x: bounds.min.x - 1, z }, { x: bounds.max.x + 1, z });
    }
    return samples;
}
export function* blendStructureTerrain(dimension, item, origin, seed, clip = undefined) {
    const siteSurface = item.placement.groundElevation - 1;
    for (const sample of perimeterSamples(item)) {
        const surrounding = terrainHeight(sample.x, sample.z, seed);
        const worldPoint = { x: origin.x + sample.x, z: origin.z + sample.z };
        if (clip && (worldPoint.x < clip.minX || worldPoint.x > clip.maxX || worldPoint.z < clip.minZ || worldPoint.z > clip.maxZ))
            continue;
        // The analytic heightmap already performs the cut-and-fill transition.
        // Runtime blending only adds a compact retaining face where a foundation
        // is visibly raised; it never builds tall dirt needles or lowers a bank.
        if (siteSurface - surrounding >= 2) {
            const retainingBottom = Math.max(surrounding + 1, siteSurface - 4);
            fillVolume(dimension,
                { x: worldPoint.x, y: retainingBottom, z: worldPoint.z },
                { x: worldPoint.x, y: siteSurface, z: worldPoint.z },
                BLOCKS.Cobblestone);
            yield;
        }
    }
    const entrance = item.placement.entrance;
    const worldEntrance = worldVec(entrance, origin);
    const ground = item.placement.groundElevation - 1;
    const entranceBounds = {
        minX: worldEntrance.x - 1,
        maxX: worldEntrance.x + 1,
        minZ: worldEntrance.z - 2,
        maxZ: worldEntrance.z + 1,
    };
    const minX = clip ? Math.max(entranceBounds.minX, clip.minX) : entranceBounds.minX;
    const maxX = clip ? Math.min(entranceBounds.maxX, clip.maxX) : entranceBounds.maxX;
    const minZ = clip ? Math.max(entranceBounds.minZ, clip.minZ) : entranceBounds.minZ;
    const maxZ = clip ? Math.min(entranceBounds.maxZ, clip.maxZ) : entranceBounds.maxZ;
    if (minX <= maxX && minZ <= maxZ) {
        fillVolume(dimension,
            { x: minX, y: ground, z: minZ },
            { x: maxX, y: ground, z: maxZ },
            item.placement.region === "B" ? BLOCKS.CoarseDirt : BLOCKS.Gravel);
        yield;
        clearVolume(dimension,
            { x: minX, y: ground + 1, z: minZ },
            { x: maxX, y: ground + 4, z: maxZ });
        yield;
    }
}
