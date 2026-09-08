import { system, EasingType, InputPermissionCategory, } from "@minecraft/server";
const running = new Set();
function safe(callback, fallback) {
    try {
        return callback();
    }
    catch (error) {
        return fallback;
    }
}
function waitTicks(ticks) {
    return new Promise((resolve) => system.runTimeout(resolve, Math.max(1, ticks)));
}
function playerKey(player) {
    return String(safe(() => player.id, safe(() => player.name, "player")));
}
function setInput(player, enabled) {
    safe(() => player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, enabled));
    safe(() => player.inputPermissions.setPermissionCategory(InputPermissionCategory.Camera, enabled));
}
export function restorePlayerControl(player) {
    setInput(player, true);
    safe(() => player.camera.clear());
}
async function playCutsceneOnce(player, sceneId, shots) {
    const tag = `eoh_delhi_cutscene_${sceneId}_v34`;
    const key = playerKey(player);
    if (running.has(key) || safe(() => player.getTags().includes(tag), false))
        return false;
    running.add(key);
    safe(() => player.addTag(tag));
    try {
        setInput(player, false);
        safe(() => player.camera.fade({
            fadeColor: { red: 0, green: 0, blue: 0 },
            fadeTime: { fadeInTime: 0.4, holdTime: 0.25, fadeOutTime: 0.45 },
        }));
        await waitTicks(10);
        for (const shot of shots) {
            safe(() => player.camera.setCamera("minecraft:free", {
                location: shot.location,
                facingLocation: shot.facingLocation,
                easeOptions: {
                    easeTime: Math.max(0.25, shot.ticks / 40),
                    easeType: EasingType.InOutSine,
                },
            }));
            if (shot.title) {
                safe(() => player.onScreenDisplay.setTitle(shot.title, {
                    subtitle: shot.subtitle ?? "",
                    fadeInDuration: 5,
                    stayDuration: Math.max(20, shot.ticks - 10),
                    fadeOutDuration: 10,
                }));
            }
            if (shot.message)
                safe(() => player.sendMessage(shot.message));
            await waitTicks(shot.ticks);
        }
        safe(() => player.camera.fade({
            fadeColor: { red: 0, green: 0, blue: 0 },
            fadeTime: { fadeInTime: 0.3, holdTime: 0.15, fadeOutTime: 0.35 },
        }));
        await waitTicks(8);
        return true;
    }
    catch (error) {
        safe(() => player.sendMessage("§7The cinematic view could not be displayed, but story progress continues."));
        return false;
    }
    finally {
        restorePlayerControl(player);
        running.delete(key);
    }
}
export function playIntroCutscene(player) {
    return playCutsceneOnce(player, "intro", [
        {
            location: { x: 160.5, y: -42, z: 553.5 },
            facingLocation: { x: 160.5, y: -56, z: 523.5 },
            ticks: 70,
            title: "§6Delhi Sultanate",
            subtitle: "§eThe sealed southern gate",
            message: "§6Captain Zayd: §fThe Royal Seal has vanished. No one leaves until the traitors are found.",
        },
        {
            location: { x: 176.5, y: -47, z: 505.5 },
            facingLocation: { x: 160.5, y: -58, z: 495.5 },
            ticks: 60,
            title: "§eA City Under Suspicion",
            subtitle: "§fBegin with the witnesses near the gate",
        },
    ]);
}
export function playMosqueVictoryCutscene(player) {
    return playCutsceneOnce(player, "mosque_victory", [
        {
            location: { x: 120.5, y: -43, z: 389.5 },
            facingLocation: { x: 120.5, y: -57, z: 360.5 },
            ticks: 65,
            title: "§6Mosque Square Defended",
            subtitle: "§eThe rebels retreat toward the palace",
            message: "§6Scholar Safiya: §fThe decree is safe. Qadir's surviving soldiers are withdrawing north.",
        },
        {
            location: { x: 160.5, y: -42, z: 273.5 },
            facingLocation: { x: 160.5, y: -58, z: 227.5 },
            ticks: 60,
            title: "§cThe Palace Road",
            subtitle: "§fCaptain Zayd is waiting",
        },
    ]);
}
export function playPalaceOpeningCutscene(player) {
    return playCutsceneOnce(player, "palace_opening", [
        {
            location: { x: 159.5, y: -48, z: 238.5 },
            facingLocation: { x: 159.5, y: -57, z: 212.5 },
            ticks: 70,
            title: "§6The Inner Palace Opens",
            subtitle: "§eThe road to the throne hall is clear",
            message: "§6Captain Zayd: §fMy blue soldiers cannot follow you inside. They must protect the wounded and hold the outer road. From here, you face Qadir alone.",
        },
    ]);
}
export function playBossIntroCutscene(player) {
    return playCutsceneOnce(player, "qadir_intro", [
        {
            location: { x: 159.5, y: -47, z: 176.5 },
            facingLocation: { x: 159.5, y: -57, z: 154.5 },
            ticks: 70,
            title: "§4Commander Qadir",
            subtitle: "§cThe Royal Seal belongs to me",
            message: "§4Commander Qadir: §fZayd sent you without his blue guard? Good. The throne hall will become your tomb.",
        },
    ]);
}
export function playEndingCutscene(player) {
    return playCutsceneOnce(player, "ending", [
        {
            location: { x: 159.5, y: -45, z: 177.5 },
            facingLocation: { x: 159.5, y: -57, z: 144.5 },
            ticks: 70,
            title: "§6Defender of Delhi",
            subtitle: "§eThe Royal Seal is restored",
            message: "§6Sultan Alauddin Khalji: §fThe city remembers those who protected its people when the palace guard could not.",
        },
        {
            location: { x: 159.5, y: -39, z: 205.5 },
            facingLocation: { x: 159.5, y: -57, z: 154.5 },
            ticks: 55,
            title: "§aThe Road Home",
            subtitle: "§fThe Chronicle can now return you to the Overworld",
        },
    ]);
}
