import { world, system, ItemStack, LocationWaypoint, WaypointTexture, WeatherType, InputPermissionCategory, EasingType, GameMode, EntityInitializationCause } from "@minecraft/server";
export const EGYPT_DIMENSION_ID = "eoh:new_kingdom_egypt";
const OVERWORLD_ID = "minecraft:overworld";
const OVERWORLD = () => world.getDimension("overworld");
const EGYPT = () => world.getDimension(EGYPT_DIMENSION_ID);
function isEgyptPlayer(player) {
    try {
        return player.dimension.id === EGYPT_DIMENSION_ID;
    }
    catch {
        return false;
    }
}
const ITEMS = {
    khopesh: "egypt:sun_khopesh",
    spear: "egypt:spear_of_horus",
    bow: "egypt:bow_of_neith",
    staff: "egypt:staff_of_anubis",
    shield: "egypt:scarab_shield",
    returnStone: "egypt:return_stone"
};
const RELIC_TOOLS = [ITEMS.khopesh, ITEMS.spear, ITEMS.bow, ITEMS.staff, ITEMS.shield];
const RETURN_STONE_LOCATION = { x: 101.5, y: 26.0, z: 94.5 };
const MAIN_GATE = { x: 203, y: -60, z: 101 };
const RETURN_STONE_SEARCH_RADIUS = 12;
// UI LEVEL GUIDE -----------------------------------------------------------
// Coordinates come from a LevelDB walkability inspection of this exact world.
const GUIDE_TARGETS = [
    { name: "Main Gate Door", hint: "Enter through the outer gate", pos: { x: 193, y: -59, z: 101 }, radius: 4 },
    { name: "Inner Gate", hint: "Push through the entrance passage", pos: { x: 161, y: -59, z: 101 }, radius: 4 },
    { name: "First Ramp Junction", hint: "Follow the buried passage to the first climb", pos: { x: 149, y: -57, z: 116 }, radius: 4 },
    { name: "East Ramp", hint: "Climb east into the long gallery", pos: { x: 165, y: -51, z: 129 }, radius: 4 },
    { name: "East Gallery", hint: "Follow the eastern gallery all the way south", pos: { x: 165, y: -51, z: 159 }, radius: 5 },
    { name: "Southern Turn", hint: "Turn west along the southern perimeter", pos: { x: 130, y: -42, z: 165 }, radius: 5 },
    { name: "Deep Southern Hall", hint: "Continue through the deep southern hall", pos: { x: 98, y: -42, z: 165 }, radius: 5 },
    { name: "Western Gallery", hint: "Cross the western gallery", pos: { x: 60, y: -42, z: 165 }, radius: 5 },
    { name: "Western Turn", hint: "Find the turn toward the ascent", pos: { x: 39, y: -43, z: 154 }, radius: 5 },
    { name: "Western Ascent", hint: "Climb the long western ascent", pos: { x: 39, y: -31, z: 124 }, radius: 5 },
    { name: "Ascending Passage", hint: "Keep climbing toward the royal floors", pos: { x: 56, y: -15, z: 124 }, radius: 5 },
    { name: "Upper Royal Floor", hint: "Enter the upper royal level", pos: { x: 73, y: 4, z: 103 }, radius: 5 },
    { name: "Guardian Stair", hint: "Advance toward the guardian chamber", pos: { x: 85, y: 16, z: 103 }, radius: 4 },
    { name: "Final Staircase", hint: "Take the final stairs to the summit", pos: { x: 93, y: 24, z: 103 }, radius: 4 },
    { name: "Pharaoh's Sanctum", hint: "Enter the summit arena and face Kheper-Ra", pos: { x: 101, y: 25, z: 102 }, radius: 5 }
];
const GUIDE_WAYPOINTS = new Map();
const GUIDE_TEXTURE_SELECTOR = {
    textureBoundsList: [
        { lowerBound: 0, texture: WaypointTexture.SmallStar }
    ]
};
// CHECKPOINT SYSTEM -------------------------------------------------------
// The route still has fifteen mandatory exploration stages, but only five
// interior respawn checkpoints are active. Together with the Main Gate
// fallback this gives six checkpoints total and avoids constant checkpointing.
const CHECKPOINT_GUIDE_STAGES = new Set([5, 7, 10, 12, 14]);
function checkpointIndex(player) {
    const raw = player.getDynamicProperty("egypt:checkpoint_index");
    if (typeof raw !== "number" || !Number.isFinite(raw))
        return -1;
    return Math.max(-1, Math.min(GUIDE_TARGETS.length, Math.floor(raw)));
}
function checkpointName(player) {
    const value = player.getDynamicProperty("egypt:checkpoint_name");
    return typeof value === "string" && value.length > 0 ? value : "Main Gate";
}
function clearCheckpoint(player) {
    try {
        player.setSpawnPoint();
    }
    catch { }
    try {
        player.setDynamicProperty("egypt:checkpoint_index", undefined);
        player.setDynamicProperty("egypt:checkpoint_name", undefined);
        player.setDynamicProperty("egypt:checkpoint_x", undefined);
        player.setDynamicProperty("egypt:checkpoint_y", undefined);
        player.setDynamicProperty("egypt:checkpoint_z", undefined);
        player.setDynamicProperty("egypt:checkpoint_dimension", undefined);
    }
    catch { }
}
function blockIsRespawnFloor(block) {
    if (!block)
        return false;
    const id = block.typeId;
    return id !== "minecraft:air" && id !== "minecraft:water" && id !== "minecraft:flowing_water" &&
        id !== "minecraft:lava" && id !== "minecraft:flowing_lava";
}
function blockIsRespawnAir(block) {
    if (!block)
        return false;
    return block.typeId === "minecraft:air";
}
function resolveSafeCheckpointLocation(dimension, requested) {
    const base = {
        x: Math.floor(requested.x),
        y: Math.floor(requested.y),
        z: Math.floor(requested.z)
    };
    const horizontal = [
        [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
        [2, 0], [-2, 0], [0, 2], [0, -2]
    ];
    const vertical = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    for (const dy of vertical) {
        for (const [dx, dz] of horizontal) {
            const x = base.x + dx, y = base.y + dy, z = base.z + dz;
            try {
                const feet = dimension.getBlock({ x, y, z });
                const head = dimension.getBlock({ x, y: y + 1, z });
                const floor = dimension.getBlock({ x, y: y - 1, z });
                if (blockIsRespawnAir(feet) && blockIsRespawnAir(head) && blockIsRespawnFloor(floor)) {
                    return { x: x + 0.5, y, z: z + 0.5 };
                }
            }
            catch { }
        }
    }
    return { x: requested.x, y: requested.y, z: requested.z };
}
function savedCheckpointLocation(player) {
    const x = player.getDynamicProperty("egypt:checkpoint_x");
    const y = player.getDynamicProperty("egypt:checkpoint_y");
    const z = player.getDynamicProperty("egypt:checkpoint_z");
    if ([x, y, z].every((v) => typeof v === "number" && Number.isFinite(v)))
        return { x, y, z };
    return { ...MAIN_GATE };
}
function teleportToSavedCheckpoint(player) {
    const requested = savedCheckpointLocation(player);
    const safe = resolveSafeCheckpointLocation(player.dimension, requested);
    try {
        player.teleport(safe, {
            dimension: player.dimension,
            checkForBlocks: false,
            keepVelocity: false,
            rotation: { x: 0, y: 90 }
        });
        return true;
    }
    catch {
        return false;
    }
}
function setMainGateCheckpoint(player) {
    clearCheckpoint(player);
    const safe = resolveSafeCheckpointLocation(player.dimension, MAIN_GATE);
    try {
        player.setSpawnPoint({ dimension: player.dimension, ...safe });
        player.setDynamicProperty("egypt:checkpoint_index", 0);
        player.setDynamicProperty("egypt:checkpoint_name", "Main Gate");
        player.setDynamicProperty("egypt:checkpoint_x", safe.x);
        player.setDynamicProperty("egypt:checkpoint_y", safe.y);
        player.setDynamicProperty("egypt:checkpoint_z", safe.z);
        player.setDynamicProperty("egypt:checkpoint_dimension", player.dimension.id);
    }
    catch { }
}
function activateCheckpoint(player, index, target) {
    if (!CHECKPOINT_GUIDE_STAGES.has(index))
        return false;
    if (index <= checkpointIndex(player))
        return false;
    const live = { x: player.location.x, y: player.location.y, z: player.location.z };
    const safe = resolveSafeCheckpointLocation(player.dimension, live);
    try {
        player.setSpawnPoint({ dimension: player.dimension, ...safe });
        player.setDynamicProperty("egypt:checkpoint_index", index);
        player.setDynamicProperty("egypt:checkpoint_name", target.name);
        player.setDynamicProperty("egypt:checkpoint_x", safe.x);
        player.setDynamicProperty("egypt:checkpoint_y", safe.y);
        player.setDynamicProperty("egypt:checkpoint_z", safe.z);
        player.setDynamicProperty("egypt:checkpoint_dimension", player.dimension.id);
    }
    catch {
        return false;
    }
    safeSound(player.dimension, "random.levelup", player.location, { volume: 0.35, pitch: 1.1 });
    return true;
}
// -------------------------------------------------------------------------
function guideStage(player) {
    const raw = player.getDynamicProperty("egypt:guide_stage");
    if (typeof raw !== "number" || !Number.isFinite(raw))
        return 0;
    return Math.max(0, Math.min(GUIDE_TARGETS.length, Math.floor(raw)));
}
function setGuideStage(player, value) {
    try {
        player.setDynamicProperty("egypt:guide_stage", value);
    }
    catch { }
}
function distanceTo(player, pos) {
    const dx = pos.x - player.location.x;
    const dy = pos.y - player.location.y;
    const dz = pos.z - player.location.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function cardinalDirection(player, pos) {
    const dx = pos.x - player.location.x;
    const dz = pos.z - player.location.z;
    if (Math.abs(dx) < 1 && Math.abs(dz) < 1)
        return "HERE";
    const angle = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    const labels = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];
    return labels[Math.round(angle / 45) % 8];
}
function clearGuideWaypoint(player) {
    const waypoint = GUIDE_WAYPOINTS.get(player.id);
    if (!waypoint)
        return;
    try {
        if (player.locatorBar.hasWaypoint(waypoint))
            player.locatorBar.removeWaypoint(waypoint);
    }
    catch { }
    try {
        waypoint.remove();
    }
    catch { }
    GUIDE_WAYPOINTS.delete(player.id);
}
function syncGuideWaypoint(player) {
    if (!isEgyptPlayer(player)) {
        clearGuideWaypoint(player);
        return;
    }
    const stage = guideStage(player);
    if (player.getDynamicProperty("egypt:expedition_complete") === true ||
        stage >= GUIDE_TARGETS.length || hasItem(player, ITEMS.returnStone)) {
        clearGuideWaypoint(player);
        return;
    }
    const target = GUIDE_TARGETS[stage];
    const dimensionLocation = { dimension: player.dimension, ...target.pos };
    let waypoint = GUIDE_WAYPOINTS.get(player.id);
    try {
        if (!waypoint || !waypoint.isValid) {
            waypoint = new LocationWaypoint(dimensionLocation, GUIDE_TEXTURE_SELECTOR, { red: 1.0, green: 0.72, blue: 0.12 });
            player.locatorBar.addWaypoint(waypoint);
            GUIDE_WAYPOINTS.set(player.id, waypoint);
        }
        else {
            waypoint.setDimensionLocation(dimensionLocation);
            if (!player.locatorBar.hasWaypoint(waypoint))
                player.locatorBar.addWaypoint(waypoint);
        }
    }
    catch {
        // Action-bar navigation remains available if locator-bar support is unavailable.
    }
}
function showGuideStage(player, useTitle = false) {
    // Deliberately silent. The locator-bar waypoint is the navigation guide.
    // No titles, subtitles, action-bar text, or chat announcements are used.
}
function resetGuide(player) {
    clearGuideWaypoint(player);
    setGuideStage(player, 0);
    try {
        player.setDynamicProperty("egypt:expedition_complete", false);
    }
    catch { }
    setMainGateCheckpoint(player);
    system.runTimeout(() => {
        syncGuideWaypoint(player);
        showGuideStage(player, true);
    }, 15);
}
function updateGuide(player) {
    if (!isEgyptPlayer(player))
        return;
    let stage = guideStage(player);
    if (player.getDynamicProperty("egypt:expedition_complete") === true) {
        showGuideStage(player);
        return;
    }
    if (hasItem(player, ITEMS.returnStone)) {
        showGuideStage(player);
        return;
    }
    if (stage < GUIDE_TARGETS.length) {
        const target = GUIDE_TARGETS[stage];
        if (distanceTo(player, target.pos) <= target.radius) {
            const completedIndex = stage + 1;
            const checkpointActivated = activateCheckpoint(player, completedIndex, target);
            stage = completedIndex;
            setGuideStage(player, stage);
            syncGuideWaypoint(player);
        }
    }
    syncGuideWaypoint(player);
    showGuideStage(player);
}
// -------------------------------------------------------------------------
const ENEMY_TYPES = new Set([
    "minecraft:husk",
    "minecraft:stray",
    "minecraft:skeleton",
    "egypt:mummified_worker",
    "egypt:tomb_archer",
    "egypt:royal_mummy",
    "egypt:scarab",
    "egypt:anubis_guardian",
    "egypt:jackal_stalker",
    "egypt:kheper_ra"
]);
const MAX_NEARBY_SCRIPTED_ENEMIES = 6;
const ENCOUNTER_VERSION = 6;
const FINAL_BOSS_DEFEATED_PROP = "egypt:final_boss_v39_defeated";
function finalBossDefeated(player) { return player.getDynamicProperty(FINAL_BOSS_DEFEATED_PROP) === true; }
// The route is stage-gated, so later encounters cannot be triggered by taking
// a shortcut. Six nearby scripted enemies is the cap; the full expedition
// contains substantially more enemies distributed across separate chambers.
const ENCOUNTERS = [
    { id: "outer_gate_patrol", minStage: 0, trigger: { x: 193, y: -59, z: 101 }, radius: 18, mobs: [
            { type: "minecraft:husk", pos: { x: 187, y: -59, z: 101 } }, { type: "egypt:tomb_archer", pos: { x: 183, y: -59, z: 104 } }, { type: "minecraft:husk", pos: { x: 180, y: -59, z: 99 } }
        ] },
    { id: "inner_gate_guard", minStage: 1, trigger: { x: 161, y: -59, z: 101 }, radius: 15, mobs: [
            { type: "egypt:mummified_worker", pos: { x: 155, y: -59, z: 102 } }, { type: "egypt:scarab", pos: { x: 151, y: -59, z: 105 } }, { type: "egypt:royal_mummy", pos: { x: 149, y: -59, z: 108 } }
        ] },
    { id: "ramp_junction", minStage: 2, trigger: { x: 149, y: -57, z: 116 }, radius: 14, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 149, y: -57, z: 120 } }, { type: "egypt:scarab", pos: { x: 153, y: -55, z: 120 } }, { type: "egypt:mummified_worker", pos: { x: 157, y: -53, z: 120 } }
        ] },
    { id: "east_ramp_pack", minStage: 3, trigger: { x: 165, y: -51, z: 129 }, radius: 15, mobs: [
            { type: "egypt:jackal_stalker", pos: { x: 165, y: -51, z: 136 } }, { type: "egypt:scarab", pos: { x: 165, y: -51, z: 142 } }, { type: "egypt:tomb_archer", pos: { x: 165, y: -51, z: 146 } }
        ] },
    { id: "east_gallery_a", minStage: 4, trigger: { x: 165, y: -51, z: 151 }, radius: 14, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 165, y: -51, z: 156 } }, { type: "egypt:scarab", pos: { x: 165, y: -51, z: 160 } }, { type: "minecraft:husk", pos: { x: 160, y: -51, z: 165 } }
        ] },
    { id: "east_gallery_b", minStage: 5, trigger: { x: 151, y: -49, z: 165 }, radius: 16, mobs: [
            { type: "egypt:tomb_archer", pos: { x: 146, y: -47, z: 165 } }, { type: "egypt:mummified_worker", pos: { x: 140, y: -45, z: 165 } }, { type: "egypt:scarab", pos: { x: 135, y: -43, z: 165 } }
        ] },
    { id: "southern_turn", minStage: 5, trigger: { x: 130, y: -42, z: 165 }, radius: 15, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 124, y: -42, z: 165 } }, { type: "egypt:mummified_worker", pos: { x: 118, y: -42, z: 165 } }, { type: "egypt:scarab", pos: { x: 112, y: -42, z: 165 } }
        ] },
    { id: "deep_south_pack", minStage: 6, trigger: { x: 98, y: -42, z: 165 }, radius: 16, mobs: [
            { type: "egypt:scarab", pos: { x: 94, y: -42, z: 165 } }, { type: "egypt:scarab", pos: { x: 90, y: -42, z: 165 } }, { type: "egypt:jackal_stalker", pos: { x: 85, y: -42, z: 165 } }, { type: "egypt:royal_mummy", pos: { x: 80, y: -42, z: 165 } }
        ] },
    { id: "western_gallery_a", minStage: 7, trigger: { x: 67, y: -42, z: 165 }, radius: 15, mobs: [
            { type: "egypt:tomb_archer", pos: { x: 62, y: -42, z: 165 } }, { type: "egypt:mummified_worker", pos: { x: 57, y: -42, z: 165 } }, { type: "egypt:scarab", pos: { x: 52, y: -42, z: 165 } }
        ] },
    { id: "western_gallery_b", minStage: 8, trigger: { x: 45, y: -42, z: 164 }, radius: 13, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 40, y: -43, z: 160 } }, { type: "egypt:jackal_stalker", pos: { x: 39, y: -43, z: 154 } }, { type: "egypt:scarab", pos: { x: 39, y: -42, z: 149 } }
        ] },
    { id: "western_ascent_low", minStage: 9, trigger: { x: 39, y: -31, z: 132 }, radius: 16, mobs: [
            { type: "egypt:scarab", pos: { x: 39, y: -31, z: 127 } }, { type: "egypt:mummified_worker", pos: { x: 43, y: -28, z: 124 } }, { type: "egypt:jackal_stalker", pos: { x: 48, y: -23, z: 124 } }
        ] },
    { id: "western_ascent_high", minStage: 10, trigger: { x: 56, y: -15, z: 124 }, radius: 17, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 60, y: -11, z: 124 } }, { type: "egypt:tomb_archer", pos: { x: 65, y: -6, z: 124 } }, { type: "egypt:scarab", pos: { x: 69, y: -2, z: 124 } }
        ] },
    { id: "upper_entry", minStage: 11, trigger: { x: 73, y: 4, z: 116 }, radius: 15, mobs: [
            { type: "egypt:mummified_worker", pos: { x: 73, y: 4, z: 112 } }, { type: "egypt:royal_mummy", pos: { x: 73, y: 4, z: 108 } }, { type: "egypt:jackal_stalker", pos: { x: 73, y: 4, z: 104 } }
        ] },
    { id: "upper_royal_guard", minStage: 12, trigger: { x: 78, y: 9, z: 103 }, radius: 14, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 80, y: 11, z: 103 } }, { type: "egypt:tomb_archer", pos: { x: 82, y: 13, z: 103 } }, { type: "egypt:scarab", pos: { x: 84, y: 15, z: 103 } }
        ] },
    { id: "anubis_guardian", minStage: 13, cutscene: "guardian_reveal", trigger: { x: 85, y: 16, z: 103 }, radius: 13, mobs: [
            { type: "egypt:anubis_guardian", pos: { x: 89, y: 20, z: 103 } }, { type: "egypt:scarab", pos: { x: 91, y: 22, z: 101 } }, { type: "egypt:scarab", pos: { x: 91, y: 22, z: 105 } }
        ] },
    { id: "final_stairs", minStage: 14, trigger: { x: 93, y: 24, z: 103 }, radius: 12, mobs: [
            { type: "egypt:jackal_stalker", pos: { x: 96, y: 24, z: 103 } }, { type: "egypt:royal_mummy", pos: { x: 98, y: 24, z: 101 } }, { type: "egypt:tomb_archer", pos: { x: 99, y: 24, z: 97 } }
        ] },
    { id: "summit_escort", minStage: 15, trigger: { x: 101, y: 25, z: 102 }, radius: 11, mobs: [
            { type: "egypt:royal_mummy", pos: { x: 104, y: 26, z: 102 } }, { type: "egypt:jackal_stalker", pos: { x: 105, y: 26, z: 99 } }, { type: "egypt:scarab", pos: { x: 102, y: 26, z: 98 } }
        ] },
    { id: "kheper_ra_finale", minStage: 15, cutscene: "kheper_reveal", trigger: { x: 101, y: 25, z: 102 }, radius: 9, mobs: [
            { type: "egypt:kheper_ra", pos: { x: 106, y: 26, z: 98 } }
        ] }
];
function announce(player, title, subtitle = "") {
    // Intentionally silent: user requested no on-screen or chat announcements.
}
function safeSound(dimension, id, location, options = {}) {
    try {
        dimension.playSound(id, location, options);
    }
    catch { }
}
function safeParticle(dimension, id, location) {
    try {
        dimension.spawnParticle(id, location);
    }
    catch { }
}
// CINEMATIC CUTSCENES -----------------------------------------------------
// Short one-time camera sequences. They never teleport the player and they
// pause scripted encounters until normal player control has been restored.
const ACTIVE_CUTSCENES = new Set();
const CUTSCENES = {
    arrival: {
        totalTicks: 105,
        shots: [
            { at: 8, pos: { x: 208, y: -53, z: 110 }, facing: { x: 193, y: -58, z: 101 }, ease: 0.65 },
            { at: 42, pos: { x: 199, y: -55, z: 96 }, facing: { x: 181, y: -59, z: 101 }, ease: 1.25 },
            { at: 72, pos: { x: 188, y: -55, z: 106 }, facing: { x: 161, y: -59, z: 101 }, ease: 1.2 }
        ]
    },
    guardian_reveal: {
        totalTicks: 92,
        shots: [
            { at: 7, pos: { x: 83, y: 22, z: 109 }, facing: { x: 89, y: 20, z: 103 }, ease: 0.55 },
            { at: 38, pos: { x: 94, y: 25, z: 108 }, facing: { x: 89, y: 20, z: 103 }, ease: 1.1 },
            { at: 65, pos: { x: 89, y: 25, z: 97 }, facing: { x: 89, y: 20, z: 103 }, ease: 1.05 }
        ]
    },
    kheper_reveal: {
        totalTicks: 112,
        shots: [
            { at: 7, pos: { x: 99, y: 31, z: 106 }, facing: { x: 106, y: 26, z: 98 }, ease: 0.6 },
            { at: 44, pos: { x: 111, y: 31, z: 104 }, facing: { x: 106, y: 26, z: 98 }, ease: 1.25 },
            { at: 78, pos: { x: 108, y: 30, z: 92 }, facing: { x: 106, y: 26, z: 98 }, ease: 1.25 }
        ]
    }
};
function cutsceneKey(id) {
    return `egypt:cutscene_seen_${id}`;
}
function setInputEnabled(player, enabled) {
    try {
        player.inputPermissions.setPermissionCategory(InputPermissionCategory.Camera, enabled);
    }
    catch { }
    try {
        player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, enabled);
    }
    catch { }
}
function resetPlayerCinematicState(player) {
    ACTIVE_CUTSCENES.delete(player.id);
    try {
        player.camera.clear();
    }
    catch { }
    setInputEnabled(player, true);
}
function cameraBlockIsOpen(dimension, x, y, z) {
    try {
        const feet = dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
        const head = dimension.getBlock({ x: Math.floor(x), y: Math.floor(y + 1), z: Math.floor(z) });
        return feet?.typeId === "minecraft:air" && head?.typeId === "minecraft:air";
    }
    catch {
        return false;
    }
}
function resolveCameraPosition(player, desired) {
    const offsets = [
        [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
        [2, 0, 0], [-2, 0, 0], [0, 0, 2], [0, 0, -2],
        [0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]
    ];
    for (const [dx, dy, dz] of offsets) {
        const candidate = { x: desired.x + dx, y: desired.y + dy, z: desired.z + dz };
        if (cameraBlockIsOpen(player.dimension, candidate.x, candidate.y, candidate.z))
            return candidate;
    }
    return { x: player.location.x, y: player.location.y + 1.6, z: player.location.z };
}
function startCutscene(player, id) {
    if (!isEgyptPlayer(player))
        return false;
    const scene = CUTSCENES[id];
    if (!scene || ACTIVE_CUTSCENES.has(player.id))
        return false;
    if (player.getDynamicProperty(cutsceneKey(id)) === true)
        return false;
    try {
        player.setDynamicProperty(cutsceneKey(id), true);
    }
    catch { }
    ACTIVE_CUTSCENES.add(player.id);
    setInputEnabled(player, false);
    try {
        player.addEffect("resistance", scene.totalTicks + 40, { amplifier: 4, showParticles: false });
    }
    catch { }
    try {
        player.camera.fade({
            fadeColor: { red: 0, green: 0, blue: 0 },
            fadeTime: { fadeInTime: 0.35, holdTime: 0.15, fadeOutTime: 0.35 }
        });
    }
    catch { }
    for (const shot of scene.shots) {
        system.runTimeout(() => {
            if (!ACTIVE_CUTSCENES.has(player.id))
                return;
            const location = resolveCameraPosition(player, shot.pos);
            try {
                player.camera.setCamera("minecraft:free", {
                    location,
                    facingLocation: shot.facing,
                    easeOptions: { easeTime: shot.ease, easeType: EasingType.InOutCubic }
                });
            }
            catch { }
        }, shot.at);
    }
    system.runTimeout(() => {
        if (!ACTIVE_CUTSCENES.has(player.id))
            return;
        try {
            player.camera.fade({
                fadeColor: { red: 0, green: 0, blue: 0 },
                fadeTime: { fadeInTime: 0.3, holdTime: 0.1, fadeOutTime: 0.3 }
            });
        }
        catch { }
    }, Math.max(1, scene.totalTicks - 12));
    system.runTimeout(() => {
        resetPlayerCinematicState(player);
        syncGuideWaypoint(player);
        showGuideStage(player);
    }, scene.totalTicks);
    return true;
}
function maybeStartCheckpointCutscene(player, checkpointNumber) {
    // Reduced cinematic set: checkpoints never interrupt play.
}
// -------------------------------------------------------------------------
function inventory(player) {
    return player.getComponent("minecraft:inventory")?.container;
}
function hasItem(player, id) {
    const container = inventory(player);
    if (!container)
        return false;
    for (let slot = 0; slot < container.size; slot++) {
        if (container.getItem(slot)?.typeId === id)
            return true;
    }
    return false;
}
function giveItem(player, id) {
    try {
        if (hasItem(player, id))
            return;
        const container = inventory(player);
        if (!container)
            return;
        const stack = new ItemStack(id, 1);
        container.addItem(stack);
    }
    catch { }
}
function giveStack(player, id, amount) {
    try {
        const container = inventory(player);
        if (!container)
            return;
        const stack = new ItemStack(id, amount);
        container.addItem(stack);
    }
    catch { }
}
function giveStarterKit(player) {
    // Custom relic tools are no longer a starting loadout. The player begins
    // with only basic expedition supplies and must discover relics in treasure
    // rooms or earn every missing relic from Kheper-Ra.
    if (!hasItem(player, "minecraft:stone_sword"))
        giveItem(player, "minecraft:stone_sword");
    if (!hasItem(player, "minecraft:bread"))
        giveStack(player, "minecraft:bread", 6);
    if (!hasItem(player, "minecraft:torch"))
        giveStack(player, "minecraft:torch", 12);
}
function giveRelicRewards(player) {
    for (const id of RELIC_TOOLS)
        giveItem(player, id);
}
function setAdventureMode(player) {
    if (!isEgyptPlayer(player))
        return;
    try {
        player.setGameMode(GameMode.Adventure);
    }
    catch { }
}
function setSurvivalMode(player) {
    try {
        player.setGameMode(GameMode.Survival);
    }
    catch { }
}
function consumeOne(player, id) {
    try {
        const container = inventory(player);
        if (!container)
            return;
        for (let slot = 0; slot < container.size; slot++) {
            const item = container.getItem(slot);
            if (!item || item.typeId !== id)
                continue;
            if (item.amount > 1) {
                item.amount -= 1;
                container.setItem(slot, item);
            }
            else {
                container.setItem(slot, undefined);
            }
            return;
        }
    }
    catch { }
}
// PYRAMID TREASURE --------------------------------------------------------
// Deliberately sparse treasure layout: six guaranteed major-room chests plus
// two random bonus chests. Three of the eight total chests contain unique
// Egyptian relic tools; Kheper-Ra awards every missing relic after the finale.
const TREASURE_VERSION = 3;
const BONUS_CHEST_COUNT = 2;
const CHEST_RELIC_COUNT = 3;
const ROOM_CHEST_SITES = [
    { id: "inner_gate_room", center: { x: 155, y: -59, z: 106 }, tier: 1 },
    { id: "east_gallery_south", center: { x: 151, y: -49, z: 165 }, tier: 2 },
    { id: "deep_south_room", center: { x: 98, y: -42, z: 161 }, tier: 2 },
    { id: "west_ascent_high", center: { x: 56, y: -15, z: 120 }, tier: 3 },
    { id: "upper_royal_room", center: { x: 78, y: 9, z: 108 }, tier: 3 },
    { id: "pharaoh_sanctum_room", center: { x: 106, y: 26, z: 103 }, tier: 4 }
];
const BONUS_CHEST_SITES = [
    { id: "bonus_outer_side", center: { x: 179, y: -59, z: 108 }, tier: 1 },
    { id: "bonus_south_mid", center: { x: 115, y: -42, z: 165 }, tier: 2 },
    { id: "bonus_west_gallery", center: { x: 48, y: -42, z: 165 }, tier: 2 },
    { id: "bonus_west_climb", center: { x: 39, y: -37, z: 139 }, tier: 3 },
    { id: "bonus_royal_approach", center: { x: 66, y: -6, z: 124 }, tier: 3 },
    { id: "bonus_guardian_side", center: { x: 90, y: 20, z: 108 }, tier: 4 }
];
const CHEST_SEARCH_OFFSETS = [
    [3, 0, 0], [-3, 0, 0], [0, 0, 3], [0, 0, -3],
    [4, 0, 0], [-4, 0, 0], [0, 0, 4], [0, 0, -4],
    [3, 0, 3], [3, 0, -3], [-3, 0, 3], [-3, 0, -3],
    [5, 0, 0], [-5, 0, 0], [0, 0, 5], [0, 0, -5],
    [4, 0, 2], [4, 0, -2], [-4, 0, 2], [-4, 0, -2],
    [2, 0, 4], [-2, 0, 4], [2, 0, -4], [-2, 0, -4],
    [3, 1, 0], [-3, 1, 0], [0, 1, 3], [0, 1, -3],
    [5, 1, 0], [-5, 1, 0], [0, 1, 5], [0, 1, -5]
];
function bonusSelectionProperty() { return `egypt:bonus_chests_v${TREASURE_VERSION}`; }
function relicLayoutProperty() { return `egypt:relic_chest_layout_v${TREASURE_VERSION}`; }
function lootPlacedProperty(id) { return `egypt:treasure_v${TREASURE_VERSION}_${id}_placed`; }
function shuffled(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function initializeTreasureLayout() {
    const currentBonus = world.getDynamicProperty(bonusSelectionProperty());
    if (typeof currentBonus !== "string" || currentBonus.length === 0) {
        const chosen = shuffled(BONUS_CHEST_SITES.map((site) => site.id)).slice(0, BONUS_CHEST_COUNT);
        try {
            world.setDynamicProperty(bonusSelectionProperty(), chosen.join(","));
        }
        catch { }
    }
    const currentRelics = world.getDynamicProperty(relicLayoutProperty());
    if (typeof currentRelics !== "string" || currentRelics.length === 0) {
        const selectedBonus = new Set(selectedBonusSiteIdsNoInit());
        const eligible = shuffled([
            ...ROOM_CHEST_SITES.filter((site) => site.tier >= 2).map((site) => site.id),
            ...BONUS_CHEST_SITES.filter((site) => selectedBonus.has(site.id) && site.tier >= 2).map((site) => site.id)
        ]);
        const tools = shuffled(RELIC_TOOLS).slice(0, CHEST_RELIC_COUNT);
        const assignments = tools.map((tool, index) => `${eligible[index]}=${tool}`);
        try {
            world.setDynamicProperty(relicLayoutProperty(), assignments.join("|"));
        }
        catch { }
    }
}
function selectedBonusSiteIdsNoInit() {
    const raw = world.getDynamicProperty(bonusSelectionProperty());
    return typeof raw === "string" ? raw.split(",").filter(Boolean) : [];
}
function selectedBonusSiteIds() {
    initializeTreasureLayout();
    const raw = world.getDynamicProperty(bonusSelectionProperty());
    return typeof raw === "string" ? raw.split(",").filter(Boolean) : [];
}
function relicForSite(id) {
    initializeTreasureLayout();
    const raw = world.getDynamicProperty(relicLayoutProperty());
    if (typeof raw !== "string")
        return undefined;
    for (const pair of raw.split("|")) {
        const split = pair.indexOf("=");
        if (split < 0)
            continue;
        if (pair.slice(0, split) === id)
            return pair.slice(split + 1);
    }
    return undefined;
}
function chestFloorIsSolid(typeId) {
    return typeId !== "minecraft:air" &&
        typeId !== "minecraft:water" && typeId !== "minecraft:flowing_water" &&
        typeId !== "minecraft:lava" && typeId !== "minecraft:flowing_lava";
}
function chestHasRoomAround(dimension, pos) {
    let open = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        try {
            const side = dimension.getBlock({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
            const sideHead = dimension.getBlock({ x: pos.x + dx, y: pos.y + 1, z: pos.z + dz });
            if (side?.typeId === "minecraft:air" && sideHead?.typeId === "minecraft:air")
                open++;
        }
        catch { }
    }
    return open >= 2;
}
function findSafeChestLocation(dimension, site) {
    for (const [dx, dy, dz] of CHEST_SEARCH_OFFSETS) {
        const pos = { x: Math.floor(site.center.x + dx), y: Math.floor(site.center.y + dy), z: Math.floor(site.center.z + dz) };
        try {
            if (typeof dimension.isChunkLoaded === "function" && !dimension.isChunkLoaded(pos))
                continue;
            const block = dimension.getBlock(pos);
            const above = dimension.getBlock({ x: pos.x, y: pos.y + 1, z: pos.z });
            const below = dimension.getBlock({ x: pos.x, y: pos.y - 1, z: pos.z });
            if (block?.typeId !== "minecraft:air" || above?.typeId !== "minecraft:air")
                continue;
            if (!below || !chestFloorIsSolid(below.typeId))
                continue;
            if (!chestHasRoomAround(dimension, pos))
                continue;
            let adjacentChest = false;
            for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (dimension.getBlock({ x: pos.x + sx, y: pos.y, z: pos.z + sz })?.typeId === "minecraft:chest")
                    adjacentChest = true;
            }
            if (adjacentChest)
                continue;
            return pos;
        }
        catch { }
    }
    return undefined;
}
function randomAmount(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
function makeLootStack(id, min, max) {
    try {
        return new ItemStack(id, randomAmount(min, max));
    }
    catch {
        return undefined;
    }
}
function makeRelicStack(id) {
    try {
        const item = new ItemStack(id, 1);
        return item;
    }
    catch {
        return undefined;
    }
}
function putLoot(container, stack, usedSlots) {
    if (!stack)
        return;
    const available = [];
    for (let slot = 0; slot < container.size; slot++)
        if (!usedSlots.has(slot))
            available.push(slot);
    if (!available.length)
        return;
    const slot = available[Math.floor(Math.random() * available.length)];
    usedSlots.add(slot);
    try {
        container.setItem(slot, stack);
    }
    catch { }
}
function fillLootChest(container, tier, relicId) {
    for (let slot = 0; slot < container.size; slot++)
        try {
            container.setItem(slot, undefined);
        }
        catch { }
    const used = new Set();
    const supplies = [
        ["minecraft:cooked_beef", 5, 10], ["minecraft:golden_carrot", 3, 7],
        ["minecraft:arrow", 12, 30], ["minecraft:torch", 10, 24], ["minecraft:bread", 4, 9]
    ];
    const treasure = [
        ["minecraft:iron_ingot", 5, 12], ["minecraft:gold_ingot", 4, 12],
        ["minecraft:emerald", 3, 8], ["minecraft:lapis_lazuli", 8, 20],
        ["minecraft:experience_bottle", 6, 14], ["minecraft:diamond", 1, Math.max(1, tier)]
    ];
    const combat = [
        "minecraft:iron_sword", "minecraft:iron_axe", "minecraft:iron_chestplate",
        "minecraft:iron_leggings", "minecraft:bow", "minecraft:shield"
    ];
    const elite = ["minecraft:diamond_sword", "minecraft:diamond_helmet", "minecraft:diamond_boots"];
    for (let i = 0; i < 2; i++) {
        const e = supplies[Math.floor(Math.random() * supplies.length)];
        putLoot(container, makeLootStack(e[0], e[1], e[2]), used);
    }
    for (let i = 0; i < 3; i++) {
        const e = treasure[Math.floor(Math.random() * treasure.length)];
        putLoot(container, makeLootStack(e[0], e[1], e[2]), used);
    }
    putLoot(container, makeLootStack("minecraft:golden_apple", 1, tier >= 3 ? 2 : 1), used);
    if (Math.random() < 0.45 + tier * 0.08)
        putLoot(container, makeLootStack(combat[Math.floor(Math.random() * combat.length)], 1, 1), used);
    if (tier >= 3 && Math.random() < 0.35)
        putLoot(container, makeLootStack(elite[Math.floor(Math.random() * elite.length)], 1, 1), used);
    if (tier >= 4 || Math.random() < 0.08)
        putLoot(container, makeLootStack("minecraft:enchanted_golden_apple", 1, 1), used);
    if (tier >= 4 && Math.random() < 0.45)
        putLoot(container, makeLootStack("minecraft:totem_of_undying", 1, 1), used);
    if (relicId)
        putLoot(container, makeRelicStack(relicId), used);
}
function placeLootChest(player, site) {
    if (world.getDynamicProperty(lootPlacedProperty(site.id)) === true)
        return false;
    const location = findSafeChestLocation(player.dimension, site);
    if (!location)
        return false;
    try {
        const block = player.dimension.getBlock(location);
        block.setType("minecraft:chest");
        const container = block.getComponent("minecraft:inventory")?.container;
        if (!container) {
            block.setType("minecraft:air");
            return false;
        }
        fillLootChest(container, site.tier ?? 1, relicForSite(site.id));
        world.setDynamicProperty(lootPlacedProperty(site.id), true);
        return true;
    }
    catch {
        return false;
    }
}
function ensureLootChestsNear(player) {
    const selectedBonus = new Set(selectedBonusSiteIds());
    for (const site of ROOM_CHEST_SITES) {
        if (world.getDynamicProperty(lootPlacedProperty(site.id)) === true)
            continue;
        if (distanceTo(player, site.center) > 45)
            continue;
        placeLootChest(player, site);
    }
    for (const site of BONUS_CHEST_SITES) {
        if (!selectedBonus.has(site.id))
            continue;
        if (world.getDynamicProperty(lootPlacedProperty(site.id)) === true)
            continue;
        if (distanceTo(player, site.center) > 45)
            continue;
        placeLootChest(player, site);
    }
}
// -------------------------------------------------------------------------
function encounterProperty(id) {
    return `egypt:encounter_v${ENCOUNTER_VERSION}_${id}_complete`;
}
function encounterMobProperty(id, index) {
    return `egypt:encounter_v${ENCOUNTER_VERSION}_${id}_mob_${index}`;
}
function scriptedEnemiesNear(player, radius = 44) {
    try {
        return player.dimension.getEntities({
            location: player.location,
            maxDistance: radius,
            tags: ["egypt_guided_encounter"]
        });
    }
    catch {
        return [];
    }
}
const MOB_CLEARANCE = {
    "minecraft:husk": { height: 2, wide: false },
    "egypt:tomb_archer": { height: 2, wide: false },
    "egypt:mummified_worker": { height: 2, wide: false },
    "egypt:royal_mummy": { height: 2, wide: false },
    "egypt:scarab": { height: 1, wide: false },
    "egypt:jackal_stalker": { height: 2, wide: true },
    "egypt:anubis_guardian": { height: 3, wide: true },
    "egypt:kheper_ra": { height: 3, wide: true }
};
const MOB_SEARCH_OFFSETS = [
    [0, 0], [2, 0], [-2, 0], [0, 2], [0, -2],
    [3, 0], [-3, 0], [0, 3], [0, -3],
    [2, 2], [2, -2], [-2, 2], [-2, -2],
    [4, 0], [-4, 0], [0, 4], [0, -4],
    [5, 0], [-5, 0], [0, 5], [0, -5],
    [4, 2], [4, -2], [-4, 2], [-4, -2],
    [2, 4], [-2, 4], [2, -4], [-2, -4]
];
function spawnAir(block) {
    return block?.typeId === "minecraft:air";
}
const UNSAFE_SPAWN_FLOOR_PARTS = [
    "slab", "stairs", "fence", "wall", "carpet", "trapdoor", "door", "button",
    "pressure_plate", "torch", "lantern", "chain", "bars", "sign", "rail", "ladder",
    "vine", "snow_layer", "flower", "sapling", "candle"
];
function spawnFloorIsSafe(block) {
    if (!block)
        return false;
    const id = block.typeId;
    if (id === "minecraft:air" || id === "minecraft:water" || id === "minecraft:flowing_water" ||
        id === "minecraft:lava" || id === "minecraft:flowing_lava" || id === "minecraft:fire")
        return false;
    return !UNSAFE_SPAWN_FLOOR_PARTS.some((part) => id.includes(part));
}
function spawnVolumeOpen(dimension, x, y, z, clearance) {
    try {
        const below = dimension.getBlock({ x, y: y - 1, z });
        if (!spawnFloorIsSafe(below))
            return false;
        for (let dy = 0; dy < clearance.height; dy++) {
            if (!spawnAir(dimension.getBlock({ x, y: y + dy, z })))
                return false;
        }
        if (clearance.wide) {
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                for (let dy = 0; dy < Math.min(2, clearance.height); dy++) {
                    if (!spawnAir(dimension.getBlock({ x: x + dx, y: y + dy, z: z + dz })))
                        return false;
                }
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
function spawnVisibleFromPlayer(player, location) {
    try {
        const origin = player.getHeadLocation();
        const tx = location.x - origin.x, ty = (location.y + 0.8) - origin.y, tz = location.z - origin.z;
        const distance = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (distance < 2)
            return true;
        const hit = player.dimension.getBlockFromRay(origin, { x: tx / distance, y: ty / distance, z: tz / distance }, { maxDistance: Math.max(1, distance - 1.0), includeLiquidBlocks: true, includePassableBlocks: false });
        return !hit;
    }
    catch {
        return false;
    }
}
function findSafeMobSpawn(player, mob) {
    const dimension = player.dimension;
    const clearance = MOB_CLEARANCE[mob.type] ?? { height: 2, wide: false };
    const desiredY = Math.floor(mob.pos.y);
    const playerY = Math.floor(player.location.y);
    const yCandidates = [desiredY, desiredY + 1, desiredY - 1, playerY, playerY + 1, playerY - 1, desiredY + 2, desiredY - 2];
    // First prefer a clear line of sight so the encounter reads naturally.
    // If the pyramid corridor geometry blocks every ray (common around corners),
    // fall back to any safe loaded floor near the authored encounter position.
    for (const requireVisible of [true, false]) {
        const seen = new Set();
        for (const [dx, dz] of MOB_SEARCH_OFFSETS) {
            const x = Math.floor(mob.pos.x + dx), z = Math.floor(mob.pos.z + dz);
            for (const y of yCandidates) {
                const key = `${x},${y},${z}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                const px = x + 0.5 - player.location.x, pz = z + 0.5 - player.location.z;
                const hd = Math.sqrt(px * px + pz * pz);
                if (hd < 5 || hd > 22)
                    continue;
                const location = { x: x + 0.5, y: y + 0.05, z: z + 0.5 };
                try {
                    if (typeof dimension.isChunkLoaded === "function" && !dimension.isChunkLoaded(location))
                        continue;
                }
                catch { }
                if (!spawnVolumeOpen(dimension, x, y, z, clearance))
                    continue;
                if (requireVisible && !spawnVisibleFromPlayer(player, location))
                    continue;
                return location;
            }
        }
    }
    return undefined;
}
function findEmergencyMobSpawn(player, mob) {
    const dimension = player.dimension;
    const clearance = MOB_CLEARANCE[mob.type] ?? { height: 2, wide: false };
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);
    const rings = [6, 8, 10, 12, 4, 14];
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const radius of rings) {
        for (const [dx, dz] of directions) {
            const scale = (dx !== 0 && dz !== 0) ? radius / Math.SQRT2 : radius;
            const x = Math.floor(px + dx * scale);
            const z = Math.floor(pz + dz * scale);
            for (const y of [py, py + 1, py - 1, py + 2, py - 2, py + 3, py - 3]) {
                if (spawnVolumeOpen(dimension, x, y, z, clearance))
                    return { x: x + 0.5, y: y + 0.05, z: z + 0.5 };
            }
        }
    }
    // Last resort: the player's own occupied space is known to be loaded and open.
    // Spawn a few blocks behind the player's view so the encounter cannot silently disappear.
    try {
        const view = player.getViewDirection();
        return {
            x: player.location.x - view.x * 3.5,
            y: player.location.y + 0.05,
            z: player.location.z - view.z * 3.5,
        };
    }
    catch {
        return { x: player.location.x, y: player.location.y + 0.05, z: player.location.z };
    }
}
function updateEncounters(player) {
    if (!isEgyptPlayer(player))
        return;
    if (ACTIVE_CUTSCENES.has(player.id))
        return;
    let active = scriptedEnemiesNear(player).length;
    if (active >= MAX_NEARBY_SCRIPTED_ENEMIES)
        return;
    const stage = guideStage(player);
    for (const encounter of ENCOUNTERS) {
        if ((encounter.minStage ?? 0) > stage)
            continue;
        if (player.getDynamicProperty(encounterProperty(encounter.id)) === true)
            continue;
        if (distanceTo(player, encounter.trigger) > encounter.radius)
            continue;
        if (encounter.id === "kheper_ra_finale" && finalBossDefeated(player))
            continue;
        let spawnedNow = 0;
        let bossSpawned = false;
        for (let index = 0; index < encounter.mobs.length; index++) {
            if (active >= MAX_NEARBY_SCRIPTED_ENEMIES)
                break;
            if (player.getDynamicProperty(encounterMobProperty(encounter.id, index)) === true)
                continue;
            const mob = encounter.mobs[index];
            const safeLocation = findSafeMobSpawn(player, mob) ?? findEmergencyMobSpawn(player, mob);
            if (!safeLocation)
                continue;
            try {
                const entity = player.dimension.spawnEntity(mob.type, safeLocation);
                if (!entity || entity.isValid === false)
                    continue;
                entity.addTag("egypt_guided_encounter");
                entity.addTag(`egypt_encounter_${encounter.id}`);
                entity.addTag(`egypt_encounter_mob_${index}`);
                if (mob.type === "egypt:anubis_guardian" || mob.type === "egypt:kheper_ra") {
                    entity.addTag("egypt_boss");
                    bossSpawned = true;
                }
                player.setDynamicProperty(encounterMobProperty(encounter.id, index), true);
                active++;
                spawnedNow++;
            }
            catch { }
        }
        const allScheduled = encounter.mobs.every((_, index) => player.getDynamicProperty(encounterMobProperty(encounter.id, index)) === true);
        if (allScheduled)
            try {
                player.setDynamicProperty(encounterProperty(encounter.id), true);
            }
            catch { }
        if (spawnedNow > 0) {
            safeSound(player.dimension, "mob.husk.ambient", player.location, { volume: .4, pitch: .95 });
            if (bossSpawned && encounter.cutscene)
                system.runTimeout(() => startCutscene(player, encounter.cutscene), 8);
        }
        return;
    }
}
function isEnemy(entity) {
    return entity && ENEMY_TYPES.has(entity.typeId);
}
function nearbyEnemies(player, radius) {
    try {
        return player.dimension
            .getEntities({ location: player.location, maxDistance: radius })
            .filter(isEnemy);
    }
    catch {
        return [];
    }
}
function cooldownReady(player, id, durationTicks) {
    const key = `egypt:direct_cd_${id.split(":")[1]}`;
    const now = system.currentTick;
    const current = player.getDynamicProperty(key);
    if (typeof current === "number" && current > now) {
        return false;
    }
    player.setDynamicProperty(key, now + durationTicks);
    return true;
}
function solarSlash(player) {
    const view = player.getViewDirection();
    for (const entity of nearbyEnemies(player, 10)) {
        const dx = entity.location.x - player.location.x;
        const dy = entity.location.y - player.location.y;
        const dz = entity.location.z - player.location.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const dot = (dx * view.x + dy * view.y + dz * view.z) / length;
        if (dot > 0.2) {
            try {
                entity.applyDamage(8);
                entity.setOnFire(3, true);
            }
            catch { }
        }
    }
    for (let distance = 1; distance <= 8; distance++) {
        safeParticle(player.dimension, "minecraft:totem_particle", {
            x: player.location.x + view.x * distance,
            y: player.location.y + 1 + view.y * distance,
            z: player.location.z + view.z * distance
        });
    }
    safeSound(player.dimension, "random.orb", player.location);
    announce(player, "§eSolar Arc");
}
function rayStrike(player, damage, range, label) {
    const view = player.getViewDirection();
    let best;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entity of nearbyEnemies(player, range)) {
        const dx = entity.location.x - player.location.x;
        const dy = entity.location.y + 1 - (player.location.y + 1.5);
        const dz = entity.location.z - player.location.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const dot = (dx * view.x + dy * view.y + dz * view.z) / distance;
        if (dot > 0.94 && distance < bestDistance) {
            best = entity;
            bestDistance = distance;
        }
    }
    for (let distance = 1; distance <= range; distance += 2) {
        safeParticle(player.dimension, "minecraft:critical_hit_emitter", {
            x: player.location.x + view.x * distance,
            y: player.location.y + 1.5 + view.y * distance,
            z: player.location.z + view.z * distance
        });
    }
    if (best) {
        try {
            best.applyDamage(damage);
        }
        catch { }
    }
    safeSound(player.dimension, "random.bow", player.location);
    announce(player, label);
}
function ensureReturnStoneForPlayer(player) {
    if (!isEgyptPlayer(player))
        return;
    if (!finalBossDefeated(player))
        return;
    if (hasItem(player, ITEMS.returnStone))
        return;
    giveItem(player, ITEMS.returnStone);
}
function rememberOverworldReturn(event) {
    if (event.fromDimension.id !== OVERWORLD_ID || event.toDimension.id !== EGYPT_DIMENSION_ID)
        return;
    try {
        event.player.setDynamicProperty("egypt:return_x", event.fromLocation.x);
        event.player.setDynamicProperty("egypt:return_y", event.fromLocation.y);
        event.player.setDynamicProperty("egypt:return_z", event.fromLocation.z);
    }
    catch { }
}
function getSafeOverworldReturn(player) {
    const x = player.getDynamicProperty("egypt:return_x");
    const y = player.getDynamicProperty("egypt:return_y");
    const z = player.getDynamicProperty("egypt:return_z");
    if ([x, y, z].every((value) => typeof value === "number" && Number.isFinite(value))) {
        return { x, y, z };
    }
    const spawn = world.getDefaultSpawnLocation();
    try {
        const top = OVERWORLD().getTopmostBlock({ x: Math.floor(spawn.x), z: Math.floor(spawn.z) });
        if (top) {
            return { x: Math.floor(spawn.x) + 0.5, y: top.location.y + 1, z: Math.floor(spawn.z) + 0.5 };
        }
    }
    catch { }
    return { x: Math.floor(spawn.x) + 0.5, y: 80, z: Math.floor(spawn.z) + 0.5 };
}
function useReturnStone(player) {
    if (!isEgyptPlayer(player))
        return;
    const destination = getSafeOverworldReturn(player);
    const overworld = OVERWORLD();
    let success = false;
    // First try the saved return point with collision checking, then fall back to a direct
    // cross-dimension teleport. The destination was already resolved to a safe Overworld point.
    for (let offset = 0; offset <= 4 && !success; offset++) {
        try {
            success = player.tryTeleport({ x: destination.x, y: destination.y + offset, z: destination.z }, { dimension: overworld, checkForBlocks: true, keepVelocity: false });
        }
        catch { }
    }
    if (!success) {
        try {
            player.teleport(destination, { dimension: overworld, checkForBlocks: false, keepVelocity: false });
            success = true;
        }
        catch { }
    }
    if (!success)
        return;
    consumeOne(player, ITEMS.returnStone);
    setSurvivalMode(player);
    clearCheckpoint(player);
    clearGuideWaypoint(player);
    try {
        player.setDynamicProperty("egypt:return_x", undefined);
        player.setDynamicProperty("egypt:return_y", undefined);
        player.setDynamicProperty("egypt:return_z", undefined);
        player.setDynamicProperty("egypt:expedition_complete", true);
    }
    catch { }
    safeSound(overworld, "portal.travel", destination);
    system.runTimeout(() => { setSurvivalMode(player); }, 20);
}
export function registerEgyptReturnStoneComponent(event) {
    event.itemComponentRegistry.registerCustomComponent("egypt:return_travel", {
        onUse(itemEvent) {
            const player = itemEvent.source;
            system.run(() => useReturnStone(player));
        },
    });
}
// BOSS COMBAT -------------------------------------------------------------
let BOSS_CLOCK = 0;
const BOSS_RUNTIME = new Map();
function bossPlayers(boss, radius) {
    try {
        return boss.dimension.getPlayers({ location: boss.location, maxDistance: radius });
    }
    catch {
        return [];
    }
}
function bossState(boss) {
    let state = BOSS_RUNTIME.get(boss.id);
    if (!state) {
        state = { nextPrimary: BOSS_CLOCK + 100, nextSummon: BOSS_CLOCK + 180, raged: false };
        BOSS_RUNTIME.set(boss.id, state);
    }
    return state;
}
function knockAway(target, origin, strength, vertical) {
    try {
        const dx = target.location.x - origin.x, dz = target.location.z - origin.z;
        const len = Math.max(.001, Math.sqrt(dx * dx + dz * dz));
        target.applyKnockback({ x: (dx / len) * strength, z: (dz / len) * strength }, vertical);
    }
    catch { }
}
function telegraphBoss(boss, animation, label) {
    try {
        boss.playAnimation(animation);
    }
    catch { }
    for (let i = 0; i < 16; i++)
        safeParticle(boss.dimension, "minecraft:totem_particle", {
            x: boss.location.x + (Math.random() - .5) * 4, y: boss.location.y + .3 + Math.random() * 2.5, z: boss.location.z + (Math.random() - .5) * 4
        });
}
function anubisShockwave(boss) {
    telegraphBoss(boss, "animation.egypt.anubis_guardian.roar", "Anubis is charging a shockwave!");
    safeSound(boss.dimension, "mob.ravager.roar", boss.location, { volume: .8, pitch: .75 });
    system.runTimeout(() => {
        try {
            if (!boss.isValid)
                return;
        }
        catch {
            return;
        }
        try {
            boss.playAnimation("animation.egypt.anubis_guardian.heavy_attack");
        }
        catch { }
        for (const player of bossPlayers(boss, 8.5)) {
            try {
                player.applyDamage(4);
            }
            catch { }
            try {
                player.addEffect("slowness", 50, { amplifier: 0, showParticles: false });
            }
            catch { }
            knockAway(player, boss.location, 1.25, .32);
        }
        safeSound(boss.dimension, "random.explode", boss.location, { volume: .65, pitch: .65 });
    }, 26);
}
function kheperSlam(boss) {
    telegraphBoss(boss, "animation.egypt.kheper_ra.slam", "Black Sun Slam — move away!");
    safeSound(boss.dimension, "mob.warden.sonic_charge", boss.location, { volume: .65, pitch: .8 });
    system.runTimeout(() => {
        try {
            if (!boss.isValid)
                return;
        }
        catch {
            return;
        }
        for (const player of bossPlayers(boss, 9.5)) {
            try {
                player.applyDamage(6);
            }
            catch { }
            try {
                player.addEffect("weakness", 70, { amplifier: 0, showParticles: false });
            }
            catch { }
            try {
                player.addEffect("slowness", 45, { amplifier: 0, showParticles: false });
            }
            catch { }
            knockAway(player, boss.location, 1.55, .42);
        }
        for (let i = 0; i < 26; i++)
            safeParticle(boss.dimension, "minecraft:large_explosion", {
                x: boss.location.x + (Math.random() - .5) * 7, y: boss.location.y + .2, z: boss.location.z + (Math.random() - .5) * 7
            });
        safeSound(boss.dimension, "random.explode", boss.location, { volume: .8, pitch: .55 });
    }, 30);
}
function findBossMinionSpawn(boss, offset) {
    const baseY = Math.floor(boss.location.y);
    const x = Math.floor(boss.location.x + offset[0]), z = Math.floor(boss.location.z + offset[1]);
    for (const y of [baseY, baseY + 1, baseY - 1]) {
        if (spawnVolumeOpen(boss.dimension, x, y, z, MOB_CLEARANCE["egypt:scarab"]))
            return { x: x + .5, y: y + .05, z: z + .5 };
    }
    return undefined;
}
function kheperSummonScarabs(boss) {
    let existing = [];
    try {
        existing = boss.dimension.getEntities({ location: boss.location, maxDistance: 16, tags: ["egypt_boss_minion"] });
    }
    catch { }
    if (existing.length >= 4)
        return;
    try {
        boss.playAnimation("animation.egypt.kheper_ra.slash");
    }
    catch { }
    const offsets = [[4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, -3]];
    let spawned = 0;
    for (const off of offsets) {
        if (spawned >= 2 || existing.length + spawned >= 4)
            break;
        const pos = findBossMinionSpawn(boss, off);
        if (!pos)
            continue;
        try {
            const scarab = boss.dimension.spawnEntity("egypt:scarab", pos);
            scarab.addTag("egypt_guided_encounter");
            scarab.addTag("egypt_boss_minion");
            spawned++;
        }
        catch { }
    }
}
function updateBossCombat() {
    BOSS_CLOCK += 10;
    const dimensions = [];
    const seenDimensions = new Set();
    for (const player of world.getAllPlayers()) {
        if (seenDimensions.has(player.dimension.id))
            continue;
        seenDimensions.add(player.dimension.id);
        dimensions.push(player.dimension);
    }
    for (const dim of dimensions) {
        let bosses = [];
        try {
            bosses = dim.getEntities({ tags: ["egypt_boss"] });
        }
        catch { }
        for (const boss of bosses) {
            const players = bossPlayers(boss, 32);
            if (!players.length)
                continue;
            if (players.some(p => ACTIVE_CUTSCENES.has(p.id)))
                continue;
            const st = bossState(boss);
            let health;
            try {
                health = boss.getComponent("minecraft:health");
            }
            catch { }
            if (boss.typeId === "egypt:anubis_guardian") {
                if (BOSS_CLOCK >= st.nextPrimary) {
                    st.nextPrimary = BOSS_CLOCK + 180;
                    anubisShockwave(boss);
                }
            }
            else if (boss.typeId === "egypt:kheper_ra") {
                if (!st.raged && health && health.currentValue <= health.effectiveMax * .5) {
                    st.raged = true;
                    try {
                        boss.playAnimation("animation.egypt.kheper_ra.rage");
                    }
                    catch { }
                    try {
                        boss.addEffect("speed", 600, { amplifier: 1, showParticles: false });
                        boss.addEffect("resistance", 200, { amplifier: 0, showParticles: false });
                    }
                    catch { }
                    for (const p of players)
                        announce(p, "§4Kheper-Ra Enraged", "§fThe Black Sun burns brighter");
                }
                if (BOSS_CLOCK >= st.nextPrimary) {
                    st.nextPrimary = BOSS_CLOCK + 200;
                    kheperSlam(boss);
                }
                if (BOSS_CLOCK >= st.nextSummon) {
                    st.nextSummon = BOSS_CLOCK + 300;
                    kheperSummonScarabs(boss);
                }
            }
        }
    }
}
try {
    world.afterEvents.entityDie.subscribe((event) => {
        const dead = event.deadEntity;
        if (!dead)
            return;
        if (dead.typeId === "egypt:kheper_ra") {
            const deathDimension = dead.dimension;
            BOSS_RUNTIME.delete(dead.id);
            system.runTimeout(() => {
                for (const player of world.getAllPlayers()) {
                    if (player.dimension.id === deathDimension.id && distanceTo(player, { x: 101, y: 25, z: 102 }) < 55) {
                        try {
                            player.setDynamicProperty(FINAL_BOSS_DEFEATED_PROP, true);
                        }
                        catch { }
                        giveRelicRewards(player);
                        ensureReturnStoneForPlayer(player);
                    }
                }
            }, 25);
        }
        else if (dead.typeId === "egypt:anubis_guardian") {
            const deathLocation = { x: dead.location.x, y: dead.location.y, z: dead.location.z };
            BOSS_RUNTIME.delete(dead.id);
            for (const player of world.getAllPlayers())
                if (distanceTo(player, deathLocation) < 35)
                    announce(player, "§6Guardian Defeated", "§fThe final ascent is open");
        }
    });
}
catch { }
// -------------------------------------------------------------------------
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (!isEgyptPlayer(player))
        return;
    resetPlayerCinematicState(player);
    setAdventureMode(player);
    giveStarterKit(player);
    const hasSavedCheckpoint = checkpointIndex(player) >= 0 && guideStage(player) > 0;
    const completedExpedition = finalBossDefeated(player) || player.getDynamicProperty("egypt:expedition_complete") === true;
    if (!hasSavedCheckpoint && !completedExpedition)
        resetGuide(player);
    system.runTimeout(() => {
        if (hasSavedCheckpoint)
            teleportToSavedCheckpoint(player);
        else {
            try {
                player.teleport(MAIN_GATE, { dimension: player.dimension, checkForBlocks: false, keepVelocity: false, rotation: { x: 0, y: 90 } });
            }
            catch { }
            startCutscene(player, "arrival");
        }
        ensureReturnStoneForPlayer(player);
        ensureLootChestsNear(player);
        syncGuideWaypoint(player);
    }, event.initialSpawn ? 10 : 2);
});
world.afterEvents.playerDimensionChange.subscribe((event) => {
    if (event.fromDimension.id !== EGYPT_DIMENSION_ID && event.toDimension.id !== EGYPT_DIMENSION_ID)
        return;
    resetPlayerCinematicState(event.player);
    rememberOverworldReturn(event);
    if (event.toDimension.id === EGYPT_DIMENSION_ID) {
        setAdventureMode(event.player);
        giveStarterKit(event.player);
        const completedExpedition = finalBossDefeated(event.player) || event.player.getDynamicProperty("egypt:expedition_complete") === true;
        if (checkpointIndex(event.player) < 0 && !completedExpedition)
            resetGuide(event.player);
        system.runTimeout(() => {
            ensureReturnStoneForPlayer(event.player);
            ensureLootChestsNear(event.player);
            syncGuideWaypoint(event.player);
            startCutscene(event.player, "arrival");
        }, 25);
    }
    else {
        clearGuideWaypoint(event.player);
        if (event.toDimension.id === OVERWORLD_ID) {
            setSurvivalMode(event.player);
            system.runTimeout(() => setSurvivalMode(event.player), 20);
        }
    }
});
world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const id = event.itemStack?.typeId;
    if (!player || !id)
        return;
    if (id === ITEMS.khopesh && cooldownReady(player, id, 140)) {
        solarSlash(player);
    }
    else if (id === ITEMS.spear && cooldownReady(player, id, 120)) {
        rayStrike(player, 16, 22, "§6Spear of Horus");
    }
    else if (id === ITEMS.bow && cooldownReady(player, id, 100)) {
        rayStrike(player, 11, 28, "§dArrow of Neith");
    }
    else if (id === ITEMS.shield && cooldownReady(player, id, 400)) {
        try {
            player.addEffect("resistance", 120, { amplifier: 2, showParticles: false });
            player.addEffect("regeneration", 100, { amplifier: 1, showParticles: false });
        }
        catch { }
        safeSound(player.dimension, "beacon.activate", player.location);
        announce(player, "§bScarab Aegis");
    }
    else if (id === ITEMS.staff && cooldownReady(player, id, 260)) {
        try {
            player.addEffect("regeneration", 120, { amplifier: 2, showParticles: false });
        }
        catch { }
        for (const entity of nearbyEnemies(player, 8)) {
            try {
                entity.applyDamage(8);
            }
            catch { }
        }
        for (let i = 0; i < 18; i++) {
            safeParticle(player.dimension, "minecraft:totem_particle", {
                x: player.location.x + (Math.random() - 0.5) * 6,
                y: player.location.y + Math.random() * 3,
                z: player.location.z + (Math.random() - 0.5) * 6
            });
        }
        safeSound(player.dimension, "mob.evocation_illager.cast_spell", player.location);
        announce(player, "§3Anubis Soul Ward");
    }
});
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!isEgyptPlayer(player))
            continue;
        updateGuide(player);
        ensureLootChestsNear(player);
        updateEncounters(player);
    }
}, 10);
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (isEgyptPlayer(player))
            ensureReturnStoneForPlayer(player);
    }
}, 100);
function enforceEgyptSettings() {
    try {
        EGYPT().setWeather(WeatherType.Clear, 1000000);
    }
    catch { }
}
system.runTimeout(() => {
    enforceEgyptSettings();
    initializeTreasureLayout();
    world.setDynamicProperty("egypt:return_stone_mode_version", 6);
    world.setDynamicProperty("egypt:cutscene_loot_mode_version", 4);
    world.setDynamicProperty("egypt:expanded_expedition_version", 2);
    world.setDynamicProperty("egypt:treasure_room_version", TREASURE_VERSION);
    world.setDynamicProperty("egypt:silent_ui_version", 1);
    world.setDynamicProperty("egypt:encounter_runtime_version", ENCOUNTER_VERSION);
}, 20);
system.runInterval(updateBossCombat, 10);
system.runInterval(enforceEgyptSettings, 200);
try {
    world.afterEvents.playerLeave.subscribe((event) => {
        GUIDE_WAYPOINTS.delete(event.playerId);
        ACTIVE_CUTSCENES.delete(event.playerId);
    });
}
catch { }
// Natural-spawn policy: only entities the engine reports as naturally spawned
// are filtered. Script-created pyramid enemies are never removed by this handler.
const UNSCRIPTED_EGYPT_HOSTILES = new Set([
    "minecraft:blaze", "minecraft:bogged", "minecraft:breeze", "minecraft:cave_spider",
    "minecraft:creeper", "minecraft:drowned", "minecraft:enderman", "minecraft:endermite",
    "minecraft:evocation_illager", "minecraft:ghast", "minecraft:guardian",
    "minecraft:elder_guardian", "minecraft:hoglin", "minecraft:husk", "minecraft:magma_cube",
    "minecraft:phantom", "minecraft:piglin", "minecraft:piglin_brute", "minecraft:pillager",
    "minecraft:ravager", "minecraft:shulker", "minecraft:silverfish", "minecraft:skeleton",
    "minecraft:slime", "minecraft:spider", "minecraft:stray", "minecraft:vex",
    "minecraft:vindicator", "minecraft:warden", "minecraft:witch", "minecraft:wither",
    "minecraft:wither_skeleton", "minecraft:zoglin", "minecraft:zombie",
    "minecraft:zombie_villager"
]);
world.afterEvents.entitySpawn.subscribe((event) => {
    if (event.cause !== EntityInitializationCause.Spawned)
        return;
    const entity = event.entity;
    system.run(() => {
        try {
            if (!entity || entity.isValid === false)
                return;
            if (entity.dimension.id !== EGYPT_DIMENSION_ID)
                return;
            if (entity.typeId.startsWith("egypt:"))
                return;
            if (entity.hasTag("egypt_guided_encounter") || entity.hasTag("egypt_boss") || entity.hasTag("egypt_boss_minion"))
                return;
            if (!UNSCRIPTED_EGYPT_HOSTILES.has(entity.typeId))
                return;
            entity.remove();
        }
        catch { }
    });
});
