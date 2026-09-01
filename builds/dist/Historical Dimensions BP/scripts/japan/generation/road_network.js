import { HARD_MAX, HARD_MIN } from "../config.js";
import { isInsideProtectedStructure } from "../structures/protected_volumes.js";
import { agricultureSuitability } from "./agriculture.js";
import { deterministicNoise2D } from "./noise.js";
import { mainRiverCenterX, sampleHydrology, terrainHeight, terrainSlope } from "./terrain.js";
const ROAD_INDEX_CELL_SIZE = 32;
const cache = new Map();
function roadPlanCacheKey(seed, placements) {
    return `${seed}|${placements.map(placement => `${placement.name}:${placement.entrance.x},${placement.entrance.z}`).join(";")}`;
}
function roadIndexCoordinate(value) { return Math.floor((value - HARD_MIN) / ROAD_INDEX_CELL_SIZE); }
function roadIndexKey(x, z) { return `${x},${z}`; }
function buildRoadSpatialIndex(segments) {
    const mutable = new Map();
    segments.forEach((segment, index) => {
        const minX = roadIndexCoordinate(segment.bounds.minX - 20), maxX = roadIndexCoordinate(segment.bounds.maxX + 20);
        const minZ = roadIndexCoordinate(segment.bounds.minZ - 20), maxZ = roadIndexCoordinate(segment.bounds.maxZ + 20);
        for (let z = minZ; z <= maxZ; z++)
            for (let x = minX; x <= maxX; x++) {
                const key = roadIndexKey(x, z);
                const values = mutable.get(key) ?? [];
                if (!values.includes(index))
                    values.push(index);
                mutable.set(key, values);
            }
    });
    return new Map([...mutable].map(([key, values]) => [key, [...values]]));
}
function candidateSegmentIndices(x, z, plan, maxDistance) {
    const radius = Math.max(0, Math.ceil(maxDistance / ROAD_INDEX_CELL_SIZE));
    const centerX = roadIndexCoordinate(x), centerZ = roadIndexCoordinate(z);
    const found = new Set();
    for (let dz = -radius; dz <= radius; dz++)
        for (let dx = -radius; dx <= radius; dx++)
            for (const index of plan.segmentSpatialIndex.get(roadIndexKey(centerX + dx, centerZ + dz)) ?? [])
                found.add(index);
    return [...found];
}
function widthFor(roadClass) {
    switch (roadClass) {
        case "main": return 3;
        case "secondary": return 2;
        case "castle": return 2;
        case "sacred": return 2;
        default: return 1;
    }
}
function clampCoordinate(value) { return Math.max(HARD_MIN + 8, Math.min(HARD_MAX - 8, value)); }
function lineDistance(point, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
    const center = { x: a.x + dx * t, z: a.z + dz * t };
    const length = Math.hypot(dx, dz) || 1;
    return { distance: Math.hypot(point.x - center.x, point.z - center.z), t, center, direction: { x: dx / length, z: dz / length } };
}
function quadraticPoint(a, control, b, t) {
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, z: u * u * a.z + 2 * u * t * control.z + t * t * b.z };
}
function pointKey(point) { return `${Math.round(point.x)},${Math.round(point.z)}`; }
function routeCost(points, seed, end) {
    let cost = 0;
    for (let index = 0; index < points.length; index++) {
        const point = points[index];
        const slope = terrainSlope(point.x, point.z, seed);
        const hydro = sampleHydrology(point.x, point.z, seed);
        const endpointDistance = Math.hypot(point.x - end.x, point.z - end.z);
        cost += 1 + slope * slope * 2.2 + agricultureSuitability(point.x, point.z, seed) * 2.5;
        if (hydro.channel)
            cost += 25 + hydro.depth * 3;
        if (isInsideProtectedStructure(point.x, point.z, 2) && endpointDistance > 18)
            cost += 1200;
        if (Math.max(Math.abs(point.x), Math.abs(point.z)) > 485)
            cost += 500;
        if (index > 0) {
            const previous = points[index - 1];
            const delta = Math.abs(terrainHeight(point.x, point.z, seed) - terrainHeight(previous.x, previous.z, seed));
            if (delta > 7)
                cost += 800;
        }
    }
    return cost;
}
function routeCurve(start, end, seed, salt) {
    const dx = end.x - start.x, dz = end.z - start.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1)
        return [{ x: Math.round(start.x), z: Math.round(start.z), y: terrainHeight(start.x, start.z, seed) }];
    const nx = -dz / distance, nz = dx / distance;
    const baseOffset = deterministicNoise2D((start.x + end.x) / 180, (start.z + end.z) / 180, seed + salt) * 18;
    const offsets = [-48, -24, 0, 24, 48].map(offset => offset + baseOffset);
    let best = [];
    let bestCost = Number.POSITIVE_INFINITY;
    for (const offset of offsets) {
        const control = { x: clampCoordinate((start.x + end.x) / 2 + nx * offset), z: clampCoordinate((start.z + end.z) / 2 + nz * offset) };
        const steps = Math.max(2, Math.ceil(distance / 4));
        const raw = [];
        for (let step = 0; step <= steps; step++) {
            const p = quadraticPoint(start, control, end, step / steps);
            const rounded = { x: Math.round(clampCoordinate(p.x)), z: Math.round(clampCoordinate(p.z)) };
            if (raw.length === 0 || pointKey(raw[raw.length - 1]) !== pointKey(rounded))
                raw.push(rounded);
        }
        const cost = routeCost(raw, seed, end);
        if (cost < bestCost) {
            bestCost = cost;
            best = raw.map(point => ({ x: point.x, z: point.z, y: terrainHeight(point.x, point.z, seed) }));
        }
    }
    best[0] = { x: Math.round(start.x), z: Math.round(start.z), y: terrainHeight(start.x, start.z, seed) };
    best[best.length - 1] = { x: Math.round(end.x), z: Math.round(end.z), y: terrainHeight(end.x, end.z, seed) };
    return best;
}
function routeVia(start, end, via, seed, salt) {
    const anchors = [start, ...(via ?? []), end];
    const result = [];
    for (let index = 0; index < anchors.length - 1; index++) {
        const part = routeCurve(anchors[index], anchors[index + 1], seed, salt + index * 101);
        if (result.length > 0)
            part.shift();
        result.push(...part);
    }
    return result;
}
function makeSegment(edge, nodes, seed, index) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    const points = routeVia(from, to, edge.via, seed, 6001 + index * 17);
    return {
        id: edge.id, fromNode: edge.from, toNode: edge.to, roadClass: edge.roadClass, width: widthFor(edge.roadClass), points,
        bounds: {
            minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
            minZ: Math.min(...points.map(point => point.z)), maxZ: Math.max(...points.map(point => point.z)),
        }
    };
}
function bridgesForSegment(segment, seed) {
    const groups = [];
    let current = [];
    segment.points.forEach((point, index) => {
        if (sampleHydrology(point.x, point.z, seed).channel) {
            current.push({ point, index });
        }
        else if (current.length) {
            groups.push(current);
            current = [];
        }
    });
    if (current.length)
        groups.push(current);
    return groups.map((group, index) => {
        const firstEntry = group[0], lastEntry = group[group.length - 1];
        const centerEntry = group[Math.floor(group.length / 2)];
        let directionStart = firstEntry.point, directionEnd = lastEntry.point;
        if (firstEntry.index === lastEntry.index) {
            directionStart = segment.points[Math.max(0, firstEntry.index - 1)] ?? firstEntry.point;
            directionEnd = segment.points[Math.min(segment.points.length - 1, lastEntry.index + 1)] ?? lastEntry.point;
        }
        const dx = directionEnd.x - directionStart.x, dz = directionEnd.z - directionStart.z;
        const directionLength = Math.hypot(dx, dz) || 1;
        const crossedLength = Math.hypot(lastEntry.point.x - firstEntry.point.x, lastEntry.point.z - firstEntry.point.z);
        return {
            id: `${segment.id}_bridge_${index + 1}`,
            segmentId: segment.id,
            center: { x: centerEntry.point.x, z: centerEntry.point.z, y: 62 },
            width: segment.width * 2 + 1,
            length: Math.max(9, Math.ceil(crossedLength) + 8),
            direction: { x: dx / directionLength, z: dz / directionLength },
        };
    });
}
function mergeBridges(bridges) {
    const result = [];
    for (const bridge of bridges) {
        const duplicate = result.find(existing => Math.hypot(existing.center.x - bridge.center.x, existing.center.z - bridge.center.z) < 8);
        if (!duplicate)
            result.push(bridge);
    }
    return result;
}
function assignedHub(placement) {
    if (placement.name === "bandit_fort_mountain")
        return "frontier_watch";
    if (placement.name === "bandit_fort_citadel")
        return "citadel_fork";
    const order = placement.placementOrder;
    if (order <= 3)
        return "agriculture";
    if (order <= 6)
        return "merchant";
    if (order <= 8)
        return "warrior";
    if (order === 9)
        return "upper_valley";
    if (order === 10)
        return "checkpoint";
    if (order === 11)
        return "frontier_watch";
    if (order <= 15)
        return "yamajiro";
    if (order === 16)
        return "citadel_gate";
    if (order <= 18)
        return "citadel_bailey";
    return "religious";
}
function addConnection(adjacency, a, b) {
    const aa = adjacency.get(a) ?? [];
    if (!aa.includes(b))
        aa.push(b);
    adjacency.set(a, aa);
    const bb = adjacency.get(b) ?? [];
    if (!bb.includes(a))
        bb.push(a);
    adjacency.set(b, bb);
}
export function buildRoadNetwork(seed, placements) {
    const cacheKey = roadPlanCacheKey(seed, placements);
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const bridgeSouth = { x: Math.round(mainRiverCenterX(145, seed)), z: 145 };
    const bridgeNorth = { x: Math.round(mainRiverCenterX(-55, seed)), z: -55 };
    const nodeList = [
        { id: "arrival", x: 0, z: 0 }, { id: "village", x: 4, z: 48 }, { id: "merchant", x: -12, z: 82 },
        { id: "agriculture", x: -165, z: 176 }, { id: "warrior", x: 125, z: 100 }, { id: "upper_valley", x: 245, z: 150 },
        { id: "religious", x: 92, z: 258 }, { id: "mountain_fork", x: -88, z: -78 }, { id: "checkpoint", x: -220, z: -150 },
        { id: "frontier_watch", x: -306, z: -205 }, { id: "yamajiro", x: -352, z: -270 },
        { id: "citadel_fork", x: 155, z: -98 }, { id: "citadel_gate", x: 252, z: -318 }, { id: "citadel_bailey", x: 302, z: -232 },
    ];
    const nodes = new Map(nodeList.map(node => [node.id, node]));
    const edges = [
        { id: "arrival_village", from: "arrival", to: "village", roadClass: "main" },
        { id: "village_merchant", from: "village", to: "merchant", roadClass: "main" },
        { id: "merchant_agriculture", from: "merchant", to: "agriculture", roadClass: "rural", via: [bridgeSouth] },
        { id: "village_warrior", from: "village", to: "warrior", roadClass: "secondary" },
        { id: "warrior_upper", from: "warrior", to: "upper_valley", roadClass: "secondary" },
        { id: "village_religious", from: "village", to: "religious", roadClass: "sacred" },
        { id: "arrival_mountain", from: "arrival", to: "mountain_fork", roadClass: "mountain", via: [bridgeNorth] },
        { id: "mountain_checkpoint", from: "mountain_fork", to: "checkpoint", roadClass: "mountain" },
        { id: "checkpoint_watch", from: "checkpoint", to: "frontier_watch", roadClass: "mountain" },
        { id: "watch_yamajiro", from: "frontier_watch", to: "yamajiro", roadClass: "castle" },
        { id: "arrival_citadel", from: "arrival", to: "citadel_fork", roadClass: "secondary" },
        { id: "citadel_gate_route", from: "citadel_fork", to: "citadel_gate", roadClass: "castle" },
        { id: "citadel_bailey_route", from: "citadel_gate", to: "citadel_bailey", roadClass: "castle" },
    ];
    const adjacency = new Map();
    const segments = [];
    edges.forEach((edge, index) => { segments.push(makeSegment(edge, nodes, seed, index)); addConnection(adjacency, edge.from, edge.to); });
    const structureConnections = new Map();
    for (const placement of placements) {
        const hubId = assignedHub(placement);
        const hub = nodes.get(hubId);
        const structureNode = `structure:${placement.name}`;
        const edge = { id: `access_${placement.name}`, from: hubId, to: structureNode, roadClass: placement.region === "B" ? "mountain" : placement.region === "C" ? "castle" : placement.placementOrder >= 19 ? "sacred" : "rural" };
        const entranceNode = { id: structureNode, x: placement.entrance.x, z: placement.entrance.z };
        const extendedNodes = new Map(nodes);
        extendedNodes.set(structureNode, entranceNode);
        const segment = makeSegment(edge, extendedNodes, seed, segments.length);
        segments.push(segment);
        structureConnections.set(placement.name, segment.points);
        addConnection(adjacency, hubId, structureNode);
    }
    const bridges = mergeBridges(segments.flatMap(segment => bridgesForSegment(segment, seed)));
    const plan = { seed, segments, bridges, structureConnections, nodeConnections: new Map([...adjacency].map(([key, value]) => [key, [...value]])), segmentSpatialIndex: buildRoadSpatialIndex(segments) };
    cache.set(cacheKey, plan);
    return plan;
}
export function roadNetworkIsConnected(plan, expectedDestinationCount = plan.structureConnections.size) {
    const visited = new Set();
    const queue = ["arrival"];
    while (queue.length) {
        const node = queue.shift();
        if (visited.has(node)) continue;
        visited.add(node);
        for (const next of plan.nodeConnections.get(node) ?? [])
            if (!visited.has(next)) queue.push(next);
    }
    return plan.structureConnections.size === expectedDestinationCount
        && [...plan.structureConnections.keys()].every(name => visited.has(`structure:${name}`));
}
function bridgeAt(x, z, plan, segmentId) {
    return plan.bridges.find(bridge => bridge.segmentId === segmentId && Math.hypot(x - bridge.center.x, z - bridge.center.z) <= bridge.length / 2 + 4);
}
function nearestRoadSampleFromIndices(x, z, plan, maxDistance, indices) {
    let best;
    for (const segmentIndex of indices) {
        const segment = plan.segments[segmentIndex];
        if (!segment)
            continue;
        if (x < segment.bounds.minX - maxDistance || x > segment.bounds.maxX + maxDistance || z < segment.bounds.minZ - maxDistance || z > segment.bounds.maxZ + maxDistance)
            continue;
        for (let index = 0; index < segment.points.length - 1; index++) {
            const a = segment.points[index], b = segment.points[index + 1];
            const sample = lineDistance({ x, z }, a, b);
            if (sample.distance > maxDistance || best && sample.distance >= best.distance)
                continue;
            const targetY = Math.round(a.y + (b.y - a.y) * sample.t);
            best = { distance: sample.distance, width: segment.width, targetY, center: sample.center, roadClass: segment.roadClass, bridge: bridgeAt(sample.center.x, sample.center.z, plan, segment.id), segmentId: segment.id, direction: sample.direction };
        }
    }
    return best;
}
export function roadQueryCandidateCount(x, z, plan, maxDistance = 16) { return candidateSegmentIndices(x, z, plan, maxDistance).length; }
export function nearestRoadSampleReference(x, z, plan, maxDistance = 16) {
    return nearestRoadSampleFromIndices(x, z, plan, maxDistance, plan.segments.map((_, index) => index));
}
export function nearestRoadSample(x, z, plan, maxDistance = 16) {
    return nearestRoadSampleFromIndices(x, z, plan, maxDistance, candidateSegmentIndices(x, z, plan, maxDistance));
}
export function roadSegmentsForBounds(plan, minX, minZ, maxX, maxZ, margin = 8) {
    return plan.segments.filter(segment => segment.bounds.minX <= maxX + margin && segment.bounds.maxX >= minX - margin && segment.bounds.minZ <= maxZ + margin && segment.bounds.maxZ >= minZ - margin);
}


// Watchdog-safe road planning. The synchronous planner is retained for pure tests,
// but runtime initialization uses this generator so every expensive route sample
// yields back to the Bedrock job coordinator.
function* routeCostIncremental(points, seed, end) {
    let cost = 0;
    for (let index = 0; index < points.length; index++) {
        const point = points[index];
        const slope = terrainSlope(point.x, point.z, seed);
        const hydro = sampleHydrology(point.x, point.z, seed);
        const endpointDistance = Math.hypot(point.x - end.x, point.z - end.z);
        cost += 1 + slope * slope * 2.2 + agricultureSuitability(point.x, point.z, seed) * 2.5;
        if (hydro.channel)
            cost += 25 + hydro.depth * 3;
        if (isInsideProtectedStructure(point.x, point.z, 2) && endpointDistance > 18)
            cost += 1200;
        if (Math.max(Math.abs(point.x), Math.abs(point.z)) > 485)
            cost += 500;
        if (index > 0) {
            const previous = points[index - 1];
            const delta = Math.abs(terrainHeight(point.x, point.z, seed) - terrainHeight(previous.x, previous.z, seed));
            if (delta > 7)
                cost += 800;
        }
        // One route-cost sample is the maximum runtime iteration. Microsoft
        // recommends that a single runJob iteration remain safe on mobile.
        yield;
    }
    return cost;
}
function* routeCurveIncremental(start, end, seed, salt) {
    const dx = end.x - start.x, dz = end.z - start.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1) {
        const point = { x: Math.round(start.x), z: Math.round(start.z), y: terrainHeight(start.x, start.z, seed) };
        yield;
        return [point];
    }
    const nx = -dz / distance, nz = dx / distance;
    const baseOffset = deterministicNoise2D((start.x + end.x) / 180, (start.z + end.z) / 180, seed + salt) * 18;
    const offsets = [-48, -24, 0, 24, 48].map(offset => offset + baseOffset);
    let bestRaw = [];
    let bestCost = Number.POSITIVE_INFINITY;
    for (const offset of offsets) {
        const control = { x: clampCoordinate((start.x + end.x) / 2 + nx * offset), z: clampCoordinate((start.z + end.z) / 2 + nz * offset) };
        const steps = Math.max(2, Math.ceil(distance / 4));
        const raw = [];
        for (let step = 0; step <= steps; step++) {
            const p = quadraticPoint(start, control, end, step / steps);
            const rounded = { x: Math.round(clampCoordinate(p.x)), z: Math.round(clampCoordinate(p.z)) };
            if (raw.length === 0 || pointKey(raw[raw.length - 1]) !== pointKey(rounded))
                raw.push(rounded);
            if ((step & 3) === 3)
                yield;
        }
        const cost = yield* routeCostIncremental(raw, seed, end);
        if (cost < bestCost) {
            bestCost = cost;
            bestRaw = raw;
        }
        yield;
    }
    const best = [];
    for (const point of bestRaw) {
        best.push({ x: point.x, z: point.z, y: terrainHeight(point.x, point.z, seed) });
        yield;
    }
    best[0] = { x: Math.round(start.x), z: Math.round(start.z), y: terrainHeight(start.x, start.z, seed) };
    best[best.length - 1] = { x: Math.round(end.x), z: Math.round(end.z), y: terrainHeight(end.x, end.z, seed) };
    yield;
    return best;
}
function* routeViaIncremental(start, end, via, seed, salt) {
    const anchors = [start, ...(via ?? []), end];
    const result = [];
    for (let index = 0; index < anchors.length - 1; index++) {
        const part = yield* routeCurveIncremental(anchors[index], anchors[index + 1], seed, salt + index * 101);
        if (result.length > 0)
            part.shift();
        result.push(...part);
        yield;
    }
    return result;
}
function* makeSegmentIncremental(edge, nodes, seed, index) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    const points = yield* routeViaIncremental(from, to, edge.via, seed, 6001 + index * 17);
    const result = {
        id: edge.id, fromNode: edge.from, toNode: edge.to, roadClass: edge.roadClass, width: widthFor(edge.roadClass), points,
        bounds: {
            minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
            minZ: Math.min(...points.map(point => point.z)), maxZ: Math.max(...points.map(point => point.z)),
        }
    };
    yield;
    return result;
}
function* bridgesForSegmentIncremental(segment, seed) {
    const groups = [];
    let current = [];
    for (let index = 0; index < segment.points.length; index++) {
        const point = segment.points[index];
        if (sampleHydrology(point.x, point.z, seed).channel)
            current.push({ point, index });
        else if (current.length) {
            groups.push(current);
            current = [];
        }
        yield;
    }
    if (current.length)
        groups.push(current);
    const bridges = groups.map((group, index) => {
        const firstEntry = group[0], lastEntry = group[group.length - 1];
        const centerEntry = group[Math.floor(group.length / 2)];
        let directionStart = firstEntry.point, directionEnd = lastEntry.point;
        if (firstEntry.index === lastEntry.index) {
            directionStart = segment.points[Math.max(0, firstEntry.index - 1)] ?? firstEntry.point;
            directionEnd = segment.points[Math.min(segment.points.length - 1, lastEntry.index + 1)] ?? lastEntry.point;
        }
        const dx = directionEnd.x - directionStart.x, dz = directionEnd.z - directionStart.z;
        const directionLength = Math.hypot(dx, dz) || 1;
        const crossedLength = Math.hypot(lastEntry.point.x - firstEntry.point.x, lastEntry.point.z - firstEntry.point.z);
        return {
            id: `${segment.id}_bridge_${index + 1}`,
            segmentId: segment.id,
            center: { x: centerEntry.point.x, z: centerEntry.point.z, y: 62 },
            width: segment.width * 2 + 1,
            length: Math.max(9, Math.ceil(crossedLength) + 8),
            direction: { x: dx / directionLength, z: dz / directionLength },
        };
    });
    yield;
    return bridges;
}
function* buildRoadSpatialIndexIncremental(segments) {
    const mutable = new Map();
    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const minX = roadIndexCoordinate(segment.bounds.minX - 20), maxX = roadIndexCoordinate(segment.bounds.maxX + 20);
        const minZ = roadIndexCoordinate(segment.bounds.minZ - 20), maxZ = roadIndexCoordinate(segment.bounds.maxZ + 20);
        for (let z = minZ; z <= maxZ; z++)
            for (let x = minX; x <= maxX; x++) {
                const key = roadIndexKey(x, z);
                const values = mutable.get(key) ?? [];
                if (!values.includes(index))
                    values.push(index);
                mutable.set(key, values);
                yield;
            }
    }
    return new Map([...mutable].map(([key, values]) => [key, [...values]]));
}
export function* buildRoadNetworkIncremental(seed, placements) {
    const cacheKey = roadPlanCacheKey(seed, placements);
    const cached = cache.get(cacheKey);
    if (cached)
        return cached;
    const bridgeSouth = { x: Math.round(mainRiverCenterX(145, seed)), z: 145 };
    const bridgeNorth = { x: Math.round(mainRiverCenterX(-55, seed)), z: -55 };
    const nodeList = [
        { id: "arrival", x: 0, z: 0 }, { id: "village", x: 4, z: 48 }, { id: "merchant", x: -12, z: 82 },
        { id: "agriculture", x: -165, z: 176 }, { id: "warrior", x: 125, z: 100 }, { id: "upper_valley", x: 245, z: 150 },
        { id: "religious", x: 92, z: 258 }, { id: "mountain_fork", x: -88, z: -78 }, { id: "checkpoint", x: -220, z: -150 },
        { id: "frontier_watch", x: -306, z: -205 }, { id: "yamajiro", x: -352, z: -270 },
        { id: "citadel_fork", x: 155, z: -98 }, { id: "citadel_gate", x: 252, z: -318 }, { id: "citadel_bailey", x: 302, z: -232 },
    ];
    const nodes = new Map(nodeList.map(node => [node.id, node]));
    const edges = [
        { id: "arrival_village", from: "arrival", to: "village", roadClass: "main" },
        { id: "village_merchant", from: "village", to: "merchant", roadClass: "main" },
        { id: "merchant_agriculture", from: "merchant", to: "agriculture", roadClass: "rural", via: [bridgeSouth] },
        { id: "village_warrior", from: "village", to: "warrior", roadClass: "secondary" },
        { id: "warrior_upper", from: "warrior", to: "upper_valley", roadClass: "secondary" },
        { id: "village_religious", from: "village", to: "religious", roadClass: "sacred" },
        { id: "arrival_mountain", from: "arrival", to: "mountain_fork", roadClass: "mountain", via: [bridgeNorth] },
        { id: "mountain_checkpoint", from: "mountain_fork", to: "checkpoint", roadClass: "mountain" },
        { id: "checkpoint_watch", from: "checkpoint", to: "frontier_watch", roadClass: "mountain" },
        { id: "watch_yamajiro", from: "frontier_watch", to: "yamajiro", roadClass: "castle" },
        { id: "arrival_citadel", from: "arrival", to: "citadel_fork", roadClass: "secondary" },
        { id: "citadel_gate_route", from: "citadel_fork", to: "citadel_gate", roadClass: "castle" },
        { id: "citadel_bailey_route", from: "citadel_gate", to: "citadel_bailey", roadClass: "castle" },
    ];
    const adjacency = new Map();
    const segments = [];
    for (let index = 0; index < edges.length; index++) {
        const edge = edges[index];
        segments.push(yield* makeSegmentIncremental(edge, nodes, seed, index));
        addConnection(adjacency, edge.from, edge.to);
        yield;
    }
    const structureConnections = new Map();
    for (const placement of placements) {
        const hubId = assignedHub(placement);
        const structureNode = `structure:${placement.name}`;
        const edge = { id: `access_${placement.name}`, from: hubId, to: structureNode, roadClass: placement.region === "B" ? "mountain" : placement.region === "C" ? "castle" : placement.placementOrder >= 19 ? "sacred" : "rural" };
        const entranceNode = { id: structureNode, x: placement.entrance.x, z: placement.entrance.z };
        const extendedNodes = new Map(nodes);
        extendedNodes.set(structureNode, entranceNode);
        const segment = yield* makeSegmentIncremental(edge, extendedNodes, seed, segments.length);
        segments.push(segment);
        structureConnections.set(placement.name, segment.points);
        addConnection(adjacency, hubId, structureNode);
        yield;
    }
    const bridgeCandidates = [];
    for (const segment of segments) {
        bridgeCandidates.push(...(yield* bridgesForSegmentIncremental(segment, seed)));
        yield;
    }
    const bridges = mergeBridges(bridgeCandidates);
    const segmentSpatialIndex = yield* buildRoadSpatialIndexIncremental(segments);
    const plan = { seed, segments, bridges, structureConnections, nodeConnections: new Map([...adjacency].map(([key, value]) => [key, [...value]])), segmentSpatialIndex };
    cache.set(cacheKey, plan);
    return plan;
}
export function serializeRoadNetworkPlan(plan) {
    // Access routes already contain the same point arrays as
    // structureConnections, and all adjacency can be reconstructed from segment
    // endpoints. Omitting those duplicate maps keeps the property below Bedrock's
    // conservative 32 KB string budget.
    return JSON.stringify({ format: 2, seed: plan.seed, segments: plan.segments, bridges: plan.bridges });
}
export function restoreRoadNetworkPlan(serialized, expectedSeed, expectedDestinationCount) {
    if (!serialized)
        return undefined;
    try {
        const value = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
        if (value?.format !== 2 || value.seed !== expectedSeed || !Array.isArray(value.segments) || !Array.isArray(value.bridges))
            return undefined;
        const structureConnections = new Map();
        const nodeConnections = new Map();
        for (const segment of value.segments) {
            addConnection(nodeConnections, segment.fromNode, segment.toNode);
            const structureNode = String(segment.toNode).startsWith("structure:") ? segment.toNode : String(segment.fromNode).startsWith("structure:") ? segment.fromNode : undefined;
            if (structureNode)
                structureConnections.set(structureNode.slice("structure:".length), segment.points);
        }
        if (structureConnections.size !== expectedDestinationCount)
            return undefined;
        return {
            seed: value.seed,
            segments: value.segments,
            bridges: value.bridges,
            structureConnections,
            nodeConnections,
            segmentSpatialIndex: buildRoadSpatialIndex(value.segments),
        };
    }
    catch {
        return undefined;
    }
}

