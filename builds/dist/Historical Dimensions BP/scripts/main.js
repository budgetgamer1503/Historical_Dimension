import { world, system, GameMode } from "@minecraft/server";
import { prewarmDelhiDimension, registerDimensionAndTravelItem, restoreTravelBookIfNeeded } from "./dimension/dimensionManager.js";
import { ensureKingdomEnvironment, KINGDOM_DIMENSION_ID, registerKingdomEnvironmentRuntime, setKingdomWeatherClear, } from "./environment/kingdomEnvironment.js";
import { EGYPT_DIMENSION_ID } from "./egypt/egyptRuntime.js";
import { ensureEgyptDimensionBuilt, keepEgyptClear } from "./egypt/egyptDimensionManager.js";
import { ensureEntryTerrainReadyForTravel } from "./japan/generation/coordinator.js";
import { markDimensionReady } from "./dimension/preparationProgress.js";
import "./japan/main.js";
const SENGOKU_DIMENSION_ID = "historyjam:sengoku_japan";
const PREWARM_SETTLE_TICKS = 200;
const PREWARM_GAP_TICKS = 100;
const PREWARM_RETRY_DELAY_TICKS = 600;
let prewarmStarted = false;
registerKingdomEnvironmentRuntime();
system.beforeEvents.startup.subscribe((event) => {
    registerDimensionAndTravelItem(event);
});
function prewarmWaitTicks(ticks) {
    return new Promise((resolve) => system.runTimeout(resolve, ticks));
}
function playersInDimension(dimensionId) {
    return world.getPlayers().some((player) => {
        try {
            return player.dimension.id === dimensionId;
        }
        catch {
            return false;
        }
    });
}
async function prewarmDimension(dimensionId, task) {
    if (playersInDimension(dimensionId))
        return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const result = await task();
            if (result !== false) {
                markDimensionReady(dimensionId);
                return;
            }
        }
        catch {
        }
        await prewarmWaitTicks(PREWARM_RETRY_DELAY_TICKS);
    }
}
async function prewarmSengokuEntry() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            if (await ensureEntryTerrainReadyForTravel())
                return true;
        }
        catch {
        }
        await prewarmWaitTicks(PREWARM_RETRY_DELAY_TICKS);
    }
    return false;
}
function startDimensionPrewarm() {
    if (prewarmStarted)
        return;
    prewarmStarted = true;
    void (async () => {
        await prewarmWaitTicks(PREWARM_SETTLE_TICKS);
        await prewarmDimension(EGYPT_DIMENSION_ID, ensureEgyptDimensionBuilt);
        await prewarmWaitTicks(PREWARM_GAP_TICKS);
        await prewarmDimension(KINGDOM_DIMENSION_ID, prewarmDelhiDimension);
        await prewarmWaitTicks(PREWARM_GAP_TICKS);
        await prewarmDimension(SENGOKU_DIMENSION_ID, prewarmSengokuEntry);
    })();
}
world.afterEvents.worldLoad?.subscribe(() => {
    startDimensionPrewarm();
});
world.afterEvents.playerSpawn.subscribe((event) => {
    if (event.initialSpawn)
        startDimensionPrewarm();
    system.runTimeout(() => {
        const dimensionId = event.player.dimension.id;
        if (dimensionId === KINGDOM_DIMENSION_ID) {
            setKingdomWeatherClear();
            ensureKingdomEnvironment(undefined).catch(() => {
            });
            if (!event.initialSpawn)
                restoreTravelBookIfNeeded(event.player);
            return;
        }
        if (dimensionId === EGYPT_DIMENSION_ID) {
            keepEgyptClear();
            if (!event.initialSpawn)
                restoreTravelBookIfNeeded(event.player);
            return;
        }
        if (dimensionId === SENGOKU_DIMENSION_ID) {
            if (!event.initialSpawn)
                restoreTravelBookIfNeeded(event.player);
            return;
        }
    }, 20);
});
function forceOverworldSurvival(player) {
    try {
        player.setGameMode(GameMode.Survival);
    }
    catch { }
    system.runTimeout(() => {
        try {
            if (player.dimension.id === "minecraft:overworld")
                player.setGameMode(GameMode.Survival);
        }
        catch { }
    }, 20);
}
world.afterEvents.playerDimensionChange.subscribe((event) => {
    const from = event.fromDimension?.id;
    const to = event.toDimension?.id;
    if (to === "minecraft:overworld" && (from === KINGDOM_DIMENSION_ID || from === EGYPT_DIMENSION_ID || from === SENGOKU_DIMENSION_ID)) {
        forceOverworldSurvival(event.player);
    }
    if (to === EGYPT_DIMENSION_ID)
        keepEgyptClear();
});
