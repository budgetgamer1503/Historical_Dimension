export const CINEMATIC_PROFILES = Object.freeze({
  jade_storm_ronin: Object.freeze({
    introSeconds: 4.8,
    victorySeconds: 2.4,
    introOffsets: Object.freeze([
      Object.freeze({ x: -12, y: 5, z: -8 }),
      Object.freeze({ x: -8, y: 4, z: 5 }),
      Object.freeze({ x: 0, y: 3, z: 11 }),
      Object.freeze({ x: 9, y: 3, z: 5 }),
      Object.freeze({ x: 12, y: 4, z: -5 }),
    ]),
  }),
  tsukikage_ghost_samurai: Object.freeze({
    introSeconds: 5.0,
    victorySeconds: 2.5,
    introOffsets: Object.freeze([
      Object.freeze({ x: 0, y: 6, z: 13 }),
      Object.freeze({ x: -10, y: 5, z: 8 }),
      Object.freeze({ x: -7, y: 3, z: -4 }),
      Object.freeze({ x: 0, y: 2, z: -10 }),
      Object.freeze({ x: 8, y: 4, z: -5 }),
    ]),
  }),
  oni_blood_warlord: Object.freeze({
    introSeconds: 4.6,
    victorySeconds: 2.6,
    introOffsets: Object.freeze([
      Object.freeze({ x: -13, y: 3, z: -10 }),
      Object.freeze({ x: -8, y: 2, z: -4 }),
      Object.freeze({ x: -3, y: 2, z: 2 }),
      Object.freeze({ x: 4, y: 3, z: 6 }),
      Object.freeze({ x: 9, y: 5, z: 8 }),
    ]),
  }),
  seiryu_dragon_daimyo: Object.freeze({
    introSeconds: 5.2,
    victorySeconds: 2.5,
    introOffsets: Object.freeze([
      Object.freeze({ x: -10, y: 4, z: -10 }),
      Object.freeze({ x: -12, y: 8, z: 0 }),
      Object.freeze({ x: -6, y: 13, z: 10 }),
      Object.freeze({ x: 6, y: 16, z: 10 }),
      Object.freeze({ x: 12, y: 10, z: 0 }),
    ]),
  }),
  kurogane_shogun: Object.freeze({
    introSeconds: 5.4,
    victorySeconds: 2.8,
    introOffsets: Object.freeze([
      Object.freeze({ x: -18, y: 12, z: -16 }),
      Object.freeze({ x: -12, y: 10, z: -7 }),
      Object.freeze({ x: -6, y: 8, z: 0 }),
      Object.freeze({ x: 0, y: 6, z: 6 }),
      Object.freeze({ x: 7, y: 4, z: 8 }),
    ]),
  }),
});

export function getCinematicProfile(bossKey) {
  return CINEMATIC_PROFILES[bossKey];
}

export function buildCameraPoints(center, profile) {
  return profile.introOffsets.map((offset) => ({
    x: Number(center.x) + offset.x,
    y: Number(center.y) + offset.y,
    z: Number(center.z) + offset.z,
  }));
}

export function lookRotation(from, target) {
  const dx = Number(target.x) - Number(from.x);
  const dy = Number(target.y) - Number(from.y);
  const dz = Number(target.z) - Number(from.z);
  const horizontal = Math.hypot(dx, dz) || 1;
  const pitch = -Math.atan2(dy, horizontal) * 180 / Math.PI;
  let yaw = Math.atan2(dx, -dz) * 180 / Math.PI;
  if (yaw < 0) yaw += 360;
  return { x: pitch, y: yaw, z: 0 };
}

export function buildLookAtRotations(points, target) {
  let previousYaw;
  return points.map((point) => {
    const rotation = lookRotation(point, target);
    let yaw = rotation.y;

    // Camera keyframes interpolate numeric yaw values. Crossing 0/360 without unwrapping
    // can make the camera take the long way around and briefly point away from the boss.
    if (previousYaw !== undefined) {
      while (yaw - previousYaw > 180) yaw -= 360;
      while (yaw - previousYaw < -180) yaw += 360;
    }

    previousYaw = yaw;
    return { ...rotation, y: yaw };
  });
}
