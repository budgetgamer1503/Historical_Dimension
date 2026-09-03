# Tsukikage Ghost Samurai — 2D FX Conversion

This is boss chunk 2 of 5 in the Sengoku all-boss 2D effect conversion.

## Live ability coverage

- Moon Crescent — layered spectral crescent release, mist charge, moonlit impact.
- Shadowstep — origin vanish, three early decoys, post-teleport real-form reveal, execution slash.
- Phantom Fan — authoritative fan-ray manifestations with spectral samurai and slash cards.
- Vanishing Mist — expanding mist rings, decoys, real-form reveal, authoritative target-circle reinforcement.
- Shadow Prison — eight torii-style 2D gates, spectral chain ring, explicit inner safe-boundary reinforcement.
- Eightfold Slash — exactly eight real shadow manifestations (two per each of four authoritative line impacts).
- Eclipse of Eight Shadows — eclipse disc plus exactly eight forms across four real/feint descriptor pairs: four bright real forms and four darker early-dissolving fakes.

`Moonlit Afterimages` is not present as a castable ability in the current `catalog.js`; this conversion does not invent new combat damage/timing to add it silently.

## Fairness contract

All lethal geometry remains sourced from `impactTelegraphDescriptors(...)` and the existing ability runner. The presentation module never applies damage, changes cooldowns, selects targets, or creates an alternate hitbox. Fake Eclipse lines use the existing `descriptor.feint` flag. Real-vs-fake visual language follows the shared `fx2d.js` Tsukikage style contract.

Shadow Prison intentionally does not draw false escape openings because the current authoritative shape is a full annular damage region. The bright inner boundary communicates the actual safe inner circle instead.

## Assets

The Tsukikage atlas is project-generated and contains only original neutral/tintable 2D artwork. No third-party art or sound files are introduced by this chunk.
