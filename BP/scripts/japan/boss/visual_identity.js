const PARTICLES_BY_BOSS_KEY = Object.freeze({
  jade_storm_ronin: Object.freeze({ warning: "historyjam:jade_wind", accent: "historyjam:jade_lightning" }),
  tsukikage_ghost_samurai: Object.freeze({ warning: "historyjam:ghost_mist", accent: "historyjam:ghost_slash" }),
  oni_blood_warlord: Object.freeze({ warning: "historyjam:blood_mist", accent: "historyjam:blood_pool" }),
  seiryu_dragon_daimyo: Object.freeze({ warning: "historyjam:dragon_mist", accent: "historyjam:azure_flame" }),
  kurogane_shogun: Object.freeze({ warning: "historyjam:steel_spark", accent: "historyjam:black_banner" }),
});

function rgba(red, green, blue, alpha = 1) {
  return Object.freeze({ red, green, blue, alpha });
}

const FX2D_STYLE_BY_BOSS_KEY = Object.freeze({
  jade_storm_ronin: Object.freeze({
    primary: rgba(0.35, 0.95, 0.72, 0.92),
    secondary: rgba(0.72, 0.98, 1.0, 0.95),
  }),
  tsukikage_ghost_samurai: Object.freeze({
    primary: rgba(0.45, 0.38, 0.78, 0.88),
    secondary: rgba(0.90, 0.93, 1.0, 0.96),
    real: rgba(0.86, 0.91, 1.0, 0.98),
    fake: rgba(0.32, 0.28, 0.50, 0.52),
  }),
  oni_blood_warlord: Object.freeze({
    primary: rgba(0.86, 0.10, 0.14, 0.94),
    secondary: rgba(0.30, 0.02, 0.03, 0.90),
  }),
  seiryu_dragon_daimyo: Object.freeze({
    primary: rgba(0.24, 0.70, 1.0, 0.92),
    secondary: rgba(0.78, 0.95, 1.0, 0.96),
  }),
  kurogane_shogun: Object.freeze({
    primary: rgba(0.62, 0.64, 0.72, 0.94),
    secondary: rgba(0.92, 0.76, 0.34, 0.96),
  }),
});

export function particlesForBossKey(key) {
  return PARTICLES_BY_BOSS_KEY[key];
}

export function fx2dStyleForBossKey(key) {
  return FX2D_STYLE_BY_BOSS_KEY[key] ?? FX2D_STYLE_BY_BOSS_KEY.jade_storm_ronin;
}

export function isKuroganeBoss(def) {
  return def?.id === "historyjam:kurogane_shogun";
}
