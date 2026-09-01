import { world, system, BlockVolume, BlockPermutation, WeatherType, } from "@minecraft/server";
import { LANTERN_SECTIONS } from "./lanternPositions.js";
import { SPAWN_CLEANUP_POSITIONS } from "./spawnCleanupPositions.js";
import { AUTHORED_DECORATION_SECTIONS, PALACE_TRAPDOOR_GROUPS, } from "./authoredDecorationPositions.js";
export const KINGDOM_DIMENSION_ID = "eoh:delhi_sultanate";
const ENVIRONMENT_VERSION = "3.3.0";
const JUNGLE_PROPERTY = "eoh:jungle_perimeter_v33";
const TERRAIN_PROGRESS_PROPERTY = "eoh:jungle_terrain_progress_v33";
const TREE_PROGRESS_PROPERTY = "eoh:jungle_tree_progress_v33";
const ROAD_PROPERTY = "eoh:jungle_road_v33";
const SPAWN_CLEANUP_PROPERTY = "eoh:spawn_cleanup_radius40_v33";
const LANTERN_REPAIR_PROPERTY = "eoh:lantern_repair_v33";
const LANTERN_PROGRESS_PROPERTY = "eoh:lantern_repair_progress_v33";
const AUTHORED_DECOR_REPAIR_PROPERTY = "eoh:authored_decor_repair_v37";
const AUTHORED_DECOR_PROGRESS_PROPERTY = "eoh:authored_decor_progress_v37";
const PALACE_TRAPDOOR_REPAIR_PROPERTY = "eoh:palace_trapdoor_repair_v37";
const LANTERN_UNRESOLVED_PROPERTY = "eoh:lantern_repair_unresolved_v37";
const AUTHORED_DECOR_UNRESOLVED_PROPERTY = "eoh:authored_decor_unresolved_v37";
const PALACE_TRAPDOOR_UNRESOLVED_PROPERTY = "eoh:palace_trapdoor_unresolved_v37";
const REQUESTED_COORDINATE_PATCH_PROPERTY = "eoh:requested_coordinate_patch_v38";
const DELHI_AUTHOR_AIR_PATCH_PROPERTY = "eoh:delhi_author_air_patch_v1";
const MAP_FLOOR = { x: 160, y: -60, z: 527 };
const PALACE_ANCHOR = { x: 159, y: -58, z: 154 };
const SPAWN = { x: 160.5, y: -59, z: 527.5 };
const OUTER_MIN_X = -64;
const OUTER_MAX_X = 383;
const OUTER_MIN_Z = -64;
const OUTER_MAX_Z = 607;
const MAP_MIN_X = 0;
const MAP_MAX_X = 319;
const MAP_MIN_Z = 0;
const MAP_MAX_Z = 543;
const SURFACE_Y = -60;
const BARRIER_MIN_Y = -59;
const BARRIER_MAX_Y = -48;
const PASSIVE_ENTITY_IDS = new Set([
    "minecraft:allay",
    "minecraft:armadillo",
    "minecraft:axolotl",
    "minecraft:bat",
    "minecraft:camel",
    "minecraft:cat",
    "minecraft:chicken",
    "minecraft:cod",
    "minecraft:cow",
    "minecraft:donkey",
    "minecraft:fox",
    "minecraft:frog",
    "minecraft:glow_squid",
    "minecraft:horse",
    "minecraft:mooshroom",
    "minecraft:mule",
    "minecraft:ocelot",
    "minecraft:parrot",
    "minecraft:pig",
    "minecraft:rabbit",
    "minecraft:salmon",
    "minecraft:sheep",
    "minecraft:sniffer",
    "minecraft:snow_golem",
    "minecraft:squid",
    "minecraft:tadpole",
    "minecraft:tropicalfish",
    "minecraft:tropical_fish",
    "minecraft:turtle",
    "minecraft:villager",
    "minecraft:villager_v2",
    "minecraft:wandering_trader",
    "minecraft:npc",
    "minecraft:agent",
    "minecraft:armor_stand",
]);
const BOOK_ITEM_IDS = new Set([
    "minecraft:book",
    "minecraft:writable_book",
    "minecraft:written_book",
    "minecraft:book_and_quill",
]);
const CLEANUP_BLOCK_IDS = new Set([
    "minecraft:chest",
    "minecraft:trapped_chest",
    "minecraft:lectern",
    "minecraft:bookshelf",
    "minecraft:chiseled_bookshelf",
]);
let environmentPromise;
let palaceTrapdoorPromise;
let runtimeRegistered = false;
function safe(callback, fallback) {
    try {
        return callback();
    }
    catch (error) {
        return fallback;
    }
}
function waitTicks(ticks) {
    return new Promise((resolve) => system.runTimeout(resolve, ticks));
}
function send(_player, _message) {
}
function logBackgroundIssue(_label, _error) {
}
function dimension() {
    return world.getDimension(KINGDOM_DIMENSION_ID);
}
function mapIsReady() {
    const builtVersion = safe(() => world.getDynamicProperty("eoh:delhi_dimension_built_v31"), "");
    if (builtVersion === "3.1.0")
        return true;
    const dim = safe(() => dimension(), undefined);
    if (!dim)
        return false;
    const floor = safe(() => dim.getBlock(MAP_FLOOR)?.typeId, "minecraft:air");
    return floor !== "minecraft:air";
}
export function setKingdomWeatherClear() {
    const dim = safe(() => dimension(), undefined);
    if (!dim)
        return;
    safe(() => dim.setWeather(WeatherType.Clear, 1000000));
}
function makeTerrainPatches() {
    const patches = [];
    for (let x = OUTER_MIN_X; x <= OUTER_MAX_X; x += 32) {
        for (let z = OUTER_MIN_Z; z <= OUTER_MAX_Z; z += 32) {
            const x1 = Math.min(x + 31, OUTER_MAX_X);
            const z1 = Math.min(z + 31, OUTER_MAX_Z);
            const fullyInsideMap = x >= MAP_MIN_X && x1 <= MAP_MAX_X &&
                z >= MAP_MIN_Z && z1 <= MAP_MAX_Z;
            if (!fullyInsideMap)
                patches.push({ x0: x, z0: z, x1, z1 });
        }
    }
    return patches;
}
const TERRAIN_PATCHES = makeTerrainPatches();
function coordinateHash(x, z) {
    let value = ((x * 73856093) ^ (z * 19349663) ^ 0x6d2b79f5) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 2246822519) >>> 0;
    value ^= value >>> 13;
    return value >>> 0;
}
function makeTreeGroups() {
    const groups = new Map();
    for (let x = OUTER_MIN_X + 8; x <= OUTER_MAX_X - 7; x += 10) {
        for (let z = OUTER_MIN_Z + 8; z <= OUTER_MAX_Z - 7; z += 10) {
            const insideMap = x >= MAP_MIN_X && x <= MAP_MAX_X && z >= MAP_MIN_Z && z <= MAP_MAX_Z;
            if (insideMap)
                continue;
            const canopyWouldTouchMap = x >= MAP_MIN_X - 3 && x <= MAP_MAX_X + 3 &&
                z >= MAP_MIN_Z - 3 && z <= MAP_MAX_Z + 3;
            if (canopyWouldTouchMap)
                continue;
            const roadClearance = x >= 150 && x <= 170 && z >= 532;
            if (roadClearance)
                continue;
            const hash = coordinateHash(x, z);
            if ((hash % 100) >= 35)
                continue;
            const patchX = OUTER_MIN_X + Math.floor((x - OUTER_MIN_X) / 32) * 32;
            const patchZ = OUTER_MIN_Z + Math.floor((z - OUTER_MIN_Z) / 32) * 32;
            const key = `${patchX},${patchZ}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    patch: {
                        x0: patchX,
                        z0: patchZ,
                        x1: Math.min(patchX + 31, OUTER_MAX_X),
                        z1: Math.min(patchZ + 31, OUTER_MAX_Z),
                    },
                    trees: [],
                });
            }
            groups.get(key).trees.push({
                x,
                z,
                height: 5 + ((hash >>> 8) % 3),
            });
        }
    }
    return [...groups.values()].sort((a, b) => a.patch.x0 - b.patch.x0 || a.patch.z0 - b.patch.z0);
}
const TREE_GROUPS = makeTreeGroups();
async function withLoadedArea(id, from, to, callback) {
    const manager = safe(() => world.tickingAreaManager, undefined);
    const dim = dimension();
    let created = false;
    if (manager?.createTickingArea) {
        safe(() => manager.removeTickingArea(id));
        try {
            await manager.createTickingArea(id, { dimension: dim, from, to });
            created = true;
        }
        catch (error) {
        }
    }
    try {
        await callback();
    }
    finally {
        if (created)
            safe(() => manager.removeTickingArea(id));
    }
}
function fill(dim, from, to, blockId) {
    dim.fillBlocks(new BlockVolume(from, to), blockId);
}
function buildTerrainPatch(dim, patch) {
    fill(dim, { x: patch.x0, y: -64, z: patch.z0 }, { x: patch.x1, y: -64, z: patch.z1 }, "minecraft:bedrock");
    fill(dim, { x: patch.x0, y: -63, z: patch.z0 }, { x: patch.x1, y: -61, z: patch.z1 }, "minecraft:dirt");
    fill(dim, { x: patch.x0, y: SURFACE_Y, z: patch.z0 }, { x: patch.x1, y: SURFACE_Y, z: patch.z1 }, "minecraft:grass_block");
    if (patch.x0 === OUTER_MIN_X) {
        fill(dim, { x: OUTER_MIN_X, y: BARRIER_MIN_Y, z: patch.z0 }, { x: OUTER_MIN_X, y: BARRIER_MAX_Y, z: patch.z1 }, "minecraft:barrier");
    }
    if (patch.x1 === OUTER_MAX_X) {
        fill(dim, { x: OUTER_MAX_X, y: BARRIER_MIN_Y, z: patch.z0 }, { x: OUTER_MAX_X, y: BARRIER_MAX_Y, z: patch.z1 }, "minecraft:barrier");
    }
    if (patch.z0 === OUTER_MIN_Z) {
        fill(dim, { x: patch.x0, y: BARRIER_MIN_Y, z: OUTER_MIN_Z }, { x: patch.x1, y: BARRIER_MAX_Y, z: OUTER_MIN_Z }, "minecraft:barrier");
    }
    if (patch.z1 === OUTER_MAX_Z) {
        fill(dim, { x: patch.x0, y: BARRIER_MIN_Y, z: OUTER_MAX_Z }, { x: patch.x1, y: BARRIER_MAX_Y, z: OUTER_MAX_Z }, "minecraft:barrier");
    }
}
async function buildJungleTerrain(player) {
    if (safe(() => world.getDynamicProperty(JUNGLE_PROPERTY), "") === ENVIRONMENT_VERSION)
        return;
    const startRaw = Number(safe(() => world.getDynamicProperty(TERRAIN_PROGRESS_PROPERTY), 0));
    const start = Number.isInteger(startRaw) && startRaw >= 0 && startRaw <= TERRAIN_PATCHES.length ? startRaw : 0;
    const dim = dimension();
    if (start === 0) {
        send(player, "§2[Delhi] §fCreating the jungle perimeter and safe construction boundary...");
    }
    for (let index = start; index < TERRAIN_PATCHES.length; index += 1) {
        const patch = TERRAIN_PATCHES[index];
        await withLoadedArea(`eoh_jungle_ground_${index}`, { x: patch.x0, y: -64, z: patch.z0 }, { x: patch.x1, y: -40, z: patch.z1 }, () => buildTerrainPatch(dim, patch));
        safe(() => world.setDynamicProperty(TERRAIN_PROGRESS_PROPERTY, index + 1));
        if ((index + 1) % 16 === 0 || index + 1 === TERRAIN_PATCHES.length) {
            send(player, `§2Jungle ground: §f${index + 1}/${TERRAIN_PATCHES.length} sections`);
        }
        await waitTicks(1);
    }
    if (safe(() => world.getDynamicProperty(ROAD_PROPERTY), false) !== true) {
        await withLoadedArea("eoh_jungle_road", { x: 144, y: -64, z: 532 }, { x: 176, y: -40, z: OUTER_MAX_Z }, () => {
            fill(dim, { x: 157, y: SURFACE_Y, z: 536 }, { x: 163, y: SURFACE_Y, z: OUTER_MAX_Z - 4 }, "minecraft:gravel");
            fill(dim, { x: 156, y: SURFACE_Y, z: 536 }, { x: 156, y: SURFACE_Y, z: OUTER_MAX_Z - 4 }, "minecraft:cobblestone");
            fill(dim, { x: 164, y: SURFACE_Y, z: 536 }, { x: 164, y: SURFACE_Y, z: OUTER_MAX_Z - 4 }, "minecraft:cobblestone");
        });
        safe(() => world.setDynamicProperty(ROAD_PROPERTY, true));
        send(player, "§2[Delhi] §fThe southern road now continues through the jungle.");
    }
    const treeStartRaw = Number(safe(() => world.getDynamicProperty(TREE_PROGRESS_PROPERTY), 0));
    const treeStart = Number.isInteger(treeStartRaw) && treeStartRaw >= 0 && treeStartRaw <= TREE_GROUPS.length ? treeStartRaw : 0;
    for (let index = treeStart; index < TREE_GROUPS.length; index += 1) {
        const group = TREE_GROUPS[index];
        await withLoadedArea(`eoh_jungle_trees_${index}`, { x: group.patch.x0 - 3, y: -64, z: group.patch.z0 - 3 }, { x: group.patch.x1 + 3, y: -40, z: group.patch.z1 + 3 }, () => {
            for (const tree of group.trees) {
                const topY = -59 + tree.height - 1;
                fill(dim, { x: tree.x - 2, y: topY - 2, z: tree.z - 2 }, { x: tree.x + 2, y: topY - 1, z: tree.z + 2 }, "minecraft:jungle_leaves");
                fill(dim, { x: tree.x - 1, y: topY, z: tree.z - 1 }, { x: tree.x + 1, y: topY, z: tree.z + 1 }, "minecraft:jungle_leaves");
                fill(dim, { x: tree.x, y: -59, z: tree.z }, { x: tree.x, y: topY, z: tree.z }, "minecraft:jungle_log");
            }
        });
        safe(() => world.setDynamicProperty(TREE_PROGRESS_PROPERTY, index + 1));
        if ((index + 1) % 12 === 0 || index + 1 === TREE_GROUPS.length) {
            send(player, `§2Jungle trees: §f${index + 1}/${TREE_GROUPS.length} areas`);
        }
        await waitTicks(1);
    }
    safe(() => world.setDynamicProperty(JUNGLE_PROPERTY, ENVIRONMENT_VERSION));
}
function isTargetCleanupBlock(typeId) {
    const id = String(typeId ?? "").toLowerCase();
    return id.includes("sign") || CLEANUP_BLOCK_IDS.has(id);
}
async function cleanupSpawnRadiusOnce(player) {
    if (safe(() => world.getDynamicProperty(SPAWN_CLEANUP_PROPERTY), false) === true)
        return;
    const dim = dimension();
    let removed = 0;
    await withLoadedArea("eoh_spawn_cleanup_v33", { x: 118, y: -64, z: 485 }, { x: 202, y: -20, z: 570 }, async () => {
        for (let index = 0; index < SPAWN_CLEANUP_POSITIONS.length; index += 3) {
            const location = {
                x: SPAWN_CLEANUP_POSITIONS[index],
                y: SPAWN_CLEANUP_POSITIONS[index + 1],
                z: SPAWN_CLEANUP_POSITIONS[index + 2],
            };
            const block = safe(() => dim.getBlock(location), undefined);
            if (block && isTargetCleanupBlock(block.typeId)) {
                safe(() => block.setType("minecraft:air"));
                removed += 1;
            }
            if (index > 0 && index % 60 === 0)
                await waitTicks(1);
        }
        for (const entity of safe(() => [...dim.getEntities({
                type: "minecraft:item",
                location: SPAWN,
                maxDistance: 42,
            })], [])) {
            const itemId = safe(() => entity.getComponent("minecraft:item")?.itemStack?.typeId, "");
            if (BOOK_ITEM_IDS.has(String(itemId)))
                safe(() => entity.remove());
        }
    });
    safe(() => world.setDynamicProperty(SPAWN_CLEANUP_PROPERTY, true));
    send(player, `§7Spawn cleanup completed once: ${removed} sign, chest, or book-display blocks removed within 40 blocks.`);
}
function tripleCount(values) {
    return Math.floor(values.length / 3);
}
function repairTriples(dim, values, permutation, expectedType) {
    let changed = 0;
    for (let index = 0; index < values.length; index += 3) {
        const location = { x: values[index], y: values[index + 1], z: values[index + 2] };
        const block = safe(() => dim.getBlock(location), undefined);
        if (!block)
            continue;
        const currentType = String(safe(() => block.typeId, ""));
        const currentHanging = safe(() => block.permutation.getState("hanging"), undefined);
        const expectedHanging = safe(() => permutation.getState("hanging"), undefined);
        if (currentType === expectedType && currentHanging === expectedHanging)
            continue;
        safe(() => block.setPermutation(permutation));
        changed += 1;
    }
    return changed;
}
function countMissingTriples(dim, values, expectedType, expectedHanging) {
    let missing = 0;
    for (let index = 0; index < values.length; index += 3) {
        const location = { x: values[index], y: values[index + 1], z: values[index + 2] };
        const block = safe(() => dim.getBlock(location), undefined);
        const typeId = String(safe(() => block?.typeId, ""));
        const hanging = Boolean(safe(() => block?.permutation?.getState("hanging"), false));
        if (typeId !== expectedType || hanging !== expectedHanging)
            missing += 1;
    }
    return missing;
}
async function repairLanternsOnce(player) {
    if (safe(() => world.getDynamicProperty(LANTERN_REPAIR_PROPERTY), false) === true)
        return;
    const dim = dimension();
    const hanging = BlockPermutation.resolve("minecraft:lantern", { hanging: true });
    const standing = BlockPermutation.resolve("minecraft:lantern", { hanging: false });
    const soulHanging = BlockPermutation.resolve("minecraft:soul_lantern", { hanging: true });
    const soulStanding = BlockPermutation.resolve("minecraft:soul_lantern", { hanging: false });
    const startRaw = Number(safe(() => world.getDynamicProperty(LANTERN_PROGRESS_PROPERTY), 0));
    const start = Number.isInteger(startRaw) && startRaw >= 0 && startRaw <= LANTERN_SECTIONS.length ? startRaw : 0;
    let repaired = 0;
    if (start === 0)
        send(player, "§6[Delhi] §fRepairing lanterns after the complete kingdom has loaded...");
    for (let sectionIndex = start; sectionIndex < LANTERN_SECTIONS.length; sectionIndex += 1) {
        const section = LANTERN_SECTIONS[sectionIndex];
        const [ox, oy, oz] = section.origin;
        const [sx, sy, sz] = section.size;
        await withLoadedArea(`eoh_lantern_repair_${sectionIndex}`, { x: ox, y: oy, z: oz }, { x: ox + sx - 1, y: oy + sy - 1, z: oz + sz - 1 }, async () => {
            repaired += repairTriples(dim, section.hanging, hanging, "minecraft:lantern");
            repaired += repairTriples(dim, section.standing, standing, "minecraft:lantern");
            repaired += repairTriples(dim, section.soulHanging, soulHanging, "minecraft:soul_lantern");
            repaired += repairTriples(dim, section.soulStanding, soulStanding, "minecraft:soul_lantern");
            await waitTicks(4);
            let missing = 0;
            missing += countMissingTriples(dim, section.hanging, "minecraft:lantern", true);
            missing += countMissingTriples(dim, section.standing, "minecraft:lantern", false);
            missing += countMissingTriples(dim, section.soulHanging, "minecraft:soul_lantern", true);
            missing += countMissingTriples(dim, section.soulStanding, "minecraft:soul_lantern", false);
            if (missing > 0) {
                repairTriples(dim, section.hanging, hanging, "minecraft:lantern");
                repairTriples(dim, section.standing, standing, "minecraft:lantern");
                repairTriples(dim, section.soulHanging, soulHanging, "minecraft:soul_lantern");
                repairTriples(dim, section.soulStanding, soulStanding, "minecraft:soul_lantern");
                await waitTicks(4);
                missing = 0;
                missing += countMissingTriples(dim, section.hanging, "minecraft:lantern", true);
                missing += countMissingTriples(dim, section.standing, "minecraft:lantern", false);
                missing += countMissingTriples(dim, section.soulHanging, "minecraft:soul_lantern", true);
                missing += countMissingTriples(dim, section.soulStanding, "minecraft:soul_lantern", false);
            }
            if (missing > 0) {
                const previous = Number(safe(() => world.getDynamicProperty(LANTERN_UNRESOLVED_PROPERTY), 0)) || 0;
                safe(() => world.setDynamicProperty(LANTERN_UNRESOLVED_PROPERTY, previous + missing));
                logBackgroundIssue("lantern repair verification", `section ${sectionIndex}: ${missing} blocks could not be confirmed`);
            }
            const centre = { x: ox + sx / 2, y: oy + sy / 2, z: oz + sz / 2 };
            for (const entity of safe(() => [...dim.getEntities({
                    type: "minecraft:item",
                    location: centre,
                    maxDistance: 55,
                })], [])) {
                const itemId = String(safe(() => entity.getComponent("minecraft:item")?.itemStack?.typeId, ""));
                if (itemId === "minecraft:lantern" || itemId === "minecraft:soul_lantern") {
                    safe(() => entity.remove());
                }
            }
        });
        safe(() => world.setDynamicProperty(LANTERN_PROGRESS_PROPERTY, sectionIndex + 1));
        if ((sectionIndex + 1) % 9 === 0 || sectionIndex + 1 === LANTERN_SECTIONS.length) {
            send(player, `§6Lantern repair: §f${sectionIndex + 1}/${LANTERN_SECTIONS.length} sections`);
        }
    }
    safe(() => world.setDynamicProperty(LANTERN_REPAIR_PROPERTY, true));
    send(player, `§6[Delhi] §fLantern repair completed. ${repaired} missing or incorrect lantern blocks were restored.`);
}
function permutationMatches(block, typeId, states) {
    if (!block || String(safe(() => block.typeId, "")) !== typeId)
        return false;
    for (const [stateName, expected] of Object.entries(states)) {
        const actual = safe(() => block.permutation.getState(stateName), undefined);
        if (actual !== expected)
            return false;
    }
    return true;
}
function repairStatesForGroup(group) {
    if (group.category !== "trapdoor")
        return group.states;
    return { ...group.states, open_bit: false };
}
function repairPermutationGroups(dim, groups) {
    let changed = 0;
    for (const group of groups) {
        const repairStates = repairStatesForGroup(group);
        const permutation = safe(() => BlockPermutation.resolve(group.typeId, repairStates), undefined);
        if (!permutation)
            continue;
        for (let index = 0; index < group.positions.length; index += 3) {
            const location = {
                x: group.positions[index],
                y: group.positions[index + 1],
                z: group.positions[index + 2],
            };
            const block = safe(() => dim.getBlock(location), undefined);
            if (!block || permutationMatches(block, group.typeId, repairStates))
                continue;
            safe(() => block.setPermutation(permutation));
            changed += 1;
        }
    }
    return changed;
}
function countMissingPermutationGroups(dim, groups) {
    let missing = 0;
    for (const group of groups) {
        const repairStates = repairStatesForGroup(group);
        for (let index = 0; index < group.positions.length; index += 3) {
            const block = safe(() => dim.getBlock({
                x: group.positions[index],
                y: group.positions[index + 1],
                z: group.positions[index + 2],
            }), undefined);
            if (!permutationMatches(block, group.typeId, repairStates))
                missing += 1;
        }
    }
    return missing;
}
function placePotGroups(dim, groups) {
    let placed = 0;
    const manager = safe(() => world.structureManager, undefined);
    if (!manager?.place)
        return 0;
    for (const group of groups) {
        for (let index = 0; index < group.positions.length; index += 3) {
            const location = {
                x: group.positions[index],
                y: group.positions[index + 1],
                z: group.positions[index + 2],
            };
            try {
                manager.place(group.structureId, dim, location);
                placed += 1;
            }
            catch (error) {
            }
        }
    }
    return placed;
}
function countMissingPotGroups(dim, groups) {
    let missing = 0;
    for (const group of groups) {
        for (let index = 0; index < group.positions.length; index += 3) {
            const block = safe(() => dim.getBlock({
                x: group.positions[index],
                y: group.positions[index + 1],
                z: group.positions[index + 2],
            }), undefined);
            if (!block || String(safe(() => block.typeId, "")) !== group.typeId)
                missing += 1;
        }
    }
    return missing;
}
function isAuthoredDecorationDrop(typeId) {
    const id = String(typeId ?? "").toLowerCase();
    return id.includes("lantern") || id.includes("trapdoor") || id.endsWith("_door") ||
        id.includes("flower_pot") || id.includes("decorated_pot") ||
        id === "minecraft:red_flower" || id === "minecraft:yellow_flower" ||
        id === "minecraft:double_plant" || id === "minecraft:pitcher_plant";
}
async function repairAuthoredDecorationsOnce(player) {
    if (safe(() => world.getDynamicProperty(AUTHORED_DECOR_REPAIR_PROPERTY), false) === true)
        return;
    const dim = dimension();
    const startRaw = Number(safe(() => world.getDynamicProperty(AUTHORED_DECOR_PROGRESS_PROPERTY), 0));
    const start = Number.isInteger(startRaw) && startRaw >= 0 && startRaw <= AUTHORED_DECORATION_SECTIONS.length ? startRaw : 0;
    let changed = 0;
    let potPlacements = 0;
    if (start === 0) {
        send(player, "§6[Delhi] §fRestoring authored doors, flowers, flower pots, decorated pots, and closed trapdoors...");
    }
    for (let sectionIndex = start; sectionIndex < AUTHORED_DECORATION_SECTIONS.length; sectionIndex += 1) {
        const section = AUTHORED_DECORATION_SECTIONS[sectionIndex];
        const [ox, oy, oz] = section.origin;
        const [sx, sy, sz] = section.size;
        await withLoadedArea(`eoh_authored_decor_v35_${sectionIndex}`, { x: ox, y: oy, z: oz }, { x: ox + sx - 1, y: oy + sy - 1, z: oz + sz - 1 }, async () => {
            changed += repairPermutationGroups(dim, section.groups);
            potPlacements += placePotGroups(dim, section.pots);
            await waitTicks(4);
            let missing = countMissingPermutationGroups(dim, section.groups) + countMissingPotGroups(dim, section.pots);
            if (missing > 0) {
                repairPermutationGroups(dim, section.groups);
                placePotGroups(dim, section.pots);
                await waitTicks(4);
                missing = countMissingPermutationGroups(dim, section.groups) + countMissingPotGroups(dim, section.pots);
            }
            if (missing > 0) {
                const previous = Number(safe(() => world.getDynamicProperty(AUTHORED_DECOR_UNRESOLVED_PROPERTY), 0)) || 0;
                safe(() => world.setDynamicProperty(AUTHORED_DECOR_UNRESOLVED_PROPERTY, previous + missing));
                logBackgroundIssue("authored decoration verification", `section ${sectionIndex}: ${missing} blocks could not be confirmed`);
            }
            const centre = { x: ox + sx / 2, y: oy + sy / 2, z: oz + sz / 2 };
            for (const entity of safe(() => [...dim.getEntities({
                    type: "minecraft:item",
                    location: centre,
                    maxDistance: 55,
                })], [])) {
                const itemId = String(safe(() => entity.getComponent("minecraft:item")?.itemStack?.typeId, ""));
                if (isAuthoredDecorationDrop(itemId))
                    safe(() => entity.remove());
            }
        });
        safe(() => world.setDynamicProperty(AUTHORED_DECOR_PROGRESS_PROPERTY, sectionIndex + 1));
        if ((sectionIndex + 1) % 9 === 0 || sectionIndex + 1 === AUTHORED_DECORATION_SECTIONS.length) {
            send(player, `§6Decoration repair: §f${sectionIndex + 1}/${AUTHORED_DECORATION_SECTIONS.length} sections`);
        }
        await waitTicks(1);
    }
    safe(() => world.setDynamicProperty(AUTHORED_DECOR_REPAIR_PROPERTY, true));
    send(player, `§6[Delhi] §fAuthored decoration repair completed. ${changed} block states were corrected and ${potPlacements} pot templates were refreshed.`);
}
async function repairPalaceTrapdoorsInternal(player) {
    if (safe(() => world.getDynamicProperty(PALACE_TRAPDOOR_REPAIR_PROPERTY), false) === true)
        return;
    const dim = dimension();
    await withLoadedArea("eoh_palace_trapdoors_v35", { x: 108, y: -64, z: 108 }, { x: 212, y: -20, z: 272 }, async () => {
        repairPermutationGroups(dim, PALACE_TRAPDOOR_GROUPS);
        await waitTicks(4);
        let missing = countMissingPermutationGroups(dim, PALACE_TRAPDOOR_GROUPS);
        if (missing > 0) {
            repairPermutationGroups(dim, PALACE_TRAPDOOR_GROUPS);
            await waitTicks(4);
            missing = countMissingPermutationGroups(dim, PALACE_TRAPDOOR_GROUPS);
        }
        if (missing > 0) {
            safe(() => world.setDynamicProperty(PALACE_TRAPDOOR_UNRESOLVED_PROPERTY, missing));
            logBackgroundIssue("palace trapdoor verification", `${missing} trapdoors could not be confirmed`);
        }
    });
    safe(() => world.setDynamicProperty(PALACE_TRAPDOOR_REPAIR_PROPERTY, true));
    send(player, "§6[Delhi] §fThe palace trapdoors have been restored and forced closed.");
}
export async function repairPalaceTrapdoorsAfterWave3(player) {
    if (palaceTrapdoorPromise) {
        await palaceTrapdoorPromise;
        return;
    }
    const current = repairPalaceTrapdoorsInternal(player);
    palaceTrapdoorPromise = current;
    try {
        await current;
    }
    finally {
        if (palaceTrapdoorPromise === current)
            palaceTrapdoorPromise = undefined;
    }
}
function hasStoryTag(entity) {
    const tags = safe(() => entity.getTags(), []) ?? [];
    return tags.some((tag) => String(tag).startsWith("eoh_delhi_"));
}
function shouldKeepLivingEntity(entity) {
    const typeId = String(safe(() => entity.typeId, ""));
    if (!typeId)
        return true;
    if (typeId === "minecraft:player")
        return true;
    if (typeId.startsWith("eoh:"))
        return true;
    if (hasStoryTag(entity))
        return true;
    if (PASSIVE_ENTITY_IDS.has(typeId))
        return true;
    const health = safe(() => entity.getComponent("minecraft:health"), undefined);
    return !health;
}
function removeIfForbidden(entity) {
    if (safe(() => entity.dimension.id, "") !== KINGDOM_DIMENSION_ID)
        return;
    if (shouldKeepLivingEntity(entity))
        return;
    safe(() => entity.remove());
}
export function sweepForbiddenKingdomMobs() {
    const dim = safe(() => dimension(), undefined);
    if (!dim)
        return;
    for (const entity of safe(() => [...dim.getEntities()], [])) {
        removeIfForbidden(entity);
    }
}
const DELHI_AUTHOR_AIR_BLOCKS = [
    { x: 158, y: -59, z: 487 },
    { x: 159, y: -59, z: 487 },
    { x: 161, y: -59, z: 487 },
    { x: 148, y: -59, z: 201 },
    { x: 151, y: -59, z: 199 },
];
async function applyDelhiAuthorAirPatchOnce() {
    if (safe(() => world.getDynamicProperty(DELHI_AUTHOR_AIR_PATCH_PROPERTY), false) === true)
        return;
    const dim = dimension();
    await withLoadedArea("eoh_delhi_author_air_south_v1", { x: 146, y: -64, z: 485 }, { x: 163, y: -54, z: 489 }, () => {
        for (const pos of DELHI_AUTHOR_AIR_BLOCKS.filter((p) => p.z >= 480)) {
            safe(() => dim.getBlock(pos)?.setType("minecraft:air"));
        }
    });
    await withLoadedArea("eoh_delhi_author_air_palace_v1", { x: 146, y: -64, z: 197 }, { x: 153, y: -54, z: 203 }, () => {
        for (const pos of DELHI_AUTHOR_AIR_BLOCKS.filter((p) => p.z < 480)) {
            safe(() => dim.getBlock(pos)?.setType("minecraft:air"));
        }
    });
    const unresolved = DELHI_AUTHOR_AIR_BLOCKS.filter((pos) => String(safe(() => dim.getBlock(pos)?.typeId, "minecraft:air")) !== "minecraft:air");
    if (unresolved.length > 0) {
        throw new Error(`${unresolved.length} requested Delhi air blocks could not be confirmed yet.`);
    }
    safe(() => world.setDynamicProperty(DELHI_AUTHOR_AIR_PATCH_PROPERTY, true));
}
async function applyRequestedCoordinatePatchOnce() {
    if (safe(() => world.getDynamicProperty(REQUESTED_COORDINATE_PATCH_PROPERTY), false) === true)
        return;
    const dim = dimension();
    await withLoadedArea("eoh_requested_air_patch_v38", { x: 168, y: -64, z: 195 }, { x: 172, y: -54, z: 199 }, () => {
        fill(dim, { x: 170, y: -59, z: 197 }, { x: 170, y: -58, z: 197 }, "minecraft:air");
    });
    await withLoadedArea("eoh_requested_road_patch_v38", { x: 154, y: -64, z: 529 }, { x: 166, y: -54, z: 538 }, () => {
        fill(dim, { x: 157, y: -60, z: 531 }, { x: 163, y: -60, z: 536 }, "minecraft:gravel");
        fill(dim, { x: 156, y: -60, z: 531 }, { x: 156, y: -60, z: 536 }, "minecraft:cobblestone");
        fill(dim, { x: 164, y: -60, z: 531 }, { x: 164, y: -60, z: 536 }, "minecraft:cobblestone");
    });
    safe(() => world.setDynamicProperty(REQUESTED_COORDINATE_PATCH_PROPERTY, true));
}
async function runBackgroundPhase(label, callback) {
    try {
        await callback();
    }
    catch (error) {
        logBackgroundIssue(label, error);
    }
}
function environmentNeedsWork() {
    if (!mapIsReady())
        return false;
    if (safe(() => world.getDynamicProperty(SPAWN_CLEANUP_PROPERTY), false) !== true)
        return true;
    if (safe(() => world.getDynamicProperty(LANTERN_REPAIR_PROPERTY), false) !== true)
        return true;
    if (safe(() => world.getDynamicProperty(AUTHORED_DECOR_REPAIR_PROPERTY), false) !== true)
        return true;
    if (safe(() => world.getDynamicProperty(JUNGLE_PROPERTY), "") !== ENVIRONMENT_VERSION)
        return true;
    if (safe(() => world.getDynamicProperty(REQUESTED_COORDINATE_PATCH_PROPERTY), false) !== true)
        return true;
    if (safe(() => world.getDynamicProperty(DELHI_AUTHOR_AIR_PATCH_PROPERTY), false) !== true)
        return true;
    return false;
}
async function prepareEnvironment(player) {
    if (!mapIsReady())
        return;
    setKingdomWeatherClear();
    await runBackgroundPhase("spawn cleanup", () => cleanupSpawnRadiusOnce(player));
    await runBackgroundPhase("lantern repair", () => repairLanternsOnce(player));
    await runBackgroundPhase("authored decoration repair", () => repairAuthoredDecorationsOnce(player));
    await runBackgroundPhase("jungle perimeter", () => buildJungleTerrain(player));
    await runBackgroundPhase("requested coordinate patch", () => applyRequestedCoordinatePatchOnce());
    await runBackgroundPhase("Delhi author air patch", () => applyDelhiAuthorAirPatchOnce());
    sweepForbiddenKingdomMobs();
    setKingdomWeatherClear();
}
export async function ensureKingdomEnvironment(player) {
    if (environmentPromise) {
        await environmentPromise;
        return;
    }
    const current = prepareEnvironment(player);
    environmentPromise = current;
    try {
        await current;
    }
    finally {
        if (environmentPromise === current)
            environmentPromise = undefined;
    }
}
export function registerKingdomEnvironmentRuntime() {
    if (runtimeRegistered)
        return;
    runtimeRegistered = true;
    world.afterEvents.entitySpawn.subscribe((event) => {
        if (safe(() => event.entity.dimension.id, "") !== KINGDOM_DIMENSION_ID)
            return;
        const entity = event.entity;
        system.runTimeout(() => removeIfForbidden(entity), 2);
    });
    world.afterEvents.weatherChange?.subscribe((event) => {
        if (String(event.dimension) !== KINGDOM_DIMENSION_ID)
            return;
        if (String(event.newWeather) === String(WeatherType.Clear))
            return;
        system.run(() => setKingdomWeatherClear());
    });
    system.runInterval(() => {
        const hasPlayers = world.getPlayers().some((player) => safe(() => player.dimension.id, "") === KINGDOM_DIMENSION_ID);
        if (!hasPlayers)
            return;
        setKingdomWeatherClear();
        sweepForbiddenKingdomMobs();
        if (environmentNeedsWork()) {
            ensureKingdomEnvironment(undefined).catch((error) => logBackgroundIssue("automatic environment migration", error));
        }
    }, 100);
}
export const KINGDOM_BOUNDARY = {
    minX: OUTER_MIN_X + 1,
    maxX: OUTER_MAX_X - 1,
    minZ: OUTER_MIN_Z + 1,
    maxZ: OUTER_MAX_Z - 1,
};
