export const LEGACY_PROCEDURAL_END_PADDING_TOTAL = 8;
export const AUTHORED_BANK_OVERLAP_PER_END = 2;

export function authoredBridgeCoverage(bridge, templateSize) {
    const legacyLength = Math.max(1, Math.ceil(Number(bridge?.length ?? 0)));
    const requiredWidth = Math.max(1, Math.ceil(Number(bridge?.width ?? 0)));
    const wetSpan = Math.max(1, legacyLength - LEGACY_PROCEDURAL_END_PADDING_TOTAL);
    const naturalCoverage = Math.max(1, Number(templateSize?.z ?? 0) - AUTHORED_BANK_OVERLAP_PER_END * 2);
    const approachExtension = Math.max(0, Math.ceil((wetSpan - naturalCoverage) / 2));
    return { legacyLength, requiredWidth, wetSpan, naturalCoverage, approachExtension };
}

export function authoredBridgeWidthFits(bridge, templateSize) {
    return authoredBridgeCoverage(bridge, templateSize).requiredWidth <= Number(templateSize?.x ?? 0);
}
