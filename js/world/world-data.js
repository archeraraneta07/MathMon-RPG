/**
 * MathMon overworld map data — the single source of truth for every location.
 *
 * Rendering-agnostic: the 2D Phaser renderer, the 3D renderer
 * (js/world-3d/overworld3d.js) and the game logic (collision, doors, NPCs in
 * OverworldScene) all read from here; none of them owns map data.
 *
 * Coordinates
 *   - Tile grid: MAP_W × MAP_H tiles; tile (tx, ty) covers pixels
 *     [tx*TILE_PX, (tx+1)*TILE_PX). Game logic stores positions in pixels.
 *   - 3D world: 1 tile = TILE_METERS meters; +X east, +Z south, +Y up.
 *
 * Each map is generated deterministically from its seed, so a location looks
 * the same on every visit. To hand-author a map instead, give the location an
 * `ascii` array (MAP_H strings of MAP_W chars, see ASCII_LEGEND).
 * See README.md → "Overworld map" for how to add locations, objects and tiles.
 */
const MathMonWorldData = (function createWorldData() {
    'use strict';

    const TILE_PX = 32;
    const TILE_METERS = 2;
    const MAP_W = 40;
    const MAP_H = 30;

    // ---- Tile types ----------------------------------------------------------
    const T = { GRASS: 0, PATH: 1, FIELD: 2, FLOWER: 3, TREE: 4, WATER: 5, SAND: 6, FLOOR: 7, WALL: 8, CRYSTAL: 9, PIER: 10, PALM: 11 };
    const TILE_INFO = [
        { key: 'grass',   walkable: true,  height: 0,    tex2d: 'tile_grass' },
        { key: 'path',    walkable: true,  height: 0,    tex2d: 'tile_path' },
        { key: 'field',   walkable: true,  height: 0,    tex2d: 'tile_field' },
        { key: 'flower',  walkable: true,  height: 0,    tex2d: 'tile_flower' },
        { key: 'tree',    walkable: false, height: 0,    tex2d: 'tile_tree' },
        { key: 'water',   walkable: false, height: -0.9, tex2d: 'tile_water' },
        { key: 'sand',    walkable: true,  height: -0.1, tex2d: 'tile_sand' },
        { key: 'floor',   walkable: true,  height: 0,    tex2d: 'tile_path' },
        { key: 'wall',    walkable: false, height: 3.2,  tex2d: 'tile_wall' },
        { key: 'crystal', walkable: false, height: 0,    tex2d: 'tile_crystal' },
        { key: 'pier',    walkable: true,  height: -0.9, tex2d: 'tile_path' },
        { key: 'palm',    walkable: false, height: -0.1, tex2d: 'tile_sand' }
    ];
    const ASCII_LEGEND = { '.': T.GRASS, '=': T.PATH, '#': T.FIELD, '*': T.FLOWER, 'T': T.TREE, '~': T.WATER, ':': T.SAND,
        '_': T.FLOOR, 'W': T.WALL, 'C': T.CRYSTAL, 'P': T.PIER, 'Y': T.PALM };

    // Building footprints in tiles (centered on the object's tile).
    const FOOTPRINTS = { house: [3, 3], apartment: [3, 3], market: [4, 3], cafe: [3, 3], gym: [4, 3], barn: [4, 3], palm: [1, 1] };

    // ---- Locations (edit here) ---------------------------------------------------
    const LOCATIONS = [
        {
            key: 'sunmeadow', name: 'Meadow Town', subtitle: 'Sumwood Trail', theme: 'grass', tint: '#1b5e20', seed: 101,
            base: T.GRASS,
            regions: [
                { tile: T.PATH, rect: [9, 11, 13, 15] }, { tile: T.PATH, rect: [23, 9, 27, 13] },
                { tile: T.PATH, rect: [0, 15, 39, 16] },
                { tile: T.FIELD, rect: [3, 21, 11, 26] }, { tile: T.FIELD, rect: [15, 21, 22, 26] }
            ],
            scatter: [
                { tile: T.TREE, on: T.GRASS, edgeRows: 2, chance: 0.7 },
                { tile: T.FLOWER, on: T.GRASS, chance: 0.03 },
                { tile: T.TREE, on: T.GRASS, chance: 0.015, when: (x, y) => x > 15 && y > 5 }
            ],
            objects: [
                { type: 'house', tx: 7, ty: 7, label: 'YOUR HOUSE', door: 'home' },
                { type: 'house', tx: 13, ty: 7, label: 'VILLAGE HOME' },
                { type: 'apartment', tx: 18, ty: 7, label: 'RESIDENCES' },
                { type: 'market', tx: 28, ty: 8, label: 'MARKET SQUARE' },
                { type: 'cafe', tx: 34, ty: 13, label: 'SUN CAFE' },
                { type: 'gym', tx: 22, ty: 18, label: 'SUM GYM' },
                { type: 'barn', tx: 9, ty: 23, label: 'HARVEST BARN' }
            ],
            npcs: [
                { name: 'Mira', tx: 17, ty: 13, color: '#ef9a9a', line: 'Keep exploring and answer carefully!' },
                { name: 'Tomas', tx: 25, ty: 12, color: '#90caf9', line: 'Fast answers hit harder in battle.' },
                { name: 'Lina', tx: 31, ty: 18, color: '#a5d6a7', line: 'The cave to the east hides a gym.' }
            ]
        },
        {
            key: 'crystalcaves', name: 'Difference Cave', subtitle: 'Minus Marsh', theme: 'cave', tint: '#311b92', seed: 202,
            base: T.FLOOR,
            noiseWalls: { threshold: 0.7, scale: 0.18 },
            regions: [{ tile: T.FLOOR, rect: [0, 15, 39, 16] }],
            scatter: [
                { tile: T.WALL, on: T.FLOOR, edgeRows: 2, chance: 1 },
                { tile: T.CRYSTAL, on: T.FLOOR, chance: 0.04 }
            ],
            objects: [
                { type: 'gym', tx: 20, ty: 8, label: 'DIFFERENCE GYM' },
                { type: 'house', tx: 8, ty: 21, label: 'CAVE CAMP', door: 'home' },
                { type: 'market', tx: 31, ty: 12, label: 'TRADE HALL' },
                { type: 'apartment', tx: 11, ty: 8, label: 'MINER HOMES' },
                { type: 'cafe', tx: 29, ty: 21, label: 'CAVE CAFE' }
            ],
            npcs: [
                { name: 'Oren', tx: 17, ty: 18, color: '#ffcc80', line: 'Crystals glow brighter near the gym.' },
                { name: 'Nia', tx: 26, ty: 9, color: '#ce93d8', line: 'Subtraction is just adding backwards!' }
            ]
        },
        {
            key: 'tidecoast', name: 'Quotient Coast', subtitle: 'Division Dojo', theme: 'water', tint: '#01579b', seed: 303,
            base: T.GRASS,
            coast: { shoreX: 34, beachWidth: 4, wobble: 2.2 },
            ponds: { threshold: 0.78, scale: 0.16 },
            regions: [{ tile: T.PATH, rect: [0, 15, 33, 16] }, { tile: T.PIER, rect: [32, 15, 39, 16] }],
            scatter: [
                { tile: T.TREE, on: T.GRASS, edgeRows: 2, chance: 0.6 },
                { tile: T.FLOWER, on: T.GRASS, chance: 0.04 },
                { tile: T.SAND, on: T.GRASS, chance: 0.06 },
                { tile: T.PALM, on: T.SAND, chance: 0.05 }
            ],
            objects: [
                { type: 'gym', tx: 21, ty: 7, label: 'DOJO' },
                { type: 'house', tx: 8, ty: 20, label: 'COAST HOUSE', door: 'home' },
                { type: 'market', tx: 28, ty: 19, label: 'FISH MARKET' },
                { type: 'cafe', tx: 18, ty: 22, label: 'BEACH CAFE' },
                { type: 'palm', tx: 32, ty: 8, label: 'PALM COVE' },
                { type: 'palm', tx: 33, ty: 12 }
            ],
            npcs: [
                { name: 'Kai', tx: 14, ty: 13, color: '#80cbc4', line: 'The pier leads back to Meadow Town.' },
                { name: 'Sela', tx: 24, ty: 19, color: '#ffab91', line: 'Divide and conquer, trainer!' },
                { name: 'Bo', tx: 31, ty: 22, color: '#90caf9', line: 'Waves are calm today.' }
            ]
        }
    ];

    // ---- Deterministic helpers ----------------------------------------------------
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function next() {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hash(x, y, seed) {
        let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }

    /** Smooth 2D value noise in [0,1] (shared with the 3D renderer for terrain detail). */
    function noise2(x, y, seed) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
        return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
    }

    // ---- Map building ------------------------------------------------------------------
    function footprint(obj) {
        const [w, h] = FOOTPRINTS[obj.type] || [3, 3];
        const x0 = obj.tx - Math.floor((w - 1) / 2);
        const y0 = obj.ty - Math.floor((h - 1) / 2);
        return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, w, h };
    }

    function generateGrid(def) {
        const grid = new Uint8Array(MAP_W * MAP_H);
        const idx = (x, y) => y * MAP_W + x;
        if (def.ascii) {
            for (let y = 0; y < MAP_H; y++) {
                for (let x = 0; x < MAP_W; x++) grid[idx(x, y)] = ASCII_LEGEND[(def.ascii[y] || '')[x]] ?? def.base;
            }
            return grid;
        }
        const rand = mulberry32(def.seed);
        grid.fill(def.base);
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                if (def.coast) {
                    const shore = def.coast.shoreX + (noise2(0.5, y * 0.25, def.seed) - 0.5) * 2 * def.coast.wobble;
                    if (x >= shore) grid[idx(x, y)] = T.WATER;
                    else if (x >= shore - def.coast.beachWidth) grid[idx(x, y)] = T.SAND;
                }
                if (def.ponds && grid[idx(x, y)] === T.GRASS && x < 26 && noise2(x * def.ponds.scale, y * def.ponds.scale, def.seed + 7) > def.ponds.threshold) {
                    grid[idx(x, y)] = T.WATER;
                }
                if (def.noiseWalls && noise2(x * def.noiseWalls.scale, y * def.noiseWalls.scale, def.seed + 3) > def.noiseWalls.threshold) {
                    grid[idx(x, y)] = T.WALL;
                }
            }
        }
        (def.regions || []).forEach((r) => {
            const [x0, y0, x1, y1] = r.rect;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[idx(x, y)] = r.tile;
        });
        (def.scatter || []).forEach((s) => {
            for (let y = 0; y < MAP_H; y++) {
                for (let x = 0; x < MAP_W; x++) {
                    const roll = rand();
                    if (grid[idx(x, y)] !== s.on) continue;
                    if (s.edgeRows != null) {
                        if ((y < s.edgeRows || y >= MAP_H - s.edgeRows) && roll < s.chance) grid[idx(x, y)] = s.tile;
                        continue;
                    }
                    if (s.when && !s.when(x, y)) continue;
                    if (roll < s.chance) grid[idx(x, y)] = s.tile;
                }
            }
        });
        return grid;
    }

    /** Guarantee doors, NPC spots, exits and the main road stay reachable. */
    function carveAccess(def, grid) {
        const set = (x, y, tile) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) grid[y * MAP_W + x] = tile; };
        const walkTile = def.theme === 'cave' ? T.FLOOR : T.PATH;
        const clearIfBlocked = (x, y) => {
            if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
            if (!TILE_INFO[grid[y * MAP_W + x]].walkable) set(x, y, grid[y * MAP_W + x] === T.WATER && def.theme === 'water' ? T.SAND : walkTile);
        };
        def.objects.forEach((o) => {
            const f = footprint(o);
            for (let y = f.y0 - 1; y <= f.y1 + 1; y++) for (let x = f.x0 - 1; x <= f.x1 + 1; x++) clearIfBlocked(x, y);
            for (let y = f.y1 + 1; y <= f.y1 + 2; y++) set(o.tx, y, walkTile);       // doorstep path
        });
        def.npcs.forEach((n) => { for (let y = n.ty - 1; y <= n.ty + 1; y++) for (let x = n.tx - 1; x <= n.tx + 1; x++) clearIfBlocked(x, y); });
        for (let y = 2; y < MAP_H - 2; y++) { clearIfBlocked(0, y); clearIfBlocked(1, y); clearIfBlocked(MAP_W - 1, y); clearIfBlocked(MAP_W - 2, y); }
    }

    const cache = {};

    /**
     * Build (once) and return a location's map.
     * @returns {{ key, name, subtitle, theme, tint, grid, objects, npcs, door,
     *            tileAt(tx,ty), tileInfo(tx,ty), isBlockedPx(px,py), heightAt(tx,ty), nearestWalkablePx(px,py) }}
     */
    function get(key) {
        if (cache[key]) return cache[key];
        const def = LOCATIONS.find((l) => l.key === key) || LOCATIONS[0];
        const grid = generateGrid(def);
        carveAccess(def, grid);
        const objects = def.objects.map((o) => ({ ...o, footprint: footprint(o) }));
        const blocked = new Uint8Array(MAP_W * MAP_H);
        for (let i = 0; i < grid.length; i++) blocked[i] = TILE_INFO[grid[i]].walkable ? 0 : 1;
        objects.forEach((o) => {
            const f = o.footprint;
            for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) blocked[y * MAP_W + x] = 1;
        });
        const doorObj = objects.find((o) => o.door === 'home');
        const map = {
            key: def.key, name: def.name, subtitle: def.subtitle, theme: def.theme, tint: def.tint, seed: def.seed,
            width: MAP_W, height: MAP_H, grid, blocked, objects, npcs: def.npcs.map((n) => ({ ...n })),
            // door in pixels, matching the previous game's door position (front-center of the house)
            door: doorObj ? { x: doorObj.tx * TILE_PX, y: (doorObj.footprint.y1 + 1) * TILE_PX + 12 } : null,
            tileAt(tx, ty) {
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return def.base;
                return grid[ty * MAP_W + tx];
            },
            tileInfo(tx, ty) { return TILE_INFO[map.tileAt(tx, ty)]; },
            isBlockedTile(tx, ty) {
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
                return blocked[ty * MAP_W + tx] === 1;
            },
            /** Collision test for a point in pixel space. */
            isBlockedPx(px, py) {
                return map.isBlockedTile(Math.floor(px / TILE_PX), Math.floor(py / TILE_PX));
            },
            /** Visual ground height (meters) at a tile center. */
            heightAt(tx, ty) {
                const t = map.tileAt(tx, ty);
                let h = TILE_INFO[t].height;
                if (def.theme === 'grass' && (ty < 2 || ty >= MAP_H - 2)) h += 1.2 + noise2(tx * 0.4, ty * 0.4, def.seed) * 1.6;
                return h;
            },
            /** Spawn safety: snap an old/invalid saved position to the nearest walkable tile center. */
            nearestWalkablePx(px, py) {
                const sx = Math.floor(px / TILE_PX), sy = Math.floor(py / TILE_PX);
                if (!map.isBlockedTile(sx, sy)) return { x: px, y: py };
                for (let r = 1; r < 20; r++) {
                    for (let dy = -r; dy <= r; dy++) {
                        for (let dx = -r; dx <= r; dx++) {
                            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                            if (!map.isBlockedTile(sx + dx, sy + dy)) return { x: (sx + dx + 0.5) * TILE_PX, y: (sy + dy + 0.5) * TILE_PX };
                        }
                    }
                }
                return { x: px, y: py };
            }
        };
        cache[key] = map;
        return map;
    }

    /**
     * 3D overworld renderer settings (read by js/world-3d/overworld3d.js).
     * models: optional authored .glb files per object type, e.g.
     *   { house: 'assets/models/house.glb', gym: 'assets/models/gym.glb' }
     * Models are scaled to the object's footprint (1 tile = 2 m) and loaded lazily.
     */
    const render3d = {
        enabled: true,          // false → always use the 2D Phaser tile renderer
        quality: 'auto',        // 'auto' | 'high' | 'medium' | 'low' (shared with battles)
        autoDowngrade: true,
        minFps: 45,
        maxFrameDt: 0.05,
        cameraDistance: 17,     // meters behind the player
        minDistance: 9,
        maxDistance: 30,
        reducedMotion: false,   // force reduced motion (also follows the OS setting)
        models: {}
    };

    return {
        TILE_PX, TILE_METERS, MAP_W, MAP_H, T, TILE_INFO, FOOTPRINTS, ASCII_LEGEND, render3d,
        locations: LOCATIONS.map((l, i) => ({ key: l.key, name: l.name, subtitle: l.subtitle, theme: l.theme, tint: l.tint,
            next: LOCATIONS[(i + 1) % LOCATIONS.length].key })),
        get,
        noise2
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonWorldData;
}
