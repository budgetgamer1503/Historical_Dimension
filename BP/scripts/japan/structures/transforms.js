export function rotatedSize(size, rotation) { return rotation === 90 || rotation === 270 ? { x: size.z, y: size.y, z: size.x } : { ...size }; }
export function rotateLocalPoint(point, size, rotation) {
    switch (rotation) {
        case 0: return { ...point };
        case 90: return { x: size.z - 1 - point.z, y: point.y, z: point.x };
        case 180: return { x: size.x - 1 - point.x, y: point.y, z: size.z - 1 - point.z };
        case 270: return { x: point.z, y: point.y, z: size.x - 1 - point.x };
    }
}
export function transformPoint(point, size, rotation, origin) { const p = rotateLocalPoint(point, size, rotation); return { x: origin.x + p.x, y: origin.y + p.y, z: origin.z + p.z }; }
export function makeBounds(origin, size, rotation) { const s = rotatedSize(size, rotation); return { min: { ...origin }, max: { x: origin.x + s.x - 1, y: origin.y + s.y - 1, z: origin.z + s.z - 1 } }; }
export function expandBounds(bounds, horizontal, below = 0, above = 0) { return { min: { x: bounds.min.x - horizontal, y: bounds.min.y - below, z: bounds.min.z - horizontal }, max: { x: bounds.max.x + horizontal, y: bounds.max.y + above, z: bounds.max.z + horizontal } }; }
export function boundsOverlap(a, b) { return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y && a.min.z <= b.max.z && a.max.z >= b.min.z; }
