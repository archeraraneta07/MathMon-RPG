/**
 * MathMon 3D battle VFX.
 *   - GPU particle pools (motion computed in the vertex shader → thousands of
 *     particles for the cost of one draw call each)
 *   - instanced physics debris (rocks)
 *   - element effects: fire, water, wind, earth, lightning, tornado, ink,
 *     tentacle wrap, ground crack, rock pillars, projectiles, breath, auras
 * A fixed set of reusable point lights avoids shader recompiles mid-battle.
 */
import * as THREE from 'three';
import { rand, pick, clamp, Ease, spriteTexture, createBendLimb, surfaceTextures, repeatSet } from './core.js';

const PARTICLE_VERT = /* glsl */`
attribute vec3 aVel; attribute vec3 aColor; attribute vec3 aColor2;
attribute float aBirth; attribute float aLife; attribute float aSize; attribute float aGrav; attribute float aDrag; attribute float aGrowth;
uniform float uTime; uniform float uScale;
varying vec3 vColor; varying float vAlpha;
void main() {
    float age = uTime - aBirth;
    float k = age / aLife;
    if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; vColor = vec3(0.0); return; }
    float travel = aDrag > 0.0 ? (1.0 - exp(-aDrag * age)) / aDrag : age;
    vec3 p = position + aVel * travel + vec3(0.0, -0.5 * aGrav * age * age, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (1.0 + aGrowth * k) * uScale / max(0.1, -mv.z);
    vAlpha = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 1.0, k));
    vColor = mix(aColor, aColor2, k);
}`;

const PARTICLE_FRAG = /* glsl */`
uniform sampler2D uMap; uniform float uOpacity;
varying vec3 vColor; varying float vAlpha;
void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
}`;

class ParticlePool {
    constructor(scene, capacity, additive, sprite) {
        this.capacity = capacity;
        this.cursor = 0;
        const g = new THREE.BufferGeometry();
        const f3 = () => new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
        const f1 = (v) => new THREE.BufferAttribute(new Float32Array(capacity).fill(v || 0), 1).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', f3());
        g.setAttribute('aVel', f3());
        g.setAttribute('aColor', f3());
        g.setAttribute('aColor2', f3());
        g.setAttribute('aBirth', f1(-999));
        g.setAttribute('aLife', f1(1));
        g.setAttribute('aSize', f1());
        g.setAttribute('aGrav', f1());
        g.setAttribute('aDrag', f1());
        g.setAttribute('aGrowth', f1());
        this.uniforms = { uTime: { value: 0 }, uScale: { value: 300 }, uMap: { value: spriteTexture(sprite) }, uOpacity: { value: 1 } };
        const mat = new THREE.ShaderMaterial({
            vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, uniforms: this.uniforms,
            transparent: true, depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        this.points = new THREE.Points(g, mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = additive ? 10 : 9;
        scene.add(this.points);
        this.dirty = false;
        this._c1 = new THREE.Color();
        this._c2 = new THREE.Color();
    }

    /**
     * opts: count, pos, spread (number|Vector3), vel (Vector3), velSpread, life [a,b], size [a,b],
     *       color, color2, gravity, drag, growth, velFn(i, out) optional custom velocity
     */
    emit(opts) {
        const g = this.points.geometry;
        const a = g.attributes;
        const n = Math.max(1, Math.round(opts.count));
        this._c1.set(opts.color || '#ffffff');
        this._c2.set(opts.color2 || opts.color || '#ffffff');
        const spread = opts.spread || 0;
        const vs = opts.velSpread || 0;
        const time = this.uniforms.uTime.value;
        const tmp = new THREE.Vector3();
        for (let k = 0; k < n; k++) {
            const i = this.cursor;
            this.cursor = (this.cursor + 1) % this.capacity;
            const sx = typeof spread === 'number' ? spread : spread.x, sy = typeof spread === 'number' ? spread : spread.y, sz = typeof spread === 'number' ? spread : spread.z;
            a.position.setXYZ(i, opts.pos.x + rand(-sx, sx), opts.pos.y + rand(-sy, sy), opts.pos.z + rand(-sz, sz));
            if (opts.velFn) {
                opts.velFn(k, tmp, a.position.getX(i), a.position.getY(i), a.position.getZ(i));
            } else {
                const v = opts.vel || tmp.set(0, 0, 0);
                tmp.set(v.x + rand(-vs, vs), v.y + rand(-vs, vs), v.z + rand(-vs, vs));
            }
            a.aVel.setXYZ(i, tmp.x, tmp.y, tmp.z);
            const jitter = opts.colorJitter || 0;
            a.aColor.setXYZ(i, this._c1.r * (1 + rand(-jitter, jitter)), this._c1.g * (1 + rand(-jitter, jitter)), this._c1.b);
            a.aColor2.setXYZ(i, this._c2.r, this._c2.g, this._c2.b);
            a.aBirth.setX(i, time + (opts.delay ? rand(0, opts.delay) : 0));
            a.aLife.setX(i, rand(opts.life[0], opts.life[1]));
            a.aSize.setX(i, rand(opts.size[0], opts.size[1]));
            a.aGrav.setX(i, opts.gravity || 0);
            a.aDrag.setX(i, opts.drag || 0);
            a.aGrowth.setX(i, opts.growth || 0);
        }
        this.dirty = true;
    }

    update(time, scale) {
        this.uniforms.uTime.value = time;
        this.uniforms.uScale.value = scale;
        if (this.dirty) {
            Object.values(this.points.geometry.attributes).forEach((attr) => { attr.needsUpdate = true; });
            this.dirty = false;
        }
    }
}

/** Instanced rock debris with simple gravity + ground bounce. */
class Debris {
    constructor(scene, capacity) {
        const tex = repeatSet(surfaceTextures('debris-rock', { pattern: 'rock', color: '#6b5a4a', dark: '#2b221b', light: '#9c8670', size: 128, seed: 4 }), 1);
        const mat = new THREE.MeshStandardMaterial({ ...tex, emissiveMap: null, color: '#ffffff', roughness: 0.9 });
        this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), mat, capacity);
        this.mesh.castShadow = true;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
        this.items = new Array(capacity).fill(null).map(() => ({ alive: false }));
        this.cursor = 0;
        this.m = new THREE.Matrix4();
        this.q = new THREE.Quaternion();
        this.e = new THREE.Euler();
        this.s = new THREE.Vector3();
        this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this.zero);
    }

    spawn(pos, vel, size, floorY, life) {
        const it = this.items[this.cursor];
        this.cursor = (this.cursor + 1) % this.items.length;
        Object.assign(it, { alive: true, p: pos.clone(), v: vel.clone(), r: new THREE.Euler(rand(0, 6), rand(0, 6), 0),
            w: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), size, floor: floorY, age: 0, life: life || 3 });
    }

    update(dt) {
        let any = false;
        this.items.forEach((it, i) => {
            if (!it.alive) return;
            any = true;
            it.age += dt;
            it.v.y -= 22 * dt;
            it.p.addScaledVector(it.v, dt);
            if (it.p.y < it.floor + it.size * 0.4) {
                it.p.y = it.floor + it.size * 0.4;
                it.v.y *= -0.3; it.v.x *= 0.6; it.v.z *= 0.6; it.w.multiplyScalar(0.6);
            }
            it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
            const shrink = clamp((it.life - it.age) / 0.6, 0, 1);
            if (it.age >= it.life) { it.alive = false; this.mesh.setMatrixAt(i, this.zero); return; }
            this.q.setFromEuler(it.r);
            this.s.setScalar(it.size * shrink);
            this.m.compose(it.p, this.q, this.s);
            this.mesh.setMatrixAt(i, this.m);
        });
        if (any) this.mesh.instanceMatrix.needsUpdate = true;
    }
}

const ELEMENT_FX = {
    fire: { core: '#ffd27a', a: '#ff9a3c', b: '#ff3d1a', light: '#ff7a2a' },
    water: { core: '#e6f6ff', a: '#7cc8ff', b: '#1e6fd9', light: '#59a8ff' },
    wind: { core: '#ffffff', a: '#c8fff1', b: '#2ec4a6', light: '#a6fff0' },
    earth: { core: '#ffe9a8', a: '#ffb347', b: '#8a5a2b', light: '#ffb347' }
};

export class VFX {
    /**
     * @param {object} stage { scene, camera, quality: { particles }, env }
     */
    constructor(stage) {
        this.stage = stage;
        this.scene = stage.scene;
        const ps = stage.particleScale || 1;
        this.ps = ps;
        this.glow = new ParticlePool(this.scene, Math.round(7000 * ps) + 500, true, 'soft');
        this.smoke = new ParticlePool(this.scene, Math.round(3000 * ps) + 300, false, 'smoke');
        this.debris = new Debris(this.scene, 160);
        this.active = [];
        this.time = 0;
        // Reusable effect lights (fixed count → no shader recompiles).
        this.lights = [0, 1, 2].map(() => {
            const l = new THREE.PointLight('#ffffff', 0, 40, 2);
            this.scene.add(l);
            return { light: l, until: 0, peak: 0, start: 0 };
        });
    }

    n(count) { return Math.max(1, Math.round(count * this.ps)); }

    update(dt) {
        this.time += dt;
        const cam = this.stage.camera;
        // world-size → pixel-size factor for gl_PointSize (sizes are diameters in world units)
        const scale = (this.stage.renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        this.glow.update(this.time, scale);
        this.smoke.update(this.time, scale);
        this.debris.update(dt);
        for (let i = this.active.length - 1; i >= 0; i--) {
            const fx = this.active[i];
            fx.age += dt;
            const k = Math.min(1, fx.age / fx.life);
            if (fx.update) fx.update(k, dt, fx.age);
            if (k >= 1) {
                if (fx.object) {
                    this.scene.remove(fx.object);
                    fx.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.userData.sharedMaterial) o.material.dispose(); });
                }
                if (fx.onEnd) fx.onEnd();
                this.active.splice(i, 1);
            }
        }
        this.lights.forEach((L) => {
            if (L.until <= this.time) { L.light.intensity = 0; return; }
            const k = (this.time - L.start) / (L.until - L.start);
            L.light.intensity = L.peak * (1 - Ease.inQuad(k));
        });
    }

    /** Track a temporary object (auto-removed + disposed after `life` seconds). */
    track(object, life, update, onEnd) {
        if (object) this.scene.add(object);
        const fx = { object, life, update, onEnd, age: 0 };
        this.active.push(fx);
        return fx;
    }

    /** Call `fn` every frame for `life` seconds (no object). */
    every(life, fn, onEnd) {
        return this.track(null, life, fn, onEnd);
    }

    flashLight(pos, color, intensity, life, distance) {
        const L = this.lights.reduce((a, b) => (a.until < b.until ? a : b));
        L.light.position.copy(pos);
        L.light.color.set(color);
        L.light.distance = distance || 40;
        L.peak = intensity;
        L.start = this.time;
        L.until = this.time + life;
        L.light.intensity = intensity;
    }

    // ---- Element bursts ------------------------------------------------------------
    burst(element, pos, k) {
        if (element === 'water') return this.waterSplash(pos, k);
        if (element === 'wind') return this.windBurst(pos, k);
        if (element === 'earth') return this.earthImpact(pos, k);
        return this.fireExplosion(pos, k);
    }

    fireExplosion(pos, k) {
        const c = ELEMENT_FX.fire;
        this.glow.emit({ count: this.n(140 * k), pos, spread: 0.6 * k, velSpread: 6 * k, vel: new THREE.Vector3(0, 3 * k, 0), drag: 2.2,
            life: [0.35, 0.9], size: [1.4 * k, 3 * k], color: c.core, color2: c.b, growth: 0.8, colorJitter: 0.1 });
        this.glow.emit({ count: this.n(70 * k), pos, spread: 1 * k, velSpread: 7, vel: new THREE.Vector3(0, 6, 0), drag: 0.6, gravity: -2,
            life: [1.0, 2.2], size: [0.18, 0.4], color: '#ffcc66', color2: '#ff3300' });
        this.smoke.emit({ count: this.n(28 * k), pos: pos.clone().add(new THREE.Vector3(0, 0.6 * k, 0)), spread: 1.2 * k, velSpread: 1.2,
            vel: new THREE.Vector3(0, 2.4, 0), drag: 0.8, life: [1.4, 2.6], size: [2.2 * k, 4 * k], color: '#3a2a22', color2: '#151010', growth: 1.6 });
        this.flashLight(pos, c.light, 120 * k, 0.5, 30 * k);
    }

    waterSplash(pos, k) {
        this.smoke.emit({ count: this.n(120 * k), pos, spread: 0.8 * k, velFn: (i, out) => {
            const a = rand(0, Math.PI * 2), s = rand(3, 9) * Math.min(k, 1.8);
            out.set(Math.cos(a) * s, rand(6, 14) * Math.min(k, 1.6), Math.sin(a) * s);
        }, gravity: 18, life: [0.8, 1.4], size: [0.35, 0.8], color: '#d9f1ff', color2: '#4aa3ff' });
        this.glow.emit({ count: this.n(60 * k), pos, spread: 1.2 * k, velSpread: 4, vel: new THREE.Vector3(0, 4, 0), gravity: 10,
            life: [0.4, 0.9], size: [0.4, 0.9], color: '#ffffff', color2: '#7cc8ff' });
        this.smoke.emit({ count: this.n(20 * k), pos, spread: 1.6 * k, velSpread: 1, vel: new THREE.Vector3(0, 1.2, 0), drag: 1,
            life: [1.2, 2], size: [3 * k, 5 * k], color: '#cfe8ff', color2: '#88b4d8', growth: 1.2 });
        this.shockwave(pos, '#bfe6ff', 6 * k, 0.8, false);
        this.flashLight(pos, ELEMENT_FX.water.light, 60 * k, 0.4, 25);
    }

    windBurst(pos, k) {
        const c = ELEMENT_FX.wind;
        for (let i = 0; i < Math.round(2 + 2 * k); i++) this.slash(pos, i * 0.06, k);
        this.glow.emit({ count: this.n(110 * k), pos, spread: 0.5, velFn: (i, out) => {
            const a = rand(0, Math.PI * 2), r = rand(4, 10) * Math.min(k, 1.8);
            out.set(Math.cos(a) * r - Math.sin(a) * 4, rand(-1, 4), Math.sin(a) * r + Math.cos(a) * 4);
        }, drag: 2.5, life: [0.4, 0.9], size: [0.3, 0.8], color: c.core, color2: c.b });
        this.flashLight(pos, c.light, 40 * k, 0.35, 25);
    }

    earthImpact(pos, k) {
        const c = ELEMENT_FX.earth;
        const floor = this.stage.groundY(pos);
        for (let i = 0; i < Math.round(10 * k); i++) {
            const a = rand(0, Math.PI * 2), s = rand(3, 8);
            this.debris.spawn(pos.clone().add(new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1))),
                new THREE.Vector3(Math.cos(a) * s, rand(6, 13), Math.sin(a) * s), rand(0.3, 0.9) * Math.min(k, 1.6), floor, rand(2, 3.5));
        }
        this.smoke.emit({ count: this.n(40 * k), pos: new THREE.Vector3(pos.x, floor + 0.5, pos.z), spread: new THREE.Vector3(2 * k, 0.3, 2 * k),
            velFn: (i, out) => { const a = rand(0, Math.PI * 2); out.set(Math.cos(a) * rand(2, 6), rand(0.5, 2.5), Math.sin(a) * rand(2, 6)); },
            drag: 1.2, life: [1.4, 2.6], size: [3 * k, 6 * k], color: '#8a6f55', color2: '#4a3a2c', growth: 1.4 });
        this.glow.emit({ count: this.n(50 * k), pos, spread: 0.6, velSpread: 8, vel: new THREE.Vector3(0, 4, 0), gravity: 14, drag: 0.5,
            life: [0.4, 0.9], size: [0.2, 0.5], color: c.core, color2: c.a });
        this.shockwave(new THREE.Vector3(pos.x, floor + 0.15, pos.z), '#ffcf6b', 9 * k, 0.7, true);
        this.flashLight(pos, c.light, 50 * k, 0.4, 25);
    }

    /** Expanding ring on the ground (or vertical when `ground` is false). */
    shockwave(pos, color, radius, life, ground) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64), mat);
        ring.position.copy(pos);
        if (ground !== false) ring.rotation.x = -Math.PI / 2;
        this.track(ring, life, (k) => {
            const s = 0.5 + Ease.outCubic(k) * radius;
            ring.scale.set(s, s, s);
            mat.opacity = 0.9 * (1 - k);
        });
    }

    /** Crescent wind slash passing through a point. */
    slash(pos, delay, k) {
        const mat = new THREE.MeshBasicMaterial({ color: '#e9fffa', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.RingGeometry(2.4 * k, 2.75 * k, 48, 1, 0, Math.PI * 0.85), mat);
        mesh.position.copy(pos);
        mesh.rotation.set(rand(-1, 1), rand(0, Math.PI * 2), rand(-0.8, 0.8));
        const spin = rand(5, 9) * (Math.random() < 0.5 ? -1 : 1);
        this.track(mesh, 0.45 + delay, (kk, dt, age) => {
            const t = clamp((age - delay) / 0.45, 0, 1);
            mat.opacity = t <= 0 ? 0 : Math.sin(t * Math.PI) * 0.95;
            mesh.rotation.z += spin * dt;
            mesh.scale.setScalar(0.6 + t * 0.8);
        });
    }

    // ---- Projectiles / streams ----------------------------------------------------------
    /** Glowing orb from → to (optional arc height), trailing particles; calls onArrive. */
    projectile(element, from, to, opts) {
        const c = ELEMENT_FX[element] || ELEMENT_FX.fire;
        const o = opts || {};
        const size = o.size || 0.8;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 16), new THREE.MeshBasicMaterial({ color: c.core }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 1.8, 24, 16),
            new THREE.MeshBasicMaterial({ color: c.a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        orb.add(halo);
        orb.position.copy(from);
        const duration = o.duration || 0.55;
        const arc = o.arc || 0;
        const p = new THREE.Vector3();
        this.track(orb, duration, (k) => {
            const e = Ease.inQuad(k);
            p.lerpVectors(from, to, e);
            p.y += Math.sin(k * Math.PI) * arc;
            orb.position.copy(p);
            orb.rotation.y += 0.3;
            this.glow.emit({ count: this.n(6), pos: p, spread: size * 0.5, velSpread: 0.8, life: [0.25, 0.5], size: [size * 1.4, size * 2.2],
                color: c.a, color2: c.b, growth: -0.5 });
            const L = this.lights[0];
            L.light.position.copy(p); L.light.color.set(c.light); L.light.intensity = 40; L.until = this.time + 0.05; L.start = this.time; L.peak = 40;
        }, () => { if (o.onArrive) o.onArrive(); });
    }

    /** A boulder (mesh) thrown along a parabola. */
    boulder(from, to, onArrive) {
        const tex = surfaceTextures('debris-rock', {});
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1),
            new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 0.95, color: '#c9b49c' }));
        rock.castShadow = true;
        const p = new THREE.Vector3();
        this.track(rock, 0.75, (k) => {
            p.lerpVectors(from, to, k);
            p.y += Math.sin(k * Math.PI) * 6;
            rock.position.copy(p);
            rock.rotation.x += 0.2; rock.rotation.z += 0.13;
            if (Math.random() < 0.5) this.smoke.emit({ count: 1, pos: p, spread: 0.4, life: [0.5, 0.9], size: [1.2, 2], color: '#7a6450', color2: '#3d3128', growth: 1 });
        }, onArrive);
    }

    /** Continuous breath stream from an Object3D (e.g. a mouth) toward a point. */
    breath(element, sourceObj, target, duration, k, onReach) {
        const c = ELEMENT_FX[element] || ELEMENT_FX.fire;
        const origin = new THREE.Vector3();
        const dir = new THREE.Vector3();
        let reached = false;
        this.every(duration, (kk, dt, age) => {
            sourceObj.getWorldPosition(origin);
            dir.subVectors(target, origin);
            const dist = dir.length();
            dir.normalize();
            const speed = 26;
            this.glow.emit({ count: this.n(22 * k), pos: origin, spread: 0.25, velFn: (i, out) => {
                out.copy(dir).multiplyScalar(speed * rand(0.85, 1.1)).add(new THREE.Vector3(rand(-2.5, 2.5), rand(-2, 2.5), rand(-2.5, 2.5)));
            }, life: [dist / speed * 0.9, dist / speed * 1.2], size: [0.8 * k, 2.6 * k], color: c.core, color2: c.b, growth: 2.2, colorJitter: 0.1 });
            if (element === 'fire') this.smoke.emit({ count: this.n(2 * k), pos: origin, spread: 0.4, velFn: (i, out) => out.copy(dir).multiplyScalar(speed * 0.8),
                life: [0.8, 1.3], size: [1.5, 3], color: '#3a2a22', color2: '#120c0a', growth: 2, drag: 0.6 });
            const L = this.lights[1];
            L.light.position.copy(origin).addScaledVector(dir, Math.min(dist, 6)); L.light.color.set(c.light);
            L.light.intensity = 90 * k; L.until = this.time + 0.06; L.start = this.time; L.peak = 90 * k;
            if (!reached && age > dist / speed) {
                reached = true;
                if (onReach) onReach();
            }
            if (reached && Math.random() < 0.4) this.burst(element, target, 0.35 * k);
        });
    }

    /**
     * Sustained energy beam from an Object3D (e.g. a mouth) to a point:
     * white-hot core + colored sheath that swell in and taper out, sparks
     * along its length, a muzzle flare and a following light. Calls onReach once.
     */
    beam(sourceObj, target, color, duration, k, onReach) {
        const group = new THREE.Group();
        const coreMat = new THREE.MeshBasicMaterial({ color: '#fff6dc', transparent: true, opacity: 1, depthWrite: false });
        const sheathMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
        const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);   // unit length along +Z
        const core = new THREE.Mesh(geo, coreMat);
        const sheath = new THREE.Mesh(geo, sheathMat);
        const flare = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), sheathMat);
        group.add(core, sheath, flare);
        const origin = new THREE.Vector3();
        const dir = new THREE.Vector3();
        let reached = false;
        this.track(group, duration, (kk, dt, age) => {
            sourceObj.getWorldPosition(origin);
            dir.subVectors(target, origin);
            const len = dir.length();
            group.position.copy(origin);
            group.lookAt(target);
            const grow = Math.min(1, age / 0.18);                    // beam shoots out
            const swell = Math.sin(Math.min(1, kk) * Math.PI);        // thickens, then tapers
            const r = (0.25 + 0.45 * swell) * k * (1 + Math.sin(age * 60) * 0.06);
            core.scale.set(r * 0.45, r * 0.45, len * grow);
            sheath.scale.set(r, r, len * grow);
            flare.scale.setScalar(r * 2.2);
            sheathMat.opacity = 0.55 * (1 - Math.max(0, kk - 0.8) / 0.2);
            coreMat.opacity = sheathMat.opacity * 1.6;
            const along = origin.clone().addScaledVector(dir, Math.random() * grow);
            this.glow.emit({ count: this.n(10 * k), pos: along, spread: r * 0.8, velSpread: 3, vel: new THREE.Vector3(0, 1, 0),
                life: [0.2, 0.45], size: [0.25, 0.6], color: '#fff2c8', color2: color });
            const L = this.lights[1];
            L.light.position.copy(origin).addScaledVector(dir, 0.5 * grow); L.light.color.set(color);
            L.light.intensity = 160 * k; L.until = this.time + 0.06; L.start = this.time; L.peak = 160 * k;
            if (!reached && grow >= 1) {
                reached = true;
                if (onReach) onReach();
            }
            if (reached && Math.random() < 0.5) this.burst('earth', target, 0.4 * k);
        });
    }

    // ---- Wind / storm -----------------------------------------------------------------------
    tornado(pos, height, radius, life, k) {
        const group = new THREE.Group();
        group.position.copy(pos);
        const uniforms = { uTime: { value: 0 }, uFade: { value: 0 }, uColor: { value: new THREE.Color('#d8f5ee') } };
        const mat = new THREE.ShaderMaterial({
            uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
            vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `uniform float uTime; uniform float uFade; uniform vec3 uColor; varying vec2 vUv;
                float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
                float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
                void main(){ vec2 uv = vec2(vUv.x * 6.0 + uTime * 1.6 + vUv.y * 3.0, vUv.y * 4.0 - uTime * 0.8);
                    float s = n(uv) * 0.6 + n(uv * 2.3) * 0.4; s = smoothstep(0.35, 0.9, s);
                    float edge = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
                    gl_FragColor = vec4(uColor * (0.6 + s * 0.6), s * edge * 0.75 * uFade); }`
        });
        [1, 0.72, 0.45].forEach((r, i) => {
            const geo = new THREE.CylinderGeometry(radius * r * 1.25, radius * r * 0.22, height, 40, 12, true);
            geo.translate(0, height / 2, 0);
            const m = new THREE.Mesh(geo, i === 0 ? mat : mat.clone());
            if (i > 0) m.material.uniforms = uniforms;
            m.userData.spin = 3 + i * 2;
            group.add(m);
        });
        this.track(group, life, (kk, dt, age) => {
            uniforms.uTime.value = age;
            uniforms.uFade.value = Math.min(1, age / 0.4) * (1 - smoothFade(kk));
            group.children.forEach((m) => { m.rotation.y += m.userData.spin * dt; });
            group.scale.set(1, Math.min(1, age / 0.35), 1);
            this.glow.emit({ count: this.n(4 * k), pos: new THREE.Vector3(pos.x, pos.y + rand(0, height), pos.z), spread: radius * 0.5,
                velFn: (i, out, x, y, z) => { const dx = x - pos.x, dz = z - pos.z; out.set(-dz * 4, rand(2, 6), dx * 4); },
                life: [0.4, 0.8], size: [0.2, 0.5], color: '#ffffff', color2: '#7ee8d2' });
            if (Math.random() < 0.15) this.debris.spawn(new THREE.Vector3(pos.x + rand(-radius, radius), pos.y + rand(0, height * 0.6), pos.z + rand(-radius, radius)),
                new THREE.Vector3(rand(-4, 4), rand(4, 9), rand(-4, 4)), rand(0.15, 0.35), this.stage.groundY(pos), 1.6);
        });
        return group;
    }

    /** Jagged lightning bolt from the sky to a point. */
    lightning(to, k, color) {
        const top = to.clone().add(new THREE.Vector3(rand(-6, 6), 38, rand(-6, 6)));
        const pts = [];
        const segs = 14;
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const p = top.clone().lerp(to, t);
            if (i > 0 && i < segs) p.add(new THREE.Vector3(rand(-1.6, 1.6), rand(-0.6, 0.6), rand(-1.6, 1.6)));
            pts.push(p);
        }
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
        const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.09 * k, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.45 * k, 8),
            new THREE.MeshBasicMaterial({ color: color || '#9fd8ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
        core.add(glow);
        this.track(core, 0.38, (kk) => { core.visible = Math.random() > 0.25 || kk < 0.1; glow.material.opacity = 0.45 * (1 - kk); });
        this.flashLight(to.clone().add(new THREE.Vector3(0, 4, 0)), '#bfe3ff', 400 * k, 0.35, 60);
        this.glow.emit({ count: this.n(40 * k), pos: to, spread: 0.5, velSpread: 9, vel: new THREE.Vector3(0, 5, 0), gravity: 12,
            life: [0.3, 0.7], size: [0.2, 0.5], color: '#ffffff', color2: '#7fc3ff' });
        if (this.stage.env && this.stage.env.flash) this.stage.env.flash(0.8 * k);
    }

    // ---- Water / kraken -----------------------------------------------------------------------
    ink(pos, k) {
        this.smoke.emit({ count: this.n(70 * k), pos, spread: 1.5 * k, velSpread: 3, vel: new THREE.Vector3(0, 1, 0), drag: 1.5,
            life: [1.6, 2.8], size: [2.5 * k, 5 * k], color: '#1a0f24', color2: '#06030a', growth: 1.3 });
    }

    /** Temporary tentacles that burst from the ground around a target and wrap it. */
    tentacleWrap(pos, material, k) {
        const group = new THREE.Group();
        group.position.set(pos.x, this.stage.groundY(pos) - 0.5, pos.z);
        const limbs = [];
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const limb = createBendLimb({ length: 7 * k, radiusTop: 0.08, radiusBottom: 0.55 * k, material, curl: 0, dir: a + Math.PI, waveAmp: 0.4, waveFreq: 1.2, phase: i });
            limb.mesh.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
            limb.mesh.rotation.y = 0;
            limb.mesh.userData.sharedMaterial = false;
            group.add(limb.mesh);
            limbs.push(limb);
        }
        this.track(group, 1.8, (kk, dt, age) => {
            const rise = Ease.outBack(clamp(age / 0.35, 0, 1)) * (1 - Ease.inCubic(clamp((kk - 0.75) / 0.25, 0, 1)));
            group.scale.set(1, Math.max(0.001, rise), 1);
            limbs.forEach((l) => { l.uniforms.uCurl.value = 0.6 + Math.min(1, age / 0.6) * 2.2; l.uniforms.uTime.value = age * 4; });
        });
        this.waterSplash(pos, 0.6 * k);
    }

    whirlpool(pos, radius, life) {
        const uniforms = { uTime: { value: 0 }, uFade: { value: 0 } };
        const mat = new THREE.ShaderMaterial({
            uniforms, transparent: true, depthWrite: false,
            vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: `uniform float uTime; uniform float uFade; varying vec2 vUv;
                void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
                    float s = sin(a * 5.0 + r * 18.0 - uTime * 6.0) * 0.5 + 0.5;
                    vec3 col = mix(vec3(0.02,0.1,0.22), vec3(0.75,0.9,1.0), smoothstep(0.55, 1.0, s) * smoothstep(0.1, 0.9, r));
                    float alpha = smoothstep(1.0, 0.8, r) * uFade * (0.55 + 0.45 * s);
                    gl_FragColor = vec4(col, alpha); }`
        });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), mat);
        disc.rotation.x = -Math.PI / 2;
        disc.position.copy(pos);
        this.track(disc, life, (k, dt, age) => { uniforms.uTime.value = age; uniforms.uFade.value = Math.min(1, age / 0.4) * (1 - smoothFade(k)); });
        return disc;
    }

    /** A rolling wall of water from → to. */
    tidalWave(from, to, onArrive, k) {
        const dir = new THREE.Vector3().subVectors(to, from);
        dir.y = 0;
        const yaw = Math.atan2(dir.x, dir.z);
        const geo = new THREE.CylinderGeometry(4 * k, 4 * k, 16 * k, 32, 1, true, Math.PI * 0.5, Math.PI);
        const mat = new THREE.MeshPhysicalMaterial({ color: '#1d5f9e', roughness: 0.08, transparent: true, opacity: 0.85, clearcoat: 1, side: THREE.DoubleSide,
            emissive: '#0a2a4a', envMapIntensity: 1.5 });
        const wave = new THREE.Mesh(geo, mat);
        wave.rotation.set(0, yaw, Math.PI / 2);
        const p = new THREE.Vector3();
        let arrived = false;
        this.track(wave, 1.1, (kk) => {
            p.lerpVectors(from, to, Ease.inQuad(Math.min(1, kk / 0.8)));
            wave.position.set(p.x, this.stage.groundY(p) + 1.5 * k, p.z);
            mat.opacity = 0.85 * (1 - Ease.inCubic(clamp((kk - 0.75) / 0.25, 0, 1)));
            this.smoke.emit({ count: this.n(8), pos: wave.position, spread: new THREE.Vector3(6 * k, 3 * k, 2), velSpread: 3, vel: new THREE.Vector3(0, 4, 0), gravity: 12,
                life: [0.5, 1], size: [0.5, 1.2], color: '#e6f6ff', color2: '#7cc8ff' });
            if (!arrived && kk >= 0.8) { arrived = true; if (onArrive) onArrive(); }
        });
    }

    // ---- Earth ------------------------------------------------------------------------------
    /** Glowing fissure that races along the ground from → to. */
    groundCrack(from, to, k, onArrive) {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
        const segs = 16;
        const pts = [];
        for (let i = 0; i <= segs; i++) {
            const p = new THREE.Vector3().lerpVectors(from, to, i / segs);
            if (i > 0 && i < segs) { p.x += rand(-0.8, 0.8); p.z += rand(-0.8, 0.8); }
            p.y = this.stage.groundY(p) + 0.06;
            pts.push(p);
        }
        const pieces = [];
        for (let i = 0; i < segs; i++) {
            const a = pts[i], b = pts[i + 1];
            const len = a.distanceTo(b);
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.35 * k, 0.05, len), mat);
            m.userData.sharedMaterial = true;
            m.position.copy(a).add(b).multiplyScalar(0.5);
            m.lookAt(b.x, m.position.y, b.z);
            m.visible = false;
            group.add(m);
            pieces.push(m);
        }
        let arrived = false;
        this.track(group, 1.6, (kk) => {
            const reveal = Math.floor(Math.min(1, kk / 0.4) * segs);
            pieces.forEach((m, i) => {
                if (i < reveal && !m.visible) {
                    m.visible = true;
                    this.smoke.emit({ count: this.n(3), pos: m.position, spread: 0.5, velSpread: 1, vel: new THREE.Vector3(0, 2, 0), life: [0.6, 1.2],
                        size: [1, 2], color: '#7a6450', color2: '#3d3128', growth: 1 });
                    this.glow.emit({ count: this.n(4), pos: m.position, spread: 0.2, velSpread: 2, vel: new THREE.Vector3(0, 3, 0), gravity: 8,
                        life: [0.3, 0.6], size: [0.15, 0.3], color: '#ffe0a0', color2: '#ff7a1a' });
                }
            });
            mat.opacity = 1 - Ease.inQuad(clamp((kk - 0.6) / 0.4, 0, 1));
            if (!arrived && kk >= 0.4) { arrived = true; if (onArrive) onArrive(); }
        }, () => mat.dispose());
    }

    /** Hexagonal rock pillars erupting around a point. */
    pillars(pos, k, material) {
        const group = new THREE.Group();
        const floor = this.stage.groundY(pos);
        group.position.set(pos.x, floor, pos.z);
        const items = [];
        const count = Math.round(5 + 3 * k);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
            const r = rand(1.2, 3.2) * Math.min(k, 1.5);
            const h = rand(3, 6) * Math.min(k, 1.6);
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, h, 6), material);
            m.userData.sharedMaterial = true;
            m.castShadow = true;
            m.position.set(Math.cos(a) * r, -h / 2, Math.sin(a) * r);
            m.rotation.set(rand(-0.35, 0.35), rand(0, 3), rand(-0.35, 0.35));
            m.userData.h = h;
            group.add(m);
            items.push(m);
        }
        this.track(group, 1.8, (kk) => {
            const up = Ease.outBack(clamp(kk / 0.2, 0, 1)) * (1 - Ease.inCubic(clamp((kk - 0.7) / 0.3, 0, 1)));
            items.forEach((m) => { m.position.y = -m.userData.h / 2 + up * m.userData.h * 0.85; });
        });
        this.earthImpact(new THREE.Vector3(pos.x, floor + 0.5, pos.z), 0.8 * k);
    }

    // ---- Misc ---------------------------------------------------------------------------------
    heal(pos) {
        this.glow.emit({ count: this.n(60), pos, spread: new THREE.Vector3(1.6, 1.5, 1.6), velSpread: 0.4, vel: new THREE.Vector3(0, 3, 0),
            life: [0.8, 1.4], size: [0.3, 0.7], color: '#c8ffd8', color2: '#2bdc6b' });
    }

    stunStars(pos) {
        const group = new THREE.Group();
        group.position.copy(pos);
        for (let i = 0; i < 4; i++) {
            const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: '#ffe57f' }));
            star.position.set(Math.cos(i * 1.57) * 1.4, 0, Math.sin(i * 1.57) * 1.4);
            group.add(star);
        }
        this.track(group, 1.5, (k, dt) => { group.rotation.y += dt * 5; group.position.y = pos.y + Math.sin(k * 12) * 0.15; });
    }

    /** Ultimate wind-up: converging motes + a light pillar. */
    chargeAura(pos, element, duration, k) {
        const c = ELEMENT_FX[element] || ELEMENT_FX.fire;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 40, 32, 1, true),
            new THREE.MeshBasicMaterial({ color: c.a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        pillar.position.set(pos.x, pos.y + 18, pos.z);
        this.track(pillar, duration, (kk) => { pillar.material.opacity = Math.sin(kk * Math.PI) * 0.35; pillar.scale.x = pillar.scale.z = 1 + kk * 0.8; });
        // Motes spawn on a sphere (radius 8) and fly into the caster.
        this.every(duration, () => {
            for (let i = 0; i < Math.max(1, Math.round(3 * k * this.ps)); i++) {
                const off = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(8);
                this.glow.emit({ count: 1, pos: pos.clone().add(off), spread: 0, velFn: (j, out) => out.copy(off).multiplyScalar(-1 / 0.7),
                    life: [0.7, 0.7], size: [0.4, 0.8], color: c.core, color2: c.a });
            }
        });
        this.flashLight(pos, c.light, 80 * k, duration, 30);
    }

    burnTick(pos) {
        this.glow.emit({ count: this.n(40), pos, spread: new THREE.Vector3(1.2, 1, 1.2), velSpread: 1, vel: new THREE.Vector3(0, 3, 0),
            life: [0.4, 0.8], size: [0.8, 1.6], color: '#ffd27a', color2: '#ff3d1a', growth: 0.6 });
    }

    dust(pos, k) {
        this.smoke.emit({ count: this.n(18 * k), pos, spread: new THREE.Vector3(1.5 * k, 0.3, 1.5 * k), velSpread: 1.5, vel: new THREE.Vector3(0, 1.2, 0),
            drag: 1.2, life: [1, 2], size: [2 * k, 4 * k], color: '#8a6f55', color2: '#4a3a2c', growth: 1.2 });
    }

    dispose() {
        this.active.forEach((fx) => { if (fx.object) this.scene.remove(fx.object); });
        this.active.length = 0;
    }
}

function smoothFade(k) {
    return Ease.inCubic(clamp((k - 0.7) / 0.3, 0, 1));
}

export { ELEMENT_FX, pick };
