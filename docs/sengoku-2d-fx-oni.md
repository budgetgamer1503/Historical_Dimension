# Oni Blood Warlord — 2D FX Conversion

Chunk 3/5 converts all live Oni Blood Warlord spell presentation to the shared 2D boss FX system.

## Ability coverage
- Blood Cleaver: layered crimson cleaver cards, cone-edge blood beads, impact burst.
- Earthbreaker: floor fracture decal, expanding blood rings, erupting blade fragments.
- Crimson Tether: segmented spectral blood-chain line followed by the authoritative cone release.
- Blood Pool: floor pool card, heartbeat rings, droplets, impact pulse.
- Devour Wound: blood-orb return path from the selected target toward Oni plus the existing cone impact.
- Berserker Roar: Oni-mask aura, expanding pressure rings, impact pulse.
- Crimson Cataclysm: giant 2D Oni apparition, blood pool, chain/root cards, three authoritative expanding rings, then the final circle detonation.

## Combat authority
All lethal geometry, damage, pull, knockback, healing, cooldowns, phase rules, and hazard lifetime remain in the existing boss combat runtime. The presentation module reads `impactTelegraphDescriptors(...)`; it does not introduce damage shapes.

## Performance
Critical mechanic reinforcement uses the shared critical emitter budget. Apparitions, secondary chain/root cards, and droplets use presentation/ambient budgets and can be dropped before mechanic-critical indicators.

No Minecraft in-game validation is claimed by this document.
