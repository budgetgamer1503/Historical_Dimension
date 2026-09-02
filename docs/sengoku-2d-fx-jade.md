# Jade Storm Ronin — 2D FX Conversion

Status: boss chunk 1 of 5.

This pass converts Jade's complete live ability set to layered 2D presentation while preserving the existing combat runner and authoritative `impactTelegraphDescriptors` geometry.

## Ability mapping

- Gale Draw: charging ring, layered wind crescents, cone-edge pressure arc, impact burst.
- Tempest Step: wind ring, four spectral afterimages, crescent echoes, lightning accents along the authoritative dash line.
- Thunder Mark: floor storm seal, lock pulses, descending lightning card, fracture decal, impact burst.
- Wind Crescent: scheduled traveling crescent cards, wind residue, authoritative fan-edge arc.
- Cyclone Guard: layered seal, concentric wind rings, eight crescent cards, final cyclone pulse.
- Storm Cross: center seal, lightning-card lanes derived from each authoritative cross descriptor, fracture/impact layers.
- Raijin Heaven Split: large storm seal, arena rings, bounded lightning columns, two authoritative line strikes, final seal/fracture/lightning detonation.

## Safety and performance

The module does not call damage, teleport, targeting, cooldown, healing, or phase APIs. It is invoked once per Jade cast and only schedules particle presentation through the shared `fx2d.js` helper. Critical mechanic-adjacent effects use the critical budget; spectacle uses presentation/ambient budgets and is bounded.

## Audio

No new sound IDs are registered in this chunk because the source audio archives are not present in the live repository for license/path verification. The visual timings leave stable anticipation, impact, and residue beats for later sound attachment without changing combat timings.
