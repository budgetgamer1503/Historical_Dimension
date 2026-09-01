import { world } from "@minecraft/server";
const DIMENSION_ID = "eoh:delhi_sultanate";
const CHECKPOINT_PROPERTY = "eoh:delhi_checkpoint_stage_v34";
const CHECKPOINTS = {
    0: { name: "Southern Arrival", pos: { x: 160.5, y: -59, z: 527.5 } },
    1: { name: "Inside the Southern Gate", pos: { x: 160.5, y: -59, z: 516.5 } },
    2: { name: "Eastern Farm Road", pos: { x: 218.5, y: -59, z: 470.5 } },
    3: { name: "Northern Market", pos: { x: 57.5, y: -59, z: 111.5 } },
    4: { name: "Blacksmith Quarter", pos: { x: 82.5, y: -59, z: 61.5 } },
    5: { name: "Great Mosque Courtyard", pos: { x: 120.5, y: -59, z: 349.5 } },
    6: { name: "Mosque Defence Line", pos: { x: 120.5, y: -59, z: 382.5 } },
    7: { name: "Palace Gate", pos: { x: 152.5, y: -59, z: 239.5 } },
    8: { name: "Palace Defence Line", pos: { x: 152.5, y: -59, z: 239.5 } },
    9: { name: "Inner Palace Passage", pos: { x: 159.5, y: -57, z: 218.5 } },
    10: { name: "Throne Hall", pos: { x: 159.5, y: -57, z: 169.5 } },
    11: { name: "Sultan's Court", pos: { x: 159.5, y: -57, z: 149.5 } },
};
function safe(callback, fallback) {
    try {
        return callback();
    }
    catch (error) {
        return fallback;
    }
}
function checkpointForStage(stage) {
    const bounded = Math.max(0, Math.min(11, Math.floor(Number(stage) || 0)));
    return CHECKPOINTS[bounded] ?? CHECKPOINTS[0];
}
export function applyStageCheckpoint(player, stage, announce = true) {
    const checkpoint = checkpointForStage(stage);
    const dimension = world.getDimension(DIMENSION_ID);
    const previous = Number(safe(() => player.getDynamicProperty(CHECKPOINT_PROPERTY), -1));
    safe(() => player.setSpawnPoint({
        dimension,
        x: checkpoint.pos.x,
        y: checkpoint.pos.y,
        z: checkpoint.pos.z,
    }));
    safe(() => player.setDynamicProperty(CHECKPOINT_PROPERTY, Math.floor(stage)));
    if (announce && previous !== Math.floor(stage)) {
        safe(() => player.sendMessage(`§a[Checkpoint] §f${checkpoint.name} is now your respawn point.`));
        safe(() => player.playSound("random.orb", { volume: 0.55, pitch: 1.25 }));
    }
}
export function restoreStageCheckpoint(player, stage) {
    applyStageCheckpoint(player, stage, false);
}
