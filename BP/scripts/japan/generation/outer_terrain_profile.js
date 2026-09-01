import { ACTIVE_MAX_X, ACTIVE_MAX_Z, ACTIVE_MIN_X, ACTIVE_MIN_Z } from "../config.js";
import { deterministicNoise2D, fractalNoise2D } from "./noise.js";
import { clamp, lerp, sampleTerrainColumn, smoothstep } from "./terrain.js";

function clampToAuthoredBoundary(x, z) {
    return {
        x: clamp(x, ACTIVE_MIN_X, ACTIVE_MAX_X),
        z: clamp(z, ACTIVE_MIN_Z, ACTIVE_MAX_Z),
    };
}

function outsideDistance(x, z, clamped) {
    return Math.hypot(x - clamped.x, z - clamped.z);
}

export function outerTerrainHeight(localX, localZ, seed) {
    const boundary = clampToAuthoredBoundary(localX, localZ);
    const boundaryHeight = sampleTerrainColumn(boundary.x, boundary.z, seed).height;
    const distance = outsideDistance(localX, localZ, boundary);
    const broad = fractalNoise2D(localX / 260, localZ / 260, seed + 9101, 4);
    const detail = deterministicNoise2D(localX / 72, localZ / 72, seed + 9119);
    const farHeight = clamp(70 + broad * 13 + detail * 3.5, 54, 104);
    const blend = smoothstep(16, 192, distance);
    return Math.round(clamp(lerp(boundaryHeight, farHeight, blend), 48, 112));
}
