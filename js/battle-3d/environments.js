/**
 * MathMon 3D battle environments — one per boss monster:
 *   volcano  (Pyrovex)   crater, flowing lava, ash clouds, embers, glowing cracks, heat haze
 *   ocean    (Kraken)    storm sea with Gerstner waves + foam, rain, lightning, wrecked ship
 *   peak     (Typhoeus)  summit above a sea of clouds, sunset god rays, tornadoes, debris
 *   ruins    (Seismodon) collapsed city in a canyon, dust, rubble, cracked ground
 *
 * Everything is procedural (geometry, PBR texture sets, shaders). Each builder
 * returns an env object the stage drives:
 *   { group, sky, sunDir, groundY(pos), water, addPlatform(pos), update(dt, t),
 *     flash(intensity), look: { exposure, fog, grade, godRays, bloom, haze } }
 */
import * as THREE from 'three';
import { fbm, valueNoise, rand, clamp, smoothstep, surfaceTextures, repeatSet, GLSL_NOISE } from './core.js';

export const ARENA = {
    player: new THREE.Vector3(-6.5, 0, 3.5),
    enemy: new THREE.Vector3(6.5, 0, -7),
    center: new THREE.Vector3(0, 0, -1.75)
};

// ---- Sky dome (gradient + sun + animated fbm clouds + lightning flash) ------------
function createSky(opts) {
    const uniforms = {
        uTop: { value: new THREE.Color(opts.top) }, uHorizon: { value: new THREE.Color(opts.horizon) }, uBottom: { value: new THREE.Color(opts.bottom) },
        uSunDir: { value: opts.sunDir.clone() }, uSunColor: { value: new THREE.Color(opts.sunColor) }, uSunSize: { value: opts.sunSize || 900 },
        uCloudLit: { value: new THREE.Color(opts.cloudLit) }, uCloudDark: { value: new THREE.Color(opts.cloudDark) },
        uCloudCover: { value: opts.cloudCover }, uCloudScale: { value: opts.cloudScale || 1 }, uCloudSpeed: { value: opts.cloudSpeed || 0.02 },
        uTime: { value: 0 }, uFlash: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({
        uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
        fragmentShader: GLSL_NOISE + `
            uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uCloudLit, uCloudDark;
            uniform float uSunSize, uCloudCover, uCloudScale, uCloudSpeed, uTime, uFlash;
            varying vec3 vDir;
            void main(){
                vec3 d = normalize(vDir);
                float h = d.y;
                vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
                float sd = max(dot(d, normalize(uSunDir)), 0.0);
                col += uSunColor * (pow(sd, uSunSize) * 14.0 + pow(sd, 18.0) * 0.45 + pow(sd, 4.0) * 0.12);
                if (h > -0.05) {
                    vec2 uv = d.xz / (h + 0.22) * 0.6 * uCloudScale + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.4);
                    float n = mmFbm(vec3(uv, uTime * 0.015));
                    float c = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, n);
                    float lit = clamp(0.35 + (n - 0.5) * 1.6 + pow(sd, 6.0) * 0.8, 0.0, 1.2);
                    vec3 cloud = mix(uCloudDark, uCloudLit, lit) + uSunColor * pow(sd, 8.0) * 0.6 * c;
                    col = mix(col, cloud, c * smoothstep(-0.05, 0.12, h) * 0.95);
                }
                col += uFlash * vec3(0.75, 0.85, 1.0);
                gl_FragColor = vec4(col, 1.0);
            }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat);
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    sky.userData.uniforms = uniforms;
    return sky;
}

// ---- Ambient particles (embers, ash, dust, snow-spray) — animated in the shader ---
function ambientParticles(count, opts) {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const uniforms = {
        uTime: { value: 0 }, uBox: { value: opts.box }, uCenter: { value: opts.center }, uVel: { value: opts.vel },
        uWobble: { value: opts.wobble || 0 }, uSize: { value: opts.size }, uScale: { value: 400 }, uColor: { value: new THREE.Color(opts.color) },
        uColor2: { value: new THREE.Color(opts.color2 || opts.color) }, uOpacity: { value: opts.opacity || 1 }, uMap: { value: opts.map }
    };
    const mat = new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: `attribute vec4 aSeed; uniform float uTime, uWobble, uSize, uScale; uniform vec3 uBox, uCenter, uVel;
            varying float vA; varying float vMix;
            void main(){
                vec3 p = aSeed.xyz * uBox + uVel * uTime * (0.6 + aSeed.w * 0.8);
                p = mod(p, uBox) - uBox * 0.5 + uCenter;
                p.x += sin(uTime * 1.3 + aSeed.w * 30.0) * uWobble;
                p.z += cos(uTime * 1.1 + aSeed.w * 20.0) * uWobble;
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = uSize * (0.4 + aSeed.w) * uScale / max(0.5, -mv.z);
                float edge = fract((p.y - uCenter.y) / uBox.y + 0.5);
                vA = smoothstep(0.0, 0.1, edge) * smoothstep(1.0, 0.85, edge) * (0.6 + 0.4 * sin(uTime * 6.0 + aSeed.w * 50.0));
                vMix = aSeed.w;
            }`,
        fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor, uColor2; uniform float uOpacity; varying float vA; varying float vMix;
            void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(mix(uColor, uColor2, vMix), a); }`
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    pts.userData.uniforms = uniforms;
    return pts;
}

function softSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

// ---- Terrain helper ---------------------------------------------------------------
function terrain(size, segments, heightFn, material, colorFn) {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = colorFn ? new Float32Array(pos.count * 3) : null;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, heightFn(x, z));
    }
    geo.computeVertexNormals();
    if (colorFn) {
        const nrm = geo.attributes.normal;
        const c = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), c);
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
}

/** 0 inside the battle arena, rising to 1 outside — keeps the fighting floor flat. */
function arenaMask(x, z, inner, outer) {
    const d = Math.hypot(x - ARENA.center.x, (z - ARENA.center.z) * 0.8);
    return smoothstep(inner || 13, outer || 24, d);
}

function lumpyRock(radius, detail, amount, seed) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i);
        const n = fbm(v.x * 0.6 + seed, v.z * 0.6 + v.y * 0.3, 64, 3, seed);
        v.multiplyScalar(1 + (n - 0.5) * amount);
        pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
}

function scatterInstances(geo, material, count, placeFn) {
    const inst = new THREE.InstancedMesh(geo, material, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
        placeFn(i, p, e, s);
        q.setFromEuler(e);
        m.compose(p, q, s);
        inst.setMatrixAt(i, m);
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    return inst;
}

function addSunLight(group, stage, sunDir, color, intensity) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.copy(ARENA.center).addScaledVector(sunDir, 70);
    light.target.position.copy(ARENA.center);
    const shadowSize = stage.quality.shadows;
    if (shadowSize) {
        light.castShadow = true;
        light.shadow.mapSize.set(shadowSize, shadowSize);
        const c = light.shadow.camera;
        c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 5; c.far = 160;
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.05;
    }
    group.add(light, light.target);
    return light;
}

function baseEnv(stage, cfg) {
    const group = new THREE.Group();
    const sunDir = cfg.sunDir.clone().normalize();
    const sky = createSky({ ...cfg.sky, sunDir });
    group.add(sky);
    const hemi = new THREE.HemisphereLight(cfg.hemi[0], cfg.hemi[1], cfg.hemi[2]);
    group.add(hemi);
    const sun = addSunLight(group, stage, sunDir, cfg.sunLight[0], cfg.sunLight[1]);
    const env = {
        key: cfg.key, group, sky, sunDir, sun, hemi, water: false, flashLevel: 0, platforms: [], updaters: [],
        look: cfg.look,
        groundY: () => 0,
        addPlatform: () => 0,
        flash(intensity) { env.flashLevel = Math.max(env.flashLevel, intensity); },
        update(dt, t) {
            sky.userData.uniforms.uTime.value = t;
            env.flashLevel = Math.max(0, env.flashLevel - dt * 3);
            sky.userData.uniforms.uFlash.value = env.flashLevel * 1.4;
            sun.intensity = cfg.sunLight[1] * (1 + env.flashLevel * 2.5);
            env.updaters.forEach((fn) => fn(dt, t));
        }
    };
    return env;
}

function ambient(env, stage, count, opts) {
    const pts = ambientParticles(Math.max(20, Math.round(count * stage.particleScale)), { ...opts, map: softSprite() });
    env.group.add(pts);
    env.updaters.push((dt, t) => {
        pts.userData.uniforms.uTime.value = t;
        pts.userData.uniforms.uScale.value = stage.pointScale();
    });
    return pts;
}

// ============================================================================
// VOLCANO
// ============================================================================
function lavaRiverDistance(x, z) {
    // river curving behind the arena from left to right
    const cz = -24 + Math.sin(x * 0.045) * 6;
    return Math.abs(z - cz);
}

function buildVolcano(stage) {
    const env = baseEnv(stage, {
        key: 'volcano',
        sunDir: new THREE.Vector3(0.35, 0.22, -1),
        sky: { top: '#140605', horizon: '#8a3214', bottom: '#1c0905', sunColor: '#ff6a2a', sunSize: 260,
            cloudLit: '#6a3a2a', cloudDark: '#1d1210', cloudCover: 0.78, cloudScale: 1.3, cloudSpeed: 0.025 },
        hemi: ['#ff9966', '#2a0d05', 0.55],
        sunLight: ['#ffb27a', 2.4],
        look: { exposure: 1.0, fog: ['#3d1a10', 0.0085], bloom: { strength: 0.9, radius: 0.55, threshold: 0.78 },
            godRays: { strength: 0.35, color: '#ff8a4a' }, haze: 0.0035,
            grade: { lift: [0.03, 0.0, -0.01], gamma: [1.0, 0.98, 0.95], gain: [1.08, 0.98, 0.9], saturation: 1.08, contrast: 1.1, vignette: 0.45 } }
    });
    const seg = stage.quality.tier === 'high' ? 220 : stage.quality.tier === 'medium' ? 150 : 96;

    const height = (x, z) => {
        const r = Math.hypot(x, z + 10);
        let h = (fbm(x * 0.035 + 50, z * 0.035 + 50, 256, 5, 3) - 0.5) * 7 * arenaMask(x, z);
        h += smoothstep(60, 105, r) * 32 + (fbm(x * 0.08, z * 0.08, 256, 3, 8) - 0.5) * 6 * smoothstep(50, 90, r);
        const river = lavaRiverDistance(x, z);
        h -= 2.2 * (1 - smoothstep(3.5, 8, river)) * smoothstep(-90, -60, x) * (1 - smoothstep(60, 90, x));
        return h;
    };
    env.groundY = (p) => height(p.x, p.z);

    const tex = repeatSet(surfaceTextures('volcano-ground', { pattern: 'basalt', color: '#3d332e', dark: '#110c0a', light: '#6d5d52', glow: '#ff5a14',
        seed: 3, size: 256, period: 8, crackWidth: 0.07, crackDepth: 0.45, normalStrength: 7, roughness: 0.9 }), 28);
    const groundMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap,
        emissive: '#ffffff', emissiveIntensity: 1, roughness: 1 });
    const pulse = { value: 1 };
    groundMat.onBeforeCompile = (shader) => {
        shader.uniforms.uPulse = pulse;
        shader.vertexShader = 'attribute float aHeat; varying float vHeat;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;');
        shader.fragmentShader = 'uniform float uPulse; varying float vHeat;\n' + shader.fragmentShader.replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= (0.25 + vHeat * 3.5) * uPulse;\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * vHeat * vHeat * 0.9;');
    };
    const ground = terrain(300, seg, height, groundMat);
    const heat = new Float32Array(ground.geometry.attributes.position.count);
    const gp = ground.geometry.attributes.position;
    for (let i = 0; i < heat.length; i++) heat[i] = 1 - smoothstep(3, 14, lavaRiverDistance(gp.getX(i), gp.getZ(i)));
    ground.geometry.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1));
    env.group.add(ground);

    // Flowing lava river + pool
    const lavaUniforms = { uTime: { value: 0 } };
    const lavaMat = new THREE.ShaderMaterial({
        uniforms: lavaUniforms,
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: GLSL_NOISE + `uniform float uTime; varying vec2 vUv; varying vec3 vW;
            void main(){
                vec3 p = vec3(vW.x * 0.18 - uTime * 0.35, vW.z * 0.25, uTime * 0.05);
                float warp = mmFbm(p * 0.7);
                float n = mmFbm(p + vec3(warp * 2.0, warp, 0.0));
                float crust = smoothstep(0.45, 0.7, n);
                vec3 hot = mix(vec3(4.0, 1.4, 0.25), vec3(6.0, 3.2, 0.9), smoothstep(0.2, 0.0, n));
                vec3 col = mix(hot, vec3(0.08, 0.03, 0.02), crust);
                float edge = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
                gl_FragColor = vec4(mix(vec3(0.05,0.02,0.01), col, edge), 1.0);
            }`
    });
    const riverGeo = new THREE.PlaneGeometry(190, 9, 190, 4);
    riverGeo.rotateX(-Math.PI / 2);
    const rp = riverGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
        const x = rp.getX(i), z = rp.getZ(i);
        rp.setXYZ(i, x, -1.35, -24 + Math.sin(x * 0.045) * 6 + z);
    }
    env.group.add(new THREE.Mesh(riverGeo, lavaMat));

    // Background volcano with a glowing crater + smoke plume
    const coneTex = repeatSet(surfaceTextures('volcano-ground', {}), 6);
    const coneGeo = lumpyRock(1, 4, 0.25, 7);
    const cp = coneGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
        const y = cp.getY(i);
        const taper = y > 0 ? 1 - y * 0.72 : 1;          // pinch the top into a volcanic cone
        cp.setXYZ(i, cp.getX(i) * taper, y, cp.getZ(i) * taper);
    }
    coneGeo.computeVertexNormals();
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ map: coneTex.map, normalMap: coneTex.normalMap, roughness: 0.95 }));
    cone.scale.set(70, 55, 70);
    cone.position.set(35, -18, -190);
    env.group.add(cone);
    const crater = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.6, 0.4) }));
    crater.scale.y = 0.25;
    crater.position.set(35, 35, -190);
    env.group.add(crater);
    ambient(env, stage, 500, { box: new THREE.Vector3(30, 120, 30), center: new THREE.Vector3(35, 95, -190), vel: new THREE.Vector3(1.5, 6, 0),
        wobble: 6, size: 18, color: '#2a1d18', color2: '#463028', opacity: 0.55 });

    // Basalt boulders
    const rockMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 0.95, color: '#9a8a80' });
    env.group.add(scatterInstances(lumpyRock(1, 1, 0.5, 2), rockMat, Math.round(140 * stage.particleScale) + 30, (i, p, e, s) => {
        let x, z;
        do { x = rand(-110, 110); z = rand(-120, 50); } while (arenaMask(x, z, 15, 16) < 1 || lavaRiverDistance(x, z) < 6);
        p.set(x, height(x, z) - 0.3, z);
        e.set(rand(0, 6), rand(0, 6), rand(0, 6));
        s.setScalar(rand(0.6, 2.8)).multiply(new THREE.Vector3(1, rand(0.5, 1), 1));
    }));

    // Embers rising and ash falling
    ambient(env, stage, 900, { box: new THREE.Vector3(120, 40, 120), center: new THREE.Vector3(0, 18, -20), vel: new THREE.Vector3(0.6, 3.2, 0),
        wobble: 1.6, size: 0.35, color: '#ffb347', color2: '#ff4a12', additive: true });
    ambient(env, stage, 700, { box: new THREE.Vector3(120, 40, 120), center: new THREE.Vector3(0, 18, -20), vel: new THREE.Vector3(1.2, -1.4, 0),
        wobble: 2, size: 0.4, color: '#8d8580', color2: '#4e4844', opacity: 0.6 });

    // Lava point lights (fixed count; flicker)
    const lavaLights = [-30, 0, 30].map((x) => {
        const l = new THREE.PointLight('#ff6a1a', 900, 70, 2);
        l.position.set(x, 3, -24 + Math.sin(x * 0.045) * 6);
        env.group.add(l);
        return l;
    });
    env.updaters.push((dt, t) => {
        lavaUniforms.uTime.value = t;
        pulse.value = 0.8 + Math.sin(t * 1.3) * 0.2;
        lavaLights.forEach((l, i) => { l.intensity = 900 * (0.85 + Math.sin(t * 7 + i * 3) * 0.08 + Math.sin(t * 13 + i) * 0.07); });
    });
    return env;
}

// ============================================================================
// OCEAN
// ============================================================================
const WAVES = [
    { dir: [1, 0.3], len: 34, amp: 0.95, q: 0.5 },
    { dir: [-0.6, 1], len: 19, amp: 0.55, q: 0.5 },
    { dir: [0.3, -1], len: 11, amp: 0.28, q: 0.45 },
    { dir: [1, 1], len: 6.5, amp: 0.14, q: 0.4 }
].map((w) => {
    const d = new THREE.Vector2(...w.dir).normalize();
    const k = (2 * Math.PI) / w.len;
    return { d, k, a: w.amp, q: w.q, w: Math.sqrt(9.8 * k) };
});

function waveHeight(x, z, t) {
    let y = 0;
    for (const w of WAVES) y += w.a * Math.sin(w.k * (w.d.x * x + w.d.y * z) - w.w * t);
    return y;
}

function buildOcean(stage) {
    const env = baseEnv(stage, {
        key: 'ocean',
        sunDir: new THREE.Vector3(-0.45, 0.16, -1),
        sky: { top: '#070d16', horizon: '#3a4858', bottom: '#08121b', sunColor: '#7d8ea2', sunSize: 120,
            cloudLit: '#56667a', cloudDark: '#141b24', cloudCover: 0.86, cloudScale: 1.1, cloudSpeed: 0.05 },
        hemi: ['#9db3cc', '#0a1622', 0.9],
        sunLight: ['#c4d4e6', 1.8],
        look: { exposure: 1.05, fog: ['#1e2b38', 0.0085], bloom: { strength: 0.6, radius: 0.5, threshold: 0.85 },
            godRays: { strength: 0.12, color: '#a9c4e0' }, haze: 0,
            grade: { lift: [-0.01, 0.01, 0.03], gamma: [1.02, 1.0, 0.98], gain: [0.92, 1.0, 1.08], saturation: 0.85, contrast: 1.12, vignette: 0.55 } }
    });
    env.water = true;
    env.waterLevel = 0;
    const seg = stage.quality.tier === 'high' ? 200 : stage.quality.tier === 'medium' ? 140 : 90;

    const waterUniforms = { uTime: { value: 0 } };
    const waterMat = new THREE.MeshPhysicalMaterial({ color: '#0a2c45', roughness: 0.07, metalness: 0, envMapIntensity: 1.25, clearcoat: 0.3, clearcoatRoughness: 0.1 });
    const waveGlsl = WAVES.map((w, i) => `mmWave(p, vec2(${w.d.x.toFixed(4)}, ${w.d.y.toFixed(4)}), ${w.k.toFixed(4)}, ${w.a.toFixed(3)}, ${w.q.toFixed(3)}, ${w.w.toFixed(4)}, off, dx, dz);`).join('\n');
    waterMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = waterUniforms.uTime;
        shader.vertexShader = `uniform float uTime; varying float vFoam; varying vec3 vWPos;
            void mmWave(vec3 p, vec2 d, float k, float a, float q, float w, inout vec3 off, inout vec3 dx, inout vec3 dz) {
                float f = k * dot(d, p.xz) - w * uTime;
                float c = cos(f), s = sin(f);
                off += vec3(q * a * d.x * c, a * s, q * a * d.y * c);
                dx += vec3(-q * d.x * d.x * k * a * s, d.x * k * a * c, -q * d.x * d.y * k * a * s);
                dz += vec3(-q * d.x * d.y * k * a * s, d.y * k * a * c, -q * d.y * d.y * k * a * s);
            }\n` + shader.vertexShader
            .replace('#include <beginnormal_vertex>', `vec3 p = position; vec3 off = vec3(0.0); vec3 dx = vec3(1.0, 0.0, 0.0); vec3 dz = vec3(0.0, 0.0, 1.0);
                ${waveGlsl}
                vec3 objectNormal = normalize(cross(dz, dx));
                vFoam = smoothstep(0.7, 1.7, off.y) ;`)
            .replace('#include <begin_vertex>', 'vec3 transformed = p + off; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = 'varying float vFoam; varying vec3 vWPos;\n' + GLSL_NOISE + shader.fragmentShader
            .replace('#include <color_fragment>', `#include <color_fragment>
                float foamN = mmFbm(vec3(vWPos.xz * 0.35, 0.0));
                float foam = clamp(vFoam * smoothstep(0.35, 0.75, foamN) * 1.6, 0.0, 1.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.88, 0.92), foam);`)
            .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, foam);');
    };
    const waterGeo = new THREE.PlaneGeometry(420, 420, seg, seg);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.receiveShadow = true;
    water.frustumCulled = false;
    env.group.add(water);

    env.groundY = (p) => {
        for (const pl of env.platforms) if (Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r) return pl.top;
        return 0;
    };

    // Wet rock islets for monsters that cannot swim
    const islandTex = repeatSet(surfaceTextures('sea-rock', { pattern: 'rock', color: '#3a4046', dark: '#121518', light: '#6a737a', seed: 12, size: 256, roughness: 0.35 }), 3);
    const islandMat = new THREE.MeshStandardMaterial({ map: islandTex.map, normalMap: islandTex.normalMap, roughness: 0.4, metalness: 0.05 });
    env.addPlatform = (pos) => {
        const rock = new THREE.Mesh(lumpyRock(5, 3, 0.35, pos.x), islandMat);
        rock.scale.set(1.15, 0.42, 1.15);
        const top = 0.9;
        rock.position.set(pos.x, top - 5 * 0.42 + 0.2, pos.z);
        rock.castShadow = rock.receiveShadow = true;
        env.group.add(rock);
        env.platforms.push({ x: pos.x, z: pos.z, r: 5.2, top });
        return top;
    };
    // distant sea stacks
    for (let i = 0; i < 6; i++) {
        const stack = new THREE.Mesh(lumpyRock(1, 2, 0.5, i * 3), islandMat);
        const a = rand(-2.6, -0.5);
        stack.position.set(Math.cos(a) * rand(70, 150), -2, Math.sin(a) * rand(70, 150));
        stack.scale.set(rand(5, 10), rand(10, 26), rand(5, 10));
        env.group.add(stack);
    }

    // Wrecked ship (procedural, half sunk, bobbing)
    const ship = new THREE.Group();
    const woodTex = repeatSet(surfaceTextures('ship-wood', { pattern: 'wood', color: '#5a3b22', dark: '#1f130a', light: '#8a6440', seed: 6, size: 256, roughness: 0.8 }), 2, 4);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex.map, normalMap: woodTex.normalMap, roughnessMap: woodTex.roughnessMap, roughness: 1 });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), wood);
    hull.scale.set(3.2, 3, 11);
    ship.add(hull);
    ship.add(new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.3, 20), wood));
    [-1, 1].forEach((s) => ship.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 18), wood).translateX(3 * s).translateY(0.6)));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 16, 10), wood);
    mast.position.set(0, 8, 2);
    mast.rotation.z = 0.25;
    ship.add(mast);
    const brokenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 6, 10), wood);
    brokenMast.position.set(0.5, 3, -5);
    ship.add(brokenMast);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 8), wood);
    yard.rotation.z = Math.PI / 2 - 0.3;
    yard.position.set(0.8, 12, 2);
    ship.add(yard);
    const sailTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const ctx = c.getContext('2d'); const img = ctx.createImageData(128, 128);
        for (let i = 0; i < 128 * 128; i++) {
            const x = i % 128, y = Math.floor(i / 128);
            const n = fbm(x / 128 * 6, y / 128 * 6, 6, 4, 9);
            img.data[i * 4] = 70; img.data[i * 4 + 1] = 64; img.data[i * 4 + 2] = 56; img.data[i * 4 + 3] = n > 0.38 + (y / 128) * 0.25 ? 255 : 0;
        }
        ctx.putImageData(img, 0, 0);
        return new THREE.CanvasTexture(c);
    })();
    const sailGeo = new THREE.PlaneGeometry(8, 7, 12, 12);
    const sp = sailGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 0.4) * 0.8 + Math.sin(sp.getY(i) * 0.7) * 0.4);
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ map: sailTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }));
    sail.position.set(0.6, 8.5, 2.3);
    sail.rotation.z = 0.25;
    ship.add(sail);
    ship.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    ship.position.set(-34, -1.2, -48);
    ship.rotation.set(0.12, 0.7, 0.38);
    env.group.add(ship);

    // Rain (shader-animated line streaks around the arena)
    const rainCount = Math.round(4000 * stage.particleScale);
    const rainGeo = new THREE.BufferGeometry();
    const rainSeed = new Float32Array(rainCount * 2 * 4);
    const rainPos = new Float32Array(rainCount * 2 * 3);
    for (let i = 0; i < rainCount; i++) {
        const s = [Math.random(), Math.random(), Math.random(), Math.random()];
        for (let v = 0; v < 2; v++) {
            rainSeed.set([s[0], s[1], s[2], v], (i * 2 + v) * 4);
        }
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(rainSeed, 4));
    const rainUniforms = { uTime: { value: 0 } };
    const rain = new THREE.LineSegments(rainGeo, new THREE.ShaderMaterial({
        uniforms: rainUniforms, transparent: true, depthWrite: false,
        vertexShader: `attribute vec4 aSeed; uniform float uTime; varying float vA;
            void main(){ vec3 box = vec3(90.0, 45.0, 80.0);
                vec3 p = aSeed.xyz * box - vec3(5.0, 34.0, 0.0) * uTime;
                p = mod(p, box) - box * 0.5 + vec3(0.0, 18.0, -8.0);
                p += vec3(0.25, 1.4, 0.0) * aSeed.w;
                vA = 0.35 * (1.0 - aSeed.w * 0.6);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.75, 0.82, 0.9, vA); }'
    }));
    rain.frustumCulled = false;
    env.group.add(rain);

    let nextBolt = 3;
    env.updaters.push((dt, t) => {
        waterUniforms.uTime.value = t;
        rainUniforms.uTime.value = t;
        ship.position.y = -1.2 + waveHeight(ship.position.x, ship.position.z, t) * 0.6;
        ship.rotation.z = 0.38 + Math.sin(t * 0.6) * 0.05;
        nextBolt -= dt;
        if (nextBolt <= 0) {
            nextBolt = rand(4, 9);
            const a = rand(-2.8, -0.4);
            if (stage.vfx) stage.vfx.lightning(new THREE.Vector3(Math.cos(a) * rand(60, 110), 0, Math.sin(a) * rand(60, 110)), 2.5, '#cfe6ff');
            if (stage.sound && stage.sound.thunder) setTimeout(() => stage.sound.thunder(), 350);
        }
    });
    env.waveHeight = waveHeight;
    return env;
}

// ============================================================================
// MOUNTAIN PEAK
// ============================================================================
function buildPeak(stage) {
    const env = baseEnv(stage, {
        key: 'peak',
        sunDir: new THREE.Vector3(-0.42, 0.13, -1),
        sky: { top: '#1f3f7a', horizon: '#ffb26b', bottom: '#f0d8c2', sunColor: '#fff0c8', sunSize: 700,
            cloudLit: '#fff3e2', cloudDark: '#9a8aa0', cloudCover: 0.42, cloudScale: 0.9, cloudSpeed: 0.03 },
        hemi: ['#a9c3ee', '#6b5a50', 0.9],
        sunLight: ['#ffd9a8', 3.2],
        look: { exposure: 1.0, fog: ['#d8bfa8', 0.0042], bloom: { strength: 0.7, radius: 0.6, threshold: 0.85 },
            godRays: { strength: 0.85, color: '#ffd7a0' }, haze: 0,
            grade: { lift: [0.02, 0.01, 0.0], gamma: [1.0, 1.0, 1.02], gain: [1.06, 1.0, 0.94], saturation: 1.1, contrast: 1.08, vignette: 0.4 } }
    });
    const seg = stage.quality.tier === 'high' ? 160 : stage.quality.tier === 'medium' ? 110 : 72;
    const height = (x, z) => {
        const r = Math.hypot(x - ARENA.center.x, (z - ARENA.center.z) * 0.85);
        const rough = (fbm(x * 0.09 + 9, z * 0.09 + 9, 256, 5, 5) - 0.5);
        return rough * 2.4 * smoothstep(9, 18, r) + rough * 0.4 - smoothstep(15, 34, r) * 40;
    };
    env.groundY = (p) => height(p.x, p.z);
    const rockTex = repeatSet(surfaceTextures('peak-rock', { pattern: 'rock', color: '#6d6660', dark: '#2a2622', light: '#a39a90', seed: 22, size: 256, roughness: 0.9 }), 10);
    const summitMat = new THREE.MeshStandardMaterial({ map: rockTex.map, normalMap: rockTex.normalMap, vertexColors: true, roughness: 0.95 });
    const snow = new THREE.Color('#f4f8ff'), rock = new THREE.Color('#ffffff');
    env.group.add(terrain(110, seg, height, summitMat, (x, y, z, ny, out) => {
        const s = smoothstep(0.72, 0.9, ny) * smoothstep(0.3, 0.6, fbm(x * 0.15, z * 0.15, 256, 3, 4)) * smoothstep(-25, -2, y);
        out.copy(rock).lerp(snow, s);
    }));

    // Distant peaks
    const peakMat = new THREE.MeshStandardMaterial({ map: rockTex.map, normalMap: rockTex.normalMap, vertexColors: true, roughness: 0.95, flatShading: false });
    [[-120, -210, 95], [90, -260, 130], [210, -160, 80], [-230, -120, 70], [20, -340, 150], [-60, -150, 60]].forEach(([x, z, h], i) => {
        const geo = new THREE.ConeGeometry(h * 0.62, h, 48, 24);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const rockTint = new THREE.Color('#7d736b');
        for (let v = 0; v < pos.count; v++) {
            const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
            const a = Math.atan2(pz, px);
            // ridged noise around the cone → sharp spurs and gullies
            const ridge = 1 - Math.abs(fbm(Math.cos(a) * 3 + i * 7, Math.sin(a) * 3 + py * 0.03, 256, 5, i + 3) - 0.5) * 2;
            const k = 1 + (ridge - 0.5) * 0.9;
            pos.setXYZ(v, px * k, py + (ridge - 0.5) * h * 0.08, pz * k);
            const snowy = smoothstep(-0.1, 0.15, py / h + (ridge - 0.5) * 0.35);
            const c = rockTint.clone().lerp(snow, snowy);
            colors.set([c.r, c.g, c.b], v * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, peakMat);
        m.position.set(x, h / 2 - 70, z);
        env.group.add(m);
    });

    // Sea of clouds
    const cloudUniforms = { uTime: { value: 0 }, uSunDir: { value: env.sunDir } };
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), new THREE.ShaderMaterial({
        uniforms: cloudUniforms,
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: GLSL_NOISE + `uniform float uTime; uniform vec3 uSunDir; varying vec3 vW;
            void main(){
                vec3 p = vec3(vW.xz * 0.012 + vec2(uTime * 0.01, uTime * 0.004), uTime * 0.01);
                float n = mmFbm(p) * 0.65 + mmFbm(p * 3.1) * 0.35;
                float lit = smoothstep(0.3, 0.75, n);
                vec3 col = mix(vec3(0.62, 0.55, 0.62), vec3(1.25, 1.1, 0.95), lit);
                float dist = length(vW.xz) / 700.0;
                col = mix(col, vec3(1.0, 0.82, 0.62), smoothstep(0.2, 1.0, dist));
                gl_FragColor = vec4(col, 1.0);
            }`
    }));
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = -26;
    env.group.add(clouds);

    // Distant tornadoes (persistent shader funnels)
    const tornadoUniforms = { uTime: { value: 0 } };
    const funnelMat = new THREE.ShaderMaterial({
        uniforms: tornadoUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: GLSL_NOISE + `uniform float uTime; varying vec2 vUv;
            void main(){ float n = mmFbm(vec3(vUv.x * 10.0 + uTime * 1.5 + vUv.y * 6.0, vUv.y * 6.0 - uTime * 0.6, 0.0));
                float a = smoothstep(0.35, 0.8, n) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
                gl_FragColor = vec4(vec3(0.62, 0.6, 0.62) + n * 0.25, a * 0.85); }`
    });
    const funnels = [[-95, -150, 120], [130, -190, 140]].map(([x, z, h]) => {
        const geo = new THREE.CylinderGeometry(22, 2.5, h, 40, 12, true);
        geo.translate(0, h / 2, 0);
        const f = new THREE.Mesh(geo, funnelMat);
        f.position.set(x, -40, z);
        env.group.add(f);
        return f;
    });

    // Flying debris orbiting the summit + wind streaks
    const debrisTex = repeatSet(surfaceTextures('peak-rock', {}), 1);
    const debris = scatterInstances(lumpyRock(1, 1, 0.4, 5), new THREE.MeshStandardMaterial({ map: debrisTex.map, normalMap: debrisTex.normalMap, roughness: 0.9 }),
        40, (i, p, e, s) => { p.set(0, -999, 0); e.set(0, 0, 0); s.setScalar(rand(0.2, 0.8)); });
    const orbit = Array.from({ length: 40 }, () => ({ r: rand(26, 50), a: rand(0, 6.28), y: rand(-4, 16), sp: rand(0.15, 0.4), s: rand(0.2, 0.9), rot: rand(0, 6) }));
    env.group.add(debris);
    ambient(env, stage, 600, { box: new THREE.Vector3(140, 30, 100), center: new THREE.Vector3(0, 8, -15), vel: new THREE.Vector3(-22, 0.5, 4),
        wobble: 0.5, size: 0.25, color: '#ffffff', color2: '#d8eef5', additive: true, opacity: 0.6 });

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let nextBolt = 5;
    env.updaters.push((dt, t) => {
        cloudUniforms.uTime.value = t;
        tornadoUniforms.uTime.value = t;
        funnels.forEach((f, i) => { f.rotation.y = t * (1.2 + i * 0.3); });
        orbit.forEach((o, i) => {
            o.a += o.sp * dt;
            p.set(ARENA.center.x + Math.cos(o.a) * o.r, o.y + Math.sin(t + i) * 1.5, ARENA.center.z + Math.sin(o.a) * o.r);
            e.set(t * o.sp * 4 + o.rot, t * 0.7 + o.rot, 0);
            q.setFromEuler(e);
            sc.setScalar(o.s);
            m.compose(p, q, sc);
            debris.setMatrixAt(i, m);
        });
        debris.instanceMatrix.needsUpdate = true;
        nextBolt -= dt;
        if (nextBolt <= 0) {
            nextBolt = rand(6, 12);
            if (stage.vfx) stage.vfx.lightning(new THREE.Vector3(rand(-160, 160), -30, rand(-260, -120)), 3, '#ffe8c8');
            if (stage.sound && stage.sound.thunder) setTimeout(() => stage.sound.thunder(), 600);
        }
    });
    return env;
}

// ============================================================================
// RUINED CITY CANYON
// ============================================================================
function buildRuins(stage) {
    const env = baseEnv(stage, {
        key: 'ruins',
        sunDir: new THREE.Vector3(0.62, 0.17, -1),
        sky: { top: '#3e3128', horizon: '#d2914e', bottom: '#3a2a20', sunColor: '#ffcf8a', sunSize: 400,
            cloudLit: '#c9986a', cloudDark: '#4a372a', cloudCover: 0.6, cloudScale: 1.2, cloudSpeed: 0.02 },
        hemi: ['#e8b27a', '#2a1f18', 0.75],
        sunLight: ['#ffcf96', 2.8],
        look: { exposure: 1.0, fog: ['#8e6c4c', 0.0125], bloom: { strength: 0.55, radius: 0.5, threshold: 0.85 },
            godRays: { strength: 0.6, color: '#ffc98a' }, haze: 0,
            grade: { lift: [0.03, 0.015, 0.0], gamma: [1.0, 1.0, 1.0], gain: [1.06, 0.98, 0.88], saturation: 0.92, contrast: 1.15, vignette: 0.5 } }
    });
    const seg = stage.quality.tier === 'high' ? 200 : stage.quality.tier === 'medium' ? 140 : 90;
    const height = (x, z) => {
        let h = (fbm(x * 0.04 + 3, z * 0.04 + 3, 256, 4, 9) - 0.5) * 2.2 * arenaMask(x, z, 14, 24);
        const wall = smoothstep(55, 85, Math.abs(x + Math.sin(z * 0.02) * 10));
        h += wall * (30 + (fbm(x * 0.05, z * 0.05, 256, 4, 2) - 0.5) * 18);
        return h;
    };
    env.groundY = (p) => height(p.x, p.z);
    const tex = repeatSet(surfaceTextures('ruins-ground', { pattern: 'rock', color: '#4d4642', dark: '#1a1817', light: '#7e746c', glow: '#ff8a2a', seed: 41,
        size: 256, period: 8, crackWidth: 0.05, crackDepth: 0.4, normalStrength: 6, roughness: 0.92 }), 26);
    const groundMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap,
        emissive: '#ffffff', emissiveIntensity: 0.35, vertexColors: true, roughness: 1 });
    const bands = ['#8a5a3c', '#a87850', '#6e4a34', '#b88c62', '#7a5038'].map((c) => new THREE.Color(c));
    const white = new THREE.Color('#ffffff');
    env.group.add(terrain(320, seg, height, groundMat, (x, y, z, ny, out) => {
        if (y < 3) { out.copy(white); return; }
        out.copy(bands[Math.floor((y + fbm(x * 0.05, z * 0.05, 256, 2, 1) * 4) / 3.2) % bands.length]).lerp(white, 0.15);
    }));

    // Collapsed buildings (instanced) with window textures
    const winTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(256, 256);
        const lit = document.createElement('canvas'); lit.width = lit.height = 256;
        const lctx = lit.getContext('2d'); const limg = lctx.createImageData(256, 256);
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
            const i = (y * 256 + x) * 4;
            const n = fbm(x / 32, y / 32, 8, 4, 5);
            const wx = x % 32, wy = y % 32;
            const isWin = wx > 6 && wx < 26 && wy > 8 && wy < 24;
            const cellLit = valueNoise(Math.floor(x / 32) + 0.5, Math.floor(y / 32) + 0.5, 8, 77) > 0.86;
            const v = isWin ? 25 : 110 + n * 70;
            img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.92; img.data[i + 3] = 255;
            const L = isWin && cellLit ? 255 : 0;
            limg.data[i] = L; limg.data[i + 1] = L * 0.7; limg.data[i + 2] = L * 0.35; limg.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0); lctx.putImageData(limg, 0, 0);
        const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(2, 4);
        const em = new THREE.CanvasTexture(lit); em.colorSpace = THREE.SRGBColorSpace; em.wrapS = em.wrapT = THREE.RepeatWrapping; em.repeat.set(2, 4);
        return { map, em };
    })();
    const concrete = repeatSet(surfaceTextures('concrete', { pattern: 'concrete', color: '#8a847c', dark: '#45413d', light: '#b3ada5', seed: 8, size: 256, roughness: 0.9 }), 3);
    const buildingMat = new THREE.MeshStandardMaterial({ map: winTex.map, normalMap: concrete.normalMap, emissiveMap: winTex.em, emissive: '#ffb066',
        emissiveIntensity: 1.6, roughness: 0.88 });
    const count = Math.round(60 * Math.max(0.6, stage.particleScale));
    env.group.add(scatterInstances(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), buildingMat, count, (i, p, e, s) => {
        let x, z;
        do { x = rand(-75, 75); z = rand(-150, 30); } while (arenaMask(x, z, 18, 19) < 1);
        const h = rand(10, 48);
        p.set(x, height(x, z) - rand(1, h * 0.3), z);
        const lean = Math.random() < 0.45 ? rand(0.12, 0.45) : rand(-0.05, 0.05);
        e.set(rand(-0.1, 0.1) + (Math.random() < 0.5 ? lean : 0), rand(0, Math.PI), Math.random() < 0.5 ? lean : 0);
        s.set(rand(6, 14), h, rand(6, 14));
    }));

    // Rubble + broken slabs
    const rubbleMat = new THREE.MeshStandardMaterial({ map: concrete.map, normalMap: concrete.normalMap, roughness: 0.95 });
    env.group.add(scatterInstances(lumpyRock(1, 1, 0.5, 3), rubbleMat, Math.round(220 * Math.max(0.5, stage.particleScale)), (i, p, e, s) => {
        let x, z;
        do { x = rand(-70, 70); z = rand(-120, 40); } while (arenaMask(x, z, 13, 14) < 1);
        p.set(x, height(x, z), z);
        e.set(rand(0, 6), rand(0, 6), rand(0, 6));
        s.setScalar(rand(0.3, 2.2)).multiply(new THREE.Vector3(1, rand(0.4, 0.9), 1));
    }));
    env.group.add(scatterInstances(new THREE.BoxGeometry(1, 1, 1), rubbleMat, 30, (i, p, e, s) => {
        let x, z;
        do { x = rand(-50, 50); z = rand(-90, 30); } while (arenaMask(x, z, 15, 16) < 1);
        p.set(x, height(x, z) + 0.5, z);
        e.set(rand(-0.6, 0.6), rand(0, 3), rand(-0.6, 0.6));
        s.set(rand(4, 9), 0.5, rand(3, 6));
    }));

    // Dust drifting
    ambient(env, stage, 900, { box: new THREE.Vector3(120, 30, 120), center: new THREE.Vector3(0, 12, -20), vel: new THREE.Vector3(2.5, 0.3, 0.8),
        wobble: 2.5, size: 1.4, color: '#b08a66', color2: '#7a5e44', opacity: 0.35 });

    // Falling rubble from the ruins
    let nextFall = 2;
    env.updaters.push((dt) => {
        nextFall -= dt;
        if (nextFall <= 0 && stage.vfx) {
            nextFall = rand(1.4, 3.2);
            const x = rand(-45, 45) || 30, z = rand(-80, -25);
            const floor = height(x, z);
            for (let i = 0; i < 5; i++) {
                stage.vfx.debris.spawn(new THREE.Vector3(x + rand(-2, 2), floor + rand(18, 30), z + rand(-2, 2)), new THREE.Vector3(rand(-1, 1), -2, rand(-1, 1)),
                    rand(0.4, 1.1), floor, 4);
            }
            setTimeout(() => stage.vfx && stage.vfx.dust(new THREE.Vector3(x, floor + 0.5, z), 1.6), 1300);
        }
    });
    return env;
}

const BUILDERS = { volcano: buildVolcano, ocean: buildOcean, peak: buildPeak, ruins: buildRuins };

export function buildEnvironment(key, stage) {
    return (BUILDERS[key] || buildVolcano)(stage);
}

// Shared with the 3D overworld (js/world-3d/).
export { clamp, createSky, ambientParticles, softSprite, lumpyRock, scatterInstances };
