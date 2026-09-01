function bytesToBase64(bytes) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] ?? 0, b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
        const n = (a << 16) | (b << 8) | c;
        out += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63] +
            (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=") +
            (i + 2 < bytes.length ? alphabet[n & 63] : "=");
    }
    return out;
}
function base64ToBytes(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = value.replace(/=+$/, "");
    const out = [];
    let buffer = 0, bits = 0;
    for (const ch of clean) {
        const v = alphabet.indexOf(ch);
        if (v < 0)
            continue;
        buffer = (buffer << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buffer >>> bits) & 255);
        }
    }
    return new Uint8Array(out);
}
export class CellLedger {
    width;
    height;
    bits;
    completedCount = 0;
    constructor(width, height, bits) {
        this.width = width;
        this.height = height;
        this.bits = bits ?? new Uint8Array(Math.ceil(width * height / 8));
        for (const byte of this.bits) {
            let n = byte;
            while (n) {
                this.completedCount += n & 1;
                n >>>= 1;
            }
        }
    }
    index(x, z) {
        if (x < 0 || z < 0 || x >= this.width || z >= this.height)
            throw new RangeError("cell outside ledger");
        return z * this.width + x;
    }
    isComplete(x, z) { const i = this.index(x, z); return (this.bits[i >> 3] & (1 << (i & 7))) !== 0; }
    markComplete(x, z) { const i = this.index(x, z), mask = 1 << (i & 7); if ((this.bits[i >> 3] & mask) === 0) {
        this.bits[i >> 3] = this.bits[i >> 3] | mask;
        this.completedCount++;
    } }
    markIncomplete(x, z) { const i = this.index(x, z), mask = 1 << (i & 7); if ((this.bits[i >> 3] & mask) === 0)
        return false; this.bits[i >> 3] = this.bits[i >> 3] & ~mask; this.completedCount = Math.max(0, this.completedCount - 1); return true; }
    encode() { return bytesToBase64(this.bits); }
    static decode(width, height, encoded) { const bytes = base64ToBytes(encoded); const expected = Math.ceil(width * height / 8); if (bytes.length !== expected)
        throw new Error(`corrupt cell ledger: expected ${expected} bytes, got ${bytes.length}`); return new CellLedger(width, height, bytes); }
}
