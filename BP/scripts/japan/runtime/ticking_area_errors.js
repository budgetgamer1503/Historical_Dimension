export class ManagedTickingAreaUnavailableError extends Error {
    constructor(reason, snapshot = {}, cause) {
        const requested = snapshot.requestedChunks ?? "?";
        const active = snapshot.chunkCount ?? "?";
        const maximum = snapshot.maxChunkCount ?? "?";
        super(`Managed ticking area temporarily unavailable (${reason}): requested=${requested} active=${active} max=${maximum}`);
        this.name = "ManagedTickingAreaUnavailableError";
        this.reason = reason;
        this.requestedChunks = snapshot.requestedChunks;
        this.chunkCount = snapshot.chunkCount;
        this.maxChunkCount = snapshot.maxChunkCount;
        this.cause = cause;
    }
}

export function isManagedTickingAreaUnavailable(error) {
    return error instanceof ManagedTickingAreaUnavailableError || error?.name === "ManagedTickingAreaUnavailableError";
}
