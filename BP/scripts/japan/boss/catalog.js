export const BOSS_ORDER = [
  "historyjam:jade_storm_ronin",
  "historyjam:tsukikage_ghost_samurai",
  "historyjam:oni_blood_warlord",
  "historyjam:seiryu_dragon_daimyo",
  "historyjam:kurogane_shogun",
];

export const PHASE_THRESHOLDS = [0.75, 0.50, 0.25];

function ability(id, bossKey, config) {
  const impacts = Array.isArray(config.impactTicks) ? config.impactTicks : [config.impactTicks];
  return Object.freeze({
    id,
    animation: `animation.historyjam.${bossKey}.${id}`,
    telegraphStartTick: 0,
    recoveryEndTick: config.durationTicks,
    minPhase: 1,
    weight: 1,
    cooldownTicks: 80,
    ...config,
    impactTicks: impacts,
  });
}

function zone({ center, approach, referenceY, region, placementOrder, subtitle }) {
  return Object.freeze({
    center: Object.freeze({ ...center, y: referenceY }),
    approach: Object.freeze({ ...approach, y: referenceY }),
    referenceY,
    region,
    placementOrder,
    subtitle,
    participantRadius: 34,
    leashRadius: 38,
    resetRadius: 48,
    triggerRadius: 18,
    surfaceSearchRadius: 12,
  });
}

const BOSS_ZONES = Object.freeze({
  jade_storm_ronin: zone({
    center: { x: -250, z: 250 }, approach: { x: -250, z: 223 }, referenceY: 74,
    region: "B", placementOrder: 30, subtitle: "The Blade Beneath the Rain",
  }),
  tsukikage_ghost_samurai: zone({
    center: { x: 220, z: 320 }, approach: { x: 220, z: 293 }, referenceY: 78,
    region: "C", placementOrder: 31, subtitle: "Moonlit Shadow",
  }),
  oni_blood_warlord: zone({
    center: { x: -400, z: 20 }, approach: { x: -400, z: -7 }, referenceY: 86,
    region: "B", placementOrder: 32, subtitle: "Crimson Tyrant",
  }),
  seiryu_dragon_daimyo: zone({
    center: { x: 340, z: 120 }, approach: { x: 340, z: 93 }, referenceY: 86,
    region: "C", placementOrder: 33, subtitle: "Azure Dragon of the East",
  }),
  kurogane_shogun: zone({
    center: { x: 330, z: -300 }, approach: { x: 330, z: -327 }, referenceY: 100,
    region: "B", placementOrder: 34, subtitle: "The Iron Shogun",
  }),
});

const jade = Object.freeze({
  step: 0,
  key: "jade_storm_ronin",
  id: "historyjam:jade_storm_ronin",
  displayName: "Jade Storm Ronin",
  baseHealth: 500,
  zone: BOSS_ZONES.jade_storm_ronin,
  abilities: Object.freeze([
    ability("gale_draw", "jade_storm_ronin", { durationTicks: 24, impactTicks: 13, shape: { type: "cone", range: 4.5, angle: 100 }, damage: [12], cooldownTicks: 70, minPhase: 1, weight: 1.4 }),
    ability("tempest_step", "jade_storm_ronin", { durationTicks: 27, impactTicks: [12, 15], shape: { type: "line", length: 9, width: 1.8, dash: true }, damage: [8, 8], cooldownTicks: 90, minPhase: 1, weight: 1.1 }),
    ability("thunder_mark", "jade_storm_ronin", { durationTicks: 36, impactTicks: 28, telegraphStartTick: 6, shape: { type: "target_circle", radius: 2.75 }, damage: [16], cooldownTicks: 105, minPhase: 1, weight: 1.0 }),
    ability("wind_crescent", "jade_storm_ronin", { durationTicks: 29, impactTicks: 16, shape: { type: "fan", range: 10, halfWidth: 1.6 }, damage: [11], cooldownTicks: 80, minPhase: 1, weight: 1.2 }),
    ability("cyclone_guard", "jade_storm_ronin", { durationTicks: 32, impactTicks: 23, telegraphStartTick: 4, shape: { type: "ring", innerRadius: 0, outerRadius: 5, knockback: 1.6 }, damage: [9], cooldownTicks: 120, minPhase: 2, weight: 0.8 }),
    ability("storm_cross", "jade_storm_ronin", { durationTicks: 40, impactTicks: [24, 30], telegraphStartTick: 6, shape: { type: "cross_lines", length: 14, width: 1.5 }, damage: [11, 11], cooldownTicks: 145, minPhase: 3, weight: 0.75 }),
    ability("raijin_heaven_split", "jade_storm_ronin", { durationTicks: 96, impactTicks: [46, 62, 82], telegraphStartTick: 10, shape: { type: "jade_ultimate", lineLength: 48, lineWidth: 2.0, finalRadius: 4 }, damage: [10, 12, 20], cooldownTicks: 900, minPhase: 4, weight: 0.35, ultimate: true }),
  ]),
});

const ghost = Object.freeze({
  step: 1,
  key: "tsukikage_ghost_samurai",
  id: "historyjam:tsukikage_ghost_samurai",
  displayName: "Tsukikage Ghost Samurai",
  baseHealth: 650,
  zone: BOSS_ZONES.tsukikage_ghost_samurai,
  abilities: Object.freeze([
    ability("moon_crescent", "tsukikage_ghost_samurai", { durationTicks: 24, impactTicks: 14, shape: { type: "cone", range: 4, angle: 110 }, damage: [12], cooldownTicks: 65, minPhase: 1, weight: 1.35 }),
    ability("shadowstep", "tsukikage_ghost_samurai", { durationTicks: 30, impactTicks: 17, telegraphStartTick: 7, shape: { type: "cone", range: 3.5, angle: 100, reposition: "behind_target", repositionTick: 14 }, damage: [15], cooldownTicks: 95, minPhase: 1, weight: 1.0 }),
    ability("phantom_fan", "tsukikage_ghost_samurai", { durationTicks: 40, impactTicks: [22, 28, 34], telegraphStartTick: 6, shape: { type: "fan_rays", length: 12, width: 1.2, rayAngles: [-24, 0, 24] }, damage: [8, 8, 8], cooldownTicks: 115, minPhase: 1, weight: 1.05 }),
    ability("vanishing_mist", "tsukikage_ghost_samurai", { durationTicks: 38, impactTicks: 25, telegraphStartTick: 5, shape: { type: "target_circle", radius: 4, reposition: "mist" }, damage: [13], cooldownTicks: 120, minPhase: 1, weight: 0.95 }),
    ability("shadow_prison", "tsukikage_ghost_samurai", { durationTicks: 52, impactTicks: 38, telegraphStartTick: 12, shape: { type: "ring", innerRadius: 2, outerRadius: 5 }, damage: [16], cooldownTicks: 150, minPhase: 2, weight: 0.8 }),
    ability("eightfold_slash", "tsukikage_ghost_samurai", { durationTicks: 64, impactTicks: [24, 32, 40, 48], telegraphStartTick: 8, shape: { type: "alternating_lines", length: 12, width: 1.5 }, damage: [9, 9, 9, 9], cooldownTicks: 180, minPhase: 3, weight: 0.7 }),
    ability("eclipse_of_eight_shadows", "tsukikage_ghost_samurai", { durationTicks: 120, impactTicks: [56, 68, 80, 92], telegraphStartTick: 16, shape: { type: "feint_lines", lineCount: 8, realCount: 4, length: 24, width: 1.5 }, damage: [13, 13, 13, 13], cooldownTicks: 900, minPhase: 4, weight: 0.35, ultimate: true }),
  ]),
});

const oni = Object.freeze({
  step: 2,
  key: "oni_blood_warlord",
  id: "historyjam:oni_blood_warlord",
  displayName: "Oni Blood Warlord",
  baseHealth: 850,
  zone: BOSS_ZONES.oni_blood_warlord,
  abilities: Object.freeze([
    ability("blood_cleaver", "oni_blood_warlord", { durationTicks: 28, impactTicks: 16, shape: { type: "cone", range: 5, angle: 120 }, damage: [15], cooldownTicks: 70, minPhase: 1, weight: 1.35 }),
    ability("earthbreaker", "oni_blood_warlord", { durationTicks: 42, impactTicks: 28, telegraphStartTick: 7, shape: { type: "circle", radius: 4.5 }, damage: [17], cooldownTicks: 105, minPhase: 1, weight: 1.0 }),
    ability("crimson_tether", "oni_blood_warlord", { durationTicks: 48, impactTicks: [24, 34], telegraphStartTick: 8, shape: { type: "tether", rayLength: 14, coneRange: 4, coneAngle: 105 }, damage: [6, 14], cooldownTicks: 135, minPhase: 1, weight: 0.9 }),
    ability("blood_pool", "oni_blood_warlord", { durationTicks: 60, impactTicks: 34, telegraphStartTick: 12, shape: { type: "persistent_circle", radius: 2.5, lifetimeTicks: 100, pulseTicks: 20 }, damage: [4], cooldownTicks: 155, minPhase: 1, weight: 0.85 }),
    ability("devour_wound", "oni_blood_warlord", { durationTicks: 34, impactTicks: 20, shape: { type: "cone", range: 4, angle: 110, healFraction: 0.5, healCap: 20 }, damage: [16], cooldownTicks: 145, minPhase: 2, weight: 0.8 }),
    ability("berserker_roar", "oni_blood_warlord", { durationTicks: 50, impactTicks: 30, telegraphStartTick: 8, shape: { type: "circle", radius: 6, knockback: 1.7, pressureTicks: 120 }, damage: [8], cooldownTicks: 220, minPhase: 3, weight: 0.6 }),
    ability("crimson_cataclysm", "oni_blood_warlord", { durationTicks: 120, impactTicks: [50, 66, 82, 102], telegraphStartTick: 16, shape: { type: "expanding_rings", radii: [3, 6, 9], finalRadius: 4.5 }, damage: [8, 9, 10, 22], cooldownTicks: 900, minPhase: 4, weight: 0.35, ultimate: true }),
  ]),
});

const seiryu = Object.freeze({
  step: 3,
  key: "seiryu_dragon_daimyo",
  id: "historyjam:seiryu_dragon_daimyo",
  displayName: "Seiryu Dragon Daimyo",
  baseHealth: 1050,
  zone: BOSS_ZONES.seiryu_dragon_daimyo,
  abilities: Object.freeze([
    ability("azure_dragon_arc", "seiryu_dragon_daimyo", { durationTicks: 30, impactTicks: 18, shape: { type: "cone", range: 5, angle: 130 }, damage: [14], cooldownTicks: 75, minPhase: 1, weight: 1.3 }),
    ability("tidal_line", "seiryu_dragon_daimyo", { durationTicks: 44, impactTicks: [24, 30, 36], telegraphStartTick: 6, shape: { type: "advancing_lines", length: 12, width: 2, steps: 3 }, damage: [8, 8, 8], cooldownTicks: 115, minPhase: 1, weight: 1.0 }),
    ability("sky_spear", "seiryu_dragon_daimyo", { durationTicks: 50, impactTicks: 36, telegraphStartTick: 10, shape: { type: "target_circles", radius: 2.5, targetCounts: [1, 1, 2, 2] }, damage: [16], cooldownTicks: 130, minPhase: 1, weight: 0.95 }),
    ability("dragon_rush", "seiryu_dragon_daimyo", { durationTicks: 38, impactTicks: [20, 24], telegraphStartTick: 5, shape: { type: "line", length: 11, width: 2, dash: true }, damage: [9, 9], cooldownTicks: 110, minPhase: 1, weight: 1.0 }),
    ability("coiling_ring", "seiryu_dragon_daimyo", { durationTicks: 60, impactTicks: [38, 46], telegraphStartTick: 10, shape: { type: "ring_then_circle", outerRadius: 6, innerSafeRadius: 3 }, damage: [12, 14], cooldownTicks: 160, minPhase: 2, weight: 0.75 }),
    ability("dragon_pillars", "seiryu_dragon_daimyo", { durationTicks: 70, impactTicks: 46, telegraphStartTick: 12, shape: { type: "arena_hazard_circles", radius: 2.25, counts: [4, 5, 6, 7] }, damage: [13], cooldownTicks: 190, minPhase: 3, weight: 0.65 }),
    ability("celestial_seiryu", "seiryu_dragon_daimyo", { durationTicks: 140, impactTicks: [60, 76, 92, 108, 126], telegraphStartTick: 18, shape: { type: "rotating_sectors", radius: 24, sectorAngle: 52, stepDegrees: 58 }, damage: [9, 9, 10, 10, 20], cooldownTicks: 900, minPhase: 4, weight: 0.35, ultimate: true }),
  ]),
});

const kurogane = Object.freeze({
  step: 4,
  key: "kurogane_shogun",
  id: "historyjam:kurogane_shogun",
  displayName: "Kurogane Shogun",
  baseHealth: 1300,
  zone: BOSS_ZONES.kurogane_shogun,
  abilities: Object.freeze([
    ability("iron_draw", "kurogane_shogun", { durationTicks: 22, impactTicks: 12, shape: { type: "cone", range: 4.5, angle: 100 }, damage: [15], cooldownTicks: 60, minPhase: 1, weight: 1.4 }),
    ability("triple_judgment", "kurogane_shogun", { durationTicks: 54, impactTicks: [20, 31, 42], telegraphStartTick: 5, shape: { type: "combo", parts: ["cone", "side_line", "cone"] }, damage: [9, 9, 9], cooldownTicks: 105, minPhase: 1, weight: 1.0 }),
    ability("steel_rain", "kurogane_shogun", { durationTicks: 72, impactTicks: [42, 50, 58], telegraphStartTick: 12, shape: { type: "target_circles", radius: 2.25, counts: [3, 4, 5, 6] }, damage: [8, 8, 8], cooldownTicks: 145, minPhase: 1, weight: 0.9 }),
    ability("iron_counter", "kurogane_shogun", { durationTicks: 40, impactTicks: 24, shape: { type: "counter_cone", range: 4, angle: 110, counterWindow: [8, 20] }, damage: [14], cooldownTicks: 150, minPhase: 1, weight: 0.75 }),
    ability("execution_mark", "kurogane_shogun", { durationTicks: 70, impactTicks: 50, telegraphStartTick: 14, shape: { type: "target_circles", radius: 3.25, counts: [1, 1, 2, 2] }, damage: [19], cooldownTicks: 180, minPhase: 2, weight: 0.75 }),
    ability("black_banner_domain", "kurogane_shogun", { durationTicks: 84, impactTicks: [48, 60, 72], telegraphStartTick: 16, shape: { type: "rotating_lines", length: 26, width: 2, damageReduction: 0.25, reductionWindow: [16, 72] }, damage: [10, 10, 10], cooldownTicks: 240, minPhase: 3, weight: 0.55 }),
    ability("fivefold_judgment", "kurogane_shogun", { durationTicks: 180, impactTicks: [52, 78, 104, 130, 158], telegraphStartTick: 18, shape: { type: "fivefold", callbacks: ["jade_cross", "ghost_feint", "oni_ring", "seiryu_sector", "kurogane_cone"] }, damage: [10, 10, 10, 10, 24], cooldownTicks: 1200, minPhase: 4, weight: 0.3, ultimate: true }),
  ]),
});

export const BOSSES = Object.freeze([jade, ghost, oni, seiryu, kurogane]);
export const BOSS_ROAD_ANCHORS = Object.freeze(BOSSES.map((def) => Object.freeze({
  name: `boss_${def.key}`,
  displayName: `${def.displayName} approach`,
  region: def.zone.region,
  placementOrder: def.zone.placementOrder,
  entrance: Object.freeze({ x: def.zone.approach.x, y: def.zone.referenceY, z: def.zone.approach.z }),
})));
export const BOSS_BY_ID = Object.freeze(Object.fromEntries(BOSSES.map((boss) => [boss.id, boss])));
export const BOSS_BY_KEY = Object.freeze(Object.fromEntries(BOSSES.map((boss) => [boss.key, boss])));

export function getBossByStep(step) {
  return Number.isInteger(step) && step >= 0 && step < BOSSES.length ? BOSSES[step] : undefined;
}

export function phaseForRatio(ratio) {
  if (ratio <= 0.25) return 4;
  if (ratio <= 0.50) return 3;
  if (ratio <= 0.75) return 2;
  return 1;
}
