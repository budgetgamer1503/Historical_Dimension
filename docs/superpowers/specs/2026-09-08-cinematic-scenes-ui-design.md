# Cinematic scene text and boss HUD design

**Date:** 2026-09-08

## Goal

Make the Historical Dimension scene text feel written for the characters and moment, then make the Sengoku boss presentation readable on mobile without changing combat, camera paths, or story progression.

## Scope

This pass covers the two existing scene systems:

- Delhi story cutscenes in `BP/scripts/story/cutsceneManager.js`.
- Sengoku boss intro, phase-shift, and victory presentations in `BP/scripts/japan/boss/cinematics.js` and `BP/scripts/japan/boss/catalog.js`.
- The custom boss HUD in `RP/ui/historyjam_boss_hud.json`.
- The matching files under `builds/dist/Historical Dimensions BP` and `builds/dist/Historical Dimensions RP`, which are committed distribution copies.

Quest menus, ambient NPC dialogue, and general story messages outside the scene systems are intentionally out of scope for this pass.

## Current behavior

Delhi cutscenes already use camera shots with a title, subtitle, and optional spoken line. The wording is functional but several lines sound like placeholder fantasy dialogue or explain the plot too directly.

Sengoku boss scenes send a prefixed string through `ScreenDisplay.setTitle`. The resource-pack HUD detects the `HJBOSS_` prefix, hides the vanilla title element, and renders the remaining text in one centered label. The current layout uses full-width letterboxes and a small center scrim, which makes the message easy to miss over the boss model on a phone screen.

The repository's CI validates the source `BP` and `RP` directories, including JSON parsing, JavaScript syntax, resource links, and the existing cinematic camera orientation checks. The source packs remain the runtime authority; the committed distribution copies will be kept in sync.

## Text direction

Use short, concrete lines with distinct character voices:

- Captain Zayd speaks like a tired officer who is trying to contain a crisis.
- Scholar Safiya speaks clearly and reacts to events as they happen.
- Commander Qadir is confident and threatening without relying on cartoon insults.
- Sultan Alauddin Khalji acknowledges what the player actually did.
- Boss subtitles describe the immediate danger in plain language, with a small amount of setting-specific flavor.
- Keep names, historical setting, quest order, and combat mechanics unchanged.
- Keep all new copy free of em dashes and en dashes so it reads cleanly in the game font.
- Keep subtitles short enough to fit the mobile HUD.

Planned Sengoku copy:

| Boss | Intro subtitle | Phase 2 | Phase 3 | Final phase | Victory |
| --- | --- | --- | --- | --- | --- |
| Jade Storm Ronin | A ronin with a storm at his back | The wind cuts a little closer | Jade lightning splits the field | Raijin answers his final draw | THE STORM BREAKS. Jade Storm Ronin has fallen. |
| Tsukikage Ghost Samurai | The moon hides more than one blade | His shadow leaves no safe ground | Eight blades move before you can turn | The eclipse leaves no room for error | THE SHADOW FADES. Tsukikage Ghost Samurai has fallen. |
| Oni Blood Warlord | Something hungry waits behind the mask | Every wound feeds the warlord | The ground shakes with his rage | The warlord has nothing left to hold back | THE WARLORD FALLS. Oni Blood Warlord has fallen. |
| Seiryu Dragon Daimyo | The dragon's tide reaches the shore | The current turns beneath your feet | The sky breaks into falling pillars | Seiryu takes to the heavens | THE DRAGON IS SILENT. Seiryu Dragon Daimyo has fallen. |
| Kurogane Shogun | The Shogun draws the line | One mistake will cost you | The black banner claims the field | The Shogun brings every blade to bear | THE IRON THRONE BREAKS. Kurogane Shogun has fallen. |

The boss phase headers will become `PHASE 2`, `PHASE 3`, and `FINAL PHASE`. The victory header will be `DUEL WON`, followed by the boss-specific victory line.

## HUD design

Keep the existing prefix protocol and token-safe cleanup. The script will continue to use `ScreenDisplay.setTitle` as the transport because the current resource-pack binding reads `#hud_title_text_string`.

The overlay will use these layers:

1. Narrower top and bottom letterboxes that preserve the cinematic framing without hiding as much gameplay.
2. A dark, centered scene card in the upper third of the screen so it does not cover the boss model or the crosshair.
3. A small kicker label: `BOSS ENCOUNTER`, `PHASE SHIFT`, or `DUEL WON`.
4. The existing bound title and subtitle as the main text, with more height, a readable scale, centered alignment, and a shadow.
5. A thin tinted rule to give the card a clear edge.

The card will use the existing `textures/ui/Black` texture and documented UI properties such as `panel`, `image`, `label`, `size`, `offset`, `anchor_from`, `anchor_to`, `alpha`, `color`, `layer`, and bindings. No new texture path or undocumented renderer will be introduced. The existing `_ui_defs.json` registration and `hud_screen.json` host will remain unchanged unless validation shows that a source file needs a small registration correction.

## Files and responsibilities

- Modify `BP/scripts/story/cutsceneManager.js`: rewrite Delhi scene title, subtitle, and spoken lines.
- Modify `BP/scripts/japan/boss/catalog.js`: add boss-specific phase and victory copy beside each boss definition, and update intro subtitles.
- Modify `BP/scripts/japan/boss/cinematics.js`: consume the new copy, use clearer phase headers, use the new victory text, and keep timing and cleanup behavior intact.
- Modify `RP/ui/historyjam_boss_hud.json`: implement the upper-third card, kicker labels, stronger spacing, and narrower letterboxes.
- Mirror those four changes into their corresponding `builds/dist` files.
- Do not change `RP/ui/hud_screen.json` or `RP/ui/_ui_defs.json` unless the validator proves that the existing integration is incomplete.

## Validation

Run the repository-equivalent checks after implementation:

- Parse the edited resource-pack JSON files.
- Run `node --check` on edited JavaScript files.
- Run the existing Sengoku camera-orientation test from `.github/workflows/sengoku-fx-validation.yml`.
- Run the resource-pack JSON/UI auditor at its portable tier if available.
- Check that source and distribution copies have identical content.
- Inspect the final diff for accidental changes to camera locations, combat thresholds, ability data, title cleanup, or story progression.

The static checks can prove JSON structure, JavaScript syntax, and the existing camera math. They cannot prove the exact appearance on every Bedrock client, so the final handoff will call out that the new card still needs a real in-game mobile check.
