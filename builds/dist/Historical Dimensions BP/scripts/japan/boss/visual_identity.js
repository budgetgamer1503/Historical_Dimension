const PARTICLES_BY_BOSS_KEY = Object.freeze({
  jade_storm_ronin: Object.freeze({ warning: "historyjam:jade_wind", accent: "historyjam:jade_lightning" }),
  tsukikage_ghost_samurai: Object.freeze({ warning: "historyjam:ghost_mist", accent: "historyjam:ghost_slash" }),
  oni_blood_warlord: Object.freeze({ warning: "historyjam:blood_mist", accent: "historyjam:blood_pool" }),
  seiryu_dragon_daimyo: Object.freeze({ warning: "historyjam:dragon_mist", accent: "historyjam:azure_flame" }),
  kurogane_shogun: Object.freeze({ warning: "historyjam:steel_spark", accent: "historyjam:black_banner" }),
});

export function particlesForBossKey(key) {
  return PARTICLES_BY_BOSS_KEY[key];
}

export function isKuroganeBoss(def) {
  return def?.id === "historyjam:kurogane_shogun";
}
