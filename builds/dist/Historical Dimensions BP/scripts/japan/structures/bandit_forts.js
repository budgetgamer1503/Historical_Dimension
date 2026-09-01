import { worldVec } from "../generation/origin.js";

const TAG_PREFIX = "historyjam.bandit_fort";
const POSITION_EPSILON_SQUARED = 0.000001;
const MANAGEMENT_QUERY_RADIUS = 64;

export const BANDIT_FORT_ROSTERS = {
    bandit_fort_mountain: [
        { role: "captain", typeId: "historyjam:bandit_scarred_captain", offset: { x: 26.5, y: 11, z: 20.5 } },
        { role: "mountain_outlaw", typeId: "historyjam:bandit_mountain_outlaw", offset: { x: 22.5, y: 11, z: 18.5 } },
        { role: "armored_mercenary", typeId: "historyjam:bandit_armored_mercenary", offset: { x: 24.5, y: 11, z: 16.5 } },
        { role: "ashland_marauder", typeId: "historyjam:bandit_ashland_marauder", offset: { x: 28.5, y: 11, z: 20.5 } },
        { role: "cloth_wrapped_ambusher", typeId: "historyjam:bandit_cloth_wrapped_ambusher", offset: { x: 25.5, y: 11, z: 25.5 } },
        { role: "rugged_common", typeId: "historyjam:bandit_rugged_common", offset: { x: 30.5, y: 11, z: 25.5 } },
    ],
    bandit_fort_citadel: [
        { role: "captain", typeId: "historyjam:bandit_scarred_captain", offset: { x: 26.5, y: 11, z: 20.5 } },
        { role: "hooded_thief", typeId: "historyjam:bandit_hooded_thief", offset: { x: 22.5, y: 11, z: 18.5 } },
        { role: "leather_cutthroat", typeId: "historyjam:bandit_leather_cutthroat", offset: { x: 24.5, y: 11, z: 16.5 } },
        { role: "masked_highwayman", typeId: "historyjam:bandit_masked_highwayman", offset: { x: 28.5, y: 11, z: 20.5 } },
        { role: "desert_raider", typeId: "historyjam:bandit_desert_raider", offset: { x: 25.5, y: 11, z: 25.5 } },
        { role: "rogue_archer", typeId: "historyjam:bandit_rogue_archer", offset: { x: 30.5, y: 11, z: 25.5 } },
    ],
};

export function isBanditFortPlacement(placement) {
    return Object.prototype.hasOwnProperty.call(BANDIT_FORT_ROSTERS, placement?.name);
}

function anchorLocation(structureOrigin, offset) {
    return {
        x: structureOrigin.x + offset.x,
        y: structureOrigin.y + offset.y,
        z: structureOrigin.z + offset.z,
    };
}

function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function nearest(entities, location) {
    let best = entities[0];
    let bestDistance = distanceSquared(best.location, location);
    for (let i = 1; i < entities.length; i++) {
        const candidate = entities[i];
        const candidateDistance = distanceSquared(candidate.location, location);
        if (candidateDistance < bestDistance) {
            best = candidate;
            bestDistance = candidateDistance;
        }
    }
    return best;
}

function removeAllExcept(entities, keeper) {
    for (const entity of entities) {
        if (entity !== keeper)
            entity.remove();
    }
}

function reconcileBandit(dimension, fortName, slot, location) {
    const managementTag = `${TAG_PREFIX}.${fortName}.${slot.role}`;
    // Management tags intentionally stay stable across releases, but terrain resets
    // preserve old province origins. Scope reconciliation to this fort anchor so a
    // loaded guard from a preserved old fort can never be stolen by the new fort.
    const managed = dimension.getEntities({
        type: slot.typeId,
        tags: [managementTag],
        location,
        maxDistance: MANAGEMENT_QUERY_RADIUS,
    });

    let keeper;
    if (managed.length > 0) {
        keeper = nearest(managed, location);
        removeAllExcept(managed, keeper);
    } else {
        keeper = dimension.spawnEntity(`${slot.typeId}<historyjam:fort_spawned>`, location);
        keeper.addTag(managementTag);
    }

    if (distanceSquared(keeper.location, location) > POSITION_EPSILON_SQUARED)
        keeper.teleport(location);
}

/**
 * Reconciles one fixed six-guard roster for each authored bandit fort. Guards are
 * spawned with the fort-specific entity event so minecraft:home captures these
 * interior anchors at creation time; their fort_guard component group then keeps
 * movement inside a 12-block home radius. Managed duplicates are removed and
 * displaced guards are returned to their assigned interior anchor.
 */
export function ensureBanditFortBandits(dimension, item, terrainOrigin) {
    const roster = BANDIT_FORT_ROSTERS[item.placement.name];
    if (!roster)
        return;
    if (item.placement.rotation !== 0)
        throw new Error(`${item.placement.name} bandit anchors require rotation 0`);

    const structureOrigin = worldVec(item.placement.origin, terrainOrigin);
    for (const slot of roster)
        reconcileBandit(dimension, item.placement.name, slot, anchorLocation(structureOrigin, slot.offset));
}
