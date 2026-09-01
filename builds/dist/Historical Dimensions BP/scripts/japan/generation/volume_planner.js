export function compressProfiles(profiles, width, height) {
    if (profiles.length !== width * height)
        throw new Error(`profile grid mismatch: expected ${width * height}, got ${profiles.length}`);
    const visited = new Uint8Array(profiles.length);
    const rectangles = [];
    for (let z = 0; z < height; z++)
        for (let x = 0; x < width; x++) {
            const index = z * width + x;
            if (visited[index])
                continue;
            const profile = profiles[index];
            let x1 = x;
            while (x1 + 1 < width && !visited[z * width + x1 + 1] && Object.is(profiles[z * width + x1 + 1], profile))
                x1++;
            let z1 = z;
            outer: while (z1 + 1 < height) {
                for (let xx = x; xx <= x1; xx++) {
                    const next = (z1 + 1) * width + xx;
                    if (visited[next] || !Object.is(profiles[next], profile))
                        break outer;
                }
                z1++;
            }
            for (let zz = z; zz <= z1; zz++)
                for (let xx = x; xx <= x1; xx++)
                    visited[zz * width + xx] = 1;
            rectangles.push({ x0: x, z0: z, x1, z1, profile });
        }
    return rectangles;
}
export function expandProfileRectangles(rectangles, width, height) {
    const out = new Array(width * height);
    const written = new Uint8Array(width * height);
    for (const rectangle of rectangles) {
        if (rectangle.x0 < 0 || rectangle.z0 < 0 || rectangle.x1 >= width || rectangle.z1 >= height || rectangle.x1 < rectangle.x0 || rectangle.z1 < rectangle.z0)
            throw new Error("invalid profile rectangle");
        for (let z = rectangle.z0; z <= rectangle.z1; z++)
            for (let x = rectangle.x0; x <= rectangle.x1; x++) {
                const index = z * width + x;
                if (written[index])
                    throw new Error(`overlapping profile rectangle at ${x},${z}`);
                written[index] = 1;
                out[index] = rectangle.profile;
            }
    }
    if (written.some(value => value === 0))
        throw new Error("profile rectangles leave gaps");
    return out;
}
export function terrainProfileKey(profile) {
    const shellDepth = Math.max(0, profile.surfaceY - profile.bottomY);
    const effectiveSubDepth = Math.min(Math.max(0, profile.subDepth), shellDepth);
    const deepTopY = profile.surfaceY - effectiveSubDepth - 1;
    const deepBlock = deepTopY >= profile.bottomY ? profile.deepBlock : "";
    return `${profile.bottomY}|${profile.surfaceY}|${deepBlock}|${profile.subBlock}|${profile.topBlock}|${effectiveSubDepth}`;
}

function normalizePlannerVolume(from, to) {
    return {
        min: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) },
        max: { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) },
    };
}

export function planVolumeSlices(from, to, maxBlocks = 2048) {
    const { min, max } = normalizePlannerVolume(from, to);
    const limit = Math.max(64, Math.floor(maxBlocks));
    const width = max.x - min.x + 1;
    const depth = max.z - min.z + 1;
    const height = max.y - min.y + 1;
    const total = width * depth * height;
    if (total <= limit)
        return [{ min, max }];

    const layerArea = width * depth;
    const slices = [];
    if (layerArea <= limit) {
        const yStep = Math.max(1, Math.floor(limit / layerArea));
        for (let y0 = min.y; y0 <= max.y; y0 += yStep) {
            const y1 = Math.min(max.y, y0 + yStep - 1);
            slices.push({ min: { x: min.x, y: y0, z: min.z }, max: { x: max.x, y: y1, z: max.z } });
        }
        return slices;
    }

    const xStep = Math.max(1, Math.min(width, Math.floor(Math.sqrt(limit))));
    const zStep = Math.max(1, Math.min(depth, Math.floor(limit / xStep)));
    for (let x0 = min.x; x0 <= max.x; x0 += xStep) {
        const x1 = Math.min(max.x, x0 + xStep - 1);
        for (let z0 = min.z; z0 <= max.z; z0 += zStep) {
            const z1 = Math.min(max.z, z0 + zStep - 1);
            const area = (x1 - x0 + 1) * (z1 - z0 + 1);
            const yStep = Math.max(1, Math.floor(limit / area));
            for (let y0 = min.y; y0 <= max.y; y0 += yStep) {
                const y1 = Math.min(max.y, y0 + yStep - 1);
                slices.push({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });
            }
        }
    }
    return slices;
}

export function planTerrainLayers(columns, width, height) {
    if (columns.length !== width * height)
        throw new Error(`terrain column grid mismatch: expected ${width * height}, got ${columns.length}`);
    const bodyKeys = [];
    const topKeys = [];
    const bodyProfiles = new Map();
    const topProfiles = new Map();
    for (const column of columns) {
        const bodyTopY = column.surfaceY - 1;
        const bodyBlock = column.subBlock ?? column.subMaterial;
        const topBlock = column.topBlock ?? column.topMaterial;
        const bodyKey = bodyTopY >= column.bottomY
            ? `${column.bottomY}|${bodyTopY}|${bodyBlock}`
            : "";
        const topKey = `${column.surfaceY}|${topBlock}`;
        bodyKeys.push(bodyKey);
        topKeys.push(topKey);
        if (bodyKey && !bodyProfiles.has(bodyKey))
            bodyProfiles.set(bodyKey, { bottomY: column.bottomY, topY: bodyTopY, block: bodyBlock });
        if (!topProfiles.has(topKey))
            topProfiles.set(topKey, { y: column.surfaceY, block: topBlock });
    }
    return {
        bodyRectangles: compressProfiles(bodyKeys, width, height),
        topRectangles: compressProfiles(topKeys, width, height),
        bodyProfiles,
        topProfiles,
    };
}
