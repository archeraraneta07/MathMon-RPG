/**
 * MathMon 3D overworld renderer (ES module) — Three.js r160.
 *
 * Draws the overworld described by MathMonWorldData; it holds NO game rules.
 * OverworldScene (js/phaser-game.js) keeps movement, collision, encounters,
 * doors and saving, and simply tells this module where the player is.
 *
 * Layering: this WebGL canvas sits *under* the (transparent) Phaser canvas, so
 * Phaser's HUD text, touch buttons and camera fades draw on top of the 3D world.
 *
 * Performance
 *  - props (trees, rocks, crystals, flowers, grass, crops, pier planks) are
 *    InstancedMeshes grouped into 8×8-tile chunks; each chunk is a THREE.LOD
 *    (detailed near / cheap far / grass & flowers dropped far) and is frustum-
 *    culled through per-chunk bounding spheres
 *  - locations are built lazily on first visit and cached
 *  - quality tiers (shared with the battle stage) scale pixel ratio, shadows,
 *    bloom and prop density; the tier drops automatically if FPS stays low
 *
 * Exposes window.MathMonOverworld3D = { isSupported(), mount(opts) }.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { detectTier, saveTier, TIERS, prefersReducedMotion } from '../battle-3d/core.js';
import { createSky, ambientParticles, softSprite } from '../battle-3d/environments.js';
import { buildTerrain } from './terrain.js';
import { materials, buildBuilding, buildPalm, buildCharacter, treeGeometries, rockGeometries, crystalGeometry,
    flowerGeometry, grassTuftGeometry, cropGeometry } from './world-assets.js';

// Classic-script globals declared with `const` are not window properties, but
// modules can reach them by name through the shared global scope.
/* global MathMonWorldData */
const WORLD = MathMonWorldData;
const TM = WORLD.TILE_METERS;
const CHUNK = 8;

const THEMES = {
    grass: {
        sky: { top: '#3d7fd6', horizon: '#c4e4ff', bottom: '#9cbf86', sunColor: '#fff4d6', sunSize: 900, cloudLit: '#ffffff', cloudDark: '#b8c6d6', cloudCover: 0.45, cloudScale: 0.8, cloudSpeed: 0.015 },
        sunDir: [0.45, 0.75, 0.35], sun: ['#fff1d6', 2.8], hemi: ['#bcd7ff', '#4a6a38', 1.1], fog: ['#c3d8ea', 0.0075], exposure: 1.0, bloom: 0.35
    },
    cave: {
        sky: { top: '#07040f', horizon: '#2a1a4a', bottom: '#05030a', sunColor: '#6b5cff', sunSize: 300, cloudLit: '#3a2a60', cloudDark: '#0c0818', cloudCover: 0.3, cloudScale: 1.4, cloudSpeed: 0.01 },
        sunDir: [-0.3, 0.8, 0.4], sun: ['#a598ff', 1.1], hemi: ['#7a6ab0', '#1a1230', 0.7], fog: ['#120c22', 0.015], exposure: 1.0, bloom: 0.45,
        crystalGlow: 0.55, crystalLight: 18
    },
    water: {
        sky: { top: '#2f8ee0', horizon: '#d6f0ff', bottom: '#8fc9dc', sunColor: '#fff2cf', sunSize: 900, cloudLit: '#ffffff', cloudDark: '#c4d6e2', cloudCover: 0.35, cloudScale: 0.7, cloudSpeed: 0.02 },
        sunDir: [0.55, 0.6, 0.45], sun: ['#fff3da', 3.0], hemi: ['#cde8ff', '#7a8a60', 1.15], fog: ['#cfe6f2', 0.006], exposure: 1.0, bloom: 0.3
    }
};

const QUALITY = {
    high:   { pixelRatio: 1.5, shadows: 2048, bloom: true, grass: 3, msaa: 4 },
    medium: { pixelRatio: 1.25, shadows: 1024, bloom: true, grass: 2, msaa: 0 },
    low:    { pixelRatio: 1, shadows: 0, bloom: false, grass: 0, msaa: 0 }
};

function isSupported() {
    try {
        return Boolean(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

/** Deterministic per-tile random (stable prop layout on every visit). */
function tileRng(tx, ty, salt) {
    let s = (tx * 73856093) ^ (ty * 19349663) ^ (salt * 83492791);
    return function next() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- Instanced, chunked props with LOD ---------------------------------------------
class PropBatcher {
    constructor() { this.chunks = new Map(); }

    /** Queue one instance of `kind` at world position with rotation/scale/color. */
    add(kind, x, y, z, rotY, scale, color) {
        const key = `${Math.floor(x / (CHUNK * TM))},${Math.floor(z / (CHUNK * TM))}`;
        if (!this.chunks.has(key)) this.chunks.set(key, {});
        const chunk = this.chunks.get(key);
        (chunk[kind] || (chunk[kind] = [])).push({ x, y, z, rotY, scale, color });
    }

    /**
     * Build THREE.LOD objects. `defs[kind]` = { near: {geo, mat}[] , far: {geo, mat}[] | null, farDistance }
     */
    build(defs, swayUniforms) {
        const group = new THREE.Group();
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const color = new THREE.Color();
        this.chunks.forEach((chunk) => {
            const all = Object.values(chunk).flat();
            const cx = all.reduce((a, it) => a + it.x, 0) / all.length;
            const cz = all.reduce((a, it) => a + it.z, 0) / all.length;
            const lod = new THREE.LOD();
            lod.position.set(cx, 0, cz);
            const levels = [new THREE.Group(), new THREE.Group()];
            Object.keys(chunk).forEach((kind) => {
                const def = defs[kind];
                const items = chunk[kind];
                [def.near, def.far].forEach((parts, level) => {
                    (parts || []).forEach((part) => {
                        const inst = new THREE.InstancedMesh(part.geo, part.mat, items.length);
                        items.forEach((it, i) => {
                            q.setFromAxisAngle(up, it.rotY);
                            s.set(it.scale[0], it.scale[1], it.scale[2]);
                            p.set(it.x - cx, it.y, it.z - cz);
                            m4.compose(p, q, s);
                            inst.setMatrixAt(i, m4);
                            if (part.tint && it.color) inst.setColorAt(i, color.set(it.color));
                        });
                        inst.castShadow = part.castShadow !== false;
                        inst.receiveShadow = true;
                        inst.computeBoundingSphere();   // enables per-chunk frustum culling
                        levels[level].add(inst);
                    });
                });
            });
            lod.addLevel(levels[0], 0);
            lod.addLevel(levels[1], defs.farDistance || 60);
            group.add(lod);
        });
        return group;
    }
}

/** Grass/foliage wind sway (vertex shader; disabled under reduced motion). */
function swayMaterial(base, uniforms, strength) {
    const mat = base.clone();
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uSway = uniforms.uSway;
        shader.vertexShader = 'uniform float uTime; uniform float uSway;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
                vec2 ip = instanceMatrix[3].xz;
            #else
                vec2 ip = vec2(0.0);
            #endif
            float sw = sin(uTime * 1.8 + ip.x * 0.35 + ip.y * 0.27) * ${strength.toFixed(3)} * uSway;
            transformed.x += sw * max(transformed.y, 0.0);
            transformed.z += sw * 0.6 * max(transformed.y, 0.0);`);
    };
    mat.customProgramCacheKey = () => `sway-${strength}`;
    return mat;
}

// ---- Location scene -------------------------------------------------------------------
class LocationScene {
    constructor(engine, map) {
        this.engine = engine;
        this.map = map;
        this.scene = new THREE.Scene();
        this.labels = [];
        this.npcs = [];
        this.updaters = [];
        const theme = THEMES[map.theme] || THEMES.grass;
        this.theme = theme;
        const q = engine.q;

        this.sunDir = new THREE.Vector3(...theme.sunDir).normalize();
        this.sky = createSky({ ...theme.sky, sunDir: this.sunDir });
        this.scene.add(this.sky);
        this.scene.fog = new THREE.FogExp2(theme.fog[0], theme.fog[1]);
        this.scene.add(new THREE.HemisphereLight(...theme.hemi));
        this.sun = new THREE.DirectionalLight(theme.sun[0], theme.sun[1]);
        this.sun.castShadow = Boolean(q.shadows);
        if (q.shadows) {
            this.sun.shadow.mapSize.set(q.shadows, q.shadows);
            const c = this.sun.shadow.camera;
            c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 120;
            this.sun.shadow.bias = -0.0004;
            this.sun.shadow.normalBias = 0.04;
        }
        this.scene.add(this.sun, this.sun.target);

        // Image-based lighting from the sky (PBR reflections / ambient).
        const pmrem = new THREE.PMREMGenerator(engine.renderer);
        const skyScene = new THREE.Scene();
        skyScene.add(this.sky.clone());
        this.envMap = pmrem.fromScene(skyScene, 0.03).texture;
        this.scene.environment = this.envMap;
        pmrem.dispose();

        this.terrain = buildTerrain(map, WORLD, q);
        this.scene.add(this.terrain.mesh);
        if (this.terrain.water) this.scene.add(this.terrain.water);

        this.swayUniforms = { uTime: { value: 0 }, uSway: { value: prefersReducedMotion() ? 0 : 1 } };
        this.buildProps();
        this.buildObjects();
        // Meshes the follow camera must not pass through (buildings only — cheap raycasts).
        this.occluders = [];
        this.buildings.forEach((b) => b.traverse((o) => { if (o.isMesh) this.occluders.push(o); }));
        this.buildNpcs();
        if (map.theme === 'cave') this.buildCaveAmbience();
        this.applyModelOverrides();
    }

    groundAt(x, z) {
        const tx = Math.floor(x / TM), ty = Math.floor(z / TM);
        if (this.map.tileAt(tx, ty) === WORLD.T.PIER) return 0.12;
        return this.terrain.heightAtWorld(x, z);
    }

    buildProps() {
        const T = WORLD.T;
        const map = this.map;
        const q = this.engine.q;
        const M = materials();
        const batch = new PropBatcher();
        const trees = treeGeometries();
        const rocks = rockGeometries();
        const leafSway = swayMaterial(M.leaf, this.swayUniforms, 0.015);
        const grassMat = swayMaterial(M.grass, this.swayUniforms, 0.12);
        const theme = map.theme;
        const pad = 10;
        for (let ty = -pad; ty < map.height + pad; ty++) {
            for (let tx = -pad; tx < map.width + pad; tx++) {
                const inside = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
                const r = tileRng(tx, ty, map.seed);
                const cx = (tx + 0.5) * TM, cz = (ty + 0.5) * TM;
                const jx = (r() - 0.5) * TM * 0.6, jz = (r() - 0.5) * TM * 0.6;
                const t = inside ? map.tileAt(tx, ty) : -1;
                const underObject = inside && map.blocked[ty * map.width + tx] && t !== T.TREE && t !== T.WALL && t !== T.CRYSTAL && t !== T.WATER && t !== T.PALM;

                // scenery beyond the map edges (hide the world boundary)
                if (!inside) {
                    const outY = ty < 0 || ty >= map.height;
                    if (theme === 'grass' && outY && r() < 0.55) batch.add('tree', cx + jx, this.groundAt(cx + jx, cz + jz) - 0.1, cz + jz, r() * 6.28, [1.1 + r() * 0.8, 1.1 + r() * 0.9, 1.1 + r() * 0.8], this.leafTint(r));
                    if (theme === 'water' && outY && tx < map.width - 4 && r() < 0.35) batch.add('tree', cx + jx, this.groundAt(cx + jx, cz + jz) - 0.1, cz + jz, r() * 6.28, [1, 1.1, 1], this.leafTint(r));
                    if (theme === 'cave' && (outY || tx < 0 || tx >= map.width) && r() < 0.5) {
                        const sc = 1.6 + r() * 2.5;
                        batch.add('rock', cx + jx, this.groundAt(cx, cz) - 0.5, cz + jz, r() * 6.28, [sc, sc * (1 + r() * 1.5), sc]);
                    }
                    continue;
                }
                if (underObject) continue;
                const gy = this.groundAt(cx + jx, cz + jz);
                if (t === T.TREE) {
                    batch.add('tree', cx + jx * 0.4, this.groundAt(cx, cz) - 0.1, cz + jz * 0.4, r() * 6.28, [0.9 + r() * 0.4, 0.9 + r() * 0.5, 0.9 + r() * 0.4], this.leafTint(r));
                } else if (t === T.WALL) {
                    const sc = 1.1 + r() * 0.4;
                    batch.add('rock', cx, this.groundAt(cx, cz) - 1.2, cz, r() * 6.28, [sc * 1.1, sc * (1.6 + r()), sc * 1.1]);
                } else if (t === T.CRYSTAL) {
                    batch.add('crystal', cx + jx * 0.3, gy, cz + jz * 0.3, r() * 6.28, [1, 0.9 + r() * 0.5, 1], ['#22d8ff', '#9a4dff', '#ff3fb0'][Math.floor(r() * 3)]);
                } else if (t === T.FLOWER) {
                    for (let i = 0; i < 6; i++) {
                        const fx = cx + (r() - 0.5) * TM * 0.9, fz = cz + (r() - 0.5) * TM * 0.9;
                        batch.add('flower', fx, this.groundAt(fx, fz), fz, r() * 6.28, [1, 0.8 + r() * 0.5, 1], ['#ff4081', '#ffd740', '#ffffff', '#b388ff', '#ff7043'][Math.floor(r() * 5)]);
                    }
                } else if (t === T.FIELD) {
                    for (let row = 0; row < 3; row++) {
                        const fz = (ty + 0.2 + row * 0.3) * TM;
                        batch.add('crop', cx, this.groundAt(cx, fz), fz, 0, [1, 0.8 + r() * 0.4, 1], ty % 2 ? '#d4b44a' : '#6fae3e');
                    }
                } else if (t === T.PIER) {
                    batch.add('plank', cx, 0.05, cz, 0, [1, 1, 1]);
                    if (ty === 15 || ty === 16) batch.add('post', cx, -1.2, cz + (ty === 15 ? -0.9 : 0.9), 0, [1, 1, 1]);
                } else if (t === T.GRASS && q.grass) {
                    for (let i = 0; i < q.grass; i++) {
                        const gx = cx + (r() - 0.5) * TM, gz = cz + (r() - 0.5) * TM;
                        batch.add('grass', gx, this.groundAt(gx, gz) - 0.05, gz, r() * 6.28, [0.8 + r() * 0.5, 0.45 + r() * 0.55, 0.8 + r() * 0.5], r() < 0.5 ? '#4f8a34' : '#6aa646');
                    }
                }
                if (t === T.PALM) {
                    const palm = buildPalm(r);
                    palm.position.set(cx, this.groundAt(cx, cz), cz);
                    palm.rotation.y = r() * 6.28;
                    this.scene.add(palm);
                }
            }
        }
        const plankMat = M.wood;
        const crystalMat = M.crystal.clone();
        crystalMat.emissiveIntensity = this.theme.crystalGlow || 0.55;
        // tint the glow by each instance's color (instance colors normally only tint diffuse)
        crystalMat.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
                '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif');
        };
        crystalMat.customProgramCacheKey = () => 'crystal-glow';
        const defs = {
            farDistance: 55,
            tree: { near: [{ geo: trees.near.trunk, mat: M.bark }, { geo: trees.near.foliage, mat: leafSway, tint: true }],
                far: [{ geo: trees.far.trunk, mat: M.bark }, { geo: trees.far.foliage, mat: M.leaf, tint: true }] },
            rock: { near: [{ geo: rocks.near, mat: M.stone }], far: [{ geo: rocks.far, mat: M.stone }] },
            crystal: { near: [{ geo: crystalGeometry(), mat: crystalMat, tint: true }], far: [{ geo: crystalGeometry(), mat: crystalMat, tint: true, castShadow: false }] },
            flower: { near: [{ geo: flowerGeometry(), mat: M.petal, tint: true, castShadow: false }], far: null },
            grass: { near: [{ geo: grassTuftGeometry(), mat: grassMat, tint: true, castShadow: false }], far: null },
            crop: { near: [{ geo: cropGeometry(), mat: M.grass, tint: true }], far: [{ geo: cropGeometry(), mat: M.grass, tint: true, castShadow: false }] },
            plank: { near: [{ geo: new THREE.BoxGeometry(TM, 0.18, TM * 0.95), mat: plankMat }], far: [{ geo: new THREE.BoxGeometry(TM, 0.18, TM * 0.95), mat: plankMat }] },
            post: { near: [{ geo: new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), mat: plankMat }], far: null }
        };
        this.scene.add(batch.build(defs));
    }

    leafTint(r) {
        return ['#ffffff', '#e6f2c8', '#cfe6a8', '#f2e2b0'][Math.floor(r() * 4)];
    }

    buildObjects() {
        const map = this.map;
        this.buildings = [];
        map.objects.forEach((obj, i) => {
            const f = obj.footprint;
            const x = (f.x0 + f.w / 2) * TM;
            const z = (f.y0 + f.h / 2) * TM;
            const corners = [[f.x0, f.y0], [f.x1 + 1, f.y0], [f.x0, f.y1 + 1], [f.x1 + 1, f.y1 + 1]].map(([cx, cz]) => this.groundAt(cx * TM, cz * TM));
            const y = Math.max(...corners) - 0.05;
            const group = buildBuilding(obj.type, f.w, f.h, tileRng(obj.tx, obj.ty, i));
            group.position.set(x, y, z);
            group.userData.type = obj.type;
            group.userData.footprint = [f.w * TM, f.h * TM];
            this.scene.add(group);
            this.buildings.push(group);
            if (obj.label) {
                const box = new THREE.Box3().setFromObject(group);
                this.addLabel(obj.label, new THREE.Vector3(x, box.max.y + 0.8, z), 'building');
            }
        });
    }

    buildNpcs() {
        this.map.npcs.forEach((npc) => {
            const ch = buildCharacter({ outfit: npc.color, accent: '#ffffff', hair: '#3a2a22', cap: false });
            const x = (npc.tx + 0.5) * TM, z = (npc.ty + 0.5) * TM;
            ch.root.position.set(x, this.groundAt(x, z), z);
            ch.root.rotation.y = Math.random() * 6.28;
            this.scene.add(ch.root);
            this.npcs.push({ data: npc, ch, baseYaw: ch.root.rotation.y });
            this.addLabel(npc.name, new THREE.Vector3(x, ch.root.position.y + 2.3, z), 'npc');
        });
    }

    buildCaveAmbience() {
        // A few static crystal lights (fixed count → no shader recompiles) + glowing spores.
        if (this.engine.q.tier !== 'low') {
            const T = WORLD.T;
            const spots = [];
            for (let ty = 2; ty < this.map.height - 2 && spots.length < 5; ty += 7) {
                for (let tx = 3; tx < this.map.width - 3 && spots.length < 5; tx += 9) {
                    for (let k = 0; k < 9; k++) {
                        const sx = tx + (k % 3), sy = ty + Math.floor(k / 3);
                        if (this.map.tileAt(sx, sy) === T.CRYSTAL) { spots.push([sx, sy]); break; }
                    }
                }
            }
            spots.forEach(([sx, sy], i) => {
                const light = new THREE.PointLight(['#7ff6ff', '#c58bff', '#ff8fd8'][i % 3], this.theme.crystalLight || 18, 18, 2);
                light.position.set((sx + 0.5) * TM, 1.6, (sy + 0.5) * TM);
                this.scene.add(light);
            });
        }
        const motes = ambientParticles(Math.round(500 * (this.engine.q.tier === 'low' ? 0.4 : 1)), {
            box: new THREE.Vector3(70, 10, 60), center: new THREE.Vector3(40, 4, 30), vel: new THREE.Vector3(0.2, 0.4, 0.1),
            wobble: 1.2, size: 0.18, color: '#9ffcff', color2: '#e0a8ff', additive: true, map: softSprite()
        });
        this.scene.add(motes);
        this.updaters.push((t) => {
            motes.userData.uniforms.uTime.value = t;
            motes.userData.uniforms.uScale.value = this.engine.pointScale();
        });
    }

    /** Swap procedural buildings / trees for authored .glb models when configured. */
    applyModelOverrides() {
        const models = (WORLD.render3d && WORLD.render3d.models) || {};
        this.buildings.forEach((group) => {
            const url = models[group.userData.type];
            if (!url) return;
            loadModel(url).then((gltf) => {
                const model = gltf.scene.clone(true);
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const [fw, fd] = group.userData.footprint;
                model.scale.setScalar(Math.min(fw / size.x, fd / size.z) * 0.9);
                model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                group.children.forEach((c) => { c.visible = false; });
                group.add(model);
            }).catch((err) => console.warn('[MathMon] model override failed', url, err));
        });
    }

    addLabel(text, pos, kind) {
        const el = document.createElement('span');
        el.className = `mm-world-label mm-world-label--${kind}`;
        el.textContent = text;
        this.engine.labelLayer.appendChild(el);
        el.hidden = true;
        this.labels.push({ el, pos });
    }

    update(dt, t, playerPos, reducedMotion) {
        this.sky.userData.uniforms.uTime.value = t;
        this.swayUniforms.uTime.value = t;
        this.swayUniforms.uSway.value = reducedMotion ? 0 : 1;
        this.terrain.update(t, reducedMotion);
        this.updaters.forEach((fn) => fn(t));
        // NPCs idle and turn to face a nearby player.
        this.npcs.forEach((n) => {
            const r = n.ch.root;
            const dx = playerPos.x - r.position.x, dz = playerPos.z - r.position.z;
            const near = dx * dx + dz * dz < 36;
            const targetYaw = near ? Math.atan2(dx, dz) : n.baseYaw;
            let diff = targetYaw - r.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            r.rotation.y += diff * Math.min(1, dt * 5);
            n.ch.update(dt, 0, reducedMotion);
        });
        // Shadow camera follows the player.
        this.sun.target.position.copy(playerPos);
        this.sun.position.copy(playerPos).addScaledVector(this.sunDir, 50);
    }

    setLabelsVisible(on) {
        this.labels.forEach((l) => { l.el.hidden = !on; });
    }
}

const modelCache = new Map();
function loadModel(url) {
    if (!modelCache.has(url)) modelCache.set(url, new GLTFLoader().loadAsync(url));
    return modelCache.get(url);
}

// ---- Engine (singleton: one WebGL context for the whole session) -----------------------
class OverworldEngine {
    constructor() {
        this.cfg = (WORLD.render3d) || {};
        this.tier = detectTier(this.cfg.quality);
        this.q = { tier: this.tier, ...QUALITY[this.tier] };
        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.canvas = this.renderer.domElement;
        this.canvas.className = 'mm-world3d';
        this.canvas.setAttribute('aria-hidden', 'true');
        this.labelLayer = document.createElement('div');
        this.labelLayer.className = 'mm-world-labels';
        this.labelLayer.setAttribute('aria-hidden', 'true');
        this.camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.3, 900);
        this.locations = new Map();
        this.player = null;
        this.playerGender = null;
        this.yaw = 0; this.targetYaw = 0;
        this.pitch = 0.48;        // ~27°: shows the horizon and building fronts
        this.distance = this.cfg.cameraDistance || 17;
        this.targetDistance = this.distance;
        this.camTarget = new THREE.Vector3();
        this.playerPos = new THREE.Vector3();
        this.playerYaw = 0;
        this.speed = 0;
        this.time = 0;
        this.running = false;
        this.fps = { frames: 0, time: 0, warmup: 3 };
        this.raycaster = new THREE.Raycaster();
        this.camClip = Infinity;
        this.loop = this.loop.bind(this);
        this.onResize = () => requestAnimationFrame(() => this.resize());
    }

    attach(container) {
        this.container = container;
        if (this.canvas.parentElement !== container) container.prepend(this.canvas);
        if (this.labelLayer.parentElement !== container) container.appendChild(this.labelLayer);
        this.canvas.style.display = '';
        this.labelLayer.style.display = '';
        window.addEventListener('resize', this.onResize);
        const phaserCanvas = this.phaserCanvas();
        if (phaserCanvas && window.ResizeObserver && !this.observer) {
            this.observer = new ResizeObserver(this.onResize);
            this.observer.observe(phaserCanvas);
        }
        this.resize();
    }

    phaserCanvas() {
        return this.container && this.container.querySelector('canvas:not(.mm-world3d):not(.mm-stage3d)');
    }

    resize() {
        const pc = this.phaserCanvas();
        if (!pc) return;
        const c = pc.getBoundingClientRect();
        const p = this.container.getBoundingClientRect();
        const box = { left: `${c.left - p.left}px`, top: `${c.top - p.top}px`, width: `${c.width}px`, height: `${c.height}px` };
        Object.assign(this.canvas.style, box);
        Object.assign(this.labelLayer.style, box);
        this.width = Math.max(2, Math.round(c.width));
        this.height = Math.max(2, Math.round(c.height));
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
        this.renderer.setSize(this.width, this.height, false);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        if (this.composer) this.composer.setSize(this.width, this.height);
    }

    buildComposer(loc) {
        if (this.composer) this.composer.dispose();
        const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
        const w = this.width || 800, h = this.height || 600;
        const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: this.q.msaa });
        this.composer = new EffectComposer(this.renderer, target);
        this.composer.setPixelRatio(pr);
        this.composer.setSize(w, h);
        this.composer.addPass(new RenderPass(loc.scene, this.camera));
        if (this.q.bloom) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), loc.theme.bloom, 0.5, 0.85));
        this.composer.addPass(new OutputPass());
        this.renderer.toneMappingExposure = loc.theme.exposure;
        this.renderer.shadowMap.enabled = Boolean(this.q.shadows);
    }

    setLocation(key) {
        if (this.current && this.current.map.key === key) return;
        if (this.current) this.current.setLabelsVisible(false);
        if (!this.locations.has(key)) this.locations.set(key, new LocationScene(this, WORLD.get(key)));   // lazy build
        this.current = this.locations.get(key);
        if (this.player) this.current.scene.add(this.player.root);
        this.buildComposer(this.current);
        this.snapCamera = true;
    }

    setPlayerModel(gender) {
        if (this.playerGender === gender && this.player) return;
        if (this.player && this.player.root.parent) this.player.root.parent.remove(this.player.root);
        this.player = gender === 'female'
            ? buildCharacter({ style: 'girl', outfit: '#d95786', accent: '#5ee0c0', hair: '#5a3028', pants: '#3a2d4a' })
            : buildCharacter({ style: 'boy', outfit: '#8d5a3b', accent: '#ef5350', hair: '#3b2419' });
        this.playerGender = gender;
        if (this.current) this.current.scene.add(this.player.root);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.canvas.style.display = 'none';
        this.labelLayer.style.display = 'none';
        window.removeEventListener('resize', this.onResize);
    }

    pointScale() {
        return (this.renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    }

    loop(now) {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this.loop);
        const dt = Math.min(this.cfg.maxFrameDt || 0.05, (now - this.last) / 1000);
        this.last = now;
        this.time += dt;
        const reduced = prefersReducedMotion() || Boolean(this.cfg.reducedMotion);
        const loc = this.current;
        if (!loc) return;

        // Player model follows the logical (pixel) position from OverworldScene.
        const p = this.player.root;
        p.position.set(this.playerPos.x, loc.groundAt(this.playerPos.x, this.playerPos.z), this.playerPos.z);
        let dyaw = this.playerYaw - p.rotation.y;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        p.rotation.y += dyaw * Math.min(1, dt * 12);
        this.player.update(dt, this.speed, reduced);

        // Follow / orbit camera with terrain collision.
        const k = reduced || this.snapCamera ? 1 : 1 - Math.exp(-dt * 7);
        this.snapCamera = false;
        this.yaw += (this.targetYaw - this.yaw) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
        this.distance += (this.targetDistance - this.distance) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
        this.camTarget.lerp(new THREE.Vector3(p.position.x, p.position.y + 1.3, p.position.z), k);
        const cp = Math.cos(this.pitch);
        const cam = this.camera.position.set(
            this.camTarget.x + Math.sin(this.yaw) * cp * this.distance,
            this.camTarget.y + Math.sin(this.pitch) * this.distance,
            this.camTarget.z + Math.cos(this.yaw) * cp * this.distance);
        // Occlusion: if a building sits between player and camera, pull the camera in
        // front of it (snap in quickly, ease back out) so the player is never hidden.
        const toCam = new THREE.Vector3().subVectors(cam, this.camTarget);
        const full = toCam.length();
        this.raycaster.set(this.camTarget, toCam.normalize());
        this.raycaster.far = full;
        const hit = this.raycaster.intersectObjects(loc.occluders, false)[0];
        const allowed = hit ? Math.max(2.5, hit.distance - 0.6) : full;
        this.camClip = allowed < this.camClip ? allowed : this.camClip + (allowed - this.camClip) * Math.min(1, dt * 3);
        if (this.camClip < full) cam.copy(this.camTarget).addScaledVector(toCam, this.camClip);
        const minY = loc.groundAt(cam.x, cam.z) + 1.2;
        if (cam.y < minY) cam.y = minY;
        this.camera.lookAt(this.camTarget);

        loc.update(dt, this.time, p.position, reduced);
        this.composer.render(dt);
        this.updateLabels();
        this.governFrameRate(dt);
    }

    updateLabels() {
        const v = new THREE.Vector3();
        const camPos = this.camera.position;
        this.current.labels.forEach((l) => {
            v.copy(l.pos).project(this.camera);
            const dist = camPos.distanceTo(l.pos);
            const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && dist < 48;
            l.el.hidden = !visible;
            if (!visible) return;
            l.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * this.width}px, ${((1 - v.y) / 2) * this.height}px)`;
            l.el.style.opacity = String(Math.max(0.15, Math.min(1, (48 - dist) / 14)));
        });
    }

    governFrameRate(dt) {
        if (this.cfg.autoDowngrade === false) return;
        if (this.fps.warmup > 0) { this.fps.warmup -= dt; return; }
        this.fps.frames++;
        this.fps.time += dt;
        if (this.fps.time < 3) return;
        const fps = this.fps.frames / this.fps.time;
        this.fps.frames = 0; this.fps.time = 0;
        const idx = TIERS.indexOf(this.tier);
        if (fps < (this.cfg.minFps || 45) && idx < TIERS.length - 1) {
            this.tier = TIERS[idx + 1];
            this.q = { tier: this.tier, ...QUALITY[this.tier] };
            saveTier(this.tier);
            console.info(`[MathMon] Overworld 3D quality lowered to "${this.tier}" (${fps.toFixed(0)} fps)`);
            this.locations.forEach((l) => { l.sun.castShadow = Boolean(this.q.shadows); });
            this.resize();
            this.buildComposer(this.current);
            this.fps.warmup = 2;
        }
    }
}

let engine = null;

window.MathMonOverworld3D = {
    isSupported,
    /**
     * Show the 3D overworld for a location and return a controller for OverworldScene.
     * @param {object} opts { container, mapKey, gender, x, y }   (x, y in game pixels)
     */
    mount(opts) {
        if (!engine) engine = new OverworldEngine();
        engine.attach(opts.container);
        engine.setPlayerModel(opts.gender);
        engine.setLocation(opts.mapKey);
        engine.current.setLabelsVisible(true);
        engine.playerPos.set((opts.x / WORLD.TILE_PX) * TM, 0, (opts.y / WORLD.TILE_PX) * TM);
        engine.snapCamera = true;
        engine.start();
        return {
            /** Called every frame by OverworldScene with the logical player position (pixels). */
            setPlayer(x, y, moving, dtSeconds) {
                const nx = (x / WORLD.TILE_PX) * TM, nz = (y / WORLD.TILE_PX) * TM;
                const dx = nx - engine.playerPos.x, dz = nz - engine.playerPos.z;
                const dist = Math.hypot(dx, dz);
                if (dist > 0.001) engine.playerYaw = Math.atan2(dx, dz);
                engine.speed = moving && dtSeconds > 0 ? dist / dtSeconds : 0;
                engine.playerPos.set(nx, 0, nz);
            },
            /** Camera yaw (radians) so input can be made camera-relative. */
            cameraYaw() { return engine.yaw; },
            orbit(delta) { engine.targetYaw += delta; },
            zoom(delta) {
                const min = engine.cfg.minDistance || 9, max = engine.cfg.maxDistance || 30;
                engine.targetDistance = Math.max(min, Math.min(max, engine.targetDistance + delta));
            },
            resetView() { engine.targetYaw = Math.round(engine.targetYaw / (Math.PI * 2)) * Math.PI * 2; engine.targetDistance = engine.cfg.cameraDistance || 17; },
            unmount() { engine.stop(); }
        };
    }
};
window.dispatchEvent(new Event('mathmon-overworld3d-ready'));
