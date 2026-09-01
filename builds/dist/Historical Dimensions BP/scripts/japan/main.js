import { system, world } from "@minecraft/server";
import { registerStartupFeatures } from "./dimension/register.js";
import { handlePlayerDimensionChange, handlePlayerLeave, initializeDimension, requestSengokuTerrainStreaming, startGenerationHealthMonitor } from "./generation/coordinator.js";
import { logError, logInfo } from "./diagnostics/logging.js";
import { clearManagedTickingAreas } from "./runtime/ticking_areas.js";
import { registerBossRuntime } from "./boss/runtime.js";
import { DIMENSION_ID } from "./config.js";
import { registerOuterTerrainStreaming } from "./generation/outer_streaming_runtime.js";
registerStartupFeatures();
registerBossRuntime();
registerOuterTerrainStreaming();
function isEngineInterruption(error) {
    const text = String(error).toLowerCase();
    return text.includes("internalerror: interrupted") || text === "interrupted" || text.includes("script interrupted");
}
world.afterEvents.playerDimensionChange.subscribe((event) => {
    try {
        handlePlayerDimensionChange(event);
    }
    catch (error) {
        logError("dimension-change-generation-resume", error);
    }
});
world.afterEvents.playerLeave.subscribe((event) => {
    try {
        handlePlayerLeave(event);
    }
    catch (error) {
        logError("player-leave-generation-pause", error);
    }
});
world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn)
        return;
    system.run(() => {
        try {
            const player = event.player;
            if (player.dimension.id === DIMENSION_ID)
                requestSengokuTerrainStreaming(player.id, 1);
        }
        catch (error) {
            logError("initial-player-spawn-terrain-resume", error);
        }
    });
});
world.afterEvents.worldLoad.subscribe(() => {
    system.run(() => {
        void (async () => {
            try {
                await clearManagedTickingAreas();
            }
            catch (error) {
                logError("startup-ticking-area-cleanup", error);
            }
            startGenerationHealthMonitor();
        })().catch((error) => {
            if (isEngineInterruption(error))
                logInfo("Initialization was interrupted by world shutdown or pack reload; generation will resume from persisted ledgers.");
            else
                logError("initialization-unhandled", error);
        });
    });
});
