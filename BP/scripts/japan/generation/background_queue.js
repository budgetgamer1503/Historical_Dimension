function cellKey(cell) {
    return `${cell.x},${cell.z}`;
}

export function buildTieredTerrainQueue(priority1, priority2, fullOrder) {
    const output = [];
    const seen = new Set();
    const append = (cells, tier) => {
        for (const cell of cells) {
            const key = cellKey(cell);
            if (seen.has(key))
                continue;
            seen.add(key);
            output.push({ ...cell, terrainPriority: tier, deterministicIndex: output.length });
        }
    };
    append(priority1, 1);
    append(priority2, 2);
    append(fullOrder, 3);
    return output;
}

function cellCenter(cell, origin, hardMin, cellSize) {
    return {
        x: origin.x + hardMin + cell.x * cellSize + cellSize / 2,
        z: origin.z + hardMin + cell.z * cellSize + cellSize / 2,
    };
}

function distanceToFocus(cell, focusPoints, origin, options) {
    if (!focusPoints.length)
        return Number.POSITIVE_INFINITY;
    const center = cellCenter(cell, origin, options.hardMin, options.cellSize);
    let best = Number.POSITIVE_INFINITY;
    for (const point of focusPoints)
        best = Math.min(best, Math.hypot(center.x - point.x, center.z - point.z));
    return best;
}

export function selectNextTerrainCell(queue, focusPoints = [], origin = { x: 0, z: 0 }, options = {}) {
    if (!queue.length)
        return undefined;
    const resolved = {
        hardMin: options.hardMin ?? -512,
        cellSize: options.cellSize ?? 32,
        nearPlayerRadius: options.nearPlayerRadius ?? 192,
    };
    const priority1 = queue.find(cell => cell.terrainPriority === 1);
    if (priority1)
        return priority1;

    let bestPriority2;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cell of queue) {
        const distance = distanceToFocus(cell, focusPoints, origin, resolved);
        const playerBoosted = cell.terrainPriority === 3 && distance <= resolved.nearPlayerRadius;
        if (cell.terrainPriority !== 2 && !playerBoosted)
            continue;
        if (!bestPriority2 || distance < bestDistance ||
            (distance === bestDistance && cell.deterministicIndex < bestPriority2.deterministicIndex)) {
            bestPriority2 = cell;
            bestDistance = distance;
        }
    }
    if (bestPriority2)
        return bestPriority2;
    return queue.reduce((best, cell) => !best || cell.deterministicIndex < best.deterministicIndex ? cell : best, undefined);
}

export function shouldPipelinePreload({ hasCapacity, chunkCount, maxChunkCount, requestedChunks }) {
    if (!hasCapacity)
        return false;
    const active = Math.max(0, Number(chunkCount) || 0);
    const maximum = Math.max(0, Number(maxChunkCount) || 0);
    const requested = Math.max(0, Number(requestedChunks) || 0);
    return requested > 0 && active + requested <= maximum;
}

export function removeQueuedCell(queue, cell) {
    const key = cellKey(cell);
    const index = queue.findIndex(item => cellKey(item) === key);
    if (index < 0)
        return false;
    queue.splice(index, 1);
    return true;
}

export function requeueTerrainCell(queue, cell) {
    const key = cellKey(cell);
    if (queue.some(item => cellKey(item) === key))
        return false;
    queue.push(cell);
    queue.sort((a, b) => (a.terrainPriority - b.terrainPriority) || (a.deterministicIndex - b.deterministicIndex));
    return true;
}

export function connectedTerrainFrontier(queue, isComplete) {
    if (!Array.isArray(queue) || queue.length === 0)
        return [];
    const complete = typeof isComplete === "function" ? isComplete : () => false;
    return queue.filter((cell) => {
        const x = Number(cell?.x);
        const z = Number(cell?.z);
        if (!Number.isFinite(x) || !Number.isFinite(z))
            return false;
        return complete(x + 1, z)
            || complete(x - 1, z)
            || complete(x, z + 1)
            || complete(x, z - 1);
    });
}
