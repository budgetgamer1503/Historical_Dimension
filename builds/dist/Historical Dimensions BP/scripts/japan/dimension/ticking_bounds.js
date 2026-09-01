export function makeTickingAreaBounds(point, radius = 16) {
    const x = Math.floor(point.x);
    const z = Math.floor(point.z);
    return {
        from: { x: x - radius, y: -64, z: z - radius },
        to: { x: x + radius, y: 319, z: z + radius }
    };
}
export function makeChunkTickingAreaBounds(point) {
    const chunkX = Math.floor(Math.floor(point.x) / 16) * 16;
    const chunkZ = Math.floor(Math.floor(point.z) / 16) * 16;
    return {
        from: { x: chunkX, y: -64, z: chunkZ },
        to: { x: chunkX + 15, y: 319, z: chunkZ + 15 }
    };
}
