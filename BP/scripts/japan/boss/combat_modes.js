export const COMBAT_MODES = Object.freeze({
  close: "close",
  mid: "mid",
  long: "long",
  defense: "defense",
  heal: "heal",
});

const CLOSE_TYPES = new Set(["cone", "circle", "ring", "ring_then_circle", "combo", "counter_cone"]);
const MID_TYPES = new Set(["fan", "fan_rays", "cross_lines", "alternating_lines", "tether", "expanding_rings"]);
const LONG_TYPES = new Set([
  "line", "advancing_lines", "target_circle", "target_circles",
  "arena_hazard_circles", "persistent_circle", "feint_lines", "rotating_sectors",
  "rotating_lines", "fivefold", "jade_ultimate",
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function randomUnit(value) {
  return clamp(value, 0, 0.999999999999);
}

export function distanceCombatMode(distance) {
  const value = Number(distance);
  if (!Number.isFinite(value)) return COMBAT_MODES.mid;
  if (value <= 4.5) return COMBAT_MODES.close;
  if (value <= 11) return COMBAT_MODES.mid;
  return COMBAT_MODES.long;
}

export function abilityRangeBand(ability) {
  const explicit = ability?.rangeBand;
  if (explicit === COMBAT_MODES.close || explicit === COMBAT_MODES.mid || explicit === COMBAT_MODES.long)
    return explicit;

  const shape = ability?.shape ?? {};
  const type = shape.type ?? "";
  if (shape.dash || shape.reposition) return COMBAT_MODES.mid;
  if (CLOSE_TYPES.has(type)) return COMBAT_MODES.close;
  if (MID_TYPES.has(type)) return COMBAT_MODES.mid;
  if (LONG_TYPES.has(type)) return COMBAT_MODES.long;
  return COMBAT_MODES.mid;
}

export function abilityModeWeight(mode, ability) {
  if (mode === COMBAT_MODES.defense || mode === COMBAT_MODES.heal) return 0;
  const band = abilityRangeBand(ability);
  if (band === mode) return 1.75;
  if ((mode === COMBAT_MODES.close && band === COMBAT_MODES.mid)
      || (mode === COMBAT_MODES.long && band === COMBAT_MODES.mid))
    return 0.82;
  if (mode === COMBAT_MODES.mid) return 0.78;
  return 0.34;
}

function penalizeRecent(weights, recentModes) {
  const recent = Array.isArray(recentModes) ? recentModes : [];
  const latest = recent[0];
  const previous = recent[1];
  if (latest && weights[latest] != null) weights[latest] *= 0.44;
  if (previous && weights[previous] != null) weights[previous] *= 0.72;
}

function weightedPick(weights, randomValue) {
  const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (entries.length === 0 || total <= 0) return COMBAT_MODES.mid;
  let cursor = randomUnit(randomValue) * total;
  for (const [mode, weight] of entries) {
    cursor -= Number(weight);
    if (cursor < 0) return mode;
  }
  return entries.at(-1)[0];
}

export function chooseCombatMode({
  healthRatio = 1,
  phase = 1,
  nearestDistance = Number.POSITIVE_INFINITY,
  averageDistance = Number.POSITIVE_INFINITY,
  playerCount = 1,
  closePlayerCount = 0,
  damagePressureRatio = 0,
  recentModes = [],
  canDefend = false,
  canHeal = false,
  randomValue = Math.random(),
} = {}) {
  const health = clamp(healthRatio, 0, 1);
  const pressure = clamp(damagePressureRatio, 0, 0.35);
  const nearest = Number(nearestDistance);
  const average = Number(averageDistance);
  const players = Math.max(1, Math.floor(Number(playerCount) || 1));
  const closePlayers = Math.max(0, Math.floor(Number(closePlayerCount) || 0));
  const currentPhase = clamp(Math.floor(Number(phase) || 1), 1, 4);
  const distanceMode = distanceCombatMode(nearest);

  const weights = {
    [COMBAT_MODES.close]: distanceMode === COMBAT_MODES.close ? 3.25 : distanceMode === COMBAT_MODES.mid ? 0.72 : 0.14,
    [COMBAT_MODES.mid]: distanceMode === COMBAT_MODES.mid ? 3.05 : 0.86,
    [COMBAT_MODES.long]: distanceMode === COMBAT_MODES.long ? 3.20 : distanceMode === COMBAT_MODES.mid ? 0.78 : 0.16,
    [COMBAT_MODES.defense]: 0,
    [COMBAT_MODES.heal]: 0,
  };

  // When players spread out, avoid tunneling into a single melee target forever.
  if (players >= 2 && Number.isFinite(average) && average >= 8) {
    weights[COMBAT_MODES.mid] *= 1.18;
    weights[COMBAT_MODES.long] *= 1.25;
  }

  if (canDefend) {
    const proximity = nearest <= 4.75 ? 1.55 : closePlayers >= 2 ? 1.30 : 0.34;
    const phaseScale = 0.78 + currentPhase * 0.13;
    const lowHealthScale = health <= 0.50 ? 1.28 : 1;
    const pressureScale = 1 + Math.min(2.2, pressure * 14);
    weights[COMBAT_MODES.defense] = proximity * phaseScale * lowHealthScale * pressureScale;
  }

  if (canHeal && health < 0.72) {
    const missing = 1 - health;
    const urgency = health <= 0.28 ? 5.0 : health <= 0.45 ? 3.35 : 1.8;
    const spacing = nearest >= 6 ? 1.38 : nearest >= 4.5 ? 1.0 : 0.55;
    weights[COMBAT_MODES.heal] = Math.max(0.18, missing * urgency * spacing * (1 + currentPhase * 0.06));
  }

  penalizeRecent(weights, recentModes);
  return weightedPick(weights, randomValue);
}

export function recordCombatMode(recentModes, mode, limit = 4) {
  const existing = Array.isArray(recentModes) ? recentModes : [];
  return [mode, ...existing].slice(0, Math.max(1, Math.floor(Number(limit) || 4)));
}
