export function structureFoundationDepth(placement) {
    return placement.region === "B" || placement.region === "C" ? 6 : 4;
}
