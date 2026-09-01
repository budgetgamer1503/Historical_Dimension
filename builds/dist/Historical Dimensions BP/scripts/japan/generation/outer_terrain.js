import { CELL_SIZE } from "../config.js";
import { deterministicNoise2D } from "./noise.js";
import { terrainCellWorldOrigin } from "./streaming_policy.js";
import { fillVolumeSlices } from "./volume_writer.js";
import { BLOCKS } from "../runtime/blocks.js";

export { outerTerrainHeight } from "./outer_terrain_profile.js";
import { outerTerrainHeight } from "./outer_terrain_profile.js";

function outerSurfaceBlock(localX, localZ, seed, height) {
    const rocky = deterministicNoise2D(localX / 42, localZ / 42, seed + 9209);
    if (height >= 91 && rocky > 0.1)
        return BLOCKS.Andesite;
    if (rocky > 0.72)
        return BLOCKS.CoarseDirt;
    return BLOCKS.GrassBlock;
}

export function* generateOuterTerrainCell(dimension, cx, cz, seed, origin, tileSize = 8) {
    const worldOrigin = terrainCellWorldOrigin(cx, cz, origin);
    const step = Math.max(4, Math.min(8, Math.floor(tileSize)));
    for (let tileZ = 0; tileZ < CELL_SIZE; tileZ += step) {
        for (let tileX = 0; tileX < CELL_SIZE; tileX += step) {
            const width = Math.min(step, CELL_SIZE - tileX);
            const depth = Math.min(step, CELL_SIZE - tileZ);
            const localX = worldOrigin.x - origin.x + tileX + (width - 1) / 2;
            const localZ = worldOrigin.z - origin.z + tileZ + (depth - 1) / 2;
            const height = outerTerrainHeight(localX, localZ, seed);
            const x0 = worldOrigin.x + tileX;
            const z0 = worldOrigin.z + tileZ;
            const x1 = x0 + width - 1;
            const z1 = z0 + depth - 1;

            // A substantial stone body prevents the continuation terrain from
            // looking like a paper-thin floating plate when seen from below.
            yield* fillVolumeSlices(
                dimension,
                { x: x0, y: 32, z: z0 },
                { x: x1, y: Math.max(32, height - 4), z: z1 },
                BLOCKS.Stone,
            );
            yield* fillVolumeSlices(
                dimension,
                { x: x0, y: Math.max(33, height - 3), z: z0 },
                { x: x1, y: height - 1, z: z1 },
                BLOCKS.Dirt,
            );
            yield* fillVolumeSlices(
                dimension,
                { x: x0, y: height, z: z0 },
                { x: x1, y: height, z: z1 },
                outerSurfaceBlock(localX, localZ, seed, height),
            );
        }
    }
}
