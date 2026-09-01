import { ACTIVE_MAX_X, ACTIVE_MAX_Z, ACTIVE_MIN_X, ACTIVE_MIN_Z, HARD_MAX as CONFIG_HARD_MAX, HARD_MIN as CONFIG_HARD_MIN } from "../config.js";
import { STRUCTURE_PLACEMENTS } from "../structures/layout.js";
import { deterministicNoise2D, fractalNoise2D } from "./noise.js";
export const HARD_MIN = CONFIG_HARD_MIN;
export const HARD_MAX = CONFIG_HARD_MAX;
export const WATER_LEVEL = 62;
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1)
        return value < edge0 ? 0 : 1;
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}
function softBand(value, outerMin, innerMin, innerMax, outerMax) {
    return smoothstep(outerMin, innerMin, value) * (1 - smoothstep(innerMax, outerMax, value));
}
export function arrivalClearingMask(x, z) {
    return 1 - smoothstep(18, 54, Math.hypot(x, z));
}
export function inhabitedValleyMask(x, z) {
    return softBand(x, -370, -305, 250, 315) * softBand(z, -90, -15, 365, 425);
}
export function sacredGroveMask(x, z) {
    return softBand(x, -45, 0, 255, 305) * softBand(z, 210, 250, 390, 430);
}
export function southernCountryMask(x, z) {
    const eastWest = softBand(x, -300, -215, 335, 405);
    const south = smoothstep(170, 285, z) * (1 - smoothstep(405, 445, z));
    return clamp(eastWest * south, 0, 1);
}
export function riverBasinMask(x, z, seed = 0) {
    const lateral = Math.abs(x - mainRiverCenterX(z, seed));
    return clamp((1 - smoothstep(95, 245, lateral)) * inhabitedValleyMask(x, z), 0, 1);
}
export function mountainFrontierMask(x, z) {
    const west = 1 - smoothstep(-185, -100, x);
    const north = 1 - smoothstep(-165, -72, z);
    return clamp(west * north, 0, 1);
}
export function citadelRegionMask(x, z) {
    const xMask = smoothstep(125, 210, x);
    const zMask = 1 - smoothstep(-135, -58, z);
    const edgeFade = 1 - smoothstep(ACTIVE_MAX_X - 96, ACTIVE_MAX_X - 18, x);
    return clamp(xMask * zMask * edgeFade, 0, 1);
}
export function classifyRegion(x, z) {
    if (mountainFrontierMask(x, z) >= 0.55)
        return "mountain_frontier";
    if (citadelRegionMask(x, z) >= 0.55)
        return "late_sengoku_citadel";
    if (x >= ACTIVE_MIN_X && x <= ACTIVE_MAX_X && z >= ACTIVE_MIN_Z && z <= ACTIVE_MAX_Z)
        return "echizen_valley";
    return "transition";
}
export function boundaryMask(x, z) {
    if (x < ACTIVE_MIN_X || x > ACTIVE_MAX_X || z < ACTIVE_MIN_Z || z > ACTIVE_MAX_Z)
        return 1;
    const edgeDistance = Math.min(x - ACTIVE_MIN_X, ACTIVE_MAX_X - x, z - ACTIVE_MIN_Z, ACTIVE_MAX_Z - z);
    return 1 - smoothstep(0, 128, edgeDistance);
}
export function mainRiverCenterX(z, seed) {
    const warp = deterministicNoise2D(z / 240, 7.25, seed + 404) * 6;
    const broadMeander = -42 + 24 * Math.sin((z + 26) / 150) + 8 * Math.sin((z - 18) / 63);
    const townBend = -66 * Math.exp(-Math.pow((z - 84) / 66, 2));
    return broadMeander + townBend + warp;
}
function mainRiverWidth(z, seed) {
    const broad = (deterministicNoise2D(z / 220, -3.75, seed + 771) + 1) * 0.5;
    const bend = 0.5 + 0.5 * Math.sin((z + 90) / 125);
    return clamp(19 + broad * 8 + bend * 4, 19, 31);
}
const westTributaryCache = new Map();
const eastTributaryCache = new Map();
function preparePolyline(points) {
    const lengths = [];
    const segments = [];
    const buckets = new Map();
    const bucketSize = 64;
    const queryPadding = 64;
    let total = 0;
    for (let index = 0; index < points.length - 1; index++) {
        const a = points[index], b = points[index + 1];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        lengths.push(length);
        const segment = { index, a, b, length, traveled: total };
        segments.push(segment);
        const minBucketX = Math.floor((Math.min(a.x, b.x) - queryPadding) / bucketSize);
        const maxBucketX = Math.floor((Math.max(a.x, b.x) + queryPadding) / bucketSize);
        const minBucketZ = Math.floor((Math.min(a.z, b.z) - queryPadding) / bucketSize);
        const maxBucketZ = Math.floor((Math.max(a.z, b.z) + queryPadding) / bucketSize);
        for (let bz = minBucketZ; bz <= maxBucketZ; bz++)
            for (let bx = minBucketX; bx <= maxBucketX; bx++) {
                const key = `${bx},${bz}`;
                const values = buckets.get(key) ?? [];
                values.push(index);
                buckets.set(key, values);
            }
        total += length;
    }
    return { points, lengths, total, segments, buckets, bucketSize };
}
function catmullRomCurve(control, samplesPerSegment = 10) {
    if (control.length < 2)
        return control;
    const points = [];
    for (let index = 0; index < control.length - 1; index++) {
        const p0 = control[Math.max(0, index - 1)];
        const p1 = control[index];
        const p2 = control[index + 1];
        const p3 = control[Math.min(control.length - 1, index + 2)];
        for (let sample = 0; sample < samplesPerSegment; sample++) {
            const t = sample / samplesPerSegment;
            const t2 = t * t;
            const t3 = t2 * t;
            points.push({
                x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
            });
        }
    }
    points.push({ ...control[control.length - 1] });
    return points;
}
function westTributaryPoints(seed) {
    const cached = westTributaryCache.get(seed);
    if (cached)
        return cached;
    const prepared = preparePolyline(catmullRomCurve([
        { x: -468, z: -386 },
        { x: -430, z: -380 },
        { x: -370, z: -376 },
        { x: -304, z: -372 },
        { x: -240, z: -365 },
        { x: -180, z: -352 },
        { x: -126, z: -338 },
        { x: -78, z: -326 },
        { x: mainRiverCenterX(-314, seed), z: -314 },
    ], 12));
    westTributaryCache.set(seed, prepared);
    return prepared;
}
function eastTributaryPoints(seed) {
    const cached = eastTributaryCache.get(seed);
    if (cached)
        return cached;
    const prepared = preparePolyline(catmullRomCurve([
        { x: 390, z: -390 },
        { x: 330, z: -392 },
        { x: 270, z: -392 },
        { x: 210, z: -386 },
        { x: 160, z: -365 },
        { x: 140, z: -330 },
        { x: 120, z: -280 },
        { x: 90, z: -220 },
        { x: 50, z: -160 },
        { x: mainRiverCenterX(-118, seed), z: -118 },
    ], 12));
    eastTributaryCache.set(seed, prepared);
    return prepared;
}
function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared, 0, 1);
    const px = start.x + dx * t;
    const pz = start.z + dz * t;
    return { distance: Math.hypot(point.x - px, point.z - pz), t };
}
function distanceToPolyline(point, polyline) {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestProgress = 0;
    const bucketX = Math.floor(point.x / polyline.bucketSize);
    const bucketZ = Math.floor(point.z / polyline.bucketSize);
    const candidates = polyline.buckets.get(`${bucketX},${bucketZ}`) ?? [];
    if (candidates.length === 0)
        return { distance: bestDistance, progress: 0 };
    for (const index of candidates) {
        const segment = polyline.segments[index];
        const result = distanceToSegment(point, segment.a, segment.b);
        if (result.distance < bestDistance) {
            bestDistance = result.distance;
            bestProgress = polyline.total === 0 ? 0 : (segment.traveled + segment.length * result.t) / polyline.total;
        }
    }
    return { distance: bestDistance, progress: bestProgress };
}
function hydrologySources(x, z, seed) {
    const mainExtent = softBand(z, ACTIVE_MIN_Z + 34, ACTIVE_MIN_Z + 82, ACTIVE_MAX_Z - 82, ACTIVE_MAX_Z - 34);
    const mainDistance = Math.abs(x - mainRiverCenterX(z, seed)) + (1 - mainExtent) * 512;
    const mainWidth = mainRiverWidth(z, seed) * mainExtent;
    const mainDepth = clamp(2.1 + mainWidth * 0.055 + deterministicNoise2D(x / 96, z / 96, seed + 1201) * 0.45, 2, 4);
    const west = distanceToPolyline({ x, z }, westTributaryPoints(seed));
    const westSourceTaper = smoothstep(0.02, 0.14, west.progress);
    const westWidth = clamp(6 + west.progress * 4 + deterministicNoise2D(x / 120, z / 120, seed + 1301), 6, 11) * westSourceTaper;
    const east = distanceToPolyline({ x, z }, eastTributaryPoints(seed));
    const eastSourceTaper = smoothstep(0.02, 0.14, east.progress);
    const eastWidth = clamp(6 + east.progress * 3.5 + deterministicNoise2D(x / 120, z / 120, seed + 1401), 6, 10) * eastSourceTaper;
    return [
        { id: "main_river", distance: mainDistance, fullWidth: mainWidth, depth: mainDepth },
        { id: "west_tributary", distance: west.distance, fullWidth: westWidth, depth: clamp(2 + west.progress * 1.5, 2, 4) },
        { id: "east_tributary", distance: east.distance, fullWidth: eastWidth, depth: clamp(2 + east.progress * 1.3, 2, 4) },
    ];
}
export function sampleHydrology(x, z, seed) {
    const samples = hydrologySources(x, z, seed);
    const ordered = [...samples].sort((a, b) => (a.distance - a.fullWidth / 2) - (b.distance - b.fullWidth / 2));
    const selected = ordered[0];
    const halfWidth = selected.fullWidth / 2;
    const sources = samples.filter(sample => sample.distance <= sample.fullWidth / 2 + 1.5).map(sample => sample.id);
    const channel = selected.distance <= halfWidth;
    const bankMask = 1 - smoothstep(halfWidth + 1.5, halfWidth + 12, selected.distance);
    const floodplainMask = 1 - smoothstep(halfWidth + 12, halfWidth + 50, selected.distance);
    const depth = clamp(selected.depth, 2, 5);
    const core = 1 - smoothstep(0, halfWidth, selected.distance);
    const effectiveDepth = 1 + (depth - 1) * Math.pow(core, 0.78);
    return {
        channel,
        source: channel ? selected.id : undefined,
        nearestSource: selected.id,
        sources,
        distance: selected.distance,
        fullWidth: selected.fullWidth,
        halfWidth,
        depth,
        bedY: Math.round(WATER_LEVEL - effectiveDepth),
        bankMask,
        floodplainMask,
        seasonal: selected.id !== "main_river" && selected.distance <= halfWidth + 2.5,
    };
}
export function riverMask(x, z, seed) {
    const sample = sampleHydrology(x, z, seed);
    return 1 - smoothstep(sample.halfWidth, sample.halfWidth + 3, sample.distance);
}
export function floodplainMask(x, z, seed = 0) {
    return sampleHydrology(x, z, seed).floodplainMask;
}
export function streamMask(x, z, seed = 0) {
    const sample = sampleHydrology(x, z, seed);
    return sample.source === "main_river" ? 0 : riverMask(x, z, seed);
}
function rectangleOutsideDistance(x, z, placement) {
    const bounds = placement.boundingBox;
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    return Math.hypot(dx, dz);
}
function siteBlendRadius(placement) {
    if (placement.name.includes("castle") || placement.name.includes("yakata") || placement.name.includes("keep") || placement.name.includes("yagura"))
        return 44;
    if (placement.name.includes("temple") || placement.name.includes("shrine") || placement.name.includes("cemetery"))
        return 34;
    return 28;
}
export function structureBlendInfluence(x, z) {
    let bestInfluence = 0;
    let bestName;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let weightedTarget = 0;
    let totalWeight = 0;
    for (const placement of STRUCTURE_PLACEMENTS) {
        const distance = rectangleOutsideDistance(x, z, placement);
        const radius = siteBlendRadius(placement);
        if (distance === 0) {
            return {
                influence: 1,
                targetY: placement.groundElevation - 1,
                placementName: placement.name,
                distance: 0,
            };
        }
        const influence = 1 - smoothstep(0, radius, distance);
        if (influence <= 0)
            continue;
        const weight = influence * influence;
        weightedTarget += (placement.groundElevation - 1) * weight;
        totalWeight += weight;
        nearestDistance = Math.min(nearestDistance, distance);
        if (influence > bestInfluence) {
            bestInfluence = influence;
            bestName = placement.name;
        }
    }
    return {
        influence: bestInfluence,
        targetY: totalWeight > 0 ? weightedTarget / totalWeight : undefined,
        placementName: bestName,
        distance: nearestDistance,
    };
}
function baseValleyHeight(x, z, seed) {
    const valleyCenter = mainRiverCenterX(z, seed);
    const lateral = Math.abs(x - valleyCenter);
    const broad = fractalNoise2D(x / 360, z / 360, seed + 2001, 3);
    const regional = deterministicNoise2D(x / 170, z / 170, seed + 2011);
    const floor = 66 + broad * 1.55 + regional * 0.72 + Math.sin((z + 70) / 205) * 0.65;
    const floodTerrace = 2.5 * smoothstep(58, 122, lateral);
    const settledShoulder = 6.5 * smoothstep(115, 205, lateral);
    const foothill = 12 * smoothstep(200, 315, lateral);
    const outerUpland = 11 * smoothstep(310, 470, lateral);
    const southernRoll = southernCountryMask(x, z) * (3.5 + deterministicNoise2D(x / 180, z / 180, seed + 2021) * 1.8);
    return floor + floodTerrace + settledShoulder + foothill + outerUpland + southernRoll;
}
function mountainFrontierRelief(x, z, seed) {
    const mask = mountainFrontierMask(x, z);
    if (mask <= 0)
        return 0;
    const warpX = x + deterministicNoise2D(x / 220, z / 210, seed + 2101) * 34;
    const warpZ = z + deterministicNoise2D(x / 240, z / 205, seed + 2111) * 28;
    const primaryWave = 1 - Math.abs(Math.sin((warpX + warpZ * 0.46) / 105));
    const crossingWave = 1 - Math.abs(Math.sin((warpX * 0.34 - warpZ) / 142));
    const primaryRidge = Math.pow(clamp(primaryWave, 0, 1), 2.0) * 13;
    const crossingRidge = Math.pow(clamp(crossingWave, 0, 1), 2.3) * 7;
    const spur = Math.max(0, deterministicNoise2D(warpX / 150, warpZ / 150, seed + 2121)) * 5;
    return mask * (8 + primaryRidge + crossingRidge + spur);
}
function citadelRelief(x, z, seed) {
    const mask = citadelRegionMask(x, z);
    if (mask <= 0)
        return 0;
    const dx = (x - 300) / 175;
    const dz = (z + 245) / 165;
    const citadelHill = 17 * Math.exp(-(dx * dx + dz * dz));
    const shoulder = 7 * Math.exp(-(((x - 248) / 245) ** 2 + ((z + 250) / 220) ** 2));
    const ridgeWave = Math.pow(1 - Math.abs(Math.sin((x * 0.62 + z) / 128)), 2.1) * 6;
    const rough = deterministicNoise2D(x / 160, z / 160, seed + 2201) * 1.2;
    return mask * (citadelHill + shoulder + ridgeWave + rough);
}
function defensiveCut(x, z) {
    const west = x > -470 && x < -245 ? 1 - smoothstep(2.5, 9, Math.abs(z + 302 + 0.07 * (x + 350))) : 0;
    const east = x > 200 && x < 410 ? 1 - smoothstep(2.5, 8, Math.abs(z + 302 - 0.13 * (x - 300))) : 0;
    return Math.max(west, east) * 5;
}
export function naturalTerrainHeight(x, z, seed) {
    let height = baseValleyHeight(x, z, seed);
    height += mountainFrontierRelief(x, z, seed);
    height += citadelRelief(x, z, seed);
    height -= defensiveCut(x, z) * 0.65;

    const edge = boundaryMask(x, z);
    const edgeNoise = deterministicNoise2D(x / 150, z / 150, seed + 2301);
    height += edge * (10 + edge * 6 + edgeNoise * 4.5);

    const inhabited = inhabitedValleyMask(x, z);
    const southern = southernCountryMask(x, z);
    const outerRelief = Math.max(mountainFrontierMask(x, z), citadelRegionMask(x, z), edge);
    const broadRolling = deterministicNoise2D(x / 175, z / 175, seed + 2307) * lerp(0.7, 1.55, outerRelief);
    const localAmplitude = lerp(lerp(0.48, 0.20, inhabited), 1.25, outerRelief);
    const microAmplitude = lerp(lerp(0.20, 0.06, inhabited), 0.48, outerRelief);
    const local = deterministicNoise2D(x / 86, z / 86, seed + 2311) * localAmplitude;
    const micro = deterministicNoise2D(x / 52, z / 52, seed + 2321) * microAmplitude;
    height += broadRolling + local + micro + southern * deterministicNoise2D(x / 112, z / 112, seed + 2327) * 0.8;

    const arrival = arrivalClearingMask(x, z);
    if (arrival > 0) {
        const arrivalTarget = 67 + clamp(z / 32, -1.1, 1.2) + deterministicNoise2D(x / 70, z / 70, seed + 2331) * 0.55;
        height = lerp(height, arrivalTarget, arrival * 0.82);
    }

    const contourStep = Math.max(mountainFrontierMask(x, z), citadelRegionMask(x, z), edge) > 0.58 ? 2 : 1;
    const contourPhase = deterministicNoise2D(x / 260, z / 260, seed + 2341) * 0.24;
    height = Math.round((height + contourPhase) / contourStep) * contourStep;
    return clamp(height, 54, 136);
}
function hydrologyAdjustedHeight(natural, hydro) {
    if (hydro.channel)
        return hydro.bedY;
    const bankDistance = Math.max(0, hydro.distance - hydro.halfWidth);
    const mainRiverBank = hydro.nearestSource === "main_river";
    const corridorWidth = mainRiverBank ? 52 : 42;
    const corridorMask = 1 - smoothstep(0, corridorWidth, bankDistance);
    if (hydro.bankMask > 0 || corridorMask > 0) {
        const riseCap = mainRiverBank ? 7 : 9;
        const riseRate = mainRiverBank ? 0.18 : 0.22;
        const gradedBank = WATER_LEVEL + 1 + Math.min(riseCap, Math.floor(bankDistance * riseRate));
        const target = Math.max(WATER_LEVEL + 1, Math.min(natural, gradedBank));
        const influence = Math.max(hydro.bankMask * 0.98, corridorMask * 0.92);
        return lerp(natural, target, influence);
    }
    return natural;
}
export function sampleTerrainColumn(x, z, seed) {
    if (x < ACTIVE_MIN_X || x > ACTIVE_MAX_X || z < ACTIVE_MIN_Z || z > ACTIVE_MAX_Z) {
        return {
            x, z, height: 0, naturalHeight: 0, hydrology: sampleHydrology(x, z, seed),
            structureBlend: { influence: 0, targetY: undefined, placementName: undefined, distance: Number.POSITIVE_INFINITY },
            region: "transition", boundary: 1,
        };
    }
    const naturalHeight = naturalTerrainHeight(x, z, seed);
    const hydrology = sampleHydrology(x, z, seed);
    const structureBlend = structureBlendInfluence(x, z);
    let height = hydrologyAdjustedHeight(naturalHeight, hydrology);
    if (!hydrology.channel && structureBlend.influence > 0 && structureBlend.targetY !== undefined) {
        const strength = structureBlend.influence;
        height = lerp(height, structureBlend.targetY, strength);
    }

    if (!hydrology.channel && structureBlend.influence < 0.92 && mountainFrontierMask(x, z) >= 0.55)
        height = Math.round(height / 2) * 2;

    return {
        x, z, height: Math.round(clamp(height, 52, 150)), naturalHeight, hydrology, structureBlend,
        region: classifyRegion(x, z), boundary: boundaryMask(x, z),
    };
}
export function terrainHeight(x, z, seed) {
    return sampleTerrainColumn(x, z, seed).height;
}
export function preparedTerrainHeight(x, z, seed) {
    return terrainHeight(x, z, seed);
}
export function terrainSlope(x, z, seed) {
    const center = terrainHeight(x, z, seed);
    let maximum = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighborX = clamp(x + dx, ACTIVE_MIN_X, ACTIVE_MAX_X);
        const neighborZ = clamp(z + dz, ACTIVE_MIN_Z, ACTIVE_MAX_Z);
        maximum = Math.max(maximum, Math.abs(center - terrainHeight(neighborX, neighborZ, seed)));
    }
    return maximum;
}
export function ridgeMask(x, z, seed = 0) {
    return clamp(mountainFrontierRelief(x, z, seed) / 35, 0, 1);
}
export function castleTerraceMask(x, z) {
    const site = structureBlendInfluence(x, z);
    return site.placementName?.includes("castle") || site.placementName?.includes("keep") || site.placementName?.includes("yagura") ? site.influence : 0;
}
export function defensiveDitchMask(x, z) {
    return clamp(defensiveCut(x, z) / 5, 0, 1);
}
export function forestDensityFromFields(x, z, seed, height, slope, hydro, structureInfluence) {
    const region = classifyRegion(x, z);
    const noise = (fractalNoise2D(x / 92, z / 92, seed + 4001, 3) + 1) * 0.5;
    const base = region === "mountain_frontier" ? 0.84 : region === "late_sengoku_citadel" ? 0.66 : 0.48;
    const footslope = smoothstep(72, 100, height);
    const arrivalOpen = arrivalClearingMask(x, z);
    const inhabitedOpen = inhabitedValleyMask(x, z);
    const sacred = sacredGroveMask(x, z);
    return clamp(base + noise * 0.22 + footslope * 0.14 + slope * 0.015 + sacred * 0.24 -
        hydro.floodplainMask * 0.30 - structureInfluence * 0.74 - inhabitedOpen * 0.10 - arrivalOpen * 1.25, 0, 1);
}
export function forestDensity(x, z, seed) {
    const sample = sampleTerrainColumn(x, z, seed);
    return forestDensityFromFields(x, z, seed, sample.height, terrainSlope(x, z, seed), sample.hydrology, sample.structureBlend.influence);
}
export function ricePaddyMask(x, z, seed) {
    const hydro = sampleHydrology(x, z, seed);
    if (classifyRegion(x, z) !== "echizen_valley" || hydro.channel || z < 70 || z > 310 || x > 90 || x < -320)
        return 0;
    const slope = terrainSlope(x, z, seed);
    return clamp(hydro.floodplainMask * (1 - smoothstep(1.5, 4, slope)) * (1 - structureBlendInfluence(x, z).influence), 0, 1);
}
export function roadMask() {
    return 0;
}
