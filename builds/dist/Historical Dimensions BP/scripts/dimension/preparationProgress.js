import { system } from "@minecraft/server";
const progress = new Map();
const DIMENSION_NAMES = {
    "eoh:delhi_sultanate": "Delhi Sultanate",
    "eoh:new_kingdom_egypt": "New Kingdom Egypt",
    "historyjam:sengoku_japan": "Sengoku Japan",
};
function safe(callback, fallback) {
    try {
        return callback();
    }
    catch {
        return fallback;
    }
}
export function setDimensionProgress(dimensionId, percent) {
    const value = Math.max(0, Math.min(100, Math.floor(percent)));
    const current = progress.get(dimensionId) ?? 0;
    if (value >= current)
        progress.set(dimensionId, value);
}
export function markDimensionReady(dimensionId) {
    progress.set(dimensionId, 100);
}
export function getDimensionProgress(dimensionId) {
    return progress.get(dimensionId) ?? 0;
}
export function trackPreparation(player, dimensionId, work) {
    const name = DIMENSION_NAMES[dimensionId] ?? dimensionId;
    safe(() => player.sendMessage(`§6[Chronicle] §f${name} is still being prepared. You will be teleported automatically once it is ready.`));
    let lastMilestone = 0;
    const interval = system.runInterval(() => {
        const percent = getDimensionProgress(dimensionId);
        safe(() => player.onScreenDisplay.setActionBar(`§6[Chronicle] §e${name}: §f${percent}% prepared`));
        const milestone = Math.floor(percent / 25) * 25;
        if (milestone > lastMilestone && milestone < 100) {
            lastMilestone = milestone;
            safe(() => player.sendMessage(`§7[Chronicle] ${name} preparation: §f${percent}%`));
        }
    }, 20);
    return Promise.resolve(work)
        .then((result) => {
        if (result === false) {
            safe(() => player.sendMessage(`§c[Chronicle] §f${name} is not ready yet (§e${getDimensionProgress(dimensionId)}%§f). It is still being prepared in the background. Try travelling again in a moment.`));
            return result;
        }
        safe(() => player.sendMessage(`§a[Chronicle] §f${name} is ready. Teleporting...`));
        return result;
    })
        .catch((error) => {
        safe(() => player.sendMessage(`§c[Chronicle] §f${name} preparation stopped at §e${getDimensionProgress(dimensionId)}%§f. Progress is saved and it will resume from there. Try travelling again in a moment.`));
        throw error;
    })
        .finally(() => {
        system.clearRun(interval);
        safe(() => player.onScreenDisplay.setActionBar(""));
    });
}
