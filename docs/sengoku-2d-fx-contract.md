# Sengoku 2D boss FX contract

R1 establishes the shared presentation layer for the all-boss 2D spell-effects rework.
It does not change boss selection, damage, hit geometry, target snapshots, cooldowns, phase timing, or cinematics by itself.

## Authority

- `ability_runner.js`, `impact_telegraph.js`, and the damage helpers remain gameplay authority.
- `fx2d.js` is presentation-only.
- A missing or culled sprite must never change whether an attack hits.
- Mechanic-critical warnings always use the `critical` priority class.

## Runtime primitives

`fx2d.js` exposes bounded helpers for:

- camera-facing billboards
- vertical cards
- floor-aligned discs
- animated flipbooks
- sampled lines, arcs, and rings
- scheduled sprite sequences
- Tsukikage real/fake styling

Every emitter call is counted against a per-encounter, per-tick budget:

- `critical`: 128
- `presentation`: 64
- `ambient`: 24

Ambient and presentation effects must be reduced before critical telegraphs are compromised.
Particles own their own short lifetime and therefore do not create persistent effect entities.
Scheduled callbacks reuse the encounter handle set and stop when the encounter ends or the boss becomes invalid.

## Molang variable contract

The generic foundation particles accept:

- `variable.fx_color` as RGBA
- `variable.fx_width`
- `variable.fx_height`
- `variable.fx_lifetime`
- `variable.fx_scale` (reserved for content-specific particles)

These variables are supplied with `MolangVariableMap` through `Dimension.spawnParticle`.

## Boss visual identities

The existing warning/accent particle IDs remain backward-compatible.
`visual_identity.js` additionally owns reusable 2D color palettes for Jade, Tsukikage, Oni, Seiryu, and Kurogane.

Tsukikage real-vs-fake rule:

- real: brighter moonlight color and critical-priority support
- fake: darker/desaturated color and presentation-priority support

Content chunks must preserve additional learnable tells such as a real moon/core marker and earlier fake dissolution.

## 3D migration rule

Boss characters, weapons, structures, and world geometry stay 3D.
Boss spell/presentation constructs are migrated to billboards, sprite sheets, ribbons, seals, silhouettes, and layered particle cards.
Old spell-effect entities and Blockbench spell models are removed only after their 2D replacement is wired and resource-reference validation proves them unused.

## Audio

Audio remains part of every boss conversion. The intended rhythm is anticipation -> manifestation -> impact -> residue, with restraint to prevent mix clutter.
Only sounds whose source and redistribution license are actually inspectable may be imported from external packs. Existing original project cues may remain until the uploaded libraries are available for direct inspection.

## Review gate

Before each boss conversion is committed, provide a visual review/contact sheet for charge, active, impact, decay, and real/fake variants where relevant.
