function normalizedRandom(randomValue) {
  const value = Number(randomValue);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999999999, value));
}

function normalizedHistory(recentAbilityIds) {
  if (Array.isArray(recentAbilityIds))
    return recentAbilityIds.filter((id) => typeof id === "string" && id.length > 0);
  return typeof recentAbilityIds === "string" && recentAbilityIds.length > 0 ? [recentAbilityIds] : [];
}

function weightedValue(ability, weightMultiplier) {
  const base = Math.max(0, Number(ability?.weight) || 0);
  if (base <= 0) return 0;
  let multiplier = 1;
  try {
    multiplier = Number(weightMultiplier?.(ability));
  } catch {
    multiplier = 1;
  }
  if (!Number.isFinite(multiplier)) multiplier = 1;
  return base * Math.max(0, multiplier);
}

export function eligibleAbilities(definition, phase, recentAbilityIds, predicate = () => true) {
  const currentPhase = Math.max(1, Math.min(4, Math.floor(Number(phase) || 1)));
  const phaseEligible = (definition?.abilities ?? []).filter(
    (ability) => (ability.minPhase ?? 1) <= currentPhase && predicate(ability),
  );
  if (phaseEligible.length <= 1) return phaseEligible;

  const history = normalizedHistory(recentAbilityIds);
  const withoutImmediateRepeat = phaseEligible.filter((ability) => ability.id !== history[0]);
  const immediateSafe = withoutImmediateRepeat.length > 0 ? withoutImmediateRepeat : phaseEligible;
  if (immediateSafe.length <= 1 || history.length <= 1) return immediateSafe;

  // Prefer unseen moves from the last few decisions. The window scales down when cooldowns
  // shrink the active pool, so a boss never deadlocks waiting for an impossible "fresh" move.
  const maximumWindow = Math.max(1, immediateSafe.length - 1);
  const recentWindow = new Set(history.slice(0, Math.min(3, maximumWindow + 1)));
  const fresh = immediateSafe.filter((ability) => !recentWindow.has(ability.id));
  return fresh.length > 0 ? fresh : immediateSafe;
}

export function chooseAbility(
  definition,
  phase,
  recentAbilityIds,
  randomValue,
  predicate = () => true,
  weightMultiplier = () => 1,
) {
  const choices = eligibleAbilities(definition, phase, recentAbilityIds, predicate);
  if (choices.length === 0) return undefined;

  const weighted = choices.map((ability) => ({
    ability,
    weight: weightedValue(ability, weightMultiplier),
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return choices[0];

  let cursor = normalizedRandom(randomValue) * totalWeight;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.ability;
  }
  return weighted.at(-1)?.ability;
}
