/**
 * MathMon 3D battle — shared utilities.
 *   - easing + a time-scaled tween system (slow motion = smaller dt)
 *   - tileable value-noise / Voronoi for procedural PBR textures (no image files)
 *   - GLSL noise chunk
 *   - "bendable limb" material: a cylinder curled along an arc in the vertex
 *     shader (necks, tails, tentacles, serpent coils) with matching shadows
 */
import * as THREE from 'three';

// ---- Quality tiers (shared by the battle stage and the 3D overworld) ----------
export const TIER_KEY = 'mathmon_stage3d_tier';
export const TIERS = ['high', 'medium', 'low'];

/** Pick a quality tier: explicit config → tier saved after an auto-downgrade → device heuristics. */
export function detectTier(qualitySetting) {
    if (qualitySetting && qualitySetting !== 'auto') return qualitySetting;
    try {
        const saved = sessionStorage.getItem(TIER_KEY);
        if (TIERS.includes(saved)) return saved;
    } catch (e) { /* storage unavailable */ }
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    if (mem <= 3 || cores <= 4) return 'low';
    if (coarse) return 'medium';
    return 'high';
}

/** Remember a downgraded tier for the rest of the session. */
export function saveTier(tier) {
    try { sessionStorage.setItem(TIER_KEY, tier); } catch (e) { /* ignore */ }
}

export function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ---- Math / easing -----------------------------------------------------------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const Ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
};

/** Envelope: rises over `a`, holds, falls over the last `b` of a 0..1 progress. */
export function envelope(p, a, b) {
    return smoothstep(0, a, p) * (1 - smoothstep(1 - b, 1, p));
}

/** Window: 0 before `a`, eased 0→1 between a and b, 1 after. */
export function win(p, a, b, ease) {
    const t = clamp((p - a) / (b - a), 0, 1);
    return (ease || Ease.inOutSine)(t);
}

/**
 * Minimal tween/timer system driven by the stage's (time-scaled) delta, so
 * slow motion affects every animation consistently.
 */
export class Tweens {
    constructor() { this.items = []; }

    add(opts) {
        const item = { t: -(opts.delay || 0), duration: Math.max(1e-4, opts.duration || 0), ease: opts.ease || Ease.outCubic,
            onUpdate: opts.onUpdate, onComplete: opts.onComplete, done: false };
        this.items.push(item);
        return item;
    }

    /** Promise that resolves after `seconds` of (scaled) stage time. */
    wait(seconds) {
        return new Promise((resolve) => this.add({ duration: seconds, onComplete: resolve }));
    }

    update(dt) {
        for (let i = 0; i < this.items.length; i++) {
            const it = this.items[i];
            if (it.done) continue;
            it.t += dt;
            if (it.t < 0) continue;
            const p = Math.min(1, it.t / it.duration);
            if (it.onUpdate) it.onUpdate(it.ease(p), p);
            if (p >= 1) {
                it.done = true;
                if (it.onComplete) it.onComplete();
            }
        }
        if (this.items.length > 64) this.items = this.items.filter((it) => !it.done);
    }

    clear() { this.items.length = 0; }
}

// ---- Tileable noise (CPU, for textures) --------------------------------------
function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Periodic value noise in [0,1]; `period` cells wrap seamlessly. */
export function valueNoise(x, y, period, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const w = (n) => ((n % period) + period) % period;
    const a = hash2(w(xi), w(yi), seed), b = hash2(w(xi + 1), w(yi), seed);
    const c = hash2(w(xi), w(yi + 1), seed), d = hash2(w(xi + 1), w(yi + 1), seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x, y, period, octaves, seed) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
        sum += valueNoise(x * f, y * f, period * f, seed + o * 17) * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
    }
    return sum / norm;
}

/** Periodic Voronoi: returns { f1, edge } (edge = F2 − F1, small near cell borders). */
export function voronoi(x, y, period, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
            const cx = xi + i, cy = yi + j;
            const wx = ((cx % period) + period) % period, wy = ((cy % period) + period) % period;
            const px = cx + hash2(wx, wy, seed), py = cy + hash2(wx, wy, seed + 5);
            const d = Math.hypot(px - x, py - y);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
        }
    }
    return { f1, edge: f2 - f1 };
}

// ---- Procedural PBR texture sets ------------------------------------------------
const textureCache = new Map();

function canvasTexture(size, draw, srgb) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    draw(img.data, size);
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function heightToNormal(height, size, strength) {
    return canvasTexture(size, (data) => {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const l = height[y * size + ((x - 1 + size) % size)], r = height[y * size + ((x + 1) % size)];
                const u = height[((y - 1 + size) % size) * size + x], d = height[((y + 1) % size) * size + x];
                let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
                const len = Math.hypot(nx, ny, nz);
                nx /= len; ny /= len; nz /= len;
                const i = (y * size + x) * 4;
                data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
            }
        }
    }, false);
}

function hexToRgb(hex) {
    const c = new THREE.Color(hex);
    return [c.r * 255, c.g * 255, c.b * 255];
}

/**
 * Generic procedural surface: albedo + normal + roughness (+ optional glowing
 * crack emissive map). `pattern` picks the height function.
 *   pattern: 'rock' | 'scales' | 'skin' | 'concrete' | 'wood' | 'basalt'
 */
export function surfaceTextures(key, opts) {
    if (textureCache.has(key)) return textureCache.get(key);
    const size = opts.size || 256;
    const seed = opts.seed || 1;
    const period = opts.period || 8;
    const height = new Float32Array(size * size);
    const crack = new Float32Array(size * size);
    const base = hexToRgb(opts.color), dark = hexToRgb(opts.dark || opts.color), light = hexToRgb(opts.light || opts.color);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = (x / size) * period, v = (y / size) * period;
            let h = fbm(u, v, period, 5, seed);
            let c = 0;
            if (opts.pattern === 'scales') {
                // overlapping rounded scales: offset rows of Voronoi-ish cells
                const sv = voronoi(u * 2, v * 2, period * 2, seed); // integer scale keeps the tile seamless
                h = 0.65 * (1 - smoothstep(0.0, 0.55, sv.f1)) + 0.35 * h;
                c = 1 - smoothstep(0.0, 0.06, sv.edge);
            } else if (opts.pattern === 'wood') {
                h = 0.5 + 0.5 * Math.sin((v * 6 + fbm(u * 0.5, v * 4, period, 3, seed) * 4) * Math.PI);
                h = h * 0.6 + fbm(u * 4, v * 0.6, period * 4, 3, seed + 3) * 0.4;
                c = smoothstep(0.96, 1, valueNoise(u * 0.25, v * 6, period, seed + 9));
            } else {
                const vr = voronoi(u * 1.3, v * 1.3, Math.round(period * 1.3), seed + 7);
                if (opts.pattern === 'rock' || opts.pattern === 'basalt') h = h * 0.7 + (1 - smoothstep(0, 0.8, vr.f1)) * 0.3;
                c = opts.cracks === false ? 0 : 1 - smoothstep(0.0, opts.crackWidth || 0.05, vr.edge);
                c *= smoothstep(0.35, 0.6, fbm(u * 0.7 + 3, v * 0.7, period, 3, seed + 11));
                if (opts.pattern === 'skin') h = h * 0.6 + fbm(u * 4, v * 4, period * 4, 3, seed + 2) * 0.4;
            }
            height[y * size + x] = h - c * (opts.crackDepth || 0.35);
            crack[y * size + x] = c;
        }
    }

    const map = canvasTexture(size, (data) => {
        for (let i = 0; i < size * size; i++) {
            const h = height[i];
            const t = clamp((h - 0.25) * 1.6, 0, 1);
            const col = t < 0.5
                ? [lerp(dark[0], base[0], t * 2), lerp(dark[1], base[1], t * 2), lerp(dark[2], base[2], t * 2)]
                : [lerp(base[0], light[0], (t - 0.5) * 2), lerp(base[1], light[1], (t - 0.5) * 2), lerp(base[2], light[2], (t - 0.5) * 2)];
            const k = 1 - crack[i] * 0.6;
            data[i * 4] = col[0] * k; data[i * 4 + 1] = col[1] * k; data[i * 4 + 2] = col[2] * k; data[i * 4 + 3] = 255;
        }
    }, true);
    const roughnessMap = canvasTexture(size, (data) => {
        const r0 = opts.roughness == null ? 0.8 : opts.roughness;
        for (let i = 0; i < size * size; i++) {
            const r = clamp(r0 + (0.5 - height[i]) * 0.3 + crack[i] * 0.15, 0.05, 1) * 255;
            data[i * 4] = r; data[i * 4 + 1] = r; data[i * 4 + 2] = r; data[i * 4 + 3] = 255;
        }
    }, false);
    const normalMap = heightToNormal(height, size, opts.normalStrength || 6);
    let emissiveMap = null;
    if (opts.glow) {
        const g = hexToRgb(opts.glow);
        emissiveMap = canvasTexture(size, (data) => {
            for (let i = 0; i < size * size; i++) {
                const c = Math.pow(crack[i], 1.5);
                data[i * 4] = g[0] * c; data[i * 4 + 1] = g[1] * c; data[i * 4 + 2] = g[2] * c; data[i * 4 + 3] = 255;
            }
        }, true);
    }
    const set = { map, normalMap, roughnessMap, emissiveMap };
    textureCache.set(key, set);
    return set;
}

/** Set texture repeat on every map of a set (returns clones so sets can be shared). */
export function repeatSet(set, rx, ry) {
    const out = {};
    Object.keys(set).forEach((k) => {
        if (!set[k]) return;
        const t = set[k].clone();
        t.repeat.set(rx, ry ?? rx);
        t.needsUpdate = true;
        out[k] = t;
    });
    return out;
}

/** Soft round sprite for particles. */
export function spriteTexture(kind) {
    const key = `sprite-${kind}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const size = 64;
    const tex = canvasTexture(size, (data) => {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
                const d = Math.hypot(dx, dy);
                let a = Math.pow(clamp(1 - d, 0, 1), kind === 'smoke' ? 1.2 : 2);
                if (kind === 'smoke') a *= 0.55 + 0.45 * fbm((x / size) * 4, (y / size) * 4, 4, 3, 3);
                const i = (y * size + x) * 4;
                data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = a * 255;
            }
        }
    }, false);
    textureCache.set(key, tex);
    return tex;
}

// ---- GLSL noise chunk ------------------------------------------------------------
export const GLSL_NOISE = /* glsl */`
float mmHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mmNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mmHash(i + vec3(0,0,0)), mmHash(i + vec3(1,0,0)), f.x),
                   mix(mmHash(i + vec3(0,1,0)), mmHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(mmHash(i + vec3(0,0,1)), mmHash(i + vec3(1,0,1)), f.x),
                   mix(mmHash(i + vec3(0,1,1)), mmHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float mmFbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * mmNoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
    return s;
}
`;

// ---- Bendable limb -----------------------------------------------------------------
const BEND_GLSL = /* glsl */`
uniform float uLen; uniform float uCurl; uniform float uDir;
uniform float uWaveAmp; uniform float uWaveFreq; uniform float uPhase; uniform float uTime;
vec3 mmBend(vec3 p, out mat3 R) {
    float t = clamp(p.y / uLen, 0.0, 1.0);
    float phi = uCurl * t;
    vec2 c = abs(uCurl) < 1e-3 ? vec2(0.0, p.y) : vec2((uLen / uCurl) * (1.0 - cos(phi)), (uLen / uCurl) * sin(phi));
    float wave = uWaveAmp * sin(uWaveFreq * t * 6.2831 - uTime + uPhase) * t;
    float cs = cos(phi), sn = sin(phi);
    vec3 q = vec3(c.x + p.x * cs, c.y - p.x * sn, p.z + wave);
    float cd = cos(uDir), sd = sin(uDir);
    mat3 Ry = mat3(cd, 0.0, -sd, 0.0, 1.0, 0.0, sd, 0.0, cd);
    R = Ry * mat3(cs, -sn, 0.0, sn, cs, 0.0, 0.0, 0.0, 1.0);
    return Ry * q;
}
`;

/**
 * Create a tapered cylinder that bends along an arc in the vertex shader.
 * Returns { mesh, uniforms, len }. Animate via uniforms.uCurl / uDir / uWaveAmp / uTime.
 * The limb grows along local +Y from y = 0 to y = len.
 */
export function createBendLimb(opts) {
    const len = opts.length;
    const geo = new THREE.CylinderGeometry(opts.radiusTop, opts.radiusBottom, len, opts.radial || 16, opts.segments || 32, false);
    geo.translate(0, len / 2, 0);
    const uniforms = {
        uLen: { value: len }, uCurl: { value: opts.curl || 0 }, uDir: { value: opts.dir || 0 },
        uWaveAmp: { value: opts.waveAmp || 0 }, uWaveFreq: { value: opts.waveFreq || 1 },
        uPhase: { value: opts.phase || 0 }, uTime: { value: 0 }
    };
    const material = opts.material.clone();
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = BEND_GLSL + shader.vertexShader
            .replace('#include <beginnormal_vertex>', 'mat3 mmR; vec3 mmPos = mmBend(position, mmR); vec3 objectNormal = mmR * normal;\n#ifdef USE_TANGENT\nvec3 objectTangent = mmR * tangent.xyz;\n#endif')
            .replace('#include <begin_vertex>', 'vec3 transformed = mmPos;');
    };
    material.customProgramCacheKey = () => 'mm-bend';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = BEND_GLSL + shader.vertexShader
            .replace('#include <begin_vertex>', 'mat3 mmR; vec3 transformed = mmBend(position, mmR);');
    };
    depth.customProgramCacheKey = () => 'mm-bend-depth';
    const mesh = new THREE.Mesh(geo, material);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // vertex shader moves geometry outside its bounds
    return { mesh, uniforms, len };
}

const _qY = new THREE.Quaternion();
const _qZ = new THREE.Quaternion();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

/** CPU mirror of mmBend at the limb tip (t = 1): places `target` at the tip, aligned to the tangent. */
export function attachToTip(limb, target, along) {
    const u = limb.uniforms;
    const len = limb.len, curl = u.uCurl.value, dir = u.uDir.value;
    const t = along == null ? 1 : along;
    const phi = curl * t;
    let cx, cy;
    if (Math.abs(curl) < 1e-3) { cx = 0; cy = len * t; } else { const r = len / curl; cx = r * (1 - Math.cos(phi)); cy = r * Math.sin(phi); }
    const wave = u.uWaveAmp.value * Math.sin(u.uWaveFreq.value * t * 6.2831 - u.uTime.value + u.uPhase.value) * t;
    const cd = Math.cos(dir), sd = Math.sin(dir);
    target.position.set(cd * cx + sd * wave, cy, -sd * cx + cd * wave);
    _qY.setFromAxisAngle(_Y, dir);
    _qZ.setFromAxisAngle(_Z, -phi);
    target.quaternion.copy(_qY).multiply(_qZ);
}

/** Recursively dispose geometries / materials / textures under an object. */
export function disposeTree(root) {
    root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        mats.forEach((m) => m.dispose());
        if (obj.customDepthMaterial) obj.customDepthMaterial.dispose();
    });
}
