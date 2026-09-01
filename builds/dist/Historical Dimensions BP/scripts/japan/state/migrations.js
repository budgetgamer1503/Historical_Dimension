import { FRESH_ORIGIN, LAYOUT_VERSION, MIGRATION_ORIGIN, TERRAIN_GENERATION_VERSION, TERRAIN_ORIGIN_STRIDE } from "../config.js";
export function nextTerrainOrigin(origin) {
    return { x: origin.x + TERRAIN_ORIGIN_STRIDE, z: origin.z };
}
export function migrateState(state) {
    const currentOrigin = state.origin ?? { ...FRESH_ORIGIN };
    const needsMigration = state.version < TERRAIN_GENERATION_VERSION || (state.layoutVersion ?? 0) < LAYOUT_VERSION;
    if (!needsMigration) {
        return { version: state.version, seed: state.seed, stage: state.stage, layoutVersion: state.layoutVersion ?? LAYOUT_VERSION, origin: currentOrigin, previousOrigin: state.previousOrigin, resetGeneration: false };
    }
    if (state.version === 0) {
        return { version: TERRAIN_GENERATION_VERSION, seed: state.seed, stage: "uninitialized", layoutVersion: LAYOUT_VERSION, origin: { ...FRESH_ORIGIN }, previousOrigin: undefined, resetGeneration: true };
    }
    const isFreshOrigin = currentOrigin.x === FRESH_ORIGIN.x && currentOrigin.z === FRESH_ORIGIN.z;
    const target = isFreshOrigin ? { ...MIGRATION_ORIGIN } : nextTerrainOrigin(currentOrigin);
    return { version: TERRAIN_GENERATION_VERSION, seed: state.seed, stage: "uninitialized", layoutVersion: LAYOUT_VERSION, origin: target, previousOrigin: currentOrigin, resetGeneration: true };
}
