import { deterministicNoise2D } from "./noise.js";
import { ARRIVAL_DRY_AGRICULTURE_RADIUS } from "../config.js";
import { classifyRegion, clamp, mainRiverCenterX, sampleHydrology, smoothstep, terrainHeight, terrainSlope } from "./terrain.js";
import { isInsideProtectedStructure } from "../structures/protected_volumes.js";
function hashCell(x, z, seed) {
    return (deterministicNoise2D(Math.floor(x / 48), Math.floor(z / 48), seed + 5101) + 1) * 0.5;
}
export function fieldCellDimensions(x, z, seed) {
    const macroX = Math.floor((x + 512) / 52);
    const macroZ = Math.floor((z + 512) / 52);
    const a = (deterministicNoise2D(macroX, macroZ, seed + 5201) + 1) * 0.5;
    const b = (deterministicNoise2D(macroX + 19, macroZ - 7, seed + 5211) + 1) * 0.5;
    const c = deterministicNoise2D(macroX - 11, macroZ + 23, seed + 5221);
    const width = 14 + Math.round(a * 14);
    const depth = 12 + Math.round(b * 14);
    const rotation = c * 0.24;
    return { width, depth, rotation };
}
function segmentDistance(x, z, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}
function irrigationPaths(seed) {
    return [
        { id: "south_intake", points: [
                { x: Math.round(mainRiverCenterX(118, seed)), z: 118 },
                { x: -92, z: 122 }, { x: -154, z: 110 }, { x: -218, z: 124 }, { x: -278, z: 151 },
            ] },
        { id: "central_feeder", points: [
                { x: Math.round(mainRiverCenterX(190, seed)), z: 190 },
                { x: -88, z: 192 }, { x: -145, z: 178 }, { x: -208, z: 190 }, { x: -268, z: 214 },
            ] },
        { id: "north_feeder", points: [
                { x: Math.round(mainRiverCenterX(258, seed)), z: 258 },
                { x: -82, z: 256 }, { x: -142, z: 246 }, { x: -202, z: 258 }, { x: -258, z: 282 },
            ] },
        { id: "western_link", points: [{ x: -278, z: 151 }, { x: -268, z: 214 }, { x: -258, z: 282 }] },
    ];
}
export function sampleIrrigation(x, z, seed, terrain) {
    if (x < -310 || x > 40 || z < 92 || z > 300)
        return { channel: false, distance: Number.POSITIVE_INFINITY, halfWidth: 1, bedY: terrain ?? 0, branch: undefined };
    let distance = Number.POSITIVE_INFINITY, branch;
    for (const path of irrigationPaths(seed))
        for (let index = 0; index < path.points.length - 1; index++) {
            const candidate = segmentDistance(x, z, path.points[index], path.points[index + 1]);
            if (candidate < distance) {
                distance = candidate;
                branch = path.id;
            }
        }
    const halfWidth = 1.05 + 0.2 * ((deterministicNoise2D(x / 80, z / 80, seed + 5601) + 1) * 0.5);
    const surface = terrain ?? terrainHeight(x, z, seed);
    return { channel: distance <= halfWidth, distance, halfWidth, bedY: Math.round(surface / 2) * 2 - 1, branch: distance <= halfWidth + 3 ? branch : undefined };
}
export function agricultureSuitabilityFromInputs(x, z, seed, inputs) {
    if (classifyRegion(x, z) !== "echizen_valley" || z < 72 || z > 315 || x < -325 || x > 95)
        return 0;
    if (inputs.protectedStructure || inputs.hydrology.channel || inputs.slope > 3.2)
        return 0;
    const flood = inputs.hydrology.floodplainMask;
    const lowland = 1 - smoothstep(76, 90, inputs.terrain);
    const noise = (deterministicNoise2D(x / 120, z / 120, seed + 5301) + 1) * 0.5;
    const paddyBase = clamp(flood * (1 - smoothstep(1.5, 4, inputs.slope)), 0, 1);
    return clamp(paddyBase * 0.58 + flood * 0.25 + lowland * 0.13 + noise * 0.08 - inputs.slope * 0.06, 0, 1);
}
export function agricultureSuitability(x, z, seed) {
    const hydrology = sampleHydrology(x, z, seed);
    return agricultureSuitabilityFromInputs(x, z, seed, {
        terrain: terrainHeight(x, z, seed), slope: terrainSlope(x, z, seed), hydrology,
        protectedStructure: isInsideProtectedStructure(x, z, 5),
    });
}
function fractional(value) { return value - Math.floor(value); }
export function classifyAgricultureFromInputs(x, z, seed, inputs) {
    const suitability = agricultureSuitabilityFromInputs(x, z, seed, inputs);
    const terrain = inputs.terrain;
    const irrigation = sampleIrrigation(x, z, seed, terrain);
    const dryArrivalDistrict = Math.hypot(x, z) < ARRIVAL_DRY_AGRICULTURE_RADIUS;
    if (irrigation.channel && !inputs.protectedStructure && !inputs.hydrology.channel) {
        if (dryArrivalDistrict)
            return { kind: suitability >= 0.34 ? "dry_field" : "meadow", suitability: Math.max(0.18, suitability), terraceY: Math.round(terrain), wet: false, boundaryDistance: 0 };
        return { kind: "irrigation", suitability: Math.max(0.34, suitability), terraceY: irrigation.bedY, wet: true, boundaryDistance: 0 };
    }
    // Irrigation water must be bounded by a raised earth shoulder. Without this
    // ring, one-block channels spill across adjacent terraces as soon as fluid
    // updates run. The shoulder is classified before the general suitability
    // cutoff so the complete channel remains sealed through meadow transitions.
    if (!inputs.protectedStructure && !inputs.hydrology.channel && irrigation.distance <= irrigation.halfWidth + 1.75)
        return { kind: "berm", suitability: Math.max(0.34, suitability), terraceY: irrigation.bedY + 2, wet: false, boundaryDistance: irrigation.distance - irrigation.halfWidth };
    if (suitability < 0.34)
        return { kind: suitability > 0.18 ? "meadow" : "none", suitability, terraceY: terrain, wet: false, boundaryDistance: 1 };
    const dimensions = fieldCellDimensions(x, z, seed);
    const warpX = deterministicNoise2D(x / 64, z / 64, seed + 5401) * 4.5;
    const warpZ = deterministicNoise2D(x / 70, z / 70, seed + 5411) * 4.5;
    const cosine = Math.cos(dimensions.rotation), sine = Math.sin(dimensions.rotation);
    const rx = (x + warpX) * cosine - (z + warpZ) * sine;
    const rz = (x + warpX) * sine + (z + warpZ) * cosine;
    const fu = fractional(rx / dimensions.width);
    const fv = fractional(rz / dimensions.depth);
    const boundaryDistance = Math.min(fu, 1 - fu, fv, 1 - fv);
    const bermThreshold = 0.055 + 0.02 * hashCell(x, z, seed);
    const terraceY = Math.round(terrain / 2) * 2;
    // Chamfer and vary corners so the fields read as fitted parcels rather than
    // a repeated rectangular grid. The cut is deterministic per parcel.
    const cornerDistance = Math.min(fu + fv, fu + (1 - fv), (1 - fu) + fv, (1 - fu) + (1 - fv));
    const cornerCut = 0.10 + 0.08 * hashCell(Math.floor(rx / dimensions.width) * 17, Math.floor(rz / dimensions.depth) * 17, seed + 5451);
    // Seal parcel edges before chamfering the visual corners. The previous
    // order cut holes through paddy berms and allowed water to cascade across
    // lower fields.
    if (boundaryDistance < bermThreshold)
        return { kind: "berm", suitability, terraceY: terraceY + 1, wet: false, boundaryDistance };
    if (cornerDistance < cornerCut)
        return { kind: "meadow", suitability: suitability * 0.82, terraceY: terrain, wet: false, boundaryDistance };
    const fieldHash = hashCell(Math.floor(rx / dimensions.width) * 41, Math.floor(rz / dimensions.depth) * 41, seed + 5501);
    if (fieldHash < 0.38)
        return dryArrivalDistrict
            ? { kind: "dry_field", suitability, terraceY, wet: false, boundaryDistance }
            : { kind: "flooded_paddy", suitability, terraceY, wet: true, boundaryDistance };
    if (fieldHash < 0.70)
        return { kind: "dry_field", suitability, terraceY, wet: false, boundaryDistance };
    if (fieldHash < 0.84)
        return { kind: "vegetable_plot", suitability, terraceY, wet: false, boundaryDistance };
    return { kind: "meadow", suitability, terraceY: terrain, wet: false, boundaryDistance };
}
export function classifyAgriculture(x, z, seed) {
    const hydrology = sampleHydrology(x, z, seed);
    return classifyAgricultureFromInputs(x, z, seed, {
        terrain: terrainHeight(x, z, seed), slope: terrainSlope(x, z, seed), hydrology,
        protectedStructure: isInsideProtectedStructure(x, z, 5),
    });
}
