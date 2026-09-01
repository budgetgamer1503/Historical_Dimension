export const NAMESPACE = "historyjam";
export const DIMENSION_ID = "historyjam:sengoku_japan";
export const TERRAIN_GENERATION_VERSION = 11;
export const GENERATION_VERSION = TERRAIN_GENERATION_VERSION;
export const LAYOUT_VERSION = 6;
export const HYDRATION_VERSION = 6;
export const ENTRY_BOOTSTRAP_VERSION = 3;
export const TREE_STRUCTURE_VERSION = 6;
export const BRIDGE_STRUCTURE_VERSION = 1;
export const CELL_SIZE = 32;
export const GRID_SIZE = 32;
export const HARD_MIN = -512;
export const HARD_MAX = 511;
// Mixed-province terrain keeps the existing 32x32 ledgers and terrain-v2
// dynamic-property keys for save compatibility, but generates only the
// inhabited 30x27-cell rectangle. The omitted rows never contained a supplied
// structure or required route.
export const ACTIVE_CELL_MIN_X = 0;
export const ACTIVE_CELL_MAX_X = 29;
export const ACTIVE_CELL_MIN_Z = 3;
export const ACTIVE_CELL_MAX_Z = 29;
export const ACTIVE_CELL_COUNT = (ACTIVE_CELL_MAX_X - ACTIVE_CELL_MIN_X + 1) * (ACTIVE_CELL_MAX_Z - ACTIVE_CELL_MIN_Z + 1);
export const ACTIVE_MIN_X = HARD_MIN + ACTIVE_CELL_MIN_X * CELL_SIZE;
export const ACTIVE_MAX_X = HARD_MIN + (ACTIVE_CELL_MAX_X + 1) * CELL_SIZE - 1;
export const ACTIVE_MIN_Z = HARD_MIN + ACTIVE_CELL_MIN_Z * CELL_SIZE;
export const ACTIVE_MAX_Z = HARD_MIN + (ACTIVE_CELL_MAX_Z + 1) * CELL_SIZE - 1;
export const CORE_MIN = -448;
export const CORE_MAX = 383;
export const FRESH_ORIGIN = { x: 0, z: 0 };
export const MIGRATION_ORIGIN = { x: 4096, z: 0 };
export const TERRAIN_ORIGIN_STRIDE = 2048;
export const ARRIVAL = { x: 0, y: 74, z: 0 };
export const ARRIVAL_HORIZON_RADIUS = 32;
export const ARRIVAL_BACKGROUND_HORIZON_RADIUS = 128;
export const ARRIVAL_DRY_AGRICULTURE_RADIUS = 168;
export const EXIT = { x: 12, y: 74, z: 0 };
export const OVERWORLD_RETURN = { x: 0, y: 100, z: 0 };
export const DYNAMIC = {
    generationVersion: "historyjam:sengoku_generation_version",
    initialized: "historyjam:sengoku_initialized",
    seed: "historyjam:sengoku_seed",
    stage: "historyjam:sengoku_stage",
    cellLedger: "historyjam:sengoku_cell_ledger",
    riverLedger: "historyjam:sengoku_river_ledger",
    roadLedger: "historyjam:sengoku_road_ledger",
    waterLedger: "historyjam:sengoku_water_ledger",
    terrainReadyLedger: "historyjam:sengoku_terrain_ready_ledger",
    waterVersion: "historyjam:sengoku_water_version",
    vegetationLedger: "historyjam:sengoku_vegetation_ledger",
    treeStructureLedger: "historyjam:sengoku_tree_structure_ledger",
    treeStructureVersion: "historyjam:sengoku_tree_structure_version",
    bridgeStructureLedger: "historyjam:sengoku_bridge_structure_ledger",
    bridgeStructureVersion: "historyjam:sengoku_bridge_structure_version",
    structureLedger: "historyjam:sengoku_structure_ledger",
    blendLedger: "historyjam:sengoku_blend_ledger",
    layoutVersion: "historyjam:sengoku_layout_version",
    activeJob: "historyjam:sengoku_active_job",
    failureState: "historyjam:sengoku_failure_state",
    arrivalReady: "historyjam:sengoku_arrival_ready",
    contentReady: "historyjam:sengoku_content_ready",
    entryBootstrapVersion: "historyjam:sengoku_entry_bootstrap_version",
    regionAComplete: "historyjam:sengoku_region_a_complete",
    regionBComplete: "historyjam:sengoku_region_b_complete",
    regionCComplete: "historyjam:sengoku_region_c_complete",
    terrainOrigin: "historyjam:sengoku_terrain_v2_origin",
    previousTerrainOrigin: "historyjam:sengoku_previous_terrain_origin",
    migrationState: "historyjam:sengoku_terrain_migration_state",
    resetArmedTick: "historyjam:sengoku_terrain_reset_armed_tick",
    performanceMetrics: "historyjam:sengoku_terrain_v2_metrics",
    roadPlanCache: "historyjam:sengoku_road_plan_cache",
    outerTerrainLedger: "historyjam:sengoku_outer_terrain_ledger",
    outerTerrainVersion: "historyjam:sengoku_outer_terrain_version"
};
