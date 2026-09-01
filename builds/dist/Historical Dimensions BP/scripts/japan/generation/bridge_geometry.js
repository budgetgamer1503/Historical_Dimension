export const AUTHORED_BRIDGE_SEGMENT_ID = "merchant_agriculture";
import { CELL_SIZE } from "../config.js";
function roundedPoint(bridge, longitudinal, lateral) {
    const perpendicular = { x: -bridge.direction.z, z: bridge.direction.x };
    return {
        x: Math.round(bridge.center.x + bridge.direction.x * longitudinal + perpendicular.x * lateral),
        z: Math.round(bridge.center.z + bridge.direction.z * longitudinal + perpendicular.z * lateral),
    };
}
function insideCell(x, z, cellMinX, cellMinZ) {
    return x >= cellMinX && x < cellMinX + CELL_SIZE && z >= cellMinZ && z < cellMinZ + CELL_SIZE;
}
export function bridgeDetailsForCell(bridge, cellMinX, cellMinZ) {
    const details = [];
    const seen = new Set();
    const halfLength = Math.max(4, Math.floor(bridge.length / 2));
    const halfWidth = Math.max(1, Math.floor(bridge.width / 2));
    const push = (detail) => {
        if (!insideCell(detail.x, detail.z, cellMinX, cellMinZ))
            return;
        const key = `${detail.kind}|${detail.x}|${detail.z}|${detail.fromY}|${detail.toY}`;
        if (seen.has(key))
            return;
        seen.add(key);
        details.push(detail);
    };
    for (let longitudinal = -halfLength + 1; longitudinal <= halfLength - 1; longitudinal += 2) {
        for (const lateral of [-halfWidth, halfWidth]) {
            const point = roundedPoint(bridge, longitudinal, lateral);
            push({ kind: "rail", x: point.x, z: point.z, fromY: bridge.center.y + 1, toY: bridge.center.y + 1 });
        }
    }
    const pierOffsets = bridge.length >= 16 ? [-Math.floor(bridge.length / 4), 0, Math.floor(bridge.length / 4)] : [0];
    for (const longitudinal of pierOffsets) {
        const point = roundedPoint(bridge, longitudinal, 0);
        push({ kind: "pier", x: point.x, z: point.z, fromY: 55, toY: bridge.center.y - 1 });
    }
    for (const longitudinal of [-halfLength, halfLength])
        for (let lateral = -halfWidth; lateral <= halfWidth; lateral++) {
            const point = roundedPoint(bridge, longitudinal, lateral);
            push({ kind: "abutment", x: point.x, z: point.z, fromY: bridge.center.y - 2, toY: bridge.center.y - 1 });
        }
    return details;
}
