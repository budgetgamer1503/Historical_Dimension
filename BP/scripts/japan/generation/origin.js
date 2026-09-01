import { ARRIVAL, EXIT } from "../config.js";
import { terrainHeight } from "./terrain.js";
export function worldXZ(local, origin) { return { x: origin.x + local.x, z: origin.z + local.z }; }
export function worldVec(local, origin) { return { x: origin.x + local.x, y: local.y, z: origin.z + local.z }; }
export function worldBounds(local, origin) { return { min: worldVec(local.min, origin), max: worldVec(local.max, origin) }; }
export function localXZ(world, origin) { return { x: world.x - origin.x, z: world.z - origin.z }; }
export function arrivalWorldLocation(origin, seed) {
    const position = worldXZ(ARRIVAL, origin);
    return { x: position.x + 0.5, y: terrainHeight(ARRIVAL.x, ARRIVAL.z, seed) + 1, z: position.z + 0.5 };
}
export function exitWorldLocation(origin, seed) {
    const position = worldXZ(EXIT, origin);
    return { x: position.x + 0.5, y: terrainHeight(EXIT.x, EXIT.z, seed) + 1, z: position.z + 0.5 };
}
