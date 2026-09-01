export function parseStringLedger(raw) {
    if (!raw)
        return new Set();
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`invalid string ledger JSON: ${String(error)}`);
    }
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error("invalid string ledger shape");
    }
    return new Set(value);
}
export function encodeStringLedger(values) {
    return JSON.stringify([...values]);
}
