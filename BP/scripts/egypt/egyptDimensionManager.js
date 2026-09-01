import { world, system, BlockVolume, GameMode, WeatherType } from "@minecraft/server";
import { EGYPT_DIMENSION_ID } from "./egyptRuntime.js";
const BUILD_PROPERTY = "eoh:egypt_dimension_built_v310";
const BUILD_PROGRESS_PROPERTY = "eoh:egypt_dimension_build_progress_v310";
const SAND_PROGRESS_PROPERTY = "eoh:egypt_sand_progress_v310";
const BUILD_VERSION = "3.10.0";
const RETURN_X = "eoh:return_x";
const RETURN_Y = "eoh:return_y";
const RETURN_Z = "eoh:return_z";
const RETURN_SAVED = "eoh:return_saved";
export const EGYPT_SPAWN = { x: 203.5, y: -60, z: 101.5 };
const SPAWN_FLOOR = { x: 203, y: -61, z: 101 };
const SANCTUM_ANCHOR = { x: 101, y: 24, z: 102 };
function buildSections() {
    const sections = [];
    for (let ix = 0; ix < 4; ix += 1) {
        for (let iz = 0; iz < 4; iz += 1) {
            const x = ix * 64;
            const z = iz * 64;
            const sx = ix === 3 ? 16 : 64;
            const sz = iz === 3 ? 16 : 64;
            sections.push({
                id: `eoh:egypt_x${ix}_z${iz}_y0`,
                origin: { x, y: -64, z },
                size: { x: sx, y: 64, z: sz },
            });
            sections.push({
                id: `eoh:egypt_x${ix}_z${iz}_y1`,
                origin: { x, y: 0, z },
                size: { x: sx, y: 41, z: sz },
            });
        }
    }
    return sections;
}
const SECTIONS = buildSections();
const ROUTE_PRIORITY = [26, 27, 18, 19, 20, 21, 12, 13, 4, 5, 2, 3, 10, 11];
const BUILD_ORDER = [...ROUTE_PRIORITY, ...SECTIONS.map((_, index) => index).filter((index) => !ROUTE_PRIORITY.includes(index))];
const ARRIVAL_SECTION_INDEX = 26;
let buildPromise;
function safe(callback, fallback) {
    try {
        return callback();
    }
    catch {
        return fallback;
    }
}
function waitTicks(ticks) {
    return new Promise((resolve) => system.runTimeout(resolve, ticks));
}
function egyptDimension() {
    return world.getDimension(EGYPT_DIMENSION_ID);
}
function saveOverworldReturn(player) {
    if (safe(() => player.dimension.id, "") !== "minecraft:overworld")
        return;
    const location = player.location;
    safe(() => player.setDynamicProperty(RETURN_X, Number(location.x)));
    safe(() => player.setDynamicProperty(RETURN_Y, Number(location.y)));
    safe(() => player.setDynamicProperty(RETURN_Z, Number(location.z)));
    safe(() => player.setDynamicProperty(RETURN_SAVED, true));
    safe(() => player.setDynamicProperty("egypt:return_x", Number(location.x)));
    safe(() => player.setDynamicProperty("egypt:return_y", Number(location.y)));
    safe(() => player.setDynamicProperty("egypt:return_z", Number(location.z)));
}
function isReady() {
    if (safe(() => world.getDynamicProperty(BUILD_PROPERTY), "") !== BUILD_VERSION)
        return false;
    const dim = safe(() => egyptDimension(), undefined);
    if (!dim)
        return false;
    const floor = safe(() => dim.getBlock(SPAWN_FLOOR)?.typeId, "minecraft:air");
    const anchor = safe(() => dim.getBlock(SANCTUM_ANCHOR)?.typeId, "minecraft:air");
    return floor === "minecraft:grass" && anchor === "minecraft:diamond_block";
}
function structureCandidates(section, available) {
    const basename = section.id.split("/").pop() ?? section.id;
    const candidates = [
        section.id,
        `eoh:${basename}`,
        `eoh:egypt/${basename}`,
        `mystructure:eoh/egypt/${basename}`,
        `mystructure:eoh/${basename}`,
        `mystructure:${basename}`,
    ];
    for (const id of available) {
        if (id === section.id || id.endsWith(`/${basename}`) || id.endsWith(`:${basename}`))
            candidates.unshift(id);
    }
    return [...new Set(candidates)];
}
async function withTickingArea(id, from, to, callback) {
    const manager = safe(() => world.tickingAreaManager, undefined);
    const dim = egyptDimension();
    let created = false;
    if (manager?.createTickingArea) {
        safe(() => manager.removeTickingArea(id));
        try {
            await manager.createTickingArea(id, { dimension: dim, from, to });
            created = true;
        }
        catch {
        }
    }
    try {
        callback();
        await waitTicks(2);
    }
    finally {
        if (created)
            safe(() => manager.removeTickingArea(id));
    }
}
async function placeSection(section, index, available) {
    const manager = world.structureManager;
    const dim = egyptDimension();
    let lastError = "unknown placement failure";
    for (const id of structureCandidates(section, available)) {
        try {
            await withTickingArea(`eoh_egypt_build_${index}`, section.origin, {
                x: section.origin.x + section.size.x - 1,
                y: section.origin.y + section.size.y - 1,
                z: section.origin.z + section.size.z - 1,
            }, () => manager.place(id, dim, section.origin));
            return;
        }
        catch (error) {
            lastError = String(error);
        }
    }
    throw new Error(`Unable to place ${section.id}: ${lastError}`);
}
function buildSandTiles() {
    const tiles = [];
    const outerMin = -64;
    const outerMax = 271;
    const mapMin = 0;
    const mapMax = 207;
    const step = 32;
    for (let x = outerMin; x <= outerMax; x += step) {
        for (let z = outerMin; z <= outerMax; z += step) {
            const x2 = Math.min(x + step - 1, outerMax);
            const z2 = Math.min(z + step - 1, outerMax);
            const intersectsAuthored = !(x2 < mapMin || x > mapMax || z2 < mapMin || z > mapMax);
            if (intersectsAuthored) {
                const pieces = [];
                if (z < mapMin)
                    pieces.push({ x1: x, z1: z, x2, z2: Math.min(z2, mapMin - 1) });
                if (z2 > mapMax)
                    pieces.push({ x1: x, z1: Math.max(z, mapMax + 1), x2, z2 });
                const iz1 = Math.max(z, mapMin);
                const iz2 = Math.min(z2, mapMax);
                if (iz1 <= iz2 && x < mapMin)
                    pieces.push({ x1: x, z1: iz1, x2: Math.min(x2, mapMin - 1), z2: iz2 });
                if (iz1 <= iz2 && x2 > mapMax)
                    pieces.push({ x1: Math.max(x, mapMax + 1), z1: iz1, x2, z2: iz2 });
                for (const piece of pieces)
                    if (piece.x1 <= piece.x2 && piece.z1 <= piece.z2)
                        tiles.push(piece);
            }
            else {
                tiles.push({ x1: x, z1: z, x2, z2 });
            }
        }
    }
    return tiles;
}
const SAND_TILES = buildSandTiles();
async function buildSandPerimeter() {
    const dim = egyptDimension();
    let start = Number(safe(() => world.getDynamicProperty(SAND_PROGRESS_PROPERTY), 0));
    if (!Number.isInteger(start) || start < 0 || start > SAND_TILES.length)
        start = 0;
    for (let index = start; index < SAND_TILES.length; index += 1) {
        const tile = SAND_TILES[index];
        await withTickingArea(`eoh_egypt_sand_${index}`, { x: tile.x1, y: -64, z: tile.z1 }, { x: tile.x2, y: -60, z: tile.z2 }, () => {
            dim.fillBlocks(new BlockVolume({ x: tile.x1, y: -64, z: tile.z1 }, { x: tile.x2, y: -62, z: tile.z2 }), "minecraft:sandstone");
            dim.fillBlocks(new BlockVolume({ x: tile.x1, y: -61, z: tile.z1 }, { x: tile.x2, y: -61, z: tile.z2 }), "minecraft:sand");
        });
        safe(() => world.setDynamicProperty(SAND_PROGRESS_PROPERTY, index + 1));
    }
}
function arrivalIsReady() {
    const dim = safe(() => egyptDimension(), undefined);
    if (!dim)
        return false;
    const floor = safe(() => dim.getBlock(SPAWN_FLOOR)?.typeId, "minecraft:air");
    return floor !== "minecraft:air";
}
async function ensureEgyptArrivalReady() {
    if (arrivalIsReady())
        return;
    const manager = world.structureManager;
    const ids = safe(() => manager.getPackStructureIds(), []) ?? [];
    const available = new Set(ids);
    await placeSection(SECTIONS[ARRIVAL_SECTION_INDEX], ARRIVAL_SECTION_INDEX, available);
    await waitTicks(8);
    if (!arrivalIsReady()) {
        throw new Error("Egypt arrival section could not be verified after placement.");
    }
}
async function buildEgypt() {
    if (isReady())
        return;
    const manager = world.structureManager;
    const ids = safe(() => manager.getPackStructureIds(), []) ?? [];
    const available = new Set(ids);
    let start = Number(safe(() => world.getDynamicProperty(BUILD_PROGRESS_PROPERTY), 0));
    if (!Number.isInteger(start) || start < 0 || start > BUILD_ORDER.length)
        start = 0;
    for (let orderIndex = start; orderIndex < BUILD_ORDER.length; orderIndex += 1) {
        const sectionIndex = BUILD_ORDER[orderIndex];
        if (sectionIndex !== ARRIVAL_SECTION_INDEX || !arrivalIsReady()) {
            await placeSection(SECTIONS[sectionIndex], sectionIndex, available);
        }
        safe(() => world.setDynamicProperty(BUILD_PROGRESS_PROPERTY, orderIndex + 1));
        await waitTicks(1);
    }
    await buildSandPerimeter();
    await waitTicks(20);
    const dim = egyptDimension();
    const floor = safe(() => dim.getBlock(SPAWN_FLOOR)?.typeId, "minecraft:air");
    const anchor = safe(() => dim.getBlock(SANCTUM_ANCHOR)?.typeId, "minecraft:air");
    if (floor !== "minecraft:grass" || anchor !== "minecraft:diamond_block") {
        throw new Error(`Egypt verification failed (spawn=${floor}, sanctum=${anchor})`);
    }
    safe(() => world.setDynamicProperty(BUILD_PROGRESS_PROPERTY, BUILD_ORDER.length));
    safe(() => world.setDynamicProperty(SAND_PROGRESS_PROPERTY, SAND_TILES.length));
    safe(() => world.setDynamicProperty(BUILD_PROPERTY, BUILD_VERSION));
}
export async function ensureEgyptDimensionBuilt() {
    if (isReady())
        return;
    if (buildPromise)
        return buildPromise;
    const current = buildEgypt();
    buildPromise = current;
    try {
        await current;
    }
    finally {
        if (buildPromise === current)
            buildPromise = undefined;
    }
}
export async function enterEgyptDimension(player) {
    saveOverworldReturn(player);
    await ensureEgyptArrivalReady();
    const dim = egyptDimension();
    safe(() => dim.setWeather(WeatherType.Clear, 1000000));
    const teleported = safe(() => {
        player.teleport(EGYPT_SPAWN, {
            dimension: dim,
            checkForBlocks: false,
            keepVelocity: false,
            rotation: { x: 0, y: 90 },
        });
        return true;
    }, false);
    if (!teleported)
        throw new Error("Unable to teleport into the Egypt dimension after preparing its arrival section.");
    safe(() => player.setGameMode(GameMode.Adventure));
    system.runTimeout(() => {
        ensureEgyptDimensionBuilt().catch(() => {
        });
    }, 10);
}
export function keepEgyptClear() {
    safe(() => egyptDimension().setWeather(WeatherType.Clear, 1000000));
}
export function egyptStructureCount() { return SECTIONS.length; }
export function egyptSandTileCount() { return SAND_TILES.length; }
