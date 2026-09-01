import { world } from "@minecraft/server";
import { DYNAMIC, GENERATION_VERSION, HYDRATION_VERSION, LAYOUT_VERSION, TREE_STRUCTURE_VERSION } from "../config.js";
import { GenerationStage } from "./state_machine.js";
import { migrateState } from "./migrations.js";

export function getString(id, fallback = "") {
    const value = world.getDynamicProperty(id);
    return typeof value === "string" ? value : fallback;
}

export function getNumber(id, fallback = 0) {
    const value = world.getDynamicProperty(id);
    return typeof value === "number" ? value : fallback;
}

export function getBoolean(id, fallback = false) {
    const value = world.getDynamicProperty(id);
    return typeof value === "boolean" ? value : fallback;
}

export function setValue(id, value) {
    world.setDynamicProperty(id, value);
}

export function getStage() {
    const raw = getString(DYNAMIC.stage, GenerationStage.Uninitialized);
    return Object.values(GenerationStage).includes(raw) ? raw : GenerationStage.FailedRecoverable;
}

export function setStage(stage) {
    setValue(DYNAMIC.stage, stage);
}

export function readJson(id, fallback) {
    const raw = getString(id);
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}

export function writeJson(id, value) {
    setValue(id, JSON.stringify(value));
}

const RESET_KEYS = [
    DYNAMIC.cellLedger,
    DYNAMIC.riverLedger,
    DYNAMIC.roadLedger,
    DYNAMIC.waterLedger,
    DYNAMIC.terrainReadyLedger,
    DYNAMIC.vegetationLedger,
    DYNAMIC.treeStructureLedger,
    DYNAMIC.bridgeStructureLedger,
    DYNAMIC.bridgeStructureVersion,
    DYNAMIC.structureLedger,
    DYNAMIC.blendLedger,
    DYNAMIC.failureState,
    DYNAMIC.activeJob,
    DYNAMIC.performanceMetrics,
    DYNAMIC.roadPlanCache,
    DYNAMIC.entryBootstrapVersion,
    DYNAMIC.outerTerrainLedger,
    DYNAMIC.outerTerrainVersion,
];

function validOrigin(value) {
    return Boolean(value && typeof value === "object" && typeof value.x === "number" && typeof value.z === "number");
}

export function getTerrainOrigin() {
    const value = readJson(DYNAMIC.terrainOrigin, undefined);
    return validOrigin(value) ? value : { x: 0, z: 0 };
}

export function getPreviousTerrainOrigin() {
    const value = readJson(DYNAMIC.previousTerrainOrigin, undefined);
    return validOrigin(value) ? value : undefined;
}

function resetLedgersAndFlags() {
    for (const key of RESET_KEYS)
        setValue(key, undefined);
    setValue(DYNAMIC.initialized, false);
    setValue(DYNAMIC.arrivalReady, false);
    setValue(DYNAMIC.contentReady, false);
    setValue(DYNAMIC.regionAComplete, false);
    setValue(DYNAMIC.regionBComplete, false);
    setValue(DYNAMIC.regionCComplete, false);
    setStage(GenerationStage.Uninitialized);
}

function persistMigratedState(state) {
    setValue(DYNAMIC.generationVersion, state.version);
    setValue(DYNAMIC.layoutVersion, state.layoutVersion);
    setValue(DYNAMIC.waterVersion, HYDRATION_VERSION);
    setValue(DYNAMIC.treeStructureVersion, TREE_STRUCTURE_VERSION);
    setValue(DYNAMIC.seed, state.seed);
    writeJson(DYNAMIC.terrainOrigin, state.origin);
    if (state.previousOrigin)
        writeJson(DYNAMIC.previousTerrainOrigin, state.previousOrigin);
    else
        setValue(DYNAMIC.previousTerrainOrigin, undefined);
}

function migrateTreeStructuresInPlace(previousTreeStructureVersion, origin) {
    if (previousTreeStructureVersion >= TREE_STRUCTURE_VERSION)
        return false;
    setValue(DYNAMIC.treeStructureLedger, undefined);
    setValue(DYNAMIC.treeStructureVersion, TREE_STRUCTURE_VERSION);
    setValue(DYNAMIC.initialized, false);
    setValue(DYNAMIC.failureState, "");
    setStage(GenerationStage.VegetationGenerating);
    writeJson(DYNAMIC.migrationState, {
        fromGenerationVersion: GENERATION_VERSION,
        toGenerationVersion: GENERATION_VERSION,
        fromTreeStructureVersion: previousTreeStructureVersion,
        toTreeStructureVersion: TREE_STRUCTURE_VERSION,
        previousOrigin: origin,
        newOrigin: origin,
        mode: "tree_and_pond_structure_decoration_in_place",
    });
    return true;
}


function recoverKnownBridgeCompatibilityFailure() {
    if (getStage() !== GenerationStage.FailedRecoverable)
        return false;
    const failure = readJson(DYNAMIC.failureState, undefined);
    const message = String(failure?.message ?? "");
    if (!message.includes("Authored bridge") || !message.includes("does not fit crossing"))
        return false;
    const resumeStage = Object.values(GenerationStage).includes(failure?.stage)
        && failure.stage !== GenerationStage.FailedRecoverable
        ? failure.stage
        : GenerationStage.BaseTerrainGenerating;
    setValue(DYNAMIC.failureState, "");
    setValue(DYNAMIC.activeJob, "");
    setValue(DYNAMIC.initialized, false);
    setStage(resumeStage);
    return true;
}
function migrateHydrationInPlace(previousWaterVersion, origin) {
    if (previousWaterVersion >= HYDRATION_VERSION)
        return false;
    setValue(DYNAMIC.waterLedger, undefined);
    setValue(DYNAMIC.waterVersion, HYDRATION_VERSION);
    setValue(DYNAMIC.initialized, false);
    setValue(DYNAMIC.failureState, "");
    setStage(GenerationStage.BaseTerrainGenerating);
    writeJson(DYNAMIC.migrationState, {
        fromGenerationVersion: GENERATION_VERSION,
        toGenerationVersion: GENERATION_VERSION,
        fromWaterVersion: previousWaterVersion,
        toWaterVersion: HYDRATION_VERSION,
        previousOrigin: origin,
        newOrigin: origin,
        mode: "water_ledger_rebuild_in_place",
    });
    return true;
}

export function ensureBaseState(seed) {
    const previousGenerationVersion = getNumber(DYNAMIC.generationVersion, 0);
    const previousLayoutVersion = getNumber(DYNAMIC.layoutVersion, 0);
    const previousWaterVersion = getNumber(DYNAMIC.waterVersion, 0);
    const previousTreeStructureVersion = getNumber(DYNAMIC.treeStructureVersion, 0);
    const persistedSeed = getNumber(DYNAMIC.seed, seed) || seed;
    const currentOrigin = getTerrainOrigin();
    const previousOrigin = getPreviousTerrainOrigin();
    const migratedState = migrateState({
        version: previousGenerationVersion,
        seed: persistedSeed,
        stage: getString(DYNAMIC.stage, GenerationStage.Uninitialized),
        layoutVersion: previousLayoutVersion,
        origin: currentOrigin,
        ...(previousOrigin ? { previousOrigin } : {}),
    });

    let hydrationMigrated = false;
    let treeStructuresMigrated = false;
    let bridgeCompatibilityRecovered = false;
    if (migratedState.resetGeneration) {
        resetLedgersAndFlags();
        writeJson(DYNAMIC.migrationState, {
            fromGenerationVersion: previousGenerationVersion,
            toGenerationVersion: GENERATION_VERSION,
            fromWaterVersion: previousWaterVersion,
            toWaterVersion: HYDRATION_VERSION,
            previousOrigin: migratedState.previousOrigin,
            newOrigin: migratedState.origin,
            mode: previousGenerationVersion === 0 ? "fresh" : "preserve_previous_origin_and_relocate",
        });
    }
    else {
        hydrationMigrated = migrateHydrationInPlace(previousWaterVersion, migratedState.origin);
        treeStructuresMigrated = migrateTreeStructuresInPlace(previousTreeStructureVersion, migratedState.origin);
        bridgeCompatibilityRecovered = recoverKnownBridgeCompatibilityFailure();
        if (!hydrationMigrated && !treeStructuresMigrated && !bridgeCompatibilityRecovered && !getString(DYNAMIC.stage))
            setStage(GenerationStage.Uninitialized);
    }

    persistMigratedState(migratedState);
    return {
        migrated: migratedState.resetGeneration,
        hydrationMigrated,
        treeStructuresMigrated,
        bridgeCompatibilityRecovered,
        previousGenerationVersion,
        previousWaterVersion,
        previousTreeStructureVersion,
        origin: migratedState.origin,
        previousOrigin: migratedState.previousOrigin,
    };
}

export function resetTerrainGeneration(origin, previousOrigin) {
    resetLedgersAndFlags();
    writeJson(DYNAMIC.previousTerrainOrigin, previousOrigin);
    writeJson(DYNAMIC.terrainOrigin, origin);
    setValue(DYNAMIC.generationVersion, GENERATION_VERSION);
    setValue(DYNAMIC.layoutVersion, LAYOUT_VERSION);
    setValue(DYNAMIC.waterVersion, HYDRATION_VERSION);
    setValue(DYNAMIC.treeStructureVersion, TREE_STRUCTURE_VERSION);
    writeJson(DYNAMIC.migrationState, {
        fromGenerationVersion: GENERATION_VERSION,
        toGenerationVersion: GENERATION_VERSION,
        fromWaterVersion: HYDRATION_VERSION,
        toWaterVersion: HYDRATION_VERSION,
        previousOrigin,
        newOrigin: origin,
        mode: "administrator_abandon_and_regenerate",
    });
}

export function setFailure(stage, error) {
    const current = readJson(DYNAMIC.failureState, undefined);
    writeJson(DYNAMIC.failureState, {
        stage,
        message: String(error),
        attempts: (current?.attempts ?? 0) + 1,
    });
    setStage(GenerationStage.FailedRecoverable);
    setValue(DYNAMIC.activeJob, "");
}

export function getFailureStage() {
    return readJson(DYNAMIC.failureState, undefined)?.stage;
}
