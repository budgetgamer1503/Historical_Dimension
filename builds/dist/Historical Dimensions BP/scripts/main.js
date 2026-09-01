import { world, system, GameMode } from "@minecraft/server";
import { registerDimensionAndTravelItem, restoreTravelBookIfNeeded } from "./dimension/dimensionManager.js";
import { ensureKingdomEnvironment, KINGDOM_DIMENSION_ID, registerKingdomEnvironmentRuntime, setKingdomWeatherClear, } from "./environment/kingdomEnvironment.js";
import { EGYPT_DIMENSION_ID } from "./egypt/egyptRuntime.js";
import { keepEgyptClear } from "./egypt/egyptDimensionManager.js";
import "./japan/main.js";
const SENGOKU_DIMENSION_ID = "historyjam:sengoku_japan";
registerKingdomEnvironmentRuntime();
system.beforeEvents.startup.subscribe((event) => {
    registerDimensionAndTravelItem(event);
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
world.afterEvents.playerSpawn.subscribe((event) => {
    system.runTimeout(() => {
        const dimensionId = event.player.dimension.id;
        if (dimensionId === KINGDOM_DIMENSION_ID) {
            setKingdomWeatherClear();
            ensureKingdomEnvironment(undefined).catch(() => {
                // Background migration retries automatically while a player remains in the kingdom.
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
