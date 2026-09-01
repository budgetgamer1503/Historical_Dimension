export function hash32(x) {
    x |= 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
}
function lattice(x, z, seed) {
    const h = hash32(Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495) ^ seed);
    return h / 0xffffffff;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
export function deterministicNoise2D(x, z, seed) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = smooth(x - x0);
    const tz = smooth(z - z0);
    const a = lerp(lattice(x0, z0, seed), lattice(x0 + 1, z0, seed), tx);
    const b = lerp(lattice(x0, z0 + 1, seed), lattice(x0 + 1, z0 + 1, seed), tx);
    return lerp(a, b, tz) * 2 - 1;
}
export function fractalNoise2D(x, z, seed, octaves = 4) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
        value += deterministicNoise2D(x * frequency, z * frequency, seed + i * 1013) * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return value / total;
}
