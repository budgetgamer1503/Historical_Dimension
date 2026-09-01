import {
    StructureAnimationMode,
    StructureMirrorAxis,
    StructureRotation,
    world,
} from "@minecraft/server";
import {
    ACTIVE_CELL_MAX_X,
    ACTIVE_CELL_MAX_Z,
    ACTIVE_CELL_MIN_X,
    ACTIVE_CELL_MIN_Z,
    CELL_SIZE,
    HARD_MAX,
    HARD_MIN,
} from "../config.js";
import { logError, logInfo } from "../diagnostics/logging.js";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import { BLOCKS } from "../runtime/blocks.js";
import { rotateLocalPoint, rotatedSize, transformPoint } from "../structures/transforms.js";
import { fillVolume } from "./volume_writer.js";
import { authoredBridgeCoverage as calculateAuthoredBridgeCoverage, authoredBridgeWidthFits } from "./bridge_fit.js";

export const BRIDGE_TEMPLATE = Object.freeze({
    key: "medieval_bridge",
    expectedRuntimeIdentifier: "historyjam:sengoku_japan/medieval_bridge",
    size: Object.freeze({ x: 7, y: 11, z: 44 }),
    // The supplied structure's continuous walking deck is local Y=6. The old
    // procedural bridge used Y=62, which is also the river water surface. Lift
    // the authored deck three blocks so its end ramps meet the sealed Y=64 banks.
    anchor: Object.freeze({ x: 3, y: 6, z: 22 }),
    deckLiftAboveLegacyCenter: 3,
    signatures: Object.freeze([
        Object.freeze({ offset: Object.freeze({ x: 1, y: 10, z: 22 }), block: "minecraft:lantern" }),
        Object.freeze({ offset: Object.freeze({ x: 5, y: 10, z: 22 }), block: "minecraft:lantern" }),
    ]),
});

let bridgeStructureIdLogged = false;

function resolveBridgeIdentifier(available) {
    const exact = available.find(id => id === BRIDGE_TEMPLATE.expectedRuntimeIdentifier);
    if (exact)
        return exact;
    const candidates = available.filter(id => id.endsWith("/medieval_bridge") || id.endsWith(":medieval_bridge"));
    return candidates.length === 1 ? candidates[0] : undefined;
}

export function resolveBridgeStructure(available = world.structureManager.getPackStructureIds()) {
    const actualIdentifier = resolveBridgeIdentifier(available);
    if (!bridgeStructureIdLogged) {
        bridgeStructureIdLogged = true;
        logInfo(`Discovered authored bridge structure ID: ${actualIdentifier ?? "none"}`);
    }
    if (!actualIdentifier) {
        logError(
            "bridge-structure-id",
            `Missing authored bridge structure; expected pack path identifier ${BRIDGE_TEMPLATE.expectedRuntimeIdentifier}`,
            1,
        );
        return undefined;
    }
    return { ...BRIDGE_TEMPLATE, actualIdentifier };
}

export function bridgeRotationDegrees(bridge) {
    const x = Number(bridge?.direction?.x ?? 0);
    const z = Number(bridge?.direction?.z ?? 0);
    if (Math.abs(z) >= Math.abs(x))
        return z >= 0 ? 0 : 180;
    // transforms.js normalizes rotations so local +Z maps to -X at 90 degrees
    // and +X at 270 degrees.
    return x >= 0 ? 270 : 90;
}

function rotationEnum(rotation) {
    switch (rotation) {
        case 90:
            return StructureRotation.Rotate90;
        case 180:
            return StructureRotation.Rotate180;
        case 270:
            return StructureRotation.Rotate270;
        default:
            return StructureRotation.None;
    }
}

// Road-network bridge.length is the legacy procedural span: the measured wet
// crossing plus four blocks of approach padding on each bank. The supplied
// authored bridge already contains its own end ramps, so comparing that padded
// legacy span directly to the 44-block template incorrectly rejects crossings
// such as 48 (= 40 wet + 8 legacy padding). Keep two solid bank blocks under
// each authored ramp; only the excess beyond that is rebuilt as a compact
// cobblestone abutment.
const AUTHORED_APPROACH_HALF_WIDTH = 2;

export function authoredBridgeCoverage(bridge) {
    return calculateAuthoredBridgeCoverage(bridge, BRIDGE_TEMPLATE.size);
}

function bridgeFitsTemplateWidth(bridge) {
    return authoredBridgeWidthFits(bridge, BRIDGE_TEMPLATE.size);
}

function expandLongitudinalBounds(bounds, rotation, extension) {
    if (extension <= 0)
        return { min: { ...bounds.min }, max: { ...bounds.max } };
    if (rotation === 90 || rotation === 270)
        return {
            min: { ...bounds.min, x: bounds.min.x - extension },
            max: { ...bounds.max, x: bounds.max.x + extension },
        };
    return {
        min: { ...bounds.min, z: bounds.min.z - extension },
        max: { ...bounds.max, z: bounds.max.z + extension },
    };
}

export function bridgePlacementSpec(bridge, origin) {
    if (!bridgeFitsTemplateWidth(bridge)) {
        const coverage = authoredBridgeCoverage(bridge);
        throw new Error(
            `Authored bridge ${bridge.id} is too narrow for road width ${coverage.requiredWidth}; ` +
            `template width is ${BRIDGE_TEMPLATE.size.x}`,
        );
    }
    const rotation = bridgeRotationDegrees(bridge);
    const footprint = rotatedSize(BRIDGE_TEMPLATE.size, rotation);
    const rotatedAnchor = rotateLocalPoint(BRIDGE_TEMPLATE.anchor, BRIDGE_TEMPLATE.size, rotation);
    const desiredAnchor = {
        x: origin.x + Math.round(bridge.center.x),
        y: Math.round(bridge.center.y + BRIDGE_TEMPLATE.deckLiftAboveLegacyCenter),
        z: origin.z + Math.round(bridge.center.z),
    };
    const location = {
        x: desiredAnchor.x - rotatedAnchor.x,
        y: desiredAnchor.y - rotatedAnchor.y,
        z: desiredAnchor.z - rotatedAnchor.z,
    };
    const localLocation = {
        x: location.x - origin.x,
        y: location.y,
        z: location.z - origin.z,
    };
    const structureBounds = {
        min: { ...location },
        max: {
            x: location.x + footprint.x - 1,
            y: location.y + footprint.y - 1,
            z: location.z + footprint.z - 1,
        },
    };
    const localStructureBounds = {
        min: { ...localLocation },
        max: {
            x: localLocation.x + footprint.x - 1,
            y: localLocation.y + footprint.y - 1,
            z: localLocation.z + footprint.z - 1,
        },
    };
    const coverage = authoredBridgeCoverage(bridge);
    const bounds = expandLongitudinalBounds(structureBounds, rotation, coverage.approachExtension);
    const localBounds = expandLongitudinalBounds(localStructureBounds, rotation, coverage.approachExtension);
    return {
        bridge, rotation, footprint, location, localBounds, bounds,
        structureBounds, localStructureBounds, desiredAnchor, coverage,
    };
}

function approachStripBounds(spec, side, distance) {
    const y0 = Math.round(spec.bridge.center.y - 2);
    const y1 = Math.round(spec.bridge.center.y + 2);
    if (spec.rotation === 90 || spec.rotation === 270) {
        const x = side < 0
            ? spec.structureBounds.min.x - distance
            : spec.structureBounds.max.x + distance;
        return {
            from: { x, y: y0, z: spec.desiredAnchor.z - AUTHORED_APPROACH_HALF_WIDTH },
            to: { x, y: y1, z: spec.desiredAnchor.z + AUTHORED_APPROACH_HALF_WIDTH },
        };
    }
    const z = side < 0
        ? spec.structureBounds.min.z - distance
        : spec.structureBounds.max.z + distance;
    return {
        from: { x: spec.desiredAnchor.x - AUTHORED_APPROACH_HALF_WIDTH, y: y0, z },
        to: { x: spec.desiredAnchor.x + AUTHORED_APPROACH_HALF_WIDTH, y: y1, z },
    };
}

export function* prepareAuthoredBridgeApproaches(dimension, spec) {
    const extension = spec.coverage?.approachExtension ?? 0;
    if (extension <= 0)
        return;
    for (let distance = 1; distance <= extension; distance++) {
        for (const side of [-1, 1]) {
            const strip = approachStripBounds(spec, side, distance);
            fillVolume(dimension, strip.from, strip.to, BLOCKS.Cobblestone);
            yield;
            const clearFrom = { ...strip.from, y: Math.round(spec.bridge.center.y + 3) };
            const clearTo = { ...strip.to, y: Math.round(spec.bridge.center.y + 5) };
            fillVolume(dimension, clearFrom, clearTo, BLOCKS.Air);
            yield;
        }
    }
}

function localCoordinateToCell(value) {
    return Math.floor((value - HARD_MIN) / CELL_SIZE);
}

export function bridgeTerrainCells(spec) {
    const { min, max } = spec.localBounds;
    if (min.x < HARD_MIN || min.z < HARD_MIN || max.x > HARD_MAX || max.z > HARD_MAX)
        throw new Error(`Authored bridge ${spec.bridge.id} extends outside the generated province`);
    const minCellX = localCoordinateToCell(min.x);
    const maxCellX = localCoordinateToCell(max.x);
    const minCellZ = localCoordinateToCell(min.z);
    const maxCellZ = localCoordinateToCell(max.z);
    if (minCellX < ACTIVE_CELL_MIN_X || maxCellX > ACTIVE_CELL_MAX_X || minCellZ < ACTIVE_CELL_MIN_Z || maxCellZ > ACTIVE_CELL_MAX_Z)
        throw new Error(`Authored bridge ${spec.bridge.id} extends outside active terrain cells`);
    const cells = [];
    for (let z = minCellZ; z <= maxCellZ; z++)
        for (let x = minCellX; x <= maxCellX; x++)
            cells.push({ x, z });
    return cells;
}

export function verifyAuthoredBridge(dimension, spec) {
    for (const signature of BRIDGE_TEMPLATE.signatures) {
        const location = transformPoint(signature.offset, BRIDGE_TEMPLATE.size, spec.rotation, spec.location);
        if (!dimension.isChunkLoaded(location))
            return false;
        const block = dimension.getBlock(location);
        if (!block || block.typeId !== signature.block)
            return false;
    }
    return true;
}

function roundedLegacyPoint(bridge, longitudinal, lateral) {
    const perpendicular = { x: -bridge.direction.z, z: bridge.direction.x };
    return {
        x: Math.round(bridge.center.x + bridge.direction.x * longitudinal + perpendicular.x * lateral),
        z: Math.round(bridge.center.z + bridge.direction.z * longitudinal + perpendicular.z * lateral),
    };
}

export function* cleanupLegacyProceduralBridge(dimension, bridge, origin) {
    const halfLength = Math.max(4, Math.floor(bridge.length / 2));
    const halfWidth = Math.max(1, Math.floor(bridge.width / 2));
    const cleaned = new Set();

    // Remove only blocks that uniquely identify the old generated bridge. This
    // avoids deleting natural terrain or unrelated player edits around the banks.
    for (let longitudinal = -halfLength; longitudinal <= halfLength; longitudinal++) {
        for (let lateral = -halfWidth; lateral <= halfWidth; lateral++) {
            const point = roundedLegacyPoint(bridge, longitudinal, lateral);
            const location = {
                x: origin.x + point.x,
                y: bridge.center.y,
                z: origin.z + point.z,
            };
            const key = `${location.x}|${location.y}|${location.z}`;
            if (cleaned.has(key))
                continue;
            cleaned.add(key);
            const block = dimension.getBlock(location);
            if (block?.typeId === BLOCKS.SprucePlanks) {
                fillVolume(dimension, location, location, BLOCKS.Air);
                yield;
            }
        }
    }

    for (let longitudinal = -halfLength + 1; longitudinal <= halfLength - 1; longitudinal += 2) {
        for (const lateral of [-halfWidth, halfWidth]) {
            const point = roundedLegacyPoint(bridge, longitudinal, lateral);
            const location = {
                x: origin.x + point.x,
                y: bridge.center.y + 1,
                z: origin.z + point.z,
            };
            const key = `${location.x}|${location.y}|${location.z}`;
            if (cleaned.has(key))
                continue;
            cleaned.add(key);
            const block = dimension.getBlock(location);
            if (block?.typeId === BLOCKS.SpruceFence) {
                fillVolume(dimension, location, location, BLOCKS.Air);
                yield;
            }
        }
    }
}

export function placeAuthoredBridge(dimension, resolvedBridge, spec, seed) {
    world.structureManager.place(
        resolvedBridge.actualIdentifier,
        dimension,
        spec.location,
        {
            includeBlocks: true,
            includeEntities: false,
            integrity: 1,
            integritySeed: `sengoku-bridge-${seed}-${spec.bridge.id}`,
            mirror: StructureMirrorAxis.None,
            rotation: rotationEnum(spec.rotation),
            animationMode: StructureAnimationMode.None,
            animationSeconds: 0,
            waterlogged: false,
        },
    );
    terrainMetrics.recordStructure();
}
