import { world } from "@minecraft/server";
import { logInfo } from "../diagnostics/logging.js";
import { STRUCTURE_PLACEMENTS, resolveStructurePlacements } from "./layout.js";

const optionalMissingLogged = new Set();

export function resolvePackStructures(available = world.structureManager.getPackStructureIds()) {
    const { resolved, missingRequired, missingOptional } = resolveStructurePlacements(STRUCTURE_PLACEMENTS, available);
    if (missingRequired.length) {
        const details = missingRequired.map((placement) => `${placement.name} expected ${placement.expectedRuntimeIdentifier}`);
        const discovered = available.length ? available.join(", ") : "none";
        throw new Error(`Missing required pack structures; initialization aborted before placement: ${details.join("; ")}. Discovered pack structure IDs: ${discovered}`);
    }
    for (const placement of missingOptional) {
        if (optionalMissingLogged.has(placement.name))
            continue;
        optionalMissingLogged.add(placement.name);
        logInfo(`Optional structure ${placement.name} was not discovered by getPackStructureIds(); terrain generation will continue and this placement will be skipped.`);
    }
    return resolved;
}
