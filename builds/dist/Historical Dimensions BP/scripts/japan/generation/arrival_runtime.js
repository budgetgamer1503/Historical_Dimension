import { ARRIVAL, EXIT } from "../config.js";
import { BLOCKS } from "../runtime/blocks.js";
import { arrivalWorldLocation, exitWorldLocation, worldXZ } from "./origin.js";
import { terrainHeight } from "./terrain.js";
import { clearVolume, fillVolume } from "./volume_writer.js";
function compactPad(dimension, local, origin, seed, radius, surface) {
    const world = worldXZ(local, origin);
    const y = terrainHeight(local.x, local.z, seed);
    fillVolume(dimension, { x: world.x - radius, y: y - 3, z: world.z - radius }, { x: world.x + radius, y: y - 1, z: world.z + radius }, BLOCKS.Stone);
    fillVolume(dimension, { x: world.x - radius, y, z: world.z - radius }, { x: world.x + radius, y, z: world.z + radius }, surface);
    clearVolume(dimension, { x: world.x - radius, y: y + 1, z: world.z - radius }, { x: world.x + radius, y: y + 4, z: world.z + radius });
}
export function* buildArrival(dimension, origin, seed) {
    // Keep the safety pad visually subordinate to the landscape. A compact
    // gravel standing area reads as a roadhead rather than a floating platform.
    compactPad(dimension, ARRIVAL, origin, seed, 1, BLOCKS.Gravel);
    yield;
    compactPad(dimension, EXIT, origin, seed, 1, BLOCKS.Cobblestone);
    yield;
    const arrival = worldXZ(ARRIVAL, origin), exit = worldXZ(EXIT, origin);
    const y = terrainHeight(ARRIVAL.x, ARRIVAL.z, seed);
    fillVolume(dimension, { x: Math.min(arrival.x, exit.x), y, z: arrival.z }, { x: Math.max(arrival.x, exit.x), y, z: arrival.z }, BLOCKS.Gravel);
    yield;
}
export function* finalizeArrival(dimension, origin, seed) { yield* buildArrival(dimension, origin, seed); }
export function verifyArrival(dimension, origin, seed) {
    const target = arrivalWorldLocation(origin, seed);
    const x = Math.floor(target.x), y = Math.floor(target.y), z = Math.floor(target.z);
    const ground = dimension.getBlock({ x, y: y - 1, z })?.typeId;
    const feet = dimension.getBlock({ x, y, z })?.typeId;
    const head = dimension.getBlock({ x, y: y + 1, z })?.typeId;
    return Boolean(ground && ground !== BLOCKS.Air && ground !== BLOCKS.Water && feet === BLOCKS.Air && head === BLOCKS.Air);
}
export function arrivalTarget(origin, seed) { return arrivalWorldLocation(origin, seed); }
export function exitTarget(origin, seed) { return exitWorldLocation(origin, seed); }
