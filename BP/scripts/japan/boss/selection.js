function normalizedRandom(randomValue) {
  const value = Number(randomValue);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999999999, value));
}

export function eligibleAbilities(definition, phase, lastAbilityId, predicate = () => true) {
  const currentPhase = Math.max(1, Math.min(4, Math.floor(Number(phase) || 1)));
  const phaseEligible = (definition?.abilities ?? []).filter(
    (ability) => (ability.minPhase ?? 1) <= currentPhase && predicate(ability),
  );
  if (phaseEligible.length <= 1) return phaseEligible;
  const withoutRepeat = phaseEligible.filter((ability) => ability.id !== lastAbilityId);
  return withoutRepeat.length > 0 ? withoutRepeat : phaseEligible;
}

export function chooseAbility(definition, phase, lastAbilityId, randomValue, predicate = () => true) {
  const choices = eligibleAbilities(definition, phase, lastAbilityId, predicate);
  if (choices.length === 0) return undefined;

  const totalWeight = choices.reduce((sum, ability) => sum + Math.max(0, Number(ability.weight) || 0), 0);
  if (totalWeight <= 0) return choices[0];

  let cursor = normalizedRandom(randomValue) * totalWeight;
  for (const ability of choices) {
    cursor -= Math.max(0, Number(ability.weight) || 0);
    if (cursor < 0) return ability;
  }
  return choices.at(-1);
}
