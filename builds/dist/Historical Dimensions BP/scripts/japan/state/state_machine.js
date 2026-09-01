export var GenerationStage;
(function (GenerationStage) {
    GenerationStage["Uninitialized"] = "uninitialized";
    GenerationStage["DimensionRegistered"] = "dimension_registered";
    GenerationStage["LayoutValidated"] = "layout_validated";
    GenerationStage["BaseTerrainGenerating"] = "base_terrain_generating";
    GenerationStage["SurfaceGenerating"] = "surface_generating";
    GenerationStage["RoadsGenerating"] = "roads_generating";
    GenerationStage["WaterGenerating"] = "water_generating";
    GenerationStage["ArrivalPreparing"] = "arrival_preparing";
    GenerationStage["ArrivalReady"] = "arrival_ready";
    GenerationStage["RegionAStructures"] = "region_a_structures";
    GenerationStage["RegionBStructures"] = "region_b_structures";
    GenerationStage["RegionCStructures"] = "region_c_structures";
    GenerationStage["TerrainBlending"] = "terrain_blending";
    GenerationStage["VegetationGenerating"] = "vegetation_generating";
    GenerationStage["Validation"] = "validation";
    GenerationStage["Complete"] = "complete";
    GenerationStage["FailedRecoverable"] = "failed_recoverable";
})(GenerationStage || (GenerationStage = {}));
export function nextStageAfterRecovery(state) {
    return state.stage === GenerationStage.FailedRecoverable ? (state.failureStage ?? GenerationStage.BaseTerrainGenerating) : (state.failureStage ?? state.stage);
}
export const STAGE_ORDER = [
    GenerationStage.Uninitialized, GenerationStage.DimensionRegistered, GenerationStage.LayoutValidated,
    GenerationStage.BaseTerrainGenerating, GenerationStage.SurfaceGenerating, GenerationStage.RoadsGenerating,
    GenerationStage.WaterGenerating, GenerationStage.ArrivalPreparing, GenerationStage.ArrivalReady,
    GenerationStage.RegionAStructures, GenerationStage.RegionBStructures, GenerationStage.RegionCStructures,
    GenerationStage.TerrainBlending, GenerationStage.VegetationGenerating, GenerationStage.Validation, GenerationStage.Complete
];
