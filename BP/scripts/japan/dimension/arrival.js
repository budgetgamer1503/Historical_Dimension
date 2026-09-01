const SOLID_GROUND = new Set(["minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:stone", "minecraft:cobblestone", "minecraft:gravel", "minecraft:packed_mud", "minecraft:spruce_planks"]);
export const ARRIVAL = { x: 0, y: 74, z: 0 };
export const EXIT = { x: 12, y: 74, z: 0 };
export function isArrivalSafe(blocks) { return blocks.length >= 3 && SOLID_GROUND.has(blocks[0]) && blocks[1] === "minecraft:air" && blocks[2] === "minecraft:air"; }
export function isDimensionReady(arrivalReady, contentReady) { return arrivalReady && contentReady; }
