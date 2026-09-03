# Seiryu Dragon Daimyo — 2D FX Conversion

Chunk 4/5 converts every live Seiryu combat ability to the shared 2D boss-FX system.

## Ability coverage

- `azure_dragon_arc`: segmented dragon head/body charge, cone-edge cloud pressure, impact burst.
- `tidal_line`: staged advancing water-wall cards derived from each authoritative line descriptor.
- `sky_spear`: floor lock seals, descending celestial spear cards, impact bursts.
- `dragon_rush`: moving dragon head/body chain along the authoritative dash line plus water pressure.
- `coiling_ring`: dragon-body ring, four dragon heads, water-wall boundary, then the authoritative inner circle.
- `dragon_pillars`: target seals, vertical water pillars, dragon-head eruptions, impact bursts.
- `celestial_seiryu`: bounded giant dragon head/body apparition, cloud field, rotating-sector dragon passes and water rays.

## Authority and fairness

All lethal geometry remains owned by `impactTelegraphDescriptors(...)` and `ability_runner.js`. The 2D presentation code consumes those descriptors but does not deal damage, move players, alter cooldowns, select targets, or create independent safe/danger geometry.

The Celestial Seiryu apparition is presentation-only and bounded by the shared critical/presentation/ambient emitter budgets.

No Minecraft in-game validation is claimed by this document.
