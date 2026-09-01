import { CommandPermissionLevel, CustomCommandStatus, system } from "@minecraft/server";
import { DIMENSION_ID } from "../config.js";
import { logError, logInfo } from "../diagnostics/logging.js";
import { commandEnter, commandPrevious, commandRecover, commandReturn, commandStatus, commandTerrainReset } from "./travel.js";
export function registerStartupFeatures() {
    system.beforeEvents.startup.subscribe((event) => {
        try {
            event.dimensionRegistry.registerCustomDimension(DIMENSION_ID);
            logInfo(`Registered custom dimension ${DIMENSION_ID}.`);
        }
        catch (error) {
            logError("failed-dimension-registration", error);
        }
        const register = (name, description, permissionLevel, cheatsRequired, handler) => {
            event.customCommandRegistry.registerCommand({ name, description, permissionLevel, cheatsRequired }, (origin) => { handler(origin); return { status: CustomCommandStatus.Success }; });
        };
        register("historyjam:sengoku", "Enter Sengoku Period — Japan", CommandPermissionLevel.Any, false, commandEnter);
        register("historyjam:return", "Return from Sengoku Japan", CommandPermissionLevel.Any, false, commandReturn);
        register("historyjam:sengoku_recover", "Resume recoverable mixed-province terrain generation", CommandPermissionLevel.GameDirectors, true, commandRecover);
        register("historyjam:sengoku_previous", "Enter the preserved previous Sengoku terrain origin", CommandPermissionLevel.GameDirectors, true, commandPrevious);
        register("historyjam:sengoku_terrain_reset", "Arm or confirm a mixed-province terrain origin reset", CommandPermissionLevel.GameDirectors, true, commandTerrainReset);
    });
}
