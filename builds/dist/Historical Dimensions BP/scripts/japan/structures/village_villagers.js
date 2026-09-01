import { system } from "@minecraft/server";
import { worldVec } from "../generation/origin.js";

const VILLAGE_NAME = "village_e2990";
const LEGACY_ADOPTION_RADIUS = 1.25;
const TAG_PREFIX = "historyjam.village_e2990";
const VILLAGER_FAMILY = "historyjam_sengoku_villager";
const BOUNDARY_MARGIN = 0.31;
const MOBILITY_CHECK_INTERVAL_TICKS = 1;
const MAX_SAFE_DROP = 1.35;
const STALL_MIN_HORIZONTAL_SPEED_SQ = 0.0004;
const STALL_MAX_PROGRESS_SQ = 0.0016;
const STALL_CHECK_LIMIT = 32;
const NEARBY_SAFE_DISTANCE_SQ = 0.5625;

const VILLAGE_VILLAGERS = [
    { role: "armorer", typeId: "historyjam:sengoku_villager_armorer", offset: { x: 24.5, y: 3.0, z: 45.5 } },
    { role: "cartographer", typeId: "historyjam:sengoku_villager_cartographer", offset: { x: 63.5, y: 3.0, z: 19.5 } },
    { role: "cleric", typeId: "historyjam:sengoku_villager_cleric", offset: { x: 35.5, y: 2.0, z: 39.5 } },
    { role: "farmer", typeId: "historyjam:sengoku_villager_farmer", offset: { x: 56.5, y: 3.0, z: 77.5 } },
    { role: "fisherman", typeId: "historyjam:sengoku_villager_fisherman", offset: { x: 40.5, y: 3.0, z: 41.5 } },
    { role: "fletcher", typeId: "historyjam:sengoku_villager_fletcher", offset: { x: 28.5, y: 3.0, z: 48.5 } },
    { role: "librarian", typeId: "historyjam:sengoku_villager_librarian", offset: { x: 58.5, y: 3.0, z: 19.5 } }
];

let boundaryGuardState;
let boundaryGuardRunId;
const motionStateByEntityId = new Map();

function anchorLocation(structureOrigin, offset) {
    return {
        x: structureOrigin.x + offset.x,
        y: structureOrigin.y + offset.y,
        z: structureOrigin.z + offset.z,
    };
}

function structureBounds(structureOrigin, sourceDimensions) {
    return {
        min: { ...structureOrigin },
        maxExclusive: {
            x: structureOrigin.x + sourceDimensions.x,
            y: structureOrigin.y + sourceDimensions.y,
            z: structureOrigin.z + sourceDimensions.z,
        },
    };
}

function isInsideVillage(location, bounds) {
    return location.x >= bounds.min.x + BOUNDARY_MARGIN
        && location.x <= bounds.maxExclusive.x - BOUNDARY_MARGIN
        && location.y >= bounds.min.y
        && location.y < bounds.maxExclusive.y
        && location.z >= bounds.min.z + BOUNDARY_MARGIN
        && location.z <= bounds.maxExclusive.z - BOUNDARY_MARGIN;
}

function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function horizontalDistanceSquared(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
}

function horizontalSpeedSquared(velocity) {
    return velocity.x * velocity.x + velocity.z * velocity.z;
}

function copySafeLocation(location) {
    return {
        x: location.x,
        y: location.y + 0.02,
        z: location.z,
    };
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

function roleForManagedVillager(entity) {
    for (const anchor of VILLAGE_VILLAGERS) {
        if (entity.hasTag(`${TAG_PREFIX}.${anchor.role}`))
            return anchor.role;
    }
    return undefined;
}

function initialMotionState(location) {
    return {
        lastLocation: { ...location },
        lastSafeLocation: undefined,
        stalledChecks: 0,
    };
}

function resetMotionState(entity, location) {
    motionStateByEntityId.set(entity.id, initialMotionState(location));
}

function recoveryTarget(motion, anchor, currentLocation, reason) {
    if (!motion.lastSafeLocation)
        return anchor;

    // A fall should return to the ledge/step the villager was safely standing on.
    if (reason === "fall" || reason === "water" || reason === "boundary")
        return motion.lastSafeLocation;

    // If a villager is jammed almost exactly where its last safe sample was,
    // teleporting to the same point would not solve the obstruction. Use its
    // known role anchor instead.
    if (horizontalDistanceSquared(motion.lastSafeLocation, currentLocation) <= NEARBY_SAFE_DISTANCE_SQ)
        return anchor;

    return motion.lastSafeLocation;
}

function recoverVillager(villager, motion, anchor, reason) {
    const target = recoveryTarget(motion, anchor, villager.location, reason);
    villager.clearVelocity();
    villager.teleport(target);
    motion.lastLocation = { ...target };
    motion.lastSafeLocation = { ...target };
    motion.stalledChecks = 0;
}

function enforceVillageMobility() {
    const state = boundaryGuardState;
    if (!state)
        return;

    const villagers = state.dimension.getEntities({ families: [VILLAGER_FAMILY] });
    const liveIds = new Set();

    for (const villager of villagers) {
        if (!villager.isValid)
            continue;

        const role = roleForManagedVillager(villager);
        if (!role)
            continue;

        liveIds.add(villager.id);
        const anchor = state.anchorsByRole.get(role);
        if (!anchor)
            continue;

        let motion = motionStateByEntityId.get(villager.id);
        if (!motion) {
            motion = initialMotionState(villager.location);
            motionStateByEntityId.set(villager.id, motion);
        }

        try {
            const location = villager.location;

            if (!isInsideVillage(location, state.bounds)) {
                recoverVillager(villager, motion, anchor, "boundary");
                continue;
            }

            if (villager.isInWater) {
                recoverVillager(villager, motion, anchor, "water");
                continue;
            }

            // Record grounded positions only after the entity is actually
            // supported. During a real fall, the last safe sample remains on the
            // ledge so we can return there instead of letting it hit the bottom.
            const standingBlock = villager.getBlockStandingOn();
            if (villager.isOnGround && !villager.isFalling && standingBlock) {
                const progressSq = horizontalDistanceSquared(location, motion.lastLocation);
                if (!motion.lastSafeLocation || progressSq > STALL_MAX_PROGRESS_SQ)
                    motion.lastSafeLocation = copySafeLocation(location);
            }

            const safeY = motion.lastSafeLocation?.y ?? anchor.y;
            if (villager.isFalling && safeY - location.y > MAX_SAFE_DROP) {
                recoverVillager(villager, motion, anchor, "fall");
                continue;
            }

            const velocity = villager.getVelocity();
            const progressSq = horizontalDistanceSquared(location, motion.lastLocation);
            const movingIntoObstacle = villager.isOnGround
                && horizontalSpeedSquared(velocity) >= STALL_MIN_HORIZONTAL_SPEED_SQ
                && progressSq <= STALL_MAX_PROGRESS_SQ;

            if (movingIntoObstacle)
                motion.stalledChecks += 1;
            else
                motion.stalledChecks = 0;

            if (motion.stalledChecks >= STALL_CHECK_LIMIT) {
                recoverVillager(villager, motion, anchor, "stalled");
                continue;
            }

            motion.lastLocation = { ...location };
        } catch {
            // Entity state can become invalid between the query and a property
            // read. The next interval will reconcile any still-loaded villager.
        }
    }

    for (const entityId of motionStateByEntityId.keys()) {
        if (!liveIds.has(entityId))
            motionStateByEntityId.delete(entityId);
    }
}

function configureBoundaryGuard(dimension, structureOrigin, sourceDimensions) {
    const anchorsByRole = new Map();
    for (const anchor of VILLAGE_VILLAGERS)
        anchorsByRole.set(anchor.role, anchorLocation(structureOrigin, anchor.offset));

    boundaryGuardState = {
        dimension,
        bounds: structureBounds(structureOrigin, sourceDimensions),
        anchorsByRole,
    };

    if (boundaryGuardRunId === undefined) {
        boundaryGuardRunId = system.runInterval(
            enforceVillageMobility,
            MOBILITY_CHECK_INTERVAL_TICKS,
        );
    }
}

function reconcileVillager(dimension, anchor, location, bounds) {
    const managementTag = `${TAG_PREFIX}.${anchor.role}`;
    const managed = dimension.getEntities({ type: anchor.typeId, tags: [managementTag] });

    let keeper;
    if (managed.length > 0) {
        keeper = nearest(managed, location);
        removeAllExcept(managed, keeper);
    } else {
        const legacy = dimension.getEntities({
            type: anchor.typeId,
            location,
            maxDistance: LEGACY_ADOPTION_RADIUS,
        });
        if (legacy.length > 0) {
            keeper = nearest(legacy, location);
            removeAllExcept(legacy, keeper);
        } else {
            keeper = dimension.spawnEntity(anchor.typeId, location);
        }
        keeper.addTag(managementTag);
    }

    const tooLow = keeper.location.y < location.y - MAX_SAFE_DROP;
    const tooFarFromRole = horizontalDistanceSquared(keeper.location, location) > 196;
    if (!isInsideVillage(keeper.location, bounds) || keeper.isInWater || tooLow || tooFarFromRole) {
        keeper.clearVelocity();
        keeper.teleport(location);
    }

    resetMotionState(keeper, keeper.location);
}

/**
 * Reconciles the seven supplied Sengoku villagers inside village_e2990.
 *
 * Data-driven navigation handles ordinary walking: short home-restricted strolls,
 * one-block maximum drops, water/damage avoidance, and tighter cornering. This
 * runtime guard is only a safety net for the irregular authored village: it
 * returns villagers to their most recent supported position if they cross the
 * exact structure boundary, fall more than one block, enter water, or spend a
 * sustained period pushing into an obstruction.
 */
export function ensureVillageVillagers(dimension, item, terrainOrigin) {
    if (item.placement.name !== VILLAGE_NAME)
        return;
    if (item.placement.rotation !== 0)
        throw new Error(`${VILLAGE_NAME} villager anchors require rotation 0`);

    const structureOrigin = worldVec(item.placement.origin, terrainOrigin);
    const bounds = structureBounds(structureOrigin, item.placement.sourceDimensions);
    for (const anchor of VILLAGE_VILLAGERS)
        reconcileVillager(dimension, anchor, anchorLocation(structureOrigin, anchor.offset), bounds);

    configureBoundaryGuard(dimension, structureOrigin, item.placement.sourceDimensions);
}
