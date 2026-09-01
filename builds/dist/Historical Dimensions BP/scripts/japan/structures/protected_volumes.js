import { STRUCTURE_PLACEMENTS } from "./layout.js";
import { boundsOverlap } from "./transforms.js";
const volumes = [];
export function registerProtectedVolume(volume) {
    if (!volumes.some(existing => existing.id === volume.id))
        volumes.push(volume);
}
export function clearProtectedVolumes() {
    volumes.length = 0;
}
export function getProtectedVolumes() {
    return volumes;
}
export function intersectsProtectedVolume(volume, bounds) {
    return boundsOverlap(volume, bounds);
}
export function containsProtectedPoint(volume, point) {
    return point.x >= volume.min.x && point.x <= volume.max.x && point.y >= volume.min.y && point.y <= volume.max.y && point.z >= volume.min.z && point.z <= volume.max.z;
}
export function getProtectedVolumesForCell(bounds) {
    return volumes.filter(volume => boundsOverlap(volume, bounds));
}
export function canModifyTerrain(point) {
    return !volumes.some(volume => (volume.kind === "structure" || volume.kind === "roof_clearance") && containsProtectedPoint(volume, point));
}
export function canPlaceVegetation(point) {
    return !volumes.some(volume => volume.kind !== "boundary" && containsProtectedPoint(volume, point));
}
function distanceToBoundsXZ(x, z, bounds) {
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    return Math.hypot(dx, dz);
}
export function isInsideProtectedStructure(x, z, margin = 0) {
    return STRUCTURE_PLACEMENTS.some(placement => x >= placement.protectedVolume.min.x - margin && x <= placement.protectedVolume.max.x + margin &&
        z >= placement.protectedVolume.min.z - margin && z <= placement.protectedVolume.max.z + margin);
}
export function distanceToProtectedStructure(x, z) {
    let distance = Number.POSITIVE_INFINITY;
    for (const placement of STRUCTURE_PLACEMENTS) {
        distance = Math.min(distance, distanceToBoundsXZ(x, z, placement.protectedVolume));
    }
    return distance;
}
