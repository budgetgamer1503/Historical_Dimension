import { MemoryTier, system } from "@minecraft/server";
import { ACTIVE_CELL_COUNT, TERRAIN_GENERATION_VERSION } from "../config.js";

class TerrainMetrics {
    stage = "idle";
    cell = "none";
    queue = 0;
    waiting = 0;
    completed = 0;
    fills = 0;
    blocks = 0;
    retries = 0;
    unloaded = 0;
    structures = 0;
    waterTicks = 0;
    columnCacheHits = 0;
    columnCacheMisses = 0;
    active = 0;
    started = 0;
    stageStart = 0;
    cellStart = 0;
    cellStartFills = 0;
    cellStartBlocks = 0;
    recent = [];
    memoryTier;

    terrainTotalRegions = ACTIVE_CELL_COUNT;
    terrainCompletedRegions = 0;
    terrainQueuedRegions = ACTIVE_CELL_COUNT;
    terrainLoadingRegions = 0;
    terrainGeneratingRegion = "none";
    terrainRemoteRegions = 0;
    remoteTerrainValidations = 0;
    remoteTerrainValidationFailures = 0;
    tickingAreaLoadAttempts = 0;
    tickingAreaCapacityDeferrals = 0;
    terrainGenerationFailures = 0;
    pipelinePreloads = 0;
    pipelinePromotions = 0;
    pipelineEnabled = false;
    observedMaxChunkCount = 0;
    observedChunkCount = 0;

    treeRegionsQueued = 0;
    treeRegionsCompleted = 0;
    treeCandidatesEvaluated = 0;
    treesPlaced = 0;
    treeProtectionRejections = 0;
    treeGroundRejections = 0;
    treePlacementFailures = 0;

    constructor() {
        this.memoryTier = Number(system.serverSystemInfo.memoryTier ?? MemoryTier.Mid);
    }

    startSession() {
        if (this.started === 0)
            this.started = system.currentTick;
        this.stageStart = system.currentTick;
        this.active = 1;
    }

    endSession() {
        if (this.stage === "water_generating")
            this.waterTicks += Math.max(0, system.currentTick - this.stageStart);
        this.active = 0;
        this.cell = "none";
        this.queue = 0;
        this.waiting = 0;
        this.terrainLoadingRegions = 0;
        this.terrainGeneratingRegion = "none";
    }

    setQueue(depth, waiting) {
        this.queue = Math.max(0, depth);
        this.waiting = Math.max(0, waiting);
    }

    setTerrainProgress(total, completed, queued = undefined) {
        this.terrainTotalRegions = Math.max(0, total);
        this.terrainCompletedRegions = Math.max(0, completed);
        this.terrainQueuedRegions = Math.max(0, queued ?? (total - completed));
    }

    setTreeProgress(queued, completed) {
        this.treeRegionsQueued = Math.max(0, queued);
        this.treeRegionsCompleted = Math.max(0, completed);
    }

    setStage(stage) {
        if (this.stage === stage)
            return;
        if (this.stage === "water_generating")
            this.waterTicks += Math.max(0, system.currentTick - this.stageStart);
        this.stage = stage;
        this.stageStart = system.currentTick;
    }

    beginCell(cell) {
        this.cell = cell;
        this.cellStart = system.currentTick;
        this.cellStartFills = this.fills;
        this.cellStartBlocks = this.blocks;
    }

    beginTerrainRegion(regionKey, loading = false) {
        if (loading)
            this.terrainLoadingRegions++;
        else
            this.terrainGeneratingRegion = regionKey;
    }

    finishTerrainLoad(regionKey, promote = true) {
        this.terrainLoadingRegions = Math.max(0, this.terrainLoadingRegions - 1);
        if (promote)
            this.terrainGeneratingRegion = regionKey;
    }

    promoteTerrainRegion(regionKey) {
        this.terrainGeneratingRegion = regionKey;
    }

    endTerrainRegion() {
        this.terrainGeneratingRegion = "none";
    }

    completeCell() {
        this.completed++;
        this.recent.push({
            stage: this.stage,
            cell: this.cell,
            ticks: Math.max(0, system.currentTick - this.cellStart),
            fillCalls: this.fills - this.cellStartFills,
            estimatedBlocks: this.blocks - this.cellStartBlocks,
        });
        if (this.recent.length > 32)
            this.recent.shift();
    }

    recordFill(blocks) {
        this.fills++;
        this.blocks += Math.max(0, Math.floor(blocks));
    }

    recordRetry(unloaded = false) {
        this.retries++;
        if (unloaded)
            this.unloaded++;
    }

    recordStructure() { this.structures++; }
    recordColumnCache(hit) { hit ? this.columnCacheHits++ : this.columnCacheMisses++; }
    recordRemoteTerrainRegion() { this.terrainRemoteRegions++; }
    recordRemoteTerrainValidation(success = true) {
        this.remoteTerrainValidations++;
        if (!success)
            this.remoteTerrainValidationFailures++;
    }
    recordTerrainFailure() { this.terrainGenerationFailures++; }
    recordCapacityDeferral() { this.tickingAreaCapacityDeferrals++; }
    recordPipelinePreload() { this.pipelinePreloads++; this.pipelineEnabled = true; }
    recordPipelinePromotion() { this.pipelinePromotions++; }
    recordTreeCandidate() { this.treeCandidatesEvaluated++; }
    recordTreePlaced() { this.treesPlaced++; }
    recordTreeProtectionRejection() { this.treeProtectionRejections++; }
    recordTreeGroundRejection() { this.treeGroundRejections++; }
    recordTreePlacementFailure() { this.treePlacementFailures++; }
    recordTreeRegionComplete() { this.treeRegionsCompleted++; }

    recordTickingAreaAttempt(chunkCount, maxChunkCount) {
        this.tickingAreaLoadAttempts++;
        this.observedChunkCount = Math.max(0, Number(chunkCount) || 0);
        this.observedMaxChunkCount = Math.max(this.observedMaxChunkCount, Math.max(0, Number(maxChunkCount) || 0));
    }

    get yieldEvery() {
        return this.memoryTier <= MemoryTier.SuperLow ? 1 :
            this.memoryTier === MemoryTier.Low ? 2 :
                this.memoryTier === MemoryTier.Mid ? 4 : 8;
    }

    get columnsPerYield() {
        return this.memoryTier <= MemoryTier.SuperLow ? 4 :
            this.memoryTier === MemoryTier.Low ? 8 :
                this.memoryTier === MemoryTier.Mid ? 16 :
                    this.memoryTier === MemoryTier.High ? 24 : 32;
    }

    get vegetationCandidatesPerYield() {
        return this.memoryTier <= MemoryTier.Low ? 1 :
            this.memoryTier === MemoryTier.Mid ? 3 :
                this.memoryTier === MemoryTier.High ? 4 : 6;
    }

    get maxBlocksPerFill() {
        return this.memoryTier <= MemoryTier.SuperLow ? 512 :
            this.memoryTier === MemoryTier.Low ? 1024 :
                this.memoryTier === MemoryTier.Mid ? 4096 :
                    this.memoryTier === MemoryTier.High ? 8192 : 12288;
    }

    get cellBatchSpan() {
        return this.memoryTier <= MemoryTier.Low ? 1 :
            this.memoryTier === MemoryTier.Mid ? 2 :
                this.memoryTier === MemoryTier.High ? 3 : 4;
    }

    get tickingChunkReserve() {
        return this.memoryTier <= MemoryTier.Low ? 8 : 16;
    }

    get columnCacheLimit() {
        return this.memoryTier <= MemoryTier.SuperLow ? 8 :
            this.memoryTier === MemoryTier.Low ? 16 :
                this.memoryTier === MemoryTier.Mid ? 40 : 64;
    }

    snapshot() {
        return {
            terrainVersion: 4.0,
            generationVersion: TERRAIN_GENERATION_VERSION,
            memoryTier: this.memoryTier,
            activeJobs: this.active,
            queueDepth: this.queue,
            cellsWaiting: this.waiting,
            cellsCompleted: this.completed,
            currentStage: this.stage,
            currentCell: this.cell,
            fillCalls: this.fills,
            estimatedBlocksChanged: this.blocks,
            retryCount: this.retries,
            unloadedChunkFailures: this.unloaded,
            structurePlacements: this.structures,
            waterStageTicks: this.waterTicks,
            columnCacheHits: this.columnCacheHits,
            columnCacheMisses: this.columnCacheMisses,
            totalTerrainRegions: this.terrainTotalRegions,
            completedTerrainRegions: this.terrainCompletedRegions,
            remainingTerrainRegions: Math.max(0, this.terrainTotalRegions - this.terrainCompletedRegions),
            queuedTerrainRegions: this.terrainQueuedRegions,
            loadingTerrainRegions: this.terrainLoadingRegions,
            generatingTerrainRegion: this.terrainGeneratingRegion,
            remoteTerrainRegions: this.terrainRemoteRegions,
            remoteTerrainValidations: this.remoteTerrainValidations,
            remoteTerrainValidationFailures: this.remoteTerrainValidationFailures,
            tickingAreaLoadAttempts: this.tickingAreaLoadAttempts,
            tickingAreaCapacityDeferrals: this.tickingAreaCapacityDeferrals,
            terrainGenerationFailures: this.terrainGenerationFailures,
            failedTerrainRegions: this.terrainGenerationFailures,
            deferredTerrainRegions: this.tickingAreaCapacityDeferrals,
            pipelineEnabled: this.pipelineEnabled,
            pipelinePreloads: this.pipelinePreloads,
            pipelinePromotions: this.pipelinePromotions,
            observedMaxChunkCount: this.observedMaxChunkCount,
            observedChunkCount: this.observedChunkCount,
            treeRegionsQueued: this.treeRegionsQueued,
            treeRegionsCompleted: this.treeRegionsCompleted,
            candidatesEvaluated: this.treeCandidatesEvaluated,
            treesPlaced: this.treesPlaced,
            roadVillageProtectionRejections: this.treeProtectionRejections,
            unsuitableGroundRejections: this.treeGroundRejections,
            treeStructurePlacementFailures: this.treePlacementFailures,
            startedTick: this.started,
            lastUpdatedTick: system.currentTick,
            recentCells: [...this.recent],
        };
    }
}

export const terrainMetrics = new TerrainMetrics();
