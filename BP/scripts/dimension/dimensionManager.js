import { world, system, ItemStack, GameMode } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { DIMENSION_ID, activateStoryDimension, enterStory, isStoryComplete, } from "../story/storyRuntime.js";
import { ensureKingdomEnvironment, setKingdomWeatherClear } from "../environment/kingdomEnvironment.js";
import { EGYPT_DIMENSION_ID } from "../egypt/egyptRuntime.js";
import { enterEgyptDimension } from "../egypt/egyptDimensionManager.js";
import { enterSengoku, returnToOverworld as returnFromSengoku } from "../japan/dimension/travel.js";
const SENGOKU_DIMENSION_ID = "historyjam:sengoku_japan";
export const TRAVEL_BOOK_ID = "eoh:chronicle_of_delhi";
export const TRAVEL_XP_COSTS = { delhi: 10, egypt: 20, japan: 30 };
const BUILD_PROPERTY = "eoh:delhi_dimension_built_v31";
const BUILD_PROGRESS_PROPERTY = "eoh:delhi_dimension_build_progress_v31";
const BUILD_VERSION = "3.1.0";
const RETURN_X = "eoh:return_x";
const RETURN_Y = "eoh:return_y";
const RETURN_Z = "eoh:return_z";
const RETURN_SAVED = "eoh:return_saved";
const SPAWN = { x: 160.5, y: -59, z: 527.5 };
const SPAWN_FLOOR = { x: 160, y: -60, z: 527 };
const PALACE_ANCHOR = { x: 159, y: -58, z: 154 };
const DELHI_CLEAR_REGION = {
    min: { x: 158, y: -59, z: 487 },
    max: { x: 161, y: -58, z: 487 },
};
const SECTIONS = [
    { id: "eoh:section_x0_z0", origin: { x: 0, y: -64, z: 0 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z1", origin: { x: 0, y: -64, z: 64 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z2", origin: { x: 0, y: -64, z: 128 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z3", origin: { x: 0, y: -64, z: 192 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z4", origin: { x: 0, y: -64, z: 256 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z5", origin: { x: 0, y: -64, z: 320 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z6", origin: { x: 0, y: -64, z: 384 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z7", origin: { x: 0, y: -64, z: 448 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x0_z8", origin: { x: 0, y: -64, z: 512 }, size: { x: 64, y: 48, z: 32 } },
    { id: "eoh:section_x1_z0", origin: { x: 64, y: -64, z: 0 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z1", origin: { x: 64, y: -64, z: 64 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z2", origin: { x: 64, y: -64, z: 128 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z3", origin: { x: 64, y: -64, z: 192 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z4", origin: { x: 64, y: -64, z: 256 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z5", origin: { x: 64, y: -64, z: 320 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z6", origin: { x: 64, y: -64, z: 384 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z7", origin: { x: 64, y: -64, z: 448 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x1_z8", origin: { x: 64, y: -64, z: 512 }, size: { x: 64, y: 48, z: 32 } },
    { id: "eoh:section_x2_z0", origin: { x: 128, y: -64, z: 0 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z1", origin: { x: 128, y: -64, z: 64 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z2", origin: { x: 128, y: -64, z: 128 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z3", origin: { x: 128, y: -64, z: 192 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z4", origin: { x: 128, y: -64, z: 256 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z5", origin: { x: 128, y: -64, z: 320 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z6", origin: { x: 128, y: -64, z: 384 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z7", origin: { x: 128, y: -64, z: 448 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x2_z8", origin: { x: 128, y: -64, z: 512 }, size: { x: 64, y: 48, z: 32 } },
    { id: "eoh:section_x3_z0", origin: { x: 192, y: -64, z: 0 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z1", origin: { x: 192, y: -64, z: 64 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z2", origin: { x: 192, y: -64, z: 128 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z3", origin: { x: 192, y: -64, z: 192 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z4", origin: { x: 192, y: -64, z: 256 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z5", origin: { x: 192, y: -64, z: 320 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z6", origin: { x: 192, y: -64, z: 384 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z7", origin: { x: 192, y: -64, z: 448 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x3_z8", origin: { x: 192, y: -64, z: 512 }, size: { x: 64, y: 48, z: 32 } },
    { id: "eoh:section_x4_z0", origin: { x: 256, y: -64, z: 0 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z1", origin: { x: 256, y: -64, z: 64 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z2", origin: { x: 256, y: -64, z: 128 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z3", origin: { x: 256, y: -64, z: 192 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z4", origin: { x: 256, y: -64, z: 256 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z5", origin: { x: 256, y: -64, z: 320 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z6", origin: { x: 256, y: -64, z: 384 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z7", origin: { x: 256, y: -64, z: 448 }, size: { x: 64, y: 48, z: 64 } },
    { id: "eoh:section_x4_z8", origin: { x: 256, y: -64, z: 512 }, size: { x: 64, y: 48, z: 32 } },
];
let buildPromise;
const travelBusy = new Set();
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
function playerKey(player) {
    return String(safe(() => player.id, player.name) ?? player.name ?? "player");
}
function send(player, message) {
    safe(() => player.sendMessage(message));
}
function hasTravelLevels(player, levels) {
    const current = safe(() => player.level, -1);
    if (current < levels) {
        send(player, `§c[Chronicle] §fThis passage requires §e${levels} experience levels§f. You have §e${Math.max(0, current)}§f.`);
        return false;
    }
    return true;
}
async function enterWithXpCost(player, levels, enter) {
    if (!hasTravelLevels(player, levels))
        return;
    await enter();
}
function playerHasTravelBook(player) {
    const container = safe(() => player.getComponent("minecraft:inventory")?.container, undefined);
    if (!container)
        return false;
    for (let slot = 0; slot < container.size; slot += 1) {
        if (safe(() => container.getItem(slot)?.typeId, "") === TRAVEL_BOOK_ID)
            return true;
    }
    return false;
}
export function restoreTravelBookIfNeeded(player) {
    const currentDimension = safe(() => player.dimension.id, "");
    if (currentDimension !== DIMENSION_ID && currentDimension !== EGYPT_DIMENSION_ID && currentDimension !== SENGOKU_DIMENSION_ID)
        return;
    if (playerHasTravelBook(player))
        return;
    const container = safe(() => player.getComponent("minecraft:inventory")?.container, undefined);
    if (!container) {
        return;
    }
    const remainder = safe(() => container.addItem(new ItemStack(TRAVEL_BOOK_ID, 1)), undefined);
    if (remainder) {
        return;
    }
}
function isDimensionReady() {
    if (safe(() => world.getDynamicProperty(BUILD_PROPERTY), "") !== BUILD_VERSION)
        return false;
    const dim = safe(() => world.getDimension(DIMENSION_ID), undefined);
    if (!dim)
        return false;
    const floor = safe(() => dim.getBlock(SPAWN_FLOOR)?.typeId, "minecraft:air");
    const palace = safe(() => dim.getBlock(PALACE_ANCHOR)?.typeId, "minecraft:air");
    return floor !== "minecraft:air" && palace !== "minecraft:air";
}
function sectionFileName(section) {
    return section.id.slice(section.id.indexOf(":") + 1);
}
function structureCandidates(section, available) {
    const name = sectionFileName(section);
    const candidates = [
        section.id,
        `eoh:delhi/${name}`,
        `mystructure:${name}`,
        `mystructure:eoh/${name}`,
        `mystructure:eoh/delhi/${name}`,
    ];
    for (const id of available) {
        if (id === name || id.endsWith(`:${name}`) || id.endsWith(`/${name}`)) {
            candidates.unshift(id);
        }
    }
    return [...new Set(candidates)];
}
async function withTickingArea(section, index, callback) {
    const manager = safe(() => world.tickingAreaManager, undefined);
    const dim = world.getDimension(DIMENSION_ID);
    const id = `eoh_delhi_build_${index}`;
    let created = false;
    if (manager?.createTickingArea) {
        safe(() => manager.removeTickingArea(id));
        try {
            await manager.createTickingArea(id, {
                dimension: dim,
                from: {
                    x: section.origin.x,
                    y: section.origin.y,
                    z: section.origin.z,
                },
                to: {
                    x: section.origin.x + section.size.x - 1,
                    y: section.origin.y + section.size.y - 1,
                    z: section.origin.z + section.size.z - 1,
                },
            });
            created = true;
        }
        catch (error) {
        }
    }
    try {
        callback();
        await waitTicks(3);
    }
    finally {
        if (created)
            safe(() => manager.removeTickingArea(id));
    }
}
async function placeSection(manager, dim, section, index, available) {
    let lastError = "unknown structure placement error";
    for (const candidate of structureCandidates(section, available)) {
        try {
            await withTickingArea(section, index, () => {
                manager.place(candidate, dim, section.origin);
            });
            return candidate;
        }
        catch (error) {
            lastError = String(error);
        }
    }
    throw new Error(`Unable to place ${section.id}. Last error: ${lastError}`);
}
async function buildDimension(player) {
    if (isDimensionReady())
        return;
    const manager = world.structureManager;
    const availableIds = safe(() => manager.getPackStructureIds(), []) ?? [];
    const available = new Set(availableIds);
    const startIndexRaw = Number(safe(() => world.getDynamicProperty(BUILD_PROGRESS_PROPERTY), 0));
    const startIndex = Number.isInteger(startIndexRaw) && startIndexRaw >= 0 && startIndexRaw < SECTIONS.length
        ? startIndexRaw
        : 0;
    const dim = world.getDimension(DIMENSION_ID);
    for (let index = startIndex; index < SECTIONS.length; index += 1) {
        const section = SECTIONS[index];
        await placeSection(manager, dim, section, index, available);
        safe(() => world.setDynamicProperty(BUILD_PROGRESS_PROPERTY, index + 1));
    }
    await waitTicks(30);
    const floor = safe(() => dim.getBlock(SPAWN_FLOOR)?.typeId, "minecraft:air");
    const palace = safe(() => dim.getBlock(PALACE_ANCHOR)?.typeId, "minecraft:air");
    if (floor === "minecraft:air" || palace === "minecraft:air") {
        throw new Error(`Dimension verification failed (spawn=${floor}, palace=${palace})`);
    }
    safe(() => world.setDynamicProperty(BUILD_PROPERTY, BUILD_VERSION));
    safe(() => world.setDynamicProperty(BUILD_PROGRESS_PROPERTY, SECTIONS.length));
    safe(() => world.setDynamicProperty("eoh:spawn_cleanup_v31_exported_gravel_only", true));
    scheduleDelhiObstructionClear();
    activateStoryDimension();
}
function clearDelhiObstructionRegion() {
    const dim = safe(() => world.getDimension(DIMENSION_ID), undefined);
    if (!dim)
        return 0;
    let cleared = 0;
    for (let x = DELHI_CLEAR_REGION.min.x; x <= DELHI_CLEAR_REGION.max.x; x += 1) {
        for (let y = DELHI_CLEAR_REGION.min.y; y <= DELHI_CLEAR_REGION.max.y; y += 1) {
            for (let z = DELHI_CLEAR_REGION.min.z; z <= DELHI_CLEAR_REGION.max.z; z += 1) {
                const block = safe(() => dim.getBlock({ x, y, z }), undefined);
                if (block && block.typeId !== "minecraft:air") {
                    safe(() => block.setType("minecraft:air"));
                    cleared += 1;
                }
            }
        }
    }
    return cleared;
}
function scheduleDelhiObstructionClear() {
    clearDelhiObstructionRegion();
    system.runTimeout(() => clearDelhiObstructionRegion(), 20);
    system.runTimeout(() => clearDelhiObstructionRegion(), 60);
}
export async function prewarmDelhiDimension() {
    await ensureDimensionBuilt(undefined);
    scheduleDelhiObstructionClear();
}
async function ensureDimensionBuilt(player) {
    if (isDimensionReady())
        return;
    if (buildPromise) {
        await buildPromise;
        return;
    }
    const currentBuild = buildDimension(player);
    buildPromise = currentBuild;
    try {
        await currentBuild;
    }
    finally {
        if (buildPromise === currentBuild)
            buildPromise = undefined;
    }
}
function saveOverworldReturn(player) {
    const location = player.location;
    safe(() => player.setDynamicProperty(RETURN_X, Number(location.x)));
    safe(() => player.setDynamicProperty(RETURN_Y, Number(location.y)));
    safe(() => player.setDynamicProperty(RETURN_Z, Number(location.z)));
    safe(() => player.setDynamicProperty(RETURN_SAVED, true));
}
function getReturnLocation(player) {
    if (safe(() => player.getDynamicProperty(RETURN_SAVED), false) !== true) {
        return { x: 0.5, y: 80, z: 0.5 };
    }
    const x = Number(safe(() => player.getDynamicProperty(RETURN_X), 0.5));
    const y = Number(safe(() => player.getDynamicProperty(RETURN_Y), 80));
    const z = Number(safe(() => player.getDynamicProperty(RETURN_Z), 0.5));
    if (![x, y, z].every(Number.isFinite))
        return { x: 0.5, y: 80, z: 0.5 };
    return { x, y, z };
}
async function enterKingdom(player) {
    saveOverworldReturn(player);
    await ensureDimensionBuilt(player);
    scheduleDelhiObstructionClear();
    setKingdomWeatherClear();
    send(player, "§6[Chronicle] §fThe pages open into another age...");
    enterStory(player);
    system.runTimeout(() => {
        ensureKingdomEnvironment(undefined).catch(() => {
        });
    }, 20);
}
async function confirmReturn(player) {
    const form = new MessageFormData()
        .title("§6Chronicle of Delhi")
        .body("The Royal Seal has been restored. Return to the Overworld now? Your completed story progress will remain saved.")
        .button1("Stay in Delhi")
        .button2("Return to Overworld");
    const response = await form.show(player);
    if (response.canceled || response.selection !== 1)
        return;
    const overworld = world.getDimension("minecraft:overworld");
    const location = getReturnLocation(player);
    safe(() => player.teleport(location, { dimension: overworld }));
    safe(() => player.setSpawnPoint({ dimension: overworld, x: location.x, y: location.y, z: location.z }));
    safe(() => player.setGameMode(GameMode.Survival));
    system.runTimeout(() => safe(() => player.setGameMode(GameMode.Survival)), 20);
    send(player, "§6[Chronicle] §fYou have returned to the Overworld in Survival mode. Use the book again whenever you wish to revisit an adventure.");
}
export async function useTravelBook(player) {
    const key = playerKey(player);
    if (travelBusy.has(key))
        return;
    travelBusy.add(key);
    try {
        const current = safe(() => player.dimension.id, "");
        if (current === "minecraft:overworld") {
            const form = new ActionFormData()
                .title("§6Historical Dimension")
                .body(`Choose the historical adventure you want to enter. Each passage spends experience levels. Your current Overworld return location will be remembered.`)
                .button(`§eDelhi Sultanate\n§7The Stolen Signet\n§b${TRAVEL_XP_COSTS.delhi} XP levels`)
                .button(`§6New Kingdom Egypt\n§7The Black Sun Pyramid\n§b${TRAVEL_XP_COSTS.egypt} XP levels`)
                .button(`§cSengoku Period Japan\n§7Samurai Provinces\n§b${TRAVEL_XP_COSTS.japan} XP levels`);
            const response = await form.show(player);
            if (response.canceled)
                return;
            if (response.selection === 0)
                await enterWithXpCost(player, TRAVEL_XP_COSTS.delhi, () => enterKingdom(player));
            else if (response.selection === 1)
                await enterWithXpCost(player, TRAVEL_XP_COSTS.egypt, () => enterEgyptDimension(player));
            else if (response.selection === 2) {
                if (!hasTravelLevels(player, TRAVEL_XP_COSTS.japan))
                    return;
                await enterSengoku(player);
            }
            return;
        }
        if (current === DIMENSION_ID) {
            if (!isStoryComplete(player)) {
                send(player, "§c[Chronicle] §fThe return passage is sealed. Restore the Royal Seal and complete the story first.");
                return;
            }
            await confirmReturn(player);
            return;
        }
        if (current === EGYPT_DIMENSION_ID) {
            send(player, "§6[Chronicle] §fComplete the Black Sun expedition. Once every guardian of the pyramid has fallen, you will be offered passage back to the Overworld.");
            return;
        }
        if (current === SENGOKU_DIMENSION_ID) {
            await returnFromSengoku(player);
            return;
        }
        send(player, "§e[Chronicle] §fThe Chronicle can only open from the Overworld or inside a Historical Dimension adventure.");
    }
    catch (_error) {
    }
    finally {
        travelBusy.delete(key);
    }
}
export function registerDimensionAndTravelItem(event) {
    event.itemComponentRegistry.registerCustomComponent("eoh:dimension_travel", {
        onUse(itemEvent) {
            const player = itemEvent.source;
            system.run(() => {
                useTravelBook(player).catch(() => { });
            });
        },
    });
    event.dimensionRegistry.registerCustomDimension(DIMENSION_ID);
    event.dimensionRegistry.registerCustomDimension(EGYPT_DIMENSION_ID);
}
