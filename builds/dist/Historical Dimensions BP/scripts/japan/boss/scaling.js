const HEALTH_MULTIPLIERS = [1.00, 1.60, 2.15, 2.65];
const DECISION_DELAYS = [16, 14, 12, 10];

export function clampParticipants(playerCount) {
  const value = Number.isFinite(playerCount) ? Math.floor(playerCount) : 1;
  return Math.max(1, Math.min(4, value));
}

export function healthForPlayers(baseHealth, playerCount) {
  const count = clampParticipants(playerCount);
  return Math.round(baseHealth * HEALTH_MULTIPLIERS[count - 1]);
}

export function decisionDelayForPlayers(playerCount) {
  const count = clampParticipants(playerCount);
  return DECISION_DELAYS[count - 1];
}

export function targetPressureCount(playerCount, table) {
  const count = clampParticipants(playerCount);
  return table[count - 1];
}
