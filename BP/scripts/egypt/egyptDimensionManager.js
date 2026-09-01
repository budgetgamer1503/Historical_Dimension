import { world, system, BlockVolume, GameMode, WeatherType } from "@minecraft/server";
import { EGYPT_DIMENSION_ID } from "./egyptRuntime.js";
import { markDimensionReady, setDimensionProgress, trackPreparation } from "../dimension/preparationProgress.js";
const BUILD_PROPERTY = "eoh:egypt_dimension_built_v310";
const BUILD_PROGRESS_PROPERTY = "eoh:egypt_dimension_build_progress_v310";
const SAND_PROGRESS_PROPERTY = "eoh:egypt_sand_progress_v310";
const BUILD_VERSION = "3.12.0";
const FRONT_REPAIR_PROPERTY = "eoh:egypt_front_repair_v1_done";
const GRASS_TO_SAND_DONE_PROPERTY = "eoh:egypt_grass_to_sand_v2_done";
const GRASS_TO_SAND_PROGRESS_PROPERTY = "eoh:egypt_grass_to_sand_v2_progress";
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
const FRONT_SECTION_INDICES = [26, 27];
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
async function waitForTickingAreaLoaded(manager, id, createPromise, timeoutTicks) {
    let waited = 0;
    while (waited < timeoutTicks) {
        const area = safe(() => manager.getTickingArea(id), undefined);
        if (area?.isFullyLoaded)
            return true;
        const slice = Math.min(2, timeoutTicks - waited);
        const outcome = await Promise.race([
            createPromise.then(() => "created", () => "failed"),
            waitTicks(slice).then(() => "tick"),
        ]);
        if (outcome !== "tick")
            return outcome === "created";
        waited += slice;
    }
    const area = safe(() => manager.getTickingArea(id), undefined);
    return area?.isFullyLoaded === true;
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
    return safe(() => world.getDynamicProperty(BUILD_PROPERTY), "") === BUILD_VERSION;
}
const UNSAFE_SPAWN_FLOORS = new Set([
    "minecraft:air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:grass",
    "minecraft:tallgrass",
    "minecraft:short_grass",
    "minecraft:snow_layer",
]);
function findSafeEgyptSpawn(dimension) {
    for (let radius = 0; radius <= 8; radius += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
            for (let dz = -radius; dz <= radius; dz += 1) {
                if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius)
                    continue;
                const x = 203 + dx;
                const z = 101 + dz;
                for (let y = -40; y >= -62; y -= 1) {
                    const feet = safe(() => dimension.getBlock({ x, y, z })?.typeId, undefined);
                    const head = safe(() => dimension.getBlock({ x, y: y + 1, z })?.typeId, undefined);
                    const floor = safe(() => dimension.getBlock({ x, y: y - 1, z })?.typeId, undefined);
                    if (feet === "minecraft:air" && head === "minecraft:air" && floor !== undefined && !UNSAFE_SPAWN_FLOORS.has(floor)) {
                        return { x: x + 0.5, y, z: z + 0.5 };
                    }
                }
            }
        }
    }
    return undefined;
}
export async function resolveEgyptSpawn() {
    let spawn;
    await withTickingArea("eoh_egypt_spawn_resolve", { x: 195, y: -63, z: 93 }, { x: 211, y: -35, z: 109 }, async () => {
        spawn = findSafeEgyptSpawn(egyptDimension());
    });
    return spawn;
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
async function withTickingArea(id, from, to, callback, settleTicks = 2) {
    const manager = safe(() => world.tickingAreaManager, undefined);
    const dim = egyptDimension();
    let created = false;
    if (manager?.createTickingArea) {
        safe(() => manager.removeTickingArea(id));
        try {
            const createPromise = Promise.resolve(manager.createTickingArea(id, { dimension: dim, from, to }));
            created = await waitForTickingAreaLoaded(manager, id, createPromise, 120);
            if (!created)
                safe(() => manager.removeTickingArea(id));
        }
        catch {
            safe(() => manager.removeTickingArea(id));
        }
    }
    try {
        await callback();
        await waitTicks(settleTicks);
    }
    finally {
        if (created)
            safe(() => manager.removeTickingArea(id));
    }
}
async function placeSection(section, index, available, settleTicks = 2) {
    const manager = world.structureManager;
    const dim = egyptDimension();
    let lastError = "unknown placement failure";
    for (const id of structureCandidates(section, available)) {
        try {
            await withTickingArea(`eoh_egypt_build_${index}`, section.origin, {
                x: section.origin.x + section.size.x - 1,
                y: section.origin.y + section.size.y - 1,
                z: section.origin.z + section.size.z - 1,
            }, () => manager.place(id, dim, section.origin), settleTicks);
            return;
        }
        catch (error) {
            lastError = String(error);
        }
    }
    throw new Error(`Unable to place ${section.id}: ${lastError}`);
}
async function repairEgyptFront(available) {
    if (safe(() => world.getDynamicProperty(FRONT_REPAIR_PROPERTY) === true, false))
        return;
    for (let offset = 0; offset < FRONT_SECTION_INDICES.length; offset += 1) {
        const index = FRONT_SECTION_INDICES[offset];
        await placeSection(SECTIONS[index], index, available, 30);
        setDimensionProgress(EGYPT_DIMENSION_ID, 88 + ((offset + 1) / FRONT_SECTION_INDICES.length) * 2);
    }
    await waitTicks(20);
    safe(() => world.setDynamicProperty(FRONT_REPAIR_PROPERTY, true));
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
        setDimensionProgress(EGYPT_DIMENSION_ID, 90 + ((index + 1) / SAND_TILES.length) * 5);
    }
}
function arrivalIsReady() {
    const dim = safe(() => egyptDimension(), undefined);
    if (!dim)
        return false;
    const floor = safe(() => dim.getBlock(SPAWN_FLOOR)?.typeId, "minecraft:air");
    return floor !== "minecraft:air";
}
function grassToSandTiles() {
    const tiles = [];
    const mapMin = 0;
    const mapMax = 207;
    const step = 32;
    for (let x = mapMin; x <= mapMax; x += step) {
        for (let z = mapMin; z <= mapMax; z += step) {
            tiles.push({ x1: x, z1: z, x2: Math.min(x + step - 1, mapMax), z2: Math.min(z + step - 1, mapMax) });
        }
    }
    return tiles;
}
const GRASS_TO_SAND_TILES = grassToSandTiles();
const GRASS_SCAN_Y_MIN = -64;
const GRASS_SCAN_Y_MAX = 40;
async function convertGrassToSand() {
    if (safe(() => world.getDynamicProperty(GRASS_TO_SAND_DONE_PROPERTY) === true, false))
        return;
    const dim = egyptDimension();
    let start = Number(safe(() => world.getDynamicProperty(GRASS_TO_SAND_PROGRESS_PROPERTY), 0));
    if (!Number.isInteger(start) || start < 0 || start > GRASS_TO_SAND_TILES.length)
        start = 0;
    for (let index = start; index < GRASS_TO_SAND_TILES.length; index += 1) {
        const tile = GRASS_TO_SAND_TILES[index];
        await withTickingArea(`eoh_egypt_grass_${index}`, { x: tile.x1, y: GRASS_SCAN_Y_MIN, z: tile.z1 }, { x: tile.x2, y: GRASS_SCAN_Y_MAX, z: tile.z2 }, () => {
            safe(() => dim.fillBlocks(new BlockVolume({ x: tile.x1, y: GRASS_SCAN_Y_MIN, z: tile.z1 }, { x: tile.x2, y: GRASS_SCAN_Y_MAX, z: tile.z2 }), "minecraft:sand", { blockFilter: { includeTypes: ["minecraft:grass_block"] } }));
        });
        safe(() => world.setDynamicProperty(GRASS_TO_SAND_PROGRESS_PROPERTY, index + 1));
        setDimensionProgress(EGYPT_DIMENSION_ID, 95 + ((index + 1) / GRASS_TO_SAND_TILES.length) * 5);
        await waitTicks(1);
    }
    safe(() => world.setDynamicProperty(GRASS_TO_SAND_DONE_PROPERTY, true));
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
        setDimensionProgress(EGYPT_DIMENSION_ID, ((orderIndex + 1) / BUILD_ORDER.length) * 90);
        await waitTicks(1);
    }
    await repairEgyptFront(available);
    await buildSandPerimeter();
    await convertGrassToSand();
    await waitTicks(20);
    let anchor;
    let spawn;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await withTickingArea("eoh_egypt_verify_sanctum", { x: SANCTUM_ANCHOR.x - 8, y: SANCTUM_ANCHOR.y - 2, z: SANCTUM_ANCHOR.z - 8 }, { x: SANCTUM_ANCHOR.x + 8, y: SANCTUM_ANCHOR.y + 2, z: SANCTUM_ANCHOR.z + 8 }, async () => {
            anchor = safe(() => egyptDimension().getBlock(SANCTUM_ANCHOR)?.typeId, "minecraft:air");
        });
        spawn = await resolveEgyptSpawn();
        if (anchor === "minecraft:diamond_block" && spawn)
            break;
        await waitTicks(20);
    }
    if (anchor !== "minecraft:diamond_block" || !spawn) {
        throw new Error(`Egypt verification failed (sanctum=${anchor}, safeSpawn=${spawn ? "found" : "missing"})`);
    }
    safe(() => world.setDynamicProperty(BUILD_PROGRESS_PROPERTY, BUILD_ORDER.length));
    safe(() => world.setDynamicProperty(SAND_PROGRESS_PROPERTY, SAND_TILES.length));
    safe(() => world.setDynamicProperty(BUILD_PROPERTY, BUILD_VERSION));
    markDimensionReady(EGYPT_DIMENSION_ID);
}
export async function ensureEgyptDimensionBuilt() {
    if (isReady()) {
        markDimensionReady(EGYPT_DIMENSION_ID);
        return;
    }
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
    if (isReady()) {
        await ensureEgyptDimensionBuilt();
    }
    else {
        await trackPreparation(player, EGYPT_DIMENSION_ID, ensureEgyptDimensionBuilt());
    }
    const dim = egyptDimension();
    const spawn = await resolveEgyptSpawn();
    if (!spawn) {
        throw new Error("No safe spawn position could be found in the Egypt dimension; refusing to teleport.");
    }
    safe(() => dim.setWeather(WeatherType.Clear, 1000000));
    const teleported = safe(() => {
        player.teleport(spawn, {
            dimension: dim,
            checkForBlocks: false,
            keepVelocity: false,
            rotation: { x: 0, y: 90 },
        });
        return true;
    }, false);
    if (!teleported)
        throw new Error("Unable to teleport into the Egypt dimension after preparing it.");
    safe(() => player.setGameMode(GameMode.Adventure));
}
export function keepEgyptClear() {
    safe(() => egyptDimension().setWeather(WeatherType.Clear, 1000000));
}
export function egyptStructureCount() { return SECTIONS.length; }
export function egyptSandTileCount() { return SAND_TILES.length; }
