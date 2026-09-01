import { BlockPermutation, BlockVolume } from "@minecraft/server";
import { BLOCKS } from "../runtime/blocks.js";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import { planVolumeSlices } from "./volume_planner.js";

const permutations = new Map();

function stateKey(states) {
    if (!states)
        return "";
    return JSON.stringify(Object.keys(states)
        .sort()
        .map(key => [key, typeof states[key], states[key]]));
}

export function cachedPermutation(typeId, states) {
    const key = `${typeId}|${stateKey(states)}`;
    let value = permutations.get(key);
    if (!value) {
        value = BlockPermutation.resolve(typeId, states);
        permutations.set(key, value);
    }
    return value;
}

export function persistentLeafPermutation(typeId) {
    return cachedPermutation(typeId, { persistent_bit: true, update_bit: false });
}

function resolveFillBlock(block) {
    return typeof block === "string" ? cachedPermutation(block) : block;
}

function normalizeVolume(from, to) {
    return {
        min: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) },
        max: { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) },
    };
}

export function fillVolume(dimension, from, to, block) {
    const { min, max } = normalizeVolume(from, to);
    dimension.fillBlocks(new BlockVolume(min, max), resolveFillBlock(block));
    terrainMetrics.recordFill((max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1));
}

export { planVolumeSlices } from "./volume_planner.js";

export function* fillVolumeSlices(dimension, from, to, block, maxBlocks = terrainMetrics.maxBlocksPerFill) {
    for (const slice of planVolumeSlices(from, to, maxBlocks)) {
        fillVolume(dimension, slice.min, slice.max, block);
        yield;
    }
}

export function* clearVolumeSlices(dimension, from, to, maxBlocks = terrainMetrics.maxBlocksPerFill) {
    yield* fillVolumeSlices(dimension, from, to, BLOCKS.Air, maxBlocks);
}

export function blockForMaterial(material) {
    switch (material) {
        case "stone": return BLOCKS.Stone;
        case "andesite": return BLOCKS.Andesite;
        case "cobblestone": return BLOCKS.Cobblestone;
        case "dirt": return BLOCKS.Dirt;
        case "coarse_dirt": return BLOCKS.CoarseDirt;
        case "grass": return BLOCKS.GrassBlock;
        case "gravel": return BLOCKS.Gravel;
        case "packed_mud": return BLOCKS.PackedMud;
        case "mud": return BLOCKS.Mud;
        case "podzol": return BLOCKS.Podzol;
        case "sand": return BLOCKS.Sand;
        case "clay": return BLOCKS.Clay;
    }
}

export function clearVolume(dimension, from, to) {
    fillVolume(dimension, from, to, BLOCKS.Air);
}
