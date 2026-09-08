# Cinematic scene text and boss HUD implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Delhi and Sengoku cinematic copy and make the Sengoku boss scene HUD readable and cinematic on mobile while preserving story, combat, camera, and cleanup behavior.

**Architecture:** Keep `ScreenDisplay.setTitle` as the transport for the boss HUD. Store boss-specific presentation copy beside each boss definition in `catalog.js`, let `cinematics.js` select that copy, and keep the resource-pack overlay responsible only for layout and binding. Mirror the four runtime/UI files into the committed `builds/dist` packs after the source files pass validation.

**Tech Stack:** Minecraft Bedrock Script API JavaScript, Bedrock JSON UI, GitHub Contents and Git Data APIs, Node.js syntax checks, Python JSON validation, and the repository's GitHub Actions validation commands.

## Global Constraints

- Preserve the existing `HJBOSS_` prefix protocol and token-safe cleanup in `cinematics.js`.
- Do not change camera points, camera easing, combat abilities, phase thresholds, story stages, entity IDs, or reward logic.
- Use only the existing `textures/ui/Black` texture in the new HUD.
- Keep new player-facing copy short, concrete, and free of em dashes and en dashes.
- Keep `RP/ui/hud_screen.json` and `RP/ui/_ui_defs.json` unchanged unless a validator proves that registration is incomplete.
- Keep root source packs and `builds/dist` copies byte-for-byte identical for every mirrored file.
- Run Node syntax checks and JSON validation before creating the implementation commit.
- Static validation cannot prove exact rendering on every Bedrock client; report that remaining runtime limitation.

---

### Task 1: Rewrite the Delhi cinematic copy

**Files:**

- Modify: `BP/scripts/story/cutsceneManager.js`
- Mirror: `builds/dist/Historical Dimensions BP/scripts/story/cutsceneManager.js`
- Test: Node syntax check and a string-content assertion

**Interfaces:**

- Consumes: The existing `playCutsceneOnce(player, sceneId, shots)` shot objects.
- Produces: The same exported cutscene functions and the same shot locations and durations, with only title, subtitle, and message strings changed.

- [ ] **Step 1: Record the protected camera and timing fields**

Before editing, extract every `location`, `facingLocation`, and `ticks` value from the root source file. The edited file must retain the following shot sequence:

```text
intro: 70 ticks, 60 ticks
mosque_victory: 65 ticks, 60 ticks
palace_opening: 70 ticks
qadir_intro: 70 ticks
ending: 70 ticks, 55 ticks
```

- [ ] **Step 2: Replace only the scene copy**

Use these exact scene strings:

```js
// intro
title: "§6Delhi Sultanate",
subtitle: "§eThe southern gate is sealed",
message: "§6Captain Zayd: §fThe Royal Seal is gone. I have closed the gate until we know who took it. Start with the people who saw what happened.",

// intro follow-up
title: "§eA City Under Suspicion",
subtitle: "§fQuestion the witnesses by the gate",

// mosque victory
title: "§6The Mosque Square Holds",
subtitle: "§eThe rebels are falling back to the palace",
message: "§6Scholar Safiya: §fThe decree is safe. Qadir's men are pulling back north. We have one chance to warn the palace.",

// palace opening
title: "§6Inside the Palace",
subtitle: "§eThe outer road is in Zayd's hands",
message: "§6Captain Zayd: §fMy soldiers will hold the road and get the wounded to safety. I cannot take them inside. Find Qadir in the throne hall and finish this.",

// Qadir intro
title: "§4Commander Qadir",
subtitle: "§cHe took the seal",
message: "§4Commander Qadir: §fZayd sent you alone. Sensible of him. You will not leave this hall with the seal, or with your life.",

// ending
title: "§6The Seal Returns",
subtitle: "§eThe city is safe again",
message: "§6Sultan Alauddin Khalji: §fYou listened to the people and stood your ground when the palace was under attack. Delhi owes you its peace.",

// ending follow-up
title: "§aThe Road Home",
subtitle: "§fThe Chronicle can take you back to the Overworld",
```

- [ ] **Step 3: Verify the file**

Run:

```bash
node --check "BP/scripts/story/cutsceneManager.js"
```

Expected result: exit code 0 and no syntax error.

Run a content check that asserts all six scene titles above are present and the old phrase `A killing rhythm emerges` is not present in this file. Also assert that the protected shot count remains ten.

- [ ] **Step 4: Mirror the source file**

Copy the exact resulting UTF-8 content into:

```text
builds/dist/Historical Dimensions BP/scripts/story/cutsceneManager.js
```

Run:

```bash
cmp "BP/scripts/story/cutsceneManager.js" "builds/dist/Historical Dimensions BP/scripts/story/cutsceneManager.js"
```

Expected result: exit code 0.

- [ ] **Step 5: Commit the Delhi copy change**

Create one commit on the feature branch with message:

```text
feat: humanize Delhi cinematic dialogue
```

---

### Task 2: Add boss-specific Sengoku presentation copy

**Files:**

- Modify: `BP/scripts/japan/boss/catalog.js`
- Mirror: `builds/dist/Historical Dimensions BP/scripts/japan/boss/catalog.js`
- Test: Node import and metadata assertions

**Interfaces:**

- Consumes: Existing boss definitions exported through `BOSSES`, `BOSS_BY_ID`, and `BOSS_BY_KEY`.
- Produces: Existing boss definitions with `zone.subtitle`, `phaseTitles`, `victoryTitle`, and `victorySubtitle` presentation fields.

- [ ] **Step 1: Add metadata beside each boss definition**

Keep each existing `zone` object and ability list unchanged except for the `subtitle` value. Add these fields to each boss object after `zone`:

```js
phaseTitles: Object.freeze({
  2: "...",
  3: "...",
  4: "...",
}),
victoryTitle: "...",
victorySubtitle: "...",
```

Use these exact values:

```text
jade_storm_ronin
  zone.subtitle: A ronin with a storm at his back
  phase 2: The wind cuts a little closer
  phase 3: Jade lightning splits the field
  phase 4: Raijin answers his final draw
  victoryTitle: THE STORM BREAKS
  victorySubtitle: Jade Storm Ronin has fallen.

tsukikage_ghost_samurai
  zone.subtitle: The moon hides more than one blade
  phase 2: His shadow leaves no safe ground
  phase 3: Eight blades move before you can turn
  phase 4: The eclipse leaves no room for error
  victoryTitle: THE SHADOW FADES
  victorySubtitle: Tsukikage Ghost Samurai has fallen.

oni_blood_warlord
  zone.subtitle: Something hungry waits behind the mask
  phase 2: Every wound feeds the warlord
  phase 3: The ground shakes with his rage
  phase 4: The warlord has nothing left to hold back
  victoryTitle: THE WARLORD FALLS
  victorySubtitle: Oni Blood Warlord has fallen.

seiryu_dragon_daimyo
  zone.subtitle: The dragon's tide reaches the shore
  phase 2: The current turns beneath your feet
  phase 3: The sky breaks into falling pillars
  phase 4: Seiryu takes to the heavens
  victoryTitle: THE DRAGON IS SILENT
  victorySubtitle: Seiryu Dragon Daimyo has fallen.

kurogane_shogun
  zone.subtitle: The Shogun draws the line
  phase 2: One mistake will cost you
  phase 3: The black banner claims the field
  phase 4: The Shogun brings every blade to bear
  victoryTitle: THE IRON THRONE BREAKS
  victorySubtitle: Kurogane Shogun has fallen.
```

- [ ] **Step 2: Verify all boss metadata**

Run:

```bash
node --input-type=module <<'NODE'
import { BOSSES } from "./BP/scripts/japan/boss/catalog.js";

if (BOSSES.length !== 5) throw new Error("expected five Sengoku bosses");
for (const boss of BOSSES) {
  if (!boss.zone.subtitle) throw new Error(`${boss.key}: missing intro subtitle`);
  for (const phase of [2, 3, 4]) {
    if (!boss.phaseTitles?.[phase]) throw new Error(`${boss.key}: missing phase ${phase} copy`);
  }
  if (!boss.victoryTitle || !boss.victorySubtitle) {
    throw new Error(`${boss.key}: missing victory copy`);
  }
}
console.log("validated five boss presentation records");
NODE
```

Expected result: the validation message and exit code 0.

- [ ] **Step 3: Run JavaScript syntax validation**

Run:

```bash
node --check "BP/scripts/japan/boss/catalog.js"
```

Expected result: exit code 0.

- [ ] **Step 4: Mirror and compare**

Copy the exact resulting content into the distribution catalog and run:

```bash
cmp "BP/scripts/japan/boss/catalog.js" "builds/dist/Historical Dimensions BP/scripts/japan/boss/catalog.js"
```

Expected result: exit code 0.

- [ ] **Step 5: Commit the boss metadata change**

Create one commit on the feature branch with message:

```text
feat: add grounded Sengoku boss scene copy
```

---

### Task 3: Connect the new copy to cinematic presentation

**Files:**

- Modify: `BP/scripts/japan/boss/cinematics.js`
- Mirror: `builds/dist/Historical Dimensions BP/scripts/japan/boss/cinematics.js`
- Test: Node syntax check and static behavior assertions

**Interfaces:**

- Consumes: `def.zone.subtitle`, `def.phaseTitles`, `def.victoryTitle`, and `def.victorySubtitle`.
- Produces: The same `playBossIntro`, `playBossVictory`, `showPhasePresentation`, and cleanup behavior.

- [ ] **Step 1: Replace the victory header and subtitle selection**

Inside `playVictoryForPlayer`, replace:

```js
showBossUi(player, "victory", "SAMURAI DEFEATED", def.displayName, durationTicks);
```

with:

```js
showBossUi(
  player,
  "victory",
  def.victoryTitle ?? "DUEL WON",
  def.victorySubtitle ?? `${def.displayName} has fallen.`,
  durationTicks,
);
```

- [ ] **Step 2: Replace the generic phase labels and techniques**

Inside `showPhasePresentation`, replace the two local maps with:

```js
const labels = {
  2: "PHASE 2",
  3: "PHASE 3",
  4: "FINAL PHASE",
};
const techniques = context.def.phaseTitles ?? {
  2: "The duel intensifies",
  3: "The fight grows more dangerous",
  4: "No restraint remains",
};
```

Keep the `showBossUi` call and participant loop intact. Keep the cleanup timeout token-safe.

- [ ] **Step 3: Make the phase card readable**

Change the phase presentation duration from `28` ticks to `36` ticks and the cleanup timeout from `29` ticks to `37` ticks. This gives the new two-line card enough time to be read without changing the encounter state machine or any attack timing.

- [ ] **Step 4: Verify JavaScript behavior**

Run:

```bash
node --check "BP/scripts/japan/boss/cinematics.js"
```

Expected result: exit code 0.

Run a source assertion that checks:

- `SAMURAI DEFEATED` is absent.
- `PHASE 2`, `PHASE 3`, and `FINAL PHASE` are present.
- `clearBossUi(player, uiToken)` remains in both cinematic `finally` blocks.
- `setTitle(buildBossUiPayload(kind, title, subtitle)` remains the presentation transport.

- [ ] **Step 5: Mirror and compare**

Copy the exact resulting content into the distribution cinematic file and run:

```bash
cmp "BP/scripts/japan/boss/cinematics.js" "builds/dist/Historical Dimensions BP/scripts/japan/boss/cinematics.js"
```

Expected result: exit code 0.

- [ ] **Step 6: Commit the cinematic wiring change**

Create one commit on the feature branch with message:

```text
feat: wire boss scenes to humanized presentation copy
```

---

### Task 4: Redesign the boss HUD layout

**Files:**

- Modify: `RP/ui/historyjam_boss_hud.json`
- Mirror: `builds/dist/Historical Dimensions RP/ui/historyjam_boss_hud.json`
- Test: JSON parsing and portable JSON UI audit

**Interfaces:**

- Consumes: The existing global `#hud_title_text_string` binding and `HJBOSS_INTRO_`, `HJBOSS_PHASE_`, and `HJBOSS_VICTORY_` prefixes.
- Produces: The same visible/hidden behavior with an upper-third scene card and no new runtime bindings.

- [ ] **Step 1: Preserve the binding contract**

Retain these exact behaviors in the edited file:

- `prefixed_label` binds `#hud_title_text_string` globally.
- The visible expression checks whether the value starts with the instance's prefix.
- The text expression strips the prefix and prepends `§r`.
- `overlay` hides unless the global title starts with `HJBOSS_`.

- [ ] **Step 2: Build the upper-third card**

Use a panel anchored from and to `top_middle`, with size `["82%", 86]` and offset `[0, 72]`. Its controls must be ordered from back to front:

1. `textures/ui/Black` card background at alpha `0.58`, layer 80.
2. A full-width black scene scrim at alpha `0.18`, layer 80.
3. A two-pixel tinted rule at the top of the card, layer 81.
4. A static kicker label whose visibility is bound to the appropriate prefix:
   - `BOSS ENCOUNTER` for intro
   - `PHASE SHIFT` for phase
   - `DUEL WON` for victory
5. The existing bound title label, centered with an explicit height of at least 54 pixels, `MinecraftTen`, `font_scale_factor` 1.0, white text, and shadow enabled.

Use only documented properties already used in the repository or covered by the Bedrock JSON UI reference: `panel`, `image`, `label`, `size`, `offset`, `anchor_from`, `anchor_to`, `alpha`, `color`, `layer`, `text`, `text_alignment`, and `bindings`.

- [ ] **Step 3: Reduce the letterbox height**

Keep both letterbox images using `textures/ui/Black`, but change their height from 34 to 24 and their alpha from 0.92 to 0.82. This keeps the cinematic framing while showing more of the arena on mobile.

- [ ] **Step 4: Keep the three prefix variants**

Keep separate inherited instances for intro, phase, and victory so each uses the correct prefix and kicker visibility. Do not introduce string parsing expressions for splitting the title and subtitle into separate bindings.

- [ ] **Step 5: Validate the HUD JSON**

Run:

```bash
python - <<'PY'
import json
from pathlib import Path
path = Path("RP/ui/historyjam_boss_hud.json")
data = json.loads(path.read_text(encoding="utf-8"))
assert data["namespace"] == "historyjam_boss_hud"
assert "prefixed_label" in data
assert "overlay" in data
assert data["prefixed_label"]["bindings"][0]["binding_name"] == "#hud_title_text_string"
print("validated boss HUD JSON")
PY
```

Expected result: the validation message and exit code 0.

Run the portable auditor from the installed MCBE JSON UI skill:

```bash
python scripts/json_ui_audit.py "RP/ui/historyjam_boss_hud.json" --strict
```

Expected result: no errors. Preserve any source-confirmed warnings in the final report if the auditor reports a client-runtime limitation.

- [ ] **Step 6: Mirror and compare**

Copy the exact resulting content into the distribution HUD file and run:

```bash
cmp "RP/ui/historyjam_boss_hud.json" "builds/dist/Historical Dimensions RP/ui/historyjam_boss_hud.json"
```

Expected result: exit code 0.

- [ ] **Step 7: Commit the HUD change**

Create one commit on the feature branch with message:

```text
feat: improve Sengoku cinematic HUD
```

---

### Task 5: Run the complete repository validation

**Files:**

- Test: `.github/workflows/bedrock-addon-check.yml` commands against the source packs
- Test: `.github/workflows/sengoku-fx-validation.yml` JavaScript and camera checks

- [ ] **Step 1: Validate every edited JavaScript file**

Run:

```bash
node --check "BP/scripts/story/cutsceneManager.js"
node --check "BP/scripts/japan/boss/catalog.js"
node --check "BP/scripts/japan/boss/cinematics.js"
```

Expected result: all three commands exit with code 0.

- [ ] **Step 2: Validate all source-pack JSON**

Run a Python walk over `BP` and `RP` that parses every `.json` file with UTF-8 decoding. The walk must report the number of parsed files and stop on the first JSON error.

Expected result: every source-pack JSON file parses successfully.

- [ ] **Step 3: Run the existing camera orientation check**

Run the exact inline Node test from `.github/workflows/sengoku-fx-validation.yml`. It must report:

```text
validated boss cinematic look-at rotations and shortest-arc yaw continuity
```

- [ ] **Step 4: Compare all mirrored files**

Run:

```bash
cmp "BP/scripts/story/cutsceneManager.js" "builds/dist/Historical Dimensions BP/scripts/story/cutsceneManager.js"
cmp "BP/scripts/japan/boss/catalog.js" "builds/dist/Historical Dimensions BP/scripts/japan/boss/catalog.js"
cmp "BP/scripts/japan/boss/cinematics.js" "builds/dist/Historical Dimensions BP/scripts/japan/boss/cinematics.js"
cmp "RP/ui/historyjam_boss_hud.json" "builds/dist/Historical Dimensions RP/ui/historyjam_boss_hud.json"
```

Expected result: all four comparisons exit with code 0.

- [ ] **Step 5: Review the final diff**

Check that the diff contains only the design/plan documents and the four mirrored runtime/UI changes. Confirm that no camera coordinate, combat ability, phase threshold, story stage, entity identifier, `_ui_defs.json` entry, or `hud_screen.json` binding changed.

- [ ] **Step 6: Create the pull request**

Open a pull request from `codex/humanize-scenes-ui-20260908` into `main` with:

- Title: `Humanize cinematic scene text and improve boss HUD`
- Body explaining the Delhi copy rewrite, boss-specific Sengoku copy, upper-third card, mirrored distribution files, and validation results.
- Note that exact Bedrock-client rendering still needs an in-game mobile check.

