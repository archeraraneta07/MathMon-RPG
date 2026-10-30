/**
 * MathMon 3D overworld — procedural asset library.
 *
 * Every builder returns Three.js objects in meters (1 tile = 2 m, trainer ≈ 1.7 m),
 * facing +Z (south, toward the camera's default view). Materials and geometries
 * are created once and shared, so many buildings/props cost few GPU resources.
 *
 * To use authored models instead, list .glb files in
 * MathMonWorldData.render3d.models — overworld3d.js swaps them in lazily.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceTextures, repeatSet } from '../battle-3d/core.js';

// ---- Shared materials -----------------------------------------------------------
let MATS = null;

export function materials() {
    if (MATS) return MATS;
    const plaster = repeatSet(surfaceTextures('world-plaster', { pattern: 'concrete', color: '#e8dcc6', dark: '#b9a98f', light: '#f6efe2', seed: 51, size: 128, roughness: 0.85 }), 1.5);
    const brick = repeatSet(surfaceTextures('world-brick', { pattern: 'rock', color: '#a0523a', dark: '#5e2b1c', light: '#c47454', seed: 52, size: 128, period: 8, crackWidth: 0.12, crackDepth: 0.6, roughness: 0.9 }), 2);
    const wood = repeatSet(surfaceTextures('ship-wood', { pattern: 'wood', color: '#5a3b22', dark: '#1f130a', light: '#8a6440', seed: 6, size: 256, roughness: 0.8 }), 1, 2);
    const roof = repeatSet(surfaceTextures('world-roof', { pattern: 'scales', color: '#b4422f', dark: '#5c1a10', light: '#d9654b', seed: 53, size: 128, roughness: 0.7 }), 3);
    const bark = repeatSet(surfaceTextures('world-bark', { pattern: 'wood', color: '#8a6a4a', dark: '#4a3524', light: '#a8865f', seed: 54, size: 128, roughness: 0.95 }), 1, 3);
    const leaf = repeatSet(surfaceTextures('world-leaf', { pattern: 'skin', color: '#3f8a3a', dark: '#1d4a1f', light: '#6fbf5a', seed: 55, size: 128, roughness: 0.8 }), 2);
    const stone = repeatSet(surfaceTextures('world-stone', { pattern: 'rock', color: '#6f6a66', dark: '#2e2b29', light: '#9d968f', seed: 56, size: 128, roughness: 0.9 }), 1);
    MATS = {
        plaster: new THREE.MeshStandardMaterial({ ...plaster, emissiveMap: null, roughness: 1 }),
        brick: new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap, roughness: 0.95 }),
        wood: new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, roughness: 0.85 }),
        roof: new THREE.MeshStandardMaterial({ map: roof.map, normalMap: roof.normalMap, roughness: 0.7 }),
        roofDark: new THREE.MeshStandardMaterial({ color: '#3c4650', roughness: 0.6, metalness: 0.3 }),
        glass: new THREE.MeshPhysicalMaterial({ color: '#9fc4dd', roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive: '#2a3a48', emissiveIntensity: 0.4 }),
        frame: new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.6 }),
        metal: new THREE.MeshStandardMaterial({ color: '#8a9298', roughness: 0.35, metalness: 0.8 }),
        gold: new THREE.MeshStandardMaterial({ color: '#e6b84a', roughness: 0.3, metalness: 0.9, emissive: '#5a3a00', emissiveIntensity: 0.4 }),
        bark: new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 1 }),
        leaf: new THREE.MeshStandardMaterial({ map: leaf.map, normalMap: leaf.normalMap, roughness: 0.85 }),
        stone: new THREE.MeshStandardMaterial({ map: stone.map, normalMap: stone.normalMap, roughness: 0.95 }),
        crystal: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0, transmission: 0, clearcoat: 1,
            emissive: '#ffffff', emissiveIntensity: 1.6, flatShading: true }),
        petal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
        grass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }),
        cloth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide })
    };
    return MATS;
}

function m(geo, mat, p, r, s) {
    const mesh = new THREE.Mesh(geo, mat);
    if (p) mesh.position.set(...p);
    if (r) mesh.rotation.set(...r);
    if (s) mesh.scale.set(...s);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** Triangular prism (gable roof) spanning width × depth, ridge height h. */
function gableRoof(w, d, h, overhang) {
    const o = overhang || 0.4;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - o, 0);
    shape.lineTo(w / 2 + o, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d + o * 2, bevelEnabled: false });
    geo.translate(0, 0, -(d + o * 2) / 2);
    return geo;
}

/** Barn-style gambrel roof profile. */
function gambrelRoof(w, d, h) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.4, 0);
    shape.lineTo(w / 2 + 0.4, 0);
    shape.lineTo(w * 0.32, h * 0.62);
    shape.lineTo(0, h);
    shape.lineTo(-w * 0.32, h * 0.62);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false });
    geo.translate(0, 0, -(d + 0.8) / 2);
    return geo;
}

function windowAt(group, x, y, z, w, h, faceRotY) {
    const M = materials();
    const win = new THREE.Group();
    win.add(m(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08), M.frame));
    win.add(m(new THREE.BoxGeometry(w, h, 0.1), M.glass, [0, 0, 0.02]));
    win.add(m(new THREE.BoxGeometry(w, 0.06, 0.12), M.frame, [0, 0, 0.04]));
    win.position.set(x, y, z);
    win.rotation.y = faceRotY || 0;
    group.add(win);
}

function awning(width, depth, colorA, colorB, stripes) {
    const g = new THREE.Group();
    const n = stripes || 8;
    const a = new THREE.MeshStandardMaterial({ color: colorA, roughness: 0.9, side: THREE.DoubleSide });
    const b = new THREE.MeshStandardMaterial({ color: colorB, roughness: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
        const s = m(new THREE.BoxGeometry(width / n, 0.05, depth), i % 2 ? a : b, [-width / 2 + (i + 0.5) * (width / n), 0, 0]);
        g.add(s);
    }
    g.rotation.x = 0.35;
    return g;
}

/**
 * Procedural building for a map object. `fw`/`fd` are the footprint in tiles.
 * Returns a Group whose origin is the footprint center at ground level; the
 * front door faces +Z.
 */
export function buildBuilding(type, fw, fd, rng) {
    const M = materials();
    const W = fw * 2 - 0.8;
    const D = fd * 2 - 0.8;
    const g = new THREE.Group();
    const r = rng || Math.random;

    const door = (x, wDoor, hDoor) => {
        g.add(m(new THREE.BoxGeometry(wDoor, hDoor, 0.15), M.wood, [x, hDoor / 2, D / 2 + 0.05]));
        g.add(m(new THREE.SphereGeometry(0.06, 8, 6), M.gold, [x + wDoor * 0.35, hDoor * 0.5, D / 2 + 0.16]));
        g.add(m(new THREE.BoxGeometry(wDoor + 0.6, 0.15, 0.9), M.stone, [x, 0.07, D / 2 + 0.45]));
    };

    if (type === 'house') {
        const H = 3.1;
        g.add(m(new THREE.BoxGeometry(W, H, D), M.plaster, [0, H / 2, 0]));
        g.add(m(new THREE.BoxGeometry(W + 0.1, 0.35, D + 0.1), M.stone, [0, 0.17, 0]));
        const roofMat = r() < 0.5 ? M.roof : M.roofDark;
        g.add(m(gableRoof(W, D, 2.0), roofMat, [0, H, 0]));
        g.add(m(new THREE.BoxGeometry(0.6, 1.6, 0.6), M.brick, [W * 0.25, H + 1.3, -D * 0.15]));
        door(0, 1.0, 2.1);
        windowAt(g, -W * 0.3, 1.8, D / 2 + 0.04, 0.9, 0.9);
        windowAt(g, W * 0.3, 1.8, D / 2 + 0.04, 0.9, 0.9);
        windowAt(g, W / 2 + 0.04, 1.8, 0, 0.9, 0.9, Math.PI / 2);
        windowAt(g, -W / 2 - 0.04, 1.8, 0, 0.9, 0.9, -Math.PI / 2);
    } else if (type === 'apartment') {
        const floors = 3;
        const H = floors * 2.7;
        g.add(m(new THREE.BoxGeometry(W, H, D), M.brick, [0, H / 2, 0]));
        g.add(m(new THREE.BoxGeometry(W + 0.2, 0.4, D + 0.2), M.stone, [0, H + 0.2, 0]));
        for (let f = 0; f < floors; f++) {
            for (let c = -1; c <= 1; c++) {
                if (f === 0 && c === 0) continue;
                windowAt(g, c * W * 0.3, 1.5 + f * 2.7, D / 2 + 0.04, 0.8, 1.1);
            }
            windowAt(g, W / 2 + 0.04, 1.5 + f * 2.7, 0, 0.8, 1.1, Math.PI / 2);
            windowAt(g, -W / 2 - 0.04, 1.5 + f * 2.7, 0, 0.8, 1.1, -Math.PI / 2);
        }
        door(0, 1.2, 2.2);
        g.add(m(new THREE.BoxGeometry(1.6, 0.12, 0.9), M.roofDark, [0, 2.45, D / 2 + 0.45]));
    } else if (type === 'market' || type === 'cafe') {
        const H = 3.4;
        g.add(m(new THREE.BoxGeometry(W, H, D * 0.75), type === 'market' ? M.plaster : M.wood, [0, H / 2, -D * 0.12]));
        g.add(m(gableRoof(W, D * 0.75, 1.4, 0.3), M.roofDark, [0, H, -D * 0.12]));
        const aw = awning(W * 0.95, 1.8, type === 'market' ? '#e8483a' : '#2f7d5a', '#f6f1e4', type === 'market' ? 10 : 8);
        aw.position.set(0, 2.6, D * 0.25 + 0.5);
        g.add(aw);
        door(0, 1.1, 2.1);
        windowAt(g, -W * 0.3, 1.6, D * 0.25 + 0.04, 1.3, 1.0);
        windowAt(g, W * 0.3, 1.6, D * 0.25 + 0.04, 1.3, 1.0);
        if (type === 'market') {
            for (let i = -1; i <= 1; i += 2) {
                g.add(m(new THREE.BoxGeometry(1.4, 0.9, 0.8), M.wood, [i * W * 0.3, 0.45, D / 2 + 0.4]));
                for (let k = 0; k < 5; k++) g.add(m(new THREE.SphereGeometry(0.14, 10, 8),
                    new THREE.MeshStandardMaterial({ color: ['#e74c3c', '#f39c12', '#f1c40f', '#7bc043'][k % 4], roughness: 0.5 }),
                    [i * W * 0.3 - 0.5 + k * 0.25, 1.0, D / 2 + 0.4]));
            }
        } else {
            for (let i = -1; i <= 1; i += 2) {
                g.add(m(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), M.frame, [i * W * 0.32, 0.8, D / 2 + 1.0]));
                g.add(m(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8), M.metal, [i * W * 0.32, 0.4, D / 2 + 1.0]));
                g.add(m(new THREE.ConeGeometry(0.9, 0.5, 16), new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.8 }), [i * W * 0.32, 2.0, D / 2 + 1.0]));
                g.add(m(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), M.metal, [i * W * 0.32, 1.4, D / 2 + 1.0]));
            }
        }
    } else if (type === 'gym') {
        const H = 4.6;
        g.add(m(new THREE.BoxGeometry(W, H, D), M.stone, [0, H / 2, 0]));
        const dome = m(new THREE.SphereGeometry(Math.min(W, D) * 0.48, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.roofDark, [0, H, 0]);
        dome.scale.set(W / Math.min(W, D), 0.55, D / Math.min(W, D));
        g.add(dome);
        for (let i = -1; i <= 1; i += 2) g.add(m(new THREE.CylinderGeometry(0.3, 0.35, H, 16), M.frame, [i * 1.5, H / 2, D / 2 + 0.35]));
        g.add(m(new THREE.BoxGeometry(4, 0.4, 1.2), M.frame, [0, H - 0.2, D / 2 + 0.35]));
        g.add(m(new THREE.CylinderGeometry(0.75, 0.75, 0.15, 32), M.gold, [0, H + 0.7, D / 2 + 0.3], [Math.PI / 2, 0, 0]));
        door(0, 1.6, 2.6);
    } else if (type === 'barn') {
        const H = 3.6;
        const red = new THREE.MeshStandardMaterial({ map: M.wood.map, normalMap: M.wood.normalMap, color: '#c0392b', roughness: 0.85 });
        g.add(m(new THREE.BoxGeometry(W, H, D), red, [0, H / 2, 0]));
        g.add(m(gambrelRoof(W, D, 2.8), M.roofDark, [0, H, 0]));
        g.add(m(new THREE.BoxGeometry(2.4, 2.8, 0.16), M.frame, [0, 1.4, D / 2 + 0.06]));
        g.add(m(new THREE.BoxGeometry(2.2, 2.6, 0.18), red, [0, 1.4, D / 2 + 0.08]));
        [0.85, -0.85].forEach((a) => g.add(m(new THREE.BoxGeometry(0.15, 3.3, 0.2), M.frame, [0, 1.4, D / 2 + 0.12], [0, 0, a])));
        g.add(m(new THREE.CylinderGeometry(0.9, 0.9, 5.5, 20), M.metal, [W / 2 + 1.0, 2.75, -D * 0.2]));
        g.add(m(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metal, [W / 2 + 1.0, 5.5, -D * 0.2]));
    } else if (type === 'palm') {
        return buildPalm(r);
    }
    return g;
}

export function buildPalm(rng) {
    const M = materials();
    const r = rng || Math.random;
    const g = new THREE.Group();
    const lean = 0.6 + r() * 0.8;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.3, 2.5, 0), new THREE.Vector3(lean, 5, 0), new THREE.Vector3(lean * 1.4, 6.6, 0)]);
    g.add(m(new THREE.TubeGeometry(curve, 16, 0.2, 8), M.bark));
    const top = curve.getPoint(1);
    const frondMat = new THREE.MeshStandardMaterial({ color: '#4c9a3c', roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
        const geo = new THREE.PlaneGeometry(0.8, 3.4, 1, 6);
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
            const y = pos.getY(v) + 1.7;
            pos.setXYZ(v, pos.getX(v) * (1 - y / 3.6), y, -0.12 * y * y);
        }
        geo.computeVertexNormals();
        const frond = m(geo, frondMat, [top.x, top.y, top.z], [-0.4, (i / 8) * Math.PI * 2, 0]);
        frond.rotation.order = 'YXZ';
        frond.rotation.x = -1.0 - r() * 0.3;
        g.add(frond);
    }
    for (let i = 0; i < 3; i++) g.add(m(new THREE.SphereGeometry(0.18, 10, 8), M.wood, [top.x + Math.cos(i * 2) * 0.25, top.y - 0.25, Math.sin(i * 2) * 0.25]));
    return g;
}

// ---- Instanced prop geometry (two LOD levels each) ---------------------------------
function lump(geo, amount, seed) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.3) * Math.sin(z * 3.3 + seed * 0.7);
        const k = 1 + n * amount;
        pos.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    return geo;
}

/** Tree: { trunk, foliage } geometries for the near (detailed) and far (cheap) LOD levels. */
export function treeGeometries() {
    const near = {
        trunk: new THREE.CylinderGeometry(0.18, 0.3, 2.6, 8).translate(0, 1.3, 0),
        foliage: mergeGeometries([
            lump(new THREE.IcosahedronGeometry(1.5, 2), 0.18, 1).translate(0, 3.2, 0),
            lump(new THREE.IcosahedronGeometry(1.1, 2), 0.2, 2).translate(0.8, 2.6, 0.3),
            lump(new THREE.IcosahedronGeometry(1.0, 2), 0.2, 3).translate(-0.7, 2.7, -0.3),
            lump(new THREE.IcosahedronGeometry(0.9, 1), 0.2, 4).translate(0.1, 4.2, 0.1)
        ])
    };
    const far = {
        trunk: new THREE.CylinderGeometry(0.2, 0.3, 2.6, 5).translate(0, 1.3, 0),
        foliage: new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.3, 0)
    };
    return { near, far };
}

export function rockGeometries() {
    return {
        near: lump(new THREE.IcosahedronGeometry(1, 2), 0.3, 7),
        far: new THREE.IcosahedronGeometry(1, 0)
    };
}

export function crystalGeometry() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
        const g = new THREE.OctahedronGeometry(0.35, 0);
        g.scale(1, 3 - i * 0.5, 1);
        g.rotateZ((i - 1.5) * 0.35);
        g.rotateY(i * 1.7);
        g.translate((i - 1.5) * 0.35, 0.9, (i % 2) * 0.3);
        parts.push(g);
    }
    return mergeGeometries(parts);
}

export function flowerGeometry() {
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(new THREE.SphereGeometry(0.11, 6, 4).scale(1, 0.5, 1).translate(Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12));
    }
    parts.push(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4).translate(0, 0.2, 0));
    return mergeGeometries(parts.map((p) => p.toNonIndexed ? p.toNonIndexed() : p));
}

/** Grass tuft: three crossed blades. */
export function grassTuftGeometry() {
    const parts = [];
    for (let i = 0; i < 3; i++) {
        const blade = new THREE.ConeGeometry(0.06, 0.55, 3, 1);
        blade.translate(0, 0.27, 0);
        blade.rotateZ((i - 1) * 0.35);
        blade.translate((i - 1) * 0.08, 0, 0);
        parts.push(blade);
    }
    return mergeGeometries(parts);
}

export function cropGeometry() {
    return mergeGeometries([0, 1, 2].map((i) => new THREE.ConeGeometry(0.12, 0.7, 5).translate((i - 1) * 0.6, 0.35, 0)));
}

// ---- Characters ------------------------------------------------------------------------
/**
 * Trainer / NPC: simple jointed figure (~1.7 m) with a walk cycle.
 * @returns {{ root, update(dt, speed) }}
 */
export function buildCharacter(opts) {
    const o = opts || {};
    const skin = new THREE.MeshStandardMaterial({ color: o.skin || '#f2c09b', roughness: 0.7 });
    const outfit = new THREE.MeshStandardMaterial({ color: o.outfit || '#8d5a3b', roughness: 0.8 });
    const accent = new THREE.MeshStandardMaterial({ color: o.accent || '#ef5350', roughness: 0.6 });
    const hair = new THREE.MeshStandardMaterial({ color: o.hair || '#3b2419', roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: o.pants || '#263238', roughness: 0.85 });
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.85;
    root.add(body);
    body.add(m(new THREE.CapsuleGeometry(0.24, 0.42, 4, 12), outfit, [0, 0.33, 0]));
    body.add(m(new THREE.BoxGeometry(0.1, 0.5, 0.02), accent, [0, 0.35, 0.24]));
    const head = new THREE.Group();
    head.position.y = 0.88;
    body.add(head);
    head.add(m(new THREE.SphereGeometry(0.2, 20, 16), skin));
    if (o.style === 'girl') {
        head.add(m(new THREE.SphereGeometry(0.215, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, [0, 0.02, -0.01]));
        [-1, 1].forEach((s) => head.add(m(new THREE.SphereGeometry(0.1, 12, 10), hair, [0.2 * s, -0.05, -0.06])));
        head.add(m(new THREE.CapsuleGeometry(0.07, 0.25, 4, 8), hair, [0, -0.15, -0.18], [0.4, 0, 0]));
    } else {
        head.add(m(new THREE.SphereGeometry(0.21, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), o.cap === false ? hair : accent, [0, 0.03, 0]));
        if (o.cap !== false) head.add(m(new THREE.BoxGeometry(0.3, 0.03, 0.18), accent, [0, 0.05, 0.2]));
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#17202a', roughness: 0.4 });
    [-1, 1].forEach((s) => head.add(m(new THREE.SphereGeometry(0.03, 8, 6), eyeMat, [0.07 * s, 0.02, 0.18])));
    const limb = (mat, len, r) => {
        const pivot = new THREE.Group();
        pivot.add(m(new THREE.CapsuleGeometry(r, len, 4, 8), mat, [0, -len / 2 - r, 0]));
        return pivot;
    };
    const armL = limb(outfit, 0.42, 0.075); armL.position.set(0.31, 0.62, 0); body.add(armL);
    const armR = limb(outfit, 0.42, 0.075); armR.position.set(-0.31, 0.62, 0); body.add(armR);
    const legL = limb(pants, 0.55, 0.09); legL.position.set(0.12, 0.05, 0); body.add(legL);
    const legR = limb(pants, 0.55, 0.09); legR.position.set(-0.12, 0.05, 0); body.add(legR);
    [armL, armR].forEach((a) => a.children[0].add(m(new THREE.SphereGeometry(0.075, 8, 6), skin, [0, -0.3, 0])));
    [legL, legR].forEach((l) => l.add(m(new THREE.BoxGeometry(0.16, 0.1, 0.26), pants, [0, -0.78, 0.05])));
    root.traverse((c) => { if (c.isMesh) c.castShadow = true; });

    let phase = 0;
    let moveBlend = 0;
    return {
        root,
        head,
        /** speed in m/s; reducedMotion freezes the idle bob. */
        update(dt, speed, reducedMotion) {
            const target = Math.min(1, speed / 3);
            moveBlend += (target - moveBlend) * Math.min(1, dt * 10);
            phase += dt * (4 + speed * 1.2);
            const swing = Math.sin(phase) * 0.75 * moveBlend;
            legL.rotation.x = swing; legR.rotation.x = -swing;
            armL.rotation.x = -swing * 0.8; armR.rotation.x = swing * 0.8;
            body.position.y = 0.85 + Math.abs(Math.cos(phase)) * 0.06 * moveBlend
                + (reducedMotion ? 0 : Math.sin(phase * 0.35) * 0.01 * (1 - moveBlend));
            body.rotation.x = 0.08 * moveBlend;
        }
    };
}
