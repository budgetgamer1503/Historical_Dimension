export class GenerationDemandTracker {
    constructor(graceTicks = 40) {
        this.graceTicks = Math.max(0, Math.floor(graceTicks));
        this.graceUntilByPlayer = new Map();
        this.pendingResumePlayers = new Set();
    }

    prune(currentTick) {
        for (const [playerId, untilTick] of this.graceUntilByPlayer)
            if (currentTick > untilTick)
                this.graceUntilByPlayer.delete(playerId);
    }

    noteEntered(playerId, currentTick) {
        if (!playerId)
            return;
        this.graceUntilByPlayer.set(playerId, currentTick + this.graceTicks);
        this.pendingResumePlayers.add(playerId);
    }

    noteLeft(playerId) {
        if (!playerId)
            return;
        this.graceUntilByPlayer.delete(playerId);
        this.pendingResumePlayers.delete(playerId);
    }

    requestResume(playerId) {
        if (playerId)
            this.pendingResumePlayers.add(playerId);
    }

    hasRecentEntry(currentTick) {
        this.prune(currentTick);
        return this.graceUntilByPlayer.size > 0;
    }

    hasPendingResume() {
        return this.pendingResumePlayers.size > 0;
    }

    consumePendingResume() {
        const hadPending = this.pendingResumePlayers.size > 0;
        this.pendingResumePlayers.clear();
        return hadPending;
    }

    clearPendingResume() {
        this.pendingResumePlayers.clear();
    }
}
