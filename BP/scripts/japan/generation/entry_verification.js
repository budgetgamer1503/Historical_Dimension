export const ENTRY_TILE_SIZE = 8;

export function entryTileSampleAxis(cellSize = 32, tileSize = ENTRY_TILE_SIZE) {
    const size = Math.max(1, Math.floor(cellSize));
    const tile = Math.max(1, Math.floor(tileSize));
    const samples = [];
    for (let start = 0; start < size; start += tile) {
        const width = Math.min(tile, size - start);
        samples.push(start + Math.floor(width / 2));
    }
    return samples;
}

export function entryTileSampleOffsets(cellSize = 32, tileSize = ENTRY_TILE_SIZE) {
    const axis = entryTileSampleAxis(cellSize, tileSize);
    return axis.flatMap(dx => axis.map(dz => [dx, dz]));
}

export function groundVerificationRange(expectedY, radius = 10, minY = 16, maxY = 160) {
    const center = Math.floor(expectedY);
    const spread = Math.max(1, Math.floor(radius));
    return {
        minY: Math.max(Math.floor(minY), center - spread),
        maxY: Math.min(Math.floor(maxY), center + spread),
    };
}

export function isGroundLikeBlock(typeId, airId = "minecraft:air", waterId = "minecraft:water") {
    return typeof typeId === "string" && typeId.length > 0 && typeId !== airId && typeId !== waterId;
}

export function coreBootstrapRequired({ contentReady, bootstrapVersion, requiredVersion, physicalTerrainReady }) {
    return !contentReady || bootstrapVersion < requiredVersion || !physicalTerrainReady;
}
