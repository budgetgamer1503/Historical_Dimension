export const BOSS_UI_PREFIX = "HJBOSS_";

export const BOSS_UI_PREFIXES = Object.freeze({
  intro: `${BOSS_UI_PREFIX}INTRO_`,
  phase: `${BOSS_UI_PREFIX}PHASE_`,
  victory: `${BOSS_UI_PREFIX}VICTORY_`,
});

function oneLine(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBossUiPayload(kind, title, subtitle = "") {
  const prefix = BOSS_UI_PREFIXES[kind];
  if (!prefix)
    throw new Error(`Unknown boss UI kind: ${kind}`);

  const safeTitle = oneLine(title);
  const safeSubtitle = oneLine(subtitle);
  return `${prefix}${safeTitle}${safeSubtitle ? `\n§7${safeSubtitle}` : ""}`;
}

export function isBossUiPayload(value) {
  const text = String(value ?? "");
  return Object.values(BOSS_UI_PREFIXES).some((prefix) => text.startsWith(prefix));
}
