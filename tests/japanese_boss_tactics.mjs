import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../BP/scripts/japan/boss/combat_modes.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  COMBAT_MODES,
  abilityModeWeight,
  abilityRangeBand,
  chooseCombatMode,
  distanceCombatMode,
  recordCombatMode,
} = await import(moduleUrl);

assert.equal(distanceCombatMode(3), COMBAT_MODES.close);
assert.equal(distanceCombatMode(8), COMBAT_MODES.mid);
assert.equal(distanceCombatMode(15), COMBAT_MODES.long);

const closeAbility = { shape: { type: "cone" } };
const midAbility = { shape: { type: "fan" } };
const longAbility = { shape: { type: "target_circles" } };
assert.equal(abilityRangeBand(closeAbility), COMBAT_MODES.close);
assert.equal(abilityRangeBand(midAbility), COMBAT_MODES.mid);
assert.equal(abilityRangeBand(longAbility), COMBAT_MODES.long);
assert(abilityModeWeight(COMBAT_MODES.close, closeAbility) > abilityModeWeight(COMBAT_MODES.close, longAbility));
assert(abilityModeWeight(COMBAT_MODES.long, longAbility) > abilityModeWeight(COMBAT_MODES.long, closeAbility));

function sample(options, samples = 600) {
  const counts = new Map();
  for (let index = 0; index < samples; index += 1) {
    const mode = chooseCombatMode({ ...options, randomValue: (index + 0.5) / samples });
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  return counts;
}

const closeCounts = sample({
  healthRatio: 0.92,
  phase: 1,
  nearestDistance: 2.8,
  averageDistance: 3.4,
  playerCount: 1,
  closePlayerCount: 1,
  canDefend: false,
  canHeal: false,
});
assert((closeCounts.get(COMBAT_MODES.close) ?? 0) > (closeCounts.get(COMBAT_MODES.long) ?? 0) * 4);

const longCounts = sample({
  healthRatio: 0.92,
  phase: 1,
  nearestDistance: 15,
  averageDistance: 15,
  playerCount: 1,
  closePlayerCount: 0,
  canDefend: false,
  canHeal: false,
});
assert((longCounts.get(COMBAT_MODES.long) ?? 0) > (longCounts.get(COMBAT_MODES.close) ?? 0) * 4);

const healCounts = sample({
  healthRatio: 0.22,
  phase: 4,
  nearestDistance: 9,
  averageDistance: 10,
  playerCount: 2,
  closePlayerCount: 0,
  canDefend: true,
  canHeal: true,
});
assert((healCounts.get(COMBAT_MODES.heal) ?? 0) > 0, "low-health bosses should sometimes choose heal");

const defenseCounts = sample({
  healthRatio: 0.45,
  phase: 3,
  nearestDistance: 2.5,
  averageDistance: 3.0,
  playerCount: 3,
  closePlayerCount: 3,
  damagePressureRatio: 0.12,
  canDefend: true,
  canHeal: false,
});
assert((defenseCounts.get(COMBAT_MODES.defense) ?? 0) > 0, "pressured bosses should sometimes choose defense");

assert.deepEqual(
  recordCombatMode([COMBAT_MODES.long, COMBAT_MODES.mid], COMBAT_MODES.defense, 3),
  [COMBAT_MODES.defense, COMBAT_MODES.long, COMBAT_MODES.mid],
);

console.log("Japanese boss tactical mode tests passed.");
