import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

function controlByName(controls, name) {
  const control = controls.find((candidate) =>
    Object.keys(candidate).some((key) => key === name || key.startsWith(`${name}@`)),
  );
  if (!control) return undefined;
  const key = Object.keys(control).find((candidate) => candidate === name || candidate.startsWith(`${name}@`));
  return control[key];
}

const cutscene = await read("BP/scripts/story/cutsceneManager.js");
const catalog = await read("BP/scripts/japan/boss/catalog.js");
const cinematics = await read("BP/scripts/japan/boss/cinematics.js");
const hud = JSON.parse(await read("RP/ui/historyjam_boss_hud.json"));

const expectedDelhiCopy = [
  "§eThe southern gate is sealed",
  "The Royal Seal is gone. I have closed the gate until we know who took it.",
  "§eThe rebels are falling back to the palace",
  "We have one chance to warn the palace.",
  "§eThe outer road is in Zayd's hands",
  "Find Qadir in the throne hall and finish this.",
  "§cHe took the seal",
  "You will not leave this hall with the seal, or with your life.",
  "§6The Seal Returns",
  "§eThe city is safe again",
  "Delhi owes you its peace.",
];
for (const text of expectedDelhiCopy) {
  assert.ok(cutscene.includes(text), `missing Delhi scene copy: ${text}`);
}
assert.equal((cutscene.match(/\bticks:\s*\d+/g) ?? []).length, 8, "Delhi shot timing changed");
assert.ok(!cutscene.includes("The Royal Seal has vanished. No one leaves until the traitors are found."));

const catalogModule = await import(`data:text/javascript,${encodeURIComponent(catalog)}`);
const expectedBossCopy = {
  jade_storm_ronin: {
    intro: "A ronin with a storm at his back",
    phases: ["The wind cuts a little closer", "Jade lightning splits the field", "Raijin answers his final draw"],
    victoryTitle: "THE STORM BREAKS",
    victorySubtitle: "Jade Storm Ronin has fallen.",
  },
  tsukikage_ghost_samurai: {
    intro: "The moon hides more than one blade",
    phases: ["His shadow leaves no safe ground", "Eight blades move before you can turn", "The eclipse leaves no room for error"],
    victoryTitle: "THE SHADOW FADES",
    victorySubtitle: "Tsukikage Ghost Samurai has fallen.",
  },
  oni_blood_warlord: {
    intro: "Something hungry waits behind the mask",
    phases: ["Every wound feeds the warlord", "The ground shakes with his rage", "The warlord has nothing left to hold back"],
    victoryTitle: "THE WARLORD FALLS",
    victorySubtitle: "Oni Blood Warlord has fallen.",
  },
  seiryu_dragon_daimyo: {
    intro: "The dragon's tide reaches the shore",
    phases: ["The current turns beneath your feet", "The sky breaks into falling pillars", "Seiryu takes to the heavens"],
    victoryTitle: "THE DRAGON IS SILENT",
    victorySubtitle: "Seiryu Dragon Daimyo has fallen.",
  },
  kurogane_shogun: {
    intro: "The Shogun draws the line",
    phases: ["One mistake will cost you", "The black banner claims the field", "The Shogun brings every blade to bear"],
    victoryTitle: "THE IRON THRONE BREAKS",
    victorySubtitle: "Kurogane Shogun has fallen.",
  },
};

assert.equal(catalogModule.BOSSES.length, 5);
for (const boss of catalogModule.BOSSES) {
  const expected = expectedBossCopy[boss.key];
  assert.ok(expected, `unexpected boss key: ${boss.key}`);
  assert.equal(boss.zone.subtitle, expected.intro, `${boss.key}: intro copy`);
  assert.deepEqual(Object.values(boss.phaseTitles), expected.phases, `${boss.key}: phase copy`);
  assert.equal(boss.victoryTitle, expected.victoryTitle, `${boss.key}: victory title`);
  assert.equal(boss.victorySubtitle, expected.victorySubtitle, `${boss.key}: victory subtitle`);
}

assert.ok(cinematics.includes("def.victoryTitle ?? \"DUEL WON\""));
assert.ok(cinematics.includes("def.victorySubtitle ?? `${def.displayName} has fallen.`"));
assert.ok(cinematics.includes('2: "PHASE 2"'));
assert.ok(cinematics.includes('3: "PHASE 3"'));
assert.ok(cinematics.includes('4: "FINAL PHASE"'));
assert.ok(cinematics.includes("const techniques = context.def.phaseTitles ??"));
assert.ok(!cinematics.includes("SAMURAI DEFEATED"));
assert.ok(!cinematics.includes("A killing rhythm emerges"));
assert.ok(cinematics.includes("clearBossUi(player, uiToken), 37"));

const overlayControls = hud.overlay.controls;
const sceneCard = controlByName(overlayControls, "scene_card");
assert.equal(sceneCard.type, "panel");
assert.deepEqual(sceneCard.size, ["82%", 86]);
assert.deepEqual(sceneCard.offset, [0, 72]);
assert.equal(sceneCard.anchor_from, "top_middle");
assert.equal(sceneCard.anchor_to, "top_middle");
for (const name of ["accent_rule", "intro_kicker", "phase_kicker", "victory_kicker", "intro_text", "phase_text", "victory_text"]) {
  assert.ok(controlByName(sceneCard.controls, name), `missing HUD control: ${name}`);
}
for (const name of ["top_letterbox", "bottom_letterbox"]) {
  const bar = controlByName(overlayControls, name);
  assert.deepEqual(bar.size, ["100%", 24], `${name}: height`);
  assert.equal(bar.alpha, 0.82, `${name}: alpha`);
}

const mirroredFiles = [
  ["BP/scripts/story/cutsceneManager.js", "builds/dist/Historical Dimensions BP/scripts/story/cutsceneManager.js"],
  ["BP/scripts/japan/boss/catalog.js", "builds/dist/Historical Dimensions BP/scripts/japan/boss/catalog.js"],
  ["BP/scripts/japan/boss/cinematics.js", "builds/dist/Historical Dimensions BP/scripts/japan/boss/cinematics.js"],
  ["RP/ui/historyjam_boss_hud.json", "builds/dist/Historical Dimensions RP/ui/historyjam_boss_hud.json"],
];
for (const [sourcePath, distributionPath] of mirroredFiles) {
  assert.equal(await read(sourcePath), await read(distributionPath), `${sourcePath} is out of sync`);
}

console.log("cinematic scene contract passed");
