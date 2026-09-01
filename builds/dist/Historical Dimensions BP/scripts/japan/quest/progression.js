import { getBossByStep } from "../boss/catalog.js";

export const QUEST_PROPERTY = "historyjam:boss_quest_step";

export function normalizeQuestStep(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.floor(numeric)));
}

export function getQuestStep(player) {
  return normalizeQuestStep(player?.getDynamicProperty?.(QUEST_PROPERTY));
}

export function setQuestStep(player, step) {
  const normalized = normalizeQuestStep(step);
  player?.setDynamicProperty?.(QUEST_PROPERTY, normalized);
  return normalized;
}

export function advanceQuestForBoss(player, bossStep) {
  const current = getQuestStep(player);
  const expected = normalizeQuestStep(bossStep);
  if (current !== expected || current >= 5) return false;
  setQuestStep(player, current + 1);
  return true;
}

export function activeBossForPlayer(player) {
  return getBossByStep(getQuestStep(player));
}
