export function tickingChunkCount(from, to) {
    const minChunkX = Math.floor(Math.min(from.x, to.x) / 16);
    const maxChunkX = Math.floor(Math.max(from.x, to.x) / 16);
    const minChunkZ = Math.floor(Math.min(from.z, to.z) / 16);
    const maxChunkZ = Math.floor(Math.max(from.z, to.z) / 16);
    return (maxChunkX - minChunkX + 1) * (maxChunkZ - minChunkZ + 1);
}

export class TickingCapacityError extends Error {
    constructor(message, requestedChunks, availableChunks) {
        super(message);
        this.name = "TickingCapacityError";
        this.requestedChunks = requestedChunks;
        this.availableChunks = availableChunks;
    }
}

export function generationChunkBudget(maxChunkCount, requestedReserve, minimumGenerationChunks = 4) {
    const reportedMaximum = Math.max(0, Math.floor(Number(maxChunkCount) || 0));
    const minimum = Math.max(1, Math.floor(minimumGenerationChunks));
    if (reportedMaximum === 0)
        return minimum;
    const boundedMinimum = Math.min(reportedMaximum, minimum);
    const reserve = Math.min(Math.max(0, Math.floor(requestedReserve)), Math.max(0, reportedMaximum - boundedMinimum));
    return reportedMaximum - reserve;
}

export function splitCellGroup(group) {
    if (group.length <= 1)
        return [group, []];
    const minX = Math.min(...group.map(cell => cell.x));
    const maxX = Math.max(...group.map(cell => cell.x));
    const minZ = Math.min(...group.map(cell => cell.z));
    const maxZ = Math.max(...group.map(cell => cell.z));
    const axis = (maxX - minX) >= (maxZ - minZ) ? "x" : "z";
    const sorted = [...group].sort((a, b) => a[axis] - b[axis] || a.x - b.x || a.z - b.z);
    const midpoint = Math.ceil(sorted.length / 2);
    return [sorted.slice(0, midpoint), sorted.slice(midpoint)];
}

export function partitionCellGroups(group, makeBounds, maxChunks) {
    const budget = Math.max(1, Math.floor(maxChunks));
    const output = [];
    const pending = [[...group]];
    while (pending.length) {
        const candidate = pending.pop();
        if (!candidate?.length)
            continue;
        const bounds = makeBounds(candidate);
        const chunks = tickingChunkCount(bounds.from, bounds.to);
        if (chunks <= budget) {
            output.push({ cells: candidate, bounds, chunks });
            continue;
        }
        if (candidate.length === 1) {
            throw new TickingCapacityError(
                `single-cell ticking area requires ${chunks} chunks but only ${budget} are available`,
                chunks,
                budget,
            );
        }
        const [left, right] = splitCellGroup(candidate);
        if (right.length)
            pending.push(right);
        if (left.length)
            pending.push(left);
    }
    return output;
}
