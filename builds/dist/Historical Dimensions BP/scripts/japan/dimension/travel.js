import { GameMode, system, world } from "@minecraft/server";
import { DIMENSION_ID, DYNAMIC, OVERWORLD_RETURN } from "../config.js";
import { logError } from "../diagnostics/logging.js";
import {
    ensureEntryTerrainReadyForTravel,
    initializeDimension,
    pauseBackgroundGenerationForTravel,
    previousTerrainOrigin,
    requestTerrainReset,
    resumeBackgroundGenerationAfterTravel,
    sengokuEntryPersistedReady,
    startGenerationHealthMonitor,
} from "../generation/coordinator.js";
import { arrivalTarget } from "../generation/arrival_runtime.js";
import { getTerrainOrigin, getNumber, setValue } from "../state/dynamic_properties.js";
import { BLOCKS } from "../runtime/blocks.js";
import { clearVolume, fillVolume } from "../generation/volume_writer.js";
import { makeChunkTickingAreaBounds } from "./ticking_bounds.js";
import { withLoadedChunksOrTickingArea } from "../runtime/ticking_areas.js";
import { markDimensionReady, trackPreparation } from "../../dimension/preparationProgress.js";
const RETURN_PROPERTY = "historyjam:sengoku_return_location";
const SENGOKU_XP_COST = 30;
function isPlayer(value) { return Boolean(value && typeof value === "object" && value.typeId === "minecraft:player"); }
function hasSengokuTravelLevels(player) {
    try {
        if (player.level < SENGOKU_XP_COST) {
            player.sendMessage(`§c[Sengoku] §fThis passage requires §e${SENGOKU_XP_COST} experience levels§f. You have §e${player.level}§f.`);
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
function saveReturn(player) { player.setDynamicProperty(RETURN_PROPERTY, JSON.stringify({ dimension: player.dimension.id, location: player.location })); }
function readReturn(player) { const raw = player.getDynamicProperty(RETURN_PROPERTY); if (typeof raw !== "string")
    return undefined; try {
    return JSON.parse(raw);
}
catch {
    return undefined;
} }
function safeAt(dimension, point) { const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z); const floor = dimension.getBlock({ x, y: y - 1, z })?.typeId, feet = dimension.getBlock({ x, y, z })?.typeId, head = dimension.getBlock({ x, y: y + 1, z })?.typeId; return Boolean(floor && floor !== BLOCKS.Air && floor !== BLOCKS.Water && feet === BLOCKS.Air && head === BLOCKS.Air); }
function findSafe(dimension, point) { const x = Math.floor(point.x), z = Math.floor(point.z); for (let y = Math.min(300, Math.max(-50, Math.floor(point.y) + 48)); y >= -50; y--) {
    const candidate = { x: x + 0.5, y, z: z + 0.5 };
    if (safeAt(dimension, candidate))
        return candidate;
} return undefined; }
function emergencyReturn(dimension) { const point = OVERWORLD_RETURN; fillVolume(dimension, { x: point.x - 2, y: point.y - 1, z: point.z - 2 }, { x: point.x + 2, y: point.y - 1, z: point.z + 2 }, BLOCKS.Cobblestone); clearVolume(dimension, { x: point.x - 2, y: point.y, z: point.z - 2 }, { x: point.x + 2, y: point.y + 3, z: point.z + 2 }); return { x: point.x + 0.5, y: point.y, z: point.z + 0.5 }; }
export async function withTravelArea(id, dimension, point, work) {
    const bounds = makeChunkTickingAreaBounds(point);
    return withLoadedChunksOrTickingArea({
        id, dimension, from: bounds.from, to: bounds.to,
        maxAttempts: 4,
        retryDelayTicks: 4,
        loadTimeoutTicks: 120,
        priority: "travel",
    }, work);
}
function nearPoint(a, b, tolerance = 4) {
    const dx = Number(a?.x ?? 0) - Number(b?.x ?? 0);
    const dy = Number(a?.y ?? 0) - Number(b?.y ?? 0);
    const dz = Number(a?.z ?? 0) - Number(b?.z ?? 0);
    return dx * dx + dy * dy + dz * dz <= tolerance * tolerance;
}
function distanceXZ(a, b) {
    return Math.hypot(Number(a?.x ?? 0) - Number(b?.x ?? 0), Number(a?.z ?? 0) - Number(b?.z ?? 0));
}
function isAtPreservedPreviousTerrain(player) {
    const previous = previousTerrainOrigin();
    if (!previous)
        return false;
    const current = getTerrainOrigin();
    return distanceXZ(player.location, previous) <= 800
        && distanceXZ(player.location, current) >= 1000;
}
async function teleportAndConfirm(player, dimension, target) {
    const options = {
        dimension,
        forceProvidedPositionOnDimensionChange: true,
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
        player.teleport(target, options);
        await system.waitTicks(1);
        if (player.isValid !== false
            && player.dimension.id === dimension.id
            && nearPoint(player.location, target))
            return true;
    }
    throw new Error(`teleport did not commit to ${dimension.id} near ${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`);
}
export async function enterSengoku(player) {
    try {
        const relocatingFromPrevious = player.dimension.id === DIMENSION_ID && isAtPreservedPreviousTerrain(player);
        if (player.dimension.id === DIMENSION_ID && !relocatingFromPrevious) {
            return;
        }
        await pauseBackgroundGenerationForTravel();
        try {
            const entryReady = sengokuEntryPersistedReady()
                ? await ensureEntryTerrainReadyForTravel()
                : await trackPreparation(player, DIMENSION_ID, ensureEntryTerrainReadyForTravel());
            if (!entryReady) {
                return;
            }
            markDimensionReady(DIMENSION_ID);
            if (!relocatingFromPrevious)
                saveReturn(player);
            const dimension = world.getDimension(DIMENSION_ID);
            const target = arrivalTarget(getTerrainOrigin(), getNumber(DYNAMIC.seed));
            await withTravelArea(`historyjam_entry_${player.id}`, dimension, target, async () => {
                if (!safeAt(dimension, target))
                    throw new Error("arrival verification failed before teleport");
                await teleportAndConfirm(player, dimension, target);
            });
        }
        finally {
            resumeBackgroundGenerationAfterTravel();
        }
    }
    catch (error) {
        logError("sengoku-entry-teleport-failed", error);
    }
}
export async function returnToOverworld(player) {
    const saved = readReturn(player);
    const dimension = world.getDimension(saved?.dimension ?? "minecraft:overworld");
    const target = saved?.location ?? OVERWORLD_RETURN;
    try {
        await withTravelArea(`historyjam_return_${player.id}`, dimension, target, async () => {
            const safe = findSafe(dimension, target) ?? emergencyReturn(dimension);
            await teleportAndConfirm(player, dimension, safe);
        });
        if (dimension.id === "minecraft:overworld") {
            try { player.setGameMode(GameMode.Survival); } catch {}
            system.runTimeout(() => {
                try { if (player.dimension.id === "minecraft:overworld") player.setGameMode(GameMode.Survival); } catch {}
            }, 20);
        }
        player.setDynamicProperty(RETURN_PROPERTY, undefined);
    }
    catch (error) {
        logError("return-teleport-failed", error);
    }
}
async function enterPreviousTerrain(player) {
    const previous = previousTerrainOrigin();
    if (!previous) {
        return;
    }
    try {
        saveReturn(player);
        const dimension = world.getDimension(DIMENSION_ID);
        const approximate = { x: previous.x + 0.5, y: 90, z: previous.z + 0.5 };
        await withTravelArea(`historyjam_previous_${player.id}`, dimension, approximate, async () => {
            const safe = findSafe(dimension, approximate);
            if (!safe)
                throw new Error("no safe location at previous origin");
            await teleportAndConfirm(player, dimension, safe);
        });
    }
    catch (error) {
        logError("previous-origin-travel", error);
    }
}
function handleReset(player) {
    const now = system.currentTick;
    const armed = getNumber(DYNAMIC.resetArmedTick, 0);
    if (armed > 0 && now - armed <= 1200) {
        setValue(DYNAMIC.resetArmedTick, undefined);
        requestTerrainReset();
        return;
    }
    setValue(DYNAMIC.resetArmedTick, now);
}
export function commandEnter(origin) { const source = origin.sourceEntity; system.run(() => { if (isPlayer(source) && hasSengokuTravelLevels(source))
    void enterSengoku(source); }); }
export function commandReturn(origin) { const source = origin.sourceEntity; system.run(() => { if (isPlayer(source))
    void returnToOverworld(source); }); }
export function commandStatus(origin) { const source = origin.sourceEntity; system.run(() => { startGenerationHealthMonitor(); }); }
export function commandRecover(origin) { const source = origin.sourceEntity; system.run(() => { if (isPlayer(source))
    void initializeDimension(true); }); }
export function commandPrevious(origin) { const source = origin.sourceEntity; system.run(() => { if (isPlayer(source))
    void enterPreviousTerrain(source); }); }
export function commandTerrainReset(origin) { const source = origin.sourceEntity; system.run(() => { if (isPlayer(source))
    handleReset(source); }); }
