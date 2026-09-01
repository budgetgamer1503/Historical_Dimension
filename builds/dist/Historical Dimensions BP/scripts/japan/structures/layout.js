export const STRUCTURE_PLACEMENTS = [
    {
        name: "village_e2990",
        displayName: "Replacement Sengoku village",
        batch: 1,
        expectedRuntimeIdentifier: "historyjam:sengoku_japan/village_e2990",
        region: "A",
        sourceDimensions: { x: 69, y: 55, z: 90 },
        groundLevel: 1,
        rotation: 0,
        origin: { x: -34, y: 66, z: 100 },
        groundElevation: 68,
        entrance: { x: -12, y: 68, z: 104 },
        connectors: [
            { id: "north_approach", world_position: { x: -12, y: 67, z: 104 } }
        ],
        boundingBox: {
            min: { x: -34, y: 66, z: 100 },
            max: { x: 34, y: 120, z: 189 }
        },
        protectedVolume: {
            min: { x: -37, y: 64, z: 97 },
            max: { x: 37, y: 124, z: 192 }
        },
        roofClearanceVolume: {
            min: { x: -35, y: 121, z: 99 },
            max: { x: 35, y: 128, z: 190 }
        },
        road: [
            { x: 0, z: 35 },
            { x: -12, z: 82 },
            { x: -12, z: 104 }
        ],
        placementOrder: 4
    },
    {
        name: "bandit_fort_mountain",
        displayName: "Mountain bandit fort",
        batch: 2,
        expectedRuntimeIdentifier: "historyjam:medievalfort_bandit_loot",
        required: false,
        region: "B",
        sourceDimensions: { x: 44, y: 64, z: 41 },
        groundLevel: 10,
        rotation: 0,
        origin: { x: -350, y: 83, z: -250 },
        groundElevation: 94,
        entrance: { x: -307, y: 94, z: -230 },
        connectors: [
            { id: "fort_gate", world_position: { x: -307, y: 94, z: -230 } }
        ],
        boundingBox: {
            min: { x: -350, y: 83, z: -250 },
            max: { x: -307, y: 146, z: -210 }
        },
        protectedVolume: {
            min: { x: -353, y: 81, z: -253 },
            max: { x: -304, y: 150, z: -207 }
        },
        roofClearanceVolume: {
            min: { x: -351, y: 147, z: -251 },
            max: { x: -306, y: 154, z: -209 }
        },
        road: [
            { x: -307, z: -230 }
        ],
        placementOrder: 20
    },
    {
        name: "bandit_fort_citadel",
        displayName: "Citadel bandit fort",
        batch: 2,
        expectedRuntimeIdentifier: "historyjam:medievalfort_bandit_loot",
        required: false,
        region: "C",
        sourceDimensions: { x: 44, y: 64, z: 41 },
        groundLevel: 10,
        rotation: 0,
        origin: { x: 198, y: 83, z: -120 },
        groundElevation: 94,
        entrance: { x: 198, y: 94, z: -100 },
        connectors: [
            { id: "fort_gate", world_position: { x: 198, y: 94, z: -100 } }
        ],
        boundingBox: {
            min: { x: 198, y: 83, z: -120 },
            max: { x: 241, y: 146, z: -80 }
        },
        protectedVolume: {
            min: { x: 195, y: 81, z: -123 },
            max: { x: 244, y: 150, z: -77 }
        },
        roofClearanceVolume: {
            min: { x: 197, y: 147, z: -121 },
            max: { x: 242, y: 154, z: -79 }
        },
        road: [
            { x: 198, z: -100 }
        ],
        placementOrder: 21
    },


];

export const STRUCTURE_COUNT = STRUCTURE_PLACEMENTS.length;

export function validateLayout(records) {
    const errors = [];
    const names = new Set();
    for (const p of records) {
        if (names.has(p.name))
            errors.push(`duplicate:${p.name}`);
        names.add(p.name);
        const b = p.boundingBox;
        if (b.min.x < -512 || b.min.z < -512 || b.max.x > 511 || b.max.z > 511)
            errors.push(`outside_boundary:${p.name}`);
        const end = p.road[p.road.length - 1];
        if (!end || end.x !== p.entrance.x || end.z !== p.entrance.z)
            errors.push(`road_misaligned:${p.name}`);
    }
    for (let i = 0; i < records.length; i++)
        for (let j = i + 1; j < records.length; j++) {
            const a = records[i], b = records[j];
            const A = a.boundingBox, B = b.boundingBox;
            if (A.min.x - 4 <= B.max.x && A.max.x + 4 >= B.min.x && A.min.z - 4 <= B.max.z && A.max.z + 4 >= B.min.z)
                errors.push(`overlap:${a.name}:${b.name}`);
        }
    if (records.length !== STRUCTURE_COUNT)
        errors.push(`structure_count:${records.length}`);
    return errors;
}

function structureIdentifierTail(identifier) {
    return String(identifier ?? "").split(/[/:]/).filter(Boolean).pop() ?? "";
}

export function resolveStructureIdentifier(placement, available) {
    const exact = available.find(id => id === placement.expectedRuntimeIdentifier);
    if (exact)
        return exact;
    const expectedTail = structureIdentifierTail(placement.expectedRuntimeIdentifier);
    if (!expectedTail)
        return undefined;
    const candidates = available.filter(id => structureIdentifierTail(id) === expectedTail);
    return candidates.length === 1 ? candidates[0] : undefined;
}

export function resolveStructurePlacements(placements, available) {
    const resolved = [];
    const missingRequired = [];
    const missingOptional = [];
    for (const placement of placements) {
        const actualIdentifier = resolveStructureIdentifier(placement, available);
        if (actualIdentifier) {
            resolved.push({ placement, actualIdentifier });
            continue;
        }
        if (placement.required === false)
            missingOptional.push(placement);
        else
            missingRequired.push(placement);
    }
    return { resolved, missingRequired, missingOptional };
}

export function requiredStructureLedgersComplete(placements, placedNames, blendedNames) {
    for (const placement of placements) {
        if (placement.required === false)
            continue;
        if (!placedNames.has(placement.name) || !blendedNames.has(placement.name))
            return false;
    }
    return true;
}
