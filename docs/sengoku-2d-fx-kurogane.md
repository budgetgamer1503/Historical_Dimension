# Kurogane Shogun — 2D FX Conversion

Chunk 5/5 converts every live Kurogane combat ability to the shared 2D boss-FX system.

## Ability coverage

- `iron_draw`: steel draw crescents, judgment arc markers, authoritative cone-edge slash cards.
- `triple_judgment`: staged judgment crests and descriptor-bound cone/side-line presentations for all three impacts.
- `steel_rain`: target seals, descending steel-sword cards, staged impacts.
- `iron_counter`: guard crest only during the configured counter window; punish FX only render if the counter was actually consumed and `punishDirection` was resolved by runtime counter logic.
- `execution_mark`: execution glyph escalation, sword ring, target-circle detonation.
- `black_banner_domain`: four spectral banners, large domain seal, and the three authoritative rotating-line sweeps.
- `fivefold_judgment`: presentation-only callbacks to Jade lightning, Tsukikage real/fake shadows, Oni blood fracture ring, Seiryu dragon apparition, then Kurogane's final execution cone.

## Authority and fairness

All lethal geometry remains owned by `impactTelegraphDescriptors(...)`, `ability_runner.js`, and Kurogane's existing counter handler in `runtime.js`. This presentation module does not deal damage, select targets, mutate cooldowns, alter damage reduction, consume counters, or create alternate safe/danger geometry.

Fivefold Judgment deliberately reuses the converted 2D visual language of the previous four bosses while preserving the existing `fivefold` descriptor sequence and damage timings.

Kurogane uses the already-validated neutral billboard, vertical-card, floor-disc, and flipbook textures from the shared R1 foundation; no new binary texture is required by this chunk.

No Minecraft in-game validation is claimed by this document.
