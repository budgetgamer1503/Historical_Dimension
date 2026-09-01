import {
    StructureAnimationMode,
    StructureMirrorAxis,
    StructureRotation,
    world,
} from "@minecraft/server";
import { logError, logInfo } from "../diagnostics/logging.js";
import { terrainMetrics } from "../diagnostics/terrain_metrics.js";
import {
    TREE_TEMPLATES,
    TREE_TEMPLATE_BY_KEY,
    generateStructureForestCandidatesIncremental,
    planTreePlacements,
} from "./tree_planning.js";

export { TREE_TEMPLATES } from "./tree_planning.js";

let structureIdsLogged = false;

function resolveTemplateIdentifier(template, available) {
    const exact = available.find(id => id === template.expectedRuntimeIdentifier);
    if (exact)
        return exact;
    const suffix = `/trees/${template.key}`;
    const candidates = available.filter(id => id.endsWith(suffix) || id.endsWith(`:${template.key}`));
    return candidates.length === 1 ? candidates[0] : undefined;
}

function relevantPackStructureIds(available) {
    const keys = new Set(TREE_TEMPLATES.map(template => template.key));
    return available.filter(id => {
        const tail = id.split(/[/:]/).pop();
        return keys.has(tail);
    }).sort();
}

export function resolveTreeStructures(available = world.structureManager.getPackStructureIds()) {
    const relevant = relevantPackStructureIds(available);
    if (!structureIdsLogged) {
        structureIdsLogged = true;
        logInfo(`Discovered tree structure IDs: ${relevant.length ? relevant.join(", ") : "none"}`);
    }
    const resolved = new Map();
    for (const template of TREE_TEMPLATES) {
        const actualIdentifier = resolveTemplateIdentifier(template, available);
        if (!actualIdentifier) {
            logError(`tree-structure-id-${template.key}`, `Missing supplied tree structure ${template.key}; expected pack path identifier ${template.expectedRuntimeIdentifier}`, 1);
            continue;
        }
        resolved.set(template.key, { ...template, actualIdentifier });
    }
    return resolved;
}

export function* generateStructureTreePlan(cx, cz, seed, plan, resolvedTemplates, options = {}) {
    const candidates = yield* generateStructureForestCandidatesIncremental(
        cx,
        cz,
        seed,
        plan,
        terrainMetrics.vegetationCandidatesPerYield,
    );
    const planned = planTreePlacements(candidates, cx, cz, seed, plan, resolvedTemplates, options, {
        candidate: () => terrainMetrics.recordTreeCandidate(),
        protectionRejection: () => terrainMetrics.recordTreeProtectionRejection(),
        groundRejection: () => terrainMetrics.recordTreeGroundRejection(),
    });
    yield;
    return planned;
}

export function treePlanWorldBounds(planned, origin, fallbackCellBounds, padding = 2) {
    let minX = fallbackCellBounds?.minX ?? Number.POSITIVE_INFINITY;
    let minZ = fallbackCellBounds?.minZ ?? Number.POSITIVE_INFINITY;
    let maxX = fallbackCellBounds?.maxX ?? Number.NEGATIVE_INFINITY;
    let maxZ = fallbackCellBounds?.maxZ ?? Number.NEGATIVE_INFINITY;
    let minY = fallbackCellBounds?.minY ?? 24;
    let maxY = fallbackCellBounds?.maxY ?? 180;
    for (const { candidate, template, geometry } of planned) {
        const locationX = origin.x + candidate.x - geometry.anchor.x;
        const locationZ = origin.z + candidate.z - geometry.anchor.z;
        const locationY = candidate.y + template.yOffset;
        minX = Math.min(minX, locationX);
        minZ = Math.min(minZ, locationZ);
        maxX = Math.max(maxX, locationX + geometry.size.x - 1);
        maxZ = Math.max(maxZ, locationZ + geometry.size.z - 1);
        minY = Math.min(minY, locationY);
        maxY = Math.max(maxY, locationY + geometry.size.y - 1);
    }
    const pad = Math.max(0, Math.floor(padding));
    return {
        from: { x: Math.floor(minX) - pad, y: Math.max(-64, Math.floor(minY) - pad), z: Math.floor(minZ) - pad },
        to: { x: Math.ceil(maxX) + pad, y: Math.min(319, Math.ceil(maxY) + pad), z: Math.ceil(maxZ) + pad },
    };
}

export function* placeStructureTreePlan(dimension, cx, cz, seed, origin, planned) {
    let placed = 0;
    let failures = 0;
    for (const { candidate, template, rotation, geometry } of planned) {
        const location = {
            x: origin.x + candidate.x - geometry.anchor.x,
            y: candidate.y + template.yOffset,
            z: origin.z + candidate.z - geometry.anchor.z,
        };
        try {
            world.structureManager.place(
                template.actualIdentifier,
                dimension,
                location,
                {
                    includeBlocks: true,
                    includeEntities: false,
                    integrity: 1,
                    integritySeed: `sengoku-tree-${seed}-${cx}-${cz}-${candidate.x}-${candidate.z}-${template.key}`,
                    mirror: StructureMirrorAxis.None,
                    rotation: StructureRotation[rotation] ?? StructureRotation.None,
                    animationMode: StructureAnimationMode.None,
                    animationSeconds: 0,
                    waterlogged: false,
                },
            );
            terrainMetrics.recordStructure();
            terrainMetrics.recordTreePlaced();
            placed++;
        }
        catch (error) {
            failures++;
            terrainMetrics.recordTreePlacementFailure();
            logError(
                `tree-place-${template.key}-${location.x}-${location.y}-${location.z}`,
                `${template.actualIdentifier} at ${location.x},${location.y},${location.z}: ${String(error)}`,
                1,
            );
        }
        // One native structure placement (success or failure) per source iteration.
        yield;
    }
    return { planned: planned.length, placed, failures };
}

export function* generateStructureTreeCell(dimension, cx, cz, seed, plan, origin, resolvedTemplates, options = {}) {
    const planned = yield* generateStructureTreePlan(cx, cz, seed, plan, resolvedTemplates, options);
    return yield* placeStructureTreePlan(dimension, cx, cz, seed, origin, planned);
}

export function treeTemplateByKey(key) {
    return TREE_TEMPLATE_BY_KEY.get(key);
}
