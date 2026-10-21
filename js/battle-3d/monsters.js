/**
 * MathMon 3D boss monsters — procedural, jointed rigs (no external models).
 *
 *   Pyrovex   (Fire Dragon)   wing flaps, tail whip, fireball, fire breath, take-off roar
 *   Kraken    (Water)         rises from the sea, tentacle slams/wraps, ink, tidal waves
 *   Typhoeus  (Wind giant)    serpent coils + vortex, wind slashes, tornadoes, lightning
 *   Seismodon (Earth Titan)   original rock-plated kaiju: stomps, boulders, fault lines, glowing roar
 *
 * Animation model: each frame the rig is reset to its rest pose, the idle
 * layer is applied, then every active action adds its offsets scaled by a
 * smooth blend weight (fade in / out) — so actions blend over the idle and
 * into each other without pops.
 */
import * as THREE from 'three';
import { createBendLimb, attachToTip, surfaceTextures, repeatSet, Ease, envelope, win, clamp, rand, smoothstep } from './core.js';

const _v = new THREE.Vector3();

// ---- Geometry helpers ------------------------------------------------------------
function mesh(geo, mat, opts) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (opts) {
        if (opts.p) m.position.set(...opts.p);
        if (opts.r) m.rotation.set(...opts.r);
        if (opts.s) m.scale.set(...opts.s);
    }
    return m;
}

function sphere(r, mat, opts, seg) { return mesh(new THREE.SphereGeometry(r, seg || 32, Math.round((seg || 32) * 0.75)), mat, opts); }
function capsule(r, len, mat, opts) { return mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat, opts); }
function cone(r, h, mat, opts, seg) { return mesh(new THREE.ConeGeometry(r, h, seg || 12), mat, opts); }

/** Cylinder spanning two points (bones, claws). */
function boneBetween(a, b, r0, r1, mat) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = mesh(new THREE.CylinderGeometry(r1, r0, len, 10), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
}

/** Displace a geometry's vertices along normals with smooth noise ("organic" lumps). */
function lumpy(geo, amount, freq, seed) {
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = Math.sin(x * freq + seed) * Math.sin(y * freq * 1.3 + seed * 2) * Math.sin(z * freq * 0.9 + seed * 3);
        pos.setXYZ(i, x + nrm.getX(i) * n * amount, y + nrm.getY(i) * n * amount, z + nrm.getZ(i) * n * amount);
    }
    geo.computeVertexNormals();
    return geo;
}

function emissiveMat(color, intensity) {
    return new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: intensity || 3, roughness: 0.3 });
}

// ---- Base rig --------------------------------------------------------------------
class MonsterRig {
    constructor(stage, def, side) {
        this.stage = stage;
        this.def = def;
        this.side = side;
        this.element = def.element;
        this.root = new THREE.Group();     // placed at home, faces the opponent
        this.rig = new THREE.Group();      // action offsets (lunges, falls)
        this.root.add(this.rig);
        this.j = {};
        this.limbs = [];
        this.tips = [];                    // { limb, target, along }
        this.layers = [];
        this.anchors = {};
        this.t = rand(0, 10);
        this.glowMats = [];
        this.idleScale = 1;
    }

    joint(name, obj, parent) {
        (parent || this.rig).add(obj);
        this.j[name] = obj;
        return obj;
    }

    limb(name, opts, parent) {
        const limb = createBendLimb(opts);
        limb.rest = { curl: opts.curl || 0, dir: opts.dir || 0, waveAmp: opts.waveAmp || 0 };
        (parent || this.rig).add(limb.mesh);
        this.j[name] = limb;
        this.limbs.push(limb);
        return limb;
    }

    tip(limb, target, along) {
        limb.mesh.parent.add(target);
        target.position.copy(limb.mesh.position);
        this.tips.push({ limb, target, along: along == null ? 1 : along, offset: limb.mesh.position.clone(), rot: limb.mesh.quaternion.clone() });
        return target;
    }

    anchor(name, parent, pos) {
        const a = new THREE.Object3D();
        if (pos) a.position.set(...pos);
        parent.add(a);
        this.anchors[name] = a;
        return a;
    }

    /** Record rest transforms; call once after building. */
    finalize() {
        this.restList = [];
        this.rig.traverse((o) => {
            if (o === this.rig) return;
            this.restList.push({ o, p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() });
        });
        this.rigRest = { p: this.rig.position.clone(), r: this.rig.rotation.clone(), s: this.rig.scale.clone() };
    }

    resetPose() {
        for (const it of this.restList) {
            it.o.position.copy(it.p);
            it.o.rotation.copy(it.r);
            it.o.scale.copy(it.s);
        }
        this.rig.position.copy(this.rigRest.p);
        this.rig.rotation.copy(this.rigRest.r);
        this.rig.scale.copy(this.rigRest.s);
        for (const l of this.limbs) {
            l.uniforms.uCurl.value = l.rest.curl;
            l.uniforms.uDir.value = l.rest.dir;
            l.uniforms.uWaveAmp.value = l.rest.waveAmp;
        }
        this.glow = 1;
    }

    applyTips() {
        for (const tip of this.tips) {
            attachToTip(tip.limb, tip.target, tip.along);
            // limb-local → parent space (limb mesh may be offset/rotated inside its parent)
            tip.target.position.applyQuaternion(tip.limb.mesh.quaternion).add(tip.limb.mesh.position);
            tip.target.quaternion.premultiply(tip.limb.mesh.quaternion);
        }
    }

    update(dt) {
        this.t += dt;
        this.resetPose();
        this.idle(this.t);
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const L = this.layers[i];
            L.age += dt;
            const p = clamp(L.age / L.def.duration, 0, 1);
            const w = L.def.hold ? smoothstep(0, 0.12, p) : envelope(p, Math.min(0.5, 0.15 / L.def.duration), Math.min(0.5, 0.2 / L.def.duration));
            L.def.pose.call(this, p, w, L);
            if (L.def.events) {
                for (const ev of L.def.events) {
                    if (!L.fired.has(ev) && p >= ev.at) {
                        L.fired.add(ev);
                        ev.fn.call(this, L.ctx);
                    }
                }
            }
            if (p >= 1 && !L.finished) {
                L.finished = true;
                if (!L.def.impact || L.impacted) this.finishLayer(L);
                else L.timeout = this.stage.tweens.add({ duration: 2.5, onComplete: () => { L.ctx.impact(); } });
                if (!L.def.hold) this.layers.splice(i, 1);
            }
        }
        for (const l of this.limbs) l.uniforms.uTime.value = this.t * (l.speed || 1.5) + (l.uniforms.uPhase.value || 0) * 0;
        this.applyTips();
        this.glowMats.forEach((m) => { m.emissiveIntensity = m.userData.base * this.glow; });
    }

    finishLayer(L) {
        if (L.resolved) return;
        L.resolved = true;
        this.stage.tweens.add({ duration: L.def.settle == null ? 0.25 : L.def.settle, onComplete: L.resolve });
    }

    /**
     * Play an action. Resolves when the animation has finished and (if the
     * action has an impact) the impact has landed.
     * @param {string} name   attack | skill1 | skill2 | ultimate | hit | defeat | roar | intro
     * @param {object} opts   { target: Vector3, opponent: MonsterRig, k, onImpact }
     */
    play(name, opts) {
        const def = this.actions()[name];
        if (!def) return Promise.resolve();
        const o = opts || {};
        if (def.hold) this.layers = this.layers.filter((l) => !l.def.hold);
        return new Promise((resolve) => {
            const L = { def, age: 0, fired: new Set(), resolve, finished: false, impacted: false };
            L.ctx = {
                stage: this.stage, vfx: this.stage.vfx, k: o.k || 1, target: o.target || new THREE.Vector3(),
                opponent: o.opponent, self: this,
                impact: () => {
                    if (L.impacted) return;
                    L.impacted = true;
                    if (o.onImpact) o.onImpact();
                    if (L.finished) this.finishLayer(L);
                }
            };
            this.layers.push(L);
        });
    }

    worldAnchor(name, out) {
        const a = this.anchors[name] || this.root;
        return a.getWorldPosition(out || new THREE.Vector3());
    }

    registerGlow(mat, base) {
        mat.userData.base = base;
        this.glowMats.push(mat);
    }

    roarSound() {
        if (this.stage.sound && this.stage.sound.roar) this.stage.sound.roar(this.def.key);
    }

    /** Common hit / defeat / roar fallbacks that subclasses can extend. */
    commonActions() {
        return {
            hit: { duration: 0.5, pose(p, w) {
                const e = Math.sin(p * Math.PI) * w;
                this.rig.position.z -= 0.8 * e;
                this.rig.rotation.x -= 0.14 * e;
                this.glow *= 1 + e;
            } }
        };
    }
}

// ============================================================================
// FIRE — Pyrovex the Dragon
// ============================================================================
class Dragon extends MonsterRig {
    build() {
        const scales = repeatSet(surfaceTextures('dragon-scales', { pattern: 'scales', color: '#a3200f', dark: '#3a0603', light: '#e2502b',
            seed: 21, size: 256, period: 8, normalStrength: 7, roughness: 0.42, crackDepth: 0.2 }), 3, 3);
        const skin = new THREE.MeshStandardMaterial({ map: scales.map, normalMap: scales.normalMap, roughnessMap: scales.roughnessMap, metalness: 0.15, roughness: 1 });
        const bellyTex = repeatSet(surfaceTextures('dragon-belly', { pattern: 'skin', color: '#d69a3a', dark: '#7a4a14', light: '#f2c66b', seed: 5, size: 128 }), 2, 4);
        const belly = new THREE.MeshStandardMaterial({ map: bellyTex.map, normalMap: bellyTex.normalMap, roughness: 0.6 });
        const bone = new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.4 });
        const membrane = new THREE.MeshStandardMaterial({ color: '#7a170c', roughness: 0.75, side: THREE.DoubleSide, emissive: '#5a0a02', emissiveIntensity: 0.5 });
        const eye = emissiveMat('#ffb000', 4);
        this.registerGlow(eye, 4);
        this.skin = skin;

        const body = this.joint('body', new THREE.Group());
        body.position.set(0, 3.0, 0);
        body.add(sphere(1, skin, { s: [1.35, 1.15, 2.4] }));
        body.add(sphere(1, belly, { p: [0, -0.35, 0.2], s: [1.12, 0.88, 2.1] }));
        for (let i = 0; i < 8; i++) {
            const z = 1.7 - i * 0.5;
            body.add(cone(0.16, 0.6 - i * 0.03, bone, { p: [0, 1.05 - Math.abs(z) * 0.08, z], r: [-0.5, 0, 0] }, 6));
        }

        // Neck → head (bend limb + tip-attached head)
        const neckBase = this.joint('neckBase', new THREE.Group(), body);
        neckBase.position.set(0, 0.5, 1.9);
        neckBase.rotation.x = 0.55;
        const neck = this.limb('neck', { length: 3.1, radiusTop: 0.42, radiusBottom: 0.66, material: skin, curl: 0.95, dir: -Math.PI / 2, waveAmp: 0.05, waveFreq: 0.5 }, neckBase);
        neck.speed = 1.2;
        const neckTip = this.tip(neck, new THREE.Group());
        const headPivot = new THREE.Group();
        headPivot.rotation.x = -Math.PI / 2;
        neckTip.add(headPivot);
        const head = this.joint('head', new THREE.Group(), headPivot);
        head.rotation.x = 0.25;
        head.add(sphere(1, skin, { p: [0, 0, 0.15], s: [0.62, 0.55, 0.85] }));
        head.add(sphere(1, skin, { p: [0, -0.06, 0.95], s: [0.4, 0.3, 0.72] }));
        head.add(sphere(1, skin, { p: [0, 0.3, 0.45], s: [0.5, 0.14, 0.5] }));          // brow ridge
        [-1, 1].forEach((s) => {
            head.add(cone(0.13, 1.4, bone, { p: [0.32 * s, 0.4, -0.3], r: [-2.0, 0, -0.35 * s] }, 10));
            head.add(cone(0.08, 0.7, bone, { p: [0.5 * s, 0.1, -0.2], r: [-1.8, 0, -0.9 * s] }, 8));
            head.add(sphere(0.12, eye, { p: [0.36 * s, 0.17, 0.62] }, 12));
        });
        const jaw = this.joint('jaw', new THREE.Group(), head);
        jaw.position.set(0, -0.22, 0.35);
        jaw.add(sphere(1, belly, { p: [0, -0.05, 0.5], s: [0.34, 0.12, 0.78] }));
        for (let i = 0; i < 5; i++) {
            [-1, 1].forEach((s) => {
                jaw.add(cone(0.035, 0.16, bone, { p: [0.24 * s, 0.07, 0.25 + i * 0.18], r: [0, 0, 0] }, 5));
                head.add(cone(0.035, 0.16, bone, { p: [0.28 * s, -0.25, 0.6 + i * 0.16], r: [Math.PI, 0, 0] }, 5));
            });
        }
        this.throat = emissiveMat('#ff5a00', 0);
        head.add(sphere(0.25, this.throat, { p: [0, -0.18, 0.8] }, 12));
        this.anchor('mouth', head, [0, -0.18, 1.6]);
        this.anchor('head', head, [0, 0.6, 0.3]);

        // Tail (lateral sway via dir = π/2) + spade tip
        const tailBase = this.joint('tailBase', new THREE.Group(), body);
        tailBase.position.set(0, -0.05, -2.1);
        tailBase.rotation.x = -(Math.PI / 2 + 0.25);
        const tail = this.limb('tail', { length: 5.6, radiusTop: 0.06, radiusBottom: 0.72, material: skin, curl: 0.35, dir: Math.PI / 2, waveAmp: 0.6, waveFreq: 0.8 }, tailBase);
        tail.speed = 2;
        const tailTip = this.tip(tail, new THREE.Group());
        tailTip.add(cone(0.4, 0.9, bone, { p: [0, 0.3, 0], s: [1, 1, 0.25] }, 4));

        // Legs
        [[0.85, -0.45, 1.2], [-0.85, -0.45, 1.2], [0.95, -0.35, -1.2], [-0.95, -0.35, -1.2]].forEach((pos, i) => {
            const leg = this.joint(`leg${i}`, new THREE.Group(), body);
            leg.position.set(...pos);
            leg.add(capsule(0.34, 0.9, skin, { p: [0, -0.55, i < 2 ? 0.15 : -0.1], r: [i < 2 ? 0.25 : -0.3, 0, 0] }));
            leg.add(capsule(0.24, 0.9, skin, { p: [0, -1.55, i < 2 ? 0.25 : -0.15], r: [i < 2 ? -0.15 : 0.2, 0, 0] }));
            for (let c = -1; c <= 1; c++) leg.add(cone(0.07, 0.35, bone, { p: [c * 0.14, -2.35, (i < 2 ? 0.55 : 0.2)], r: [Math.PI / 2, 0, 0] }, 6));
        });

        // Wings (left built along +X, right mirrored)
        [1, -1].forEach((side) => {
            const wing = this.joint(side > 0 ? 'wingL' : 'wingR', new THREE.Group(), body);
            wing.position.set(0.95 * side, 0.85, 0.9);
            wing.scale.x = side;
            const S = new THREE.Vector3(0, 0, 0), W = new THREE.Vector3(3, 0.9, -0.3);
            const tips = [new THREE.Vector3(6.4, 1.6, -1.4), new THREE.Vector3(6.0, 0.2, -2.9), new THREE.Vector3(4.7, -0.6, -3.8), new THREE.Vector3(2.9, -0.8, -3.9)];
            const A = new THREE.Vector3(0.3, -0.6, -2.7);
            wing.add(boneBetween(S, W, 0.17, 0.11, skin));
            tips.forEach((t) => wing.add(boneBetween(W, t, 0.08, 0.025, bone)));
            wing.add(cone(0.08, 0.5, bone, { p: [3.1, 1.2, -0.3], r: [0, 0, -0.4] }, 6));
            const outline = [tips[0]];
            for (let i = 0; i < tips.length - 1; i++) {
                outline.push(new THREE.Vector3().lerpVectors(tips[i], tips[i + 1], 0.5).lerp(W, 0.22));
                outline.push(tips[i + 1]);
            }
            outline.push(new THREE.Vector3().lerpVectors(tips[3], A, 0.5).lerp(W, 0.15), A);
            const verts = [];
            for (let i = 0; i < outline.length - 1; i++) verts.push(W, outline[i], outline[i + 1]);
            verts.push(S, W, A);
            const geo = new THREE.BufferGeometry().setFromPoints(verts);
            geo.computeVertexNormals();
            wing.add(mesh(geo, membrane));
        });
        this.home = { flyHeight: 0 };
    }

    idle(t) {
        const j = this.j;
        j.body.position.y += Math.sin(t * 1.6) * 0.06;
        j.body.scale.y *= 1 + Math.sin(t * 1.6) * 0.015;
        const flap = 0.25 + Math.sin(t * 1.8) * 0.16;
        j.wingL.rotation.z += flap; j.wingR.rotation.z -= flap;
        j.wingL.rotation.y -= 0.15; j.wingR.rotation.y += 0.15;
        j.neck.uniforms.uCurl.value += Math.sin(t * 0.9) * 0.08;
        j.head.rotation.y += Math.sin(t * 0.55) * 0.15;
        j.jaw.rotation.x += 0.04 + Math.sin(t * 1.6) * 0.03;
        this.throat.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.2;
    }

    flap(speed, amp, w) {
        const f = Math.sin(this.t * speed) * amp * w;
        this.j.wingL.rotation.z += f; this.j.wingR.rotation.z -= f;
    }

    actions() {
        const self = this;
        return {
            ...this.commonActions(),
            intro: { duration: 1.9, pose(p, w) {
                const fly = 1 - Ease.outCubic(win(p, 0, 0.8, Ease.linear));
                this.rig.position.y += 14 * fly;
                this.rig.position.z -= 10 * fly;
                this.rig.rotation.x += 0.3 * fly;
                this.flap(14, 0.8, fly + 0.2 * w);
            }, events: [{ at: 0.82, fn(ctx) { ctx.vfx.dust(this.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 1.5); ctx.stage.shake(0.4); } }] },

            roar: { duration: 1.5, pose(p, w) {
                const e = envelope(p, 0.2, 0.25) * w;
                this.j.neck.uniforms.uCurl.value -= 0.6 * e;
                this.j.head.rotation.x -= 0.5 * e;
                this.j.jaw.rotation.x += 0.7 * e;
                this.throat.emissiveIntensity += 4 * e;
                this.flap(10, 0.5, e);
            }, events: [{ at: 0.25, fn(ctx) { self.roarSound(); ctx.stage.shake(0.7); } }] },

            // Normal: Tail Whip — turn, swing the tail across the target.
            attack: { duration: 1.15, impact: true, pose(p, w) {
                const wind = win(p, 0, 0.35), whip = win(p, 0.35, 0.55, Ease.outCubic), back = win(p, 0.6, 1);
                this.rig.rotation.y += (1.4 * wind - 2.4 * whip + 1.0 * back) * w;
                this.rig.position.z += 2.5 * Math.sin(p * Math.PI) * w;
                this.j.tail.uniforms.uWaveAmp.value += 1.2 * whip * (1 - back) * w;
                this.j.tail.uniforms.uCurl.value -= 0.8 * whip * (1 - back) * w;
            }, events: [{ at: 0.52, fn(ctx) { ctx.vfx.burst('fire', ctx.target, 0.6); ctx.stage.shake(0.35); ctx.impact(); } }] },

            // Skill 1: Ember Burst — rear back, spit a fireball.
            skill1: { duration: 1.2, impact: true, pose(p, w) {
                const rear = win(p, 0, 0.35) * (1 - win(p, 0.35, 0.5, Ease.outCubic));
                const snap = win(p, 0.35, 0.5, Ease.outCubic) * (1 - win(p, 0.6, 1));
                this.j.neck.uniforms.uCurl.value += (-0.7 * rear + 0.35 * snap) * w;
                this.j.jaw.rotation.x += 0.6 * snap * w;
                this.throat.emissiveIntensity += 5 * rear * w;
            }, events: [{ at: 0.45, fn(ctx) {
                const from = this.worldAnchor('mouth');
                ctx.vfx.projectile('fire', from, ctx.target, { size: 0.9 * ctx.k, duration: 0.5, onArrive: () => { ctx.vfx.burst('fire', ctx.target, ctx.k); ctx.impact(); } });
            } }] },

            // Skill 2: Inferno Breath — lowered head, sustained fire stream.
            skill2: { duration: 2.0, impact: true, pose(p, w) {
                const e = envelope(p, 0.15, 0.15) * w;
                this.j.neck.uniforms.uCurl.value += 0.3 * e;
                this.j.head.rotation.x += 0.15 * e;
                this.j.jaw.rotation.x += 0.75 * e;
                this.throat.emissiveIntensity += 8 * e;
                this.j.body.rotation.x += 0.08 * e;
                this.flap(6, 0.3, e);
            }, events: [{ at: 0.22, fn(ctx) { ctx.vfx.breath('fire', this.anchors.mouth, ctx.target, 1.1, ctx.k, () => ctx.impact()); } }] },

            // Ultimate: Skyfall Inferno — take off, roar, dive with a massive breath.
            ultimate: { duration: 3.3, impact: true, pose(p, w) {
                const up = win(p, 0, 0.3, Ease.outCubic) * (1 - win(p, 0.85, 1));
                this.rig.position.y += 5.5 * up * w;
                this.rig.rotation.x += (-0.25 * win(p, 0.1, 0.3) + 0.55 * win(p, 0.5, 0.6)) * (1 - win(p, 0.85, 1)) * w;
                this.flap(15, 0.9, up * w + 0.1);
                const roar = envelope(win(p, 0.3, 0.5, Ease.linear), 0.3, 0.3);
                this.j.neck.uniforms.uCurl.value -= 0.7 * roar * w;
                this.j.jaw.rotation.x += (0.8 * roar + 0.8 * envelope(win(p, 0.52, 0.85, Ease.linear), 0.1, 0.1)) * w;
                this.throat.emissiveIntensity += 10 * Math.max(roar, win(p, 0.5, 0.55)) * (1 - win(p, 0.85, 0.9)) * w;
            }, events: [
                { at: 0.32, fn(ctx) { self.roarSound(); ctx.stage.shake(1); } },
                { at: 0.52, fn(ctx) { ctx.vfx.breath('fire', this.anchors.mouth, ctx.target, 1.1, 2.2 * ctx.k, () => {
                    ctx.vfx.fireExplosion(ctx.target, 2.6); ctx.stage.shake(1.2); ctx.impact();
                }); } }
            ] },

            defeat: { duration: 1.6, hold: true, pose(p, w) {
                const e = Ease.inOutCubic(p) * w;
                this.rig.rotation.z += 1.25 * e;
                this.rig.position.y -= 0.9 * e;
                this.j.wingL.rotation.z -= 0.7 * e; this.j.wingR.rotation.z += 0.7 * e;
                this.j.neck.uniforms.uCurl.value -= 0.6 * e;
                this.j.jaw.rotation.x += 0.3 * e;
                this.glow *= 1 - 0.9 * e;
            } }
        };
    }
}

// ============================================================================
// WATER — Kraken
// ============================================================================
class Kraken extends MonsterRig {
    build() {
        const tex = repeatSet(surfaceTextures('kraken-skin', { pattern: 'skin', color: '#7a1f3d', dark: '#2a0716', light: '#c0566a', seed: 9, size: 256, normalStrength: 5, roughness: 0.4 }), 2, 3);
        const skin = new THREE.MeshPhysicalMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, roughness: 1,
            clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color('#ff9ab0') });
        const eye = emissiveMat('#ffd54a', 3.5);
        this.registerGlow(eye, 3.5);
        this.skin = skin;

        const body = this.joint('body', new THREE.Group());
        body.position.set(0, 2.2, 0);
        const profile = [[0, -0.3], [1.5, -0.1], [1.95, 0.7], [1.9, 1.7], [1.6, 2.8], [1.15, 3.8], [0.6, 4.5], [0.15, 4.85], [0, 4.9]]
            .map(([x, y]) => new THREE.Vector2(x, y));
        const mantleGeo = lumpy(new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(40), 48), 0.08, 2.4, 3);
        const mantle = this.joint('mantle', new THREE.Group(), body);
        mantle.position.set(0, 0.6, -0.3);
        mantle.rotation.x = -0.4;
        mantle.add(mesh(mantleGeo, skin));
        // fins
        [-1, 1].forEach((s) => mantle.add(sphere(1, skin, { p: [0.9 * s, 4.1, 0], s: [0.9, 0.6, 0.12], r: [0, 0, 0.7 * s] }, 16)));
        body.add(sphere(1.65, skin, { s: [1.1, 0.75, 1.1] }));
        [-1, 1].forEach((s) => {
            const e = sphere(0.42, eye, { p: [1.35 * s, 0.55, 0.75] }, 20);
            e.add(mesh(new THREE.BoxGeometry(0.08, 0.38, 0.06), new THREE.MeshStandardMaterial({ color: '#050505' }), { p: [0.05 * s, 0, 0.38] }));
            body.add(e);
        });
        this.anchor('head', body, [0, 3.5, 0]);
        this.anchor('mouth', body, [0, -0.4, 1.4]);

        // 8 tentacles around the base; 0 and 1 are the long front "slam" arms.
        this.tentacles = [];
        for (let i = 0; i < 8; i++) {
            const front = i < 2;
            const a = front ? Math.PI / 2 + (i === 0 ? 0.35 : -0.35) : Math.PI / 2 + 0.9 + (i - 2) * ((2 * Math.PI - 1.8) / 5);
            const pivot = this.joint(`tp${i}`, new THREE.Group(), body);
            pivot.position.set(Math.cos(a) * 1.15, -0.35, Math.sin(a) * 1.15);
            pivot.rotation.order = 'YXZ';
            pivot.rotation.y = Math.PI / 2 - a;
            pivot.rotation.x = Math.PI / 2 + 0.55;
            const limb = this.limb(`t${i}`, { length: front ? 8 : 6.4, radiusTop: 0.05, radiusBottom: front ? 0.48 : 0.42, material: skin,
                curl: 1.1, dir: -Math.PI / 2, waveAmp: 0.6, waveFreq: 1.1, phase: i * 0.8, segments: 40 }, pivot);
            limb.speed = 1.6 + (i % 3) * 0.2;
            this.tentacles.push(limb);
        }
    }

    idle(t) {
        const j = this.j;
        j.body.position.y += Math.sin(t * 1.1) * 0.18;
        j.mantle.scale.set(1 - Math.sin(t * 1.4) * 0.03, 1 + Math.sin(t * 1.4) * 0.04, 1 - Math.sin(t * 1.4) * 0.03);
        j.mantle.rotation.x += Math.sin(t * 0.7) * 0.05;
        this.tentacles.forEach((l, i) => { l.uniforms.uCurl.value += Math.sin(t * 1.3 + i * 1.7) * 0.35; });
    }

    slam(e, amount) {
        this.tentacles[0].uniforms.uCurl.value += amount * e;
        this.tentacles[1].uniforms.uCurl.value += amount * e;
    }

    actions() {
        const self = this;
        return {
            ...this.commonActions(),
            intro: { duration: 1.8, pose(p, w) {
                const rise = 1 - Ease.outBack(win(p, 0.1, 0.75, Ease.linear));
                this.rig.position.y -= 10 * rise;
                this.tentacles.forEach((l) => { l.uniforms.uCurl.value -= 1.2 * (1 - rise) * envelope(p, 0.3, 0.4); });
            }, events: [{ at: 0.3, fn(ctx) { ctx.vfx.waterSplash(this.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 2.2); ctx.stage.shake(0.4); } }] },

            roar: { duration: 1.5, pose(p, w) {
                const e = envelope(p, 0.2, 0.3) * w;
                this.tentacles.forEach((l, i) => { l.uniforms.uCurl.value -= (1.6 + (i % 2) * 0.4) * e; });
                this.j.mantle.rotation.x -= 0.3 * e;
                this.rig.position.y += 0.8 * e;
            }, events: [{ at: 0.25, fn(ctx) { self.roarSound(); ctx.stage.shake(0.6); ctx.vfx.waterSplash(this.root.position.clone(), 1.2); } }] },

            // Normal: Tentacle Slam
            attack: { duration: 1.2, impact: true, pose(p, w) {
                const lift = win(p, 0, 0.35) * (1 - win(p, 0.35, 0.5, Ease.inCubic));
                const slam = win(p, 0.35, 0.5, Ease.inCubic) * (1 - win(p, 0.65, 1));
                this.slam(w, -2.2 * lift + 1.6 * slam);
                this.rig.position.z += 2.6 * Math.sin(p * Math.PI) * w;
                this.rig.rotation.x += 0.18 * slam * w;
            }, events: [{ at: 0.5, fn(ctx) { ctx.vfx.waterSplash(ctx.target, 1); ctx.stage.shake(0.5); ctx.impact(); } }] },

            // Skill 1: Tide Splash — tentacles rise, tidal wave rolls out.
            skill1: { duration: 1.5, impact: true, pose(p, w) {
                const e = envelope(p, 0.25, 0.3) * w;
                this.tentacles.forEach((l) => { l.uniforms.uCurl.value -= 1.4 * e; });
                this.rig.position.y += 1.2 * e;
            }, events: [{ at: 0.4, fn(ctx) {
                const from = this.root.position.clone().lerp(ctx.target, 0.15);
                ctx.vfx.tidalWave(from, ctx.target, () => { ctx.vfx.waterSplash(ctx.target, 1.3); ctx.impact(); }, 0.8);
            } }] },

            // Skill 2: Ink Riptide — tentacles burst up around the foe and wrap it; ink cloud.
            skill2: { duration: 1.8, impact: true, pose(p, w) {
                const e = envelope(p, 0.2, 0.3) * w;
                this.slam(e, -1.8);
                this.rig.rotation.x += 0.15 * e;
                this.tentacles.slice(2).forEach((l) => { l.uniforms.uCurl.value += 0.5 * e; });
            }, events: [
                { at: 0.3, fn(ctx) { ctx.vfx.tentacleWrap(ctx.target, this.skin, 1); } },
                { at: 0.5, fn(ctx) { ctx.vfx.ink(ctx.target.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.2); ctx.impact(); } }
            ] },

            // Ultimate: Maelstrom Deluge — sink into a whirlpool, rise huge, crash a tidal wave.
            ultimate: { duration: 3.5, impact: true, pose(p, w) {
                const sink = win(p, 0, 0.22) * (1 - win(p, 0.25, 0.42, Ease.outBack));
                const big = win(p, 0.25, 0.42, Ease.outBack) * (1 - win(p, 0.85, 1));
                this.rig.position.y += (-4 * sink + 2.5 * big) * w;
                this.rig.scale.multiplyScalar(1 + 0.35 * big * w);
                this.tentacles.forEach((l, i) => { l.uniforms.uCurl.value -= (1.8 + (i % 2) * 0.4) * envelope(win(p, 0.35, 0.8, Ease.linear), 0.2, 0.3) * w; });
            }, events: [
                { at: 0.02, fn(ctx) { ctx.vfx.whirlpool(this.root.position.clone().add(new THREE.Vector3(0, 0.15, 0)), 9, 2.2); } },
                { at: 0.3, fn(ctx) { ctx.vfx.waterSplash(this.root.position.clone(), 2.4); self.roarSound(); ctx.stage.shake(0.9); } },
                { at: 0.5, fn(ctx) {
                    ctx.vfx.tidalWave(this.root.position.clone().lerp(ctx.target, 0.1), ctx.target, () => {
                        ctx.vfx.waterSplash(ctx.target, 2.6); ctx.vfx.tentacleWrap(ctx.target, this.skin, 1.2); ctx.stage.shake(1.2); ctx.impact();
                    }, 1.6);
                } }
            ] },

            defeat: { duration: 1.8, hold: true, pose(p, w) {
                const e = Ease.inCubic(p) * w;
                this.rig.position.y -= 7 * e;
                this.rig.rotation.z += 0.4 * e;
                this.tentacles.forEach((l) => { l.uniforms.uCurl.value -= 0.8 * e; l.uniforms.uWaveAmp.value *= 1 - e; });
                this.glow *= 1 - e;
            }, events: [{ at: 0.4, fn(ctx) { ctx.vfx.waterSplash(this.root.position.clone(), 1.6); } }] }
        };
    }
}

// ============================================================================
// WIND — Typhoeus, the storm giant
// ============================================================================
class Typhoeus extends MonsterRig {
    build() {
        const tex = repeatSet(surfaceTextures('typhoeus-skin', { pattern: 'skin', color: '#5f7387', dark: '#26303b', light: '#a9bccd', glow: '#7ff6ff',
            seed: 13, size: 256, crackWidth: 0.04, normalStrength: 5, roughness: 0.6 }), 2, 2);
        const skin = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap,
            emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 1, metalness: 0.05 });
        this.registerGlow(skin, 1.6);
        const scaleTex = repeatSet(surfaceTextures('serpent-scales', { pattern: 'scales', color: '#2f6f62', dark: '#0d2a24', light: '#6fc2ad', seed: 31, size: 128 }), 2, 4);
        const serpent = new THREE.MeshStandardMaterial({ map: scaleTex.map, normalMap: scaleTex.normalMap, roughness: 0.5, metalness: 0.1 });
        const cloud = new THREE.MeshStandardMaterial({ color: '#2b3440', roughness: 1 });
        const eye = emissiveMat('#9ffcff', 5);
        this.registerGlow(eye, 5);

        const pelvis = this.joint('pelvis', new THREE.Group());
        pelvis.position.set(0, 4.2, 0);
        pelvis.add(sphere(1.05, skin, { s: [1.2, 0.8, 1] }));
        const torso = this.joint('torso', new THREE.Group(), pelvis);
        torso.position.set(0, 0.4, 0);
        torso.add(capsule(0.85, 0.6, skin, { p: [0, 0.55, 0] }));
        torso.add(capsule(1.15, 1.2, skin, { p: [0, 2.0, 0], s: [1.35, 1, 0.82] }));
        torso.add(sphere(1, skin, { p: [0, 1.9, 0.55], s: [1.0, 0.75, 0.45] }));          // pecs
        [-1, 1].forEach((s) => {
            torso.add(sphere(0.72, skin, { p: [1.85 * s, 2.75, 0] }));
            const shoulder = this.joint(s > 0 ? 'shL' : 'shR', new THREE.Group(), torso);
            shoulder.position.set(1.9 * s, 2.7, 0);
            shoulder.rotation.set(-0.15, 0, 0.35 * s);
            shoulder.add(capsule(0.45, 1.4, skin, { p: [0, -1.05, 0] }));
            const elbow = this.joint(s > 0 ? 'elL' : 'elR', new THREE.Group(), shoulder);
            elbow.position.set(0, -2.0, 0);
            elbow.rotation.x = -0.45;
            elbow.add(capsule(0.4, 1.3, skin, { p: [0, -0.95, 0] }));
            const hand = new THREE.Group();
            hand.position.set(0, -1.95, 0);
            elbow.add(hand);
            hand.add(sphere(0.5, skin, { s: [1, 1.1, 0.8] }));
            for (let f = -1.5; f <= 1.5; f++) hand.add(cone(0.1, 0.55, skin, { p: [f * 0.18, -0.55, 0.12], r: [Math.PI + 0.3, 0, 0] }, 6));
            this.anchor(s > 0 ? 'handL' : 'handR', hand, [0, -0.4, 0.3]);
        });
        const head = this.joint('head', new THREE.Group(), torso);
        head.position.set(0, 3.55, 0.15);
        head.add(sphere(0.78, skin, { s: [1, 1.15, 1] }));
        head.add(cone(0.65, 1.5, cloud, { p: [0, -0.9, 0.35], r: [Math.PI - 0.2, 0, 0] }, 12));       // storm beard
        [-1, 1].forEach((s) => head.add(sphere(0.13, eye, { p: [0.28 * s, 0.15, 0.68] }, 12)));
        for (let i = 0; i < 9; i++) {
            const a = (i / 8 - 0.5) * 2.4;
            const spike = cone(0.18, 1.6 + Math.cos(a) * 0.6, cloud, { p: [Math.sin(a) * 0.6, 0.75, -0.2 - Math.abs(Math.sin(a)) * 0.1], r: [-0.6, 0, -a * 0.6] }, 6);
            spike.add(cone(0.06, 0.4, eye, { p: [0, 0.9 + Math.cos(a) * 0.3, 0] }, 5));
            head.add(spike);
        }
        this.anchor('head', head, [0, 1.6, 0]);
        this.anchor('mouth', head, [0, -0.2, 0.9]);

        // Lower body: serpent coils + a spinning storm vortex
        this.serpents = [];
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            const pivot = this.joint(`sp${i}`, new THREE.Group(), pelvis);
            pivot.position.set(Math.cos(a) * 0.6, -0.4, Math.sin(a) * 0.6);
            pivot.rotation.order = 'YXZ';
            pivot.rotation.y = Math.PI / 2 - a;
            pivot.rotation.x = Math.PI - 0.55;
            const limb = this.limb(`s${i}`, { length: 5, radiusTop: 0.16, radiusBottom: 0.6, material: serpent, curl: -1.4, dir: -Math.PI / 2, waveAmp: 0.8, waveFreq: 1.4, phase: i * 1.6 }, pivot);
            limb.speed = 2.2;
            const sHead = this.tip(limb, new THREE.Group());
            sHead.add(sphere(0.28, serpent, { p: [0, 0.2, 0], s: [1, 1.5, 0.8] }, 12));
            sHead.add(sphere(0.06, eye, { p: [0.15, 0.35, 0.15] }, 6));
            sHead.add(sphere(0.06, eye, { p: [-0.15, 0.35, 0.15] }, 6));
            this.serpents.push(limb);
        }
        this.vortexUniforms = { uTime: { value: 0 }, uFade: { value: 1 } };
        const vortexMat = new THREE.ShaderMaterial({
            uniforms: this.vortexUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: `uniform float uTime; uniform float uFade; varying vec2 vUv;
                float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
                float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
                void main(){ vec2 uv = vec2(vUv.x * 8.0 + uTime * 2.0 + vUv.y * 4.0, vUv.y * 3.0 - uTime);
                    float s = smoothstep(0.35, 0.95, n(uv) * 0.6 + n(uv * 2.7) * 0.4);
                    float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
                    gl_FragColor = vec4(mix(vec3(0.55,0.75,0.8), vec3(0.95,1.0,1.0), s), s * edge * 0.7 * uFade); }`
        });
        const vortexGeo = new THREE.CylinderGeometry(1.4, 3.2, 4.6, 40, 8, true);
        vortexGeo.translate(0, -2.3, 0);
        this.vortex = new THREE.Mesh(vortexGeo, vortexMat);
        this.vortex.renderOrder = 5;
        pelvis.add(this.vortex);
    }

    idle(t) {
        const j = this.j;
        j.pelvis.position.y += Math.sin(t * 1.2) * 0.25;
        j.torso.rotation.y += Math.sin(t * 0.6) * 0.08;
        j.shL.rotation.z += Math.sin(t * 1.1) * 0.08; j.shR.rotation.z -= Math.sin(t * 1.1 + 1) * 0.08;
        j.head.rotation.y += Math.sin(t * 0.5) * 0.2;
        this.vortex.rotation.y = t * 3;
        this.vortexUniforms.uTime.value = t;
        this.serpents.forEach((l, i) => { l.uniforms.uCurl.value += Math.sin(t * 1.4 + i) * 0.3; });
        this.glow *= 1 + Math.max(0, Math.sin(t * 7) * Math.sin(t * 2.3)) * 0.8;   // crackling veins
    }

    actions() {
        const self = this;
        const slashFrom = (name) => this.worldAnchor(name);
        return {
            ...this.commonActions(),
            intro: { duration: 1.9, pose(p, w) {
                const s = Ease.outBack(win(p, 0.15, 0.8, Ease.linear));
                this.rig.scale.multiplyScalar(Math.max(0.01, s));
                this.vortexUniforms.uFade.value = s;
            }, events: [
                { at: 0.05, fn(ctx) { ctx.vfx.tornado(this.root.position.clone(), 16, 4, 1.6, 1); } },
                { at: 0.55, fn(ctx) { ctx.vfx.lightning(this.root.position.clone().add(new THREE.Vector3(2, 0, 1)), 1); } }
            ] },

            roar: { duration: 1.5, pose(p, w) {
                const e = envelope(p, 0.2, 0.3) * w;
                this.j.shL.rotation.z += 1.1 * e; this.j.shR.rotation.z -= 1.1 * e;
                this.j.shL.rotation.x -= 0.5 * e; this.j.shR.rotation.x -= 0.5 * e;
                this.j.head.rotation.x -= 0.4 * e;
                this.glow *= 1 + 2 * e;
            }, events: [{ at: 0.3, fn(ctx) { self.roarSound(); ctx.vfx.lightning(this.root.position.clone().add(new THREE.Vector3(-3, 0, 2)), 1); ctx.stage.shake(0.5); } }] },

            // Normal: Gale Slashes — three alternating arm swings, three wind blades.
            attack: { duration: 1.35, impact: true, pose(p, w) {
                const s1 = envelope(win(p, 0.05, 0.35, Ease.linear), 0.4, 0.4);
                const s2 = envelope(win(p, 0.3, 0.6, Ease.linear), 0.4, 0.4);
                const s3 = envelope(win(p, 0.55, 0.85, Ease.linear), 0.4, 0.4);
                this.j.shL.rotation.x -= 1.6 * (s1 + s3) * w; this.j.shL.rotation.z -= 0.4 * (s1 + s3) * w;
                this.j.shR.rotation.x -= 1.6 * s2 * w; this.j.shR.rotation.z += 0.4 * s2 * w;
                this.j.torso.rotation.y += (0.35 * (s1 + s3) - 0.35 * s2) * w;
            }, events: [0.22, 0.47, 0.72].map((at, i) => ({ at, fn(ctx) {
                ctx.vfx.projectile('wind', slashFrom(i === 1 ? 'handR' : 'handL'), ctx.target, { size: 0.45, duration: 0.3,
                    onArrive: () => { ctx.vfx.slash(ctx.target, 0, 0.8); if (i === 2) ctx.impact(); } });
            } })) },

            // Skill 1: Razor Gale — double-arm thrust, big wind blade.
            skill1: { duration: 1.3, impact: true, pose(p, w) {
                const e = envelope(p, 0.3, 0.35) * w;
                this.j.shL.rotation.x -= 1.4 * e; this.j.shR.rotation.x -= 1.4 * e;
                this.j.elL.rotation.x += 0.4 * e; this.j.elR.rotation.x += 0.4 * e;
                this.rig.position.z += 1.5 * e;
            }, events: [{ at: 0.4, fn(ctx) {
                ctx.vfx.projectile('wind', this.worldAnchor('head').add(new THREE.Vector3(0, -3, 1)), ctx.target, { size: 1.1, duration: 0.4,
                    onArrive: () => { ctx.vfx.windBurst(ctx.target, ctx.k * 1.2); ctx.impact(); } });
            } }] },

            // Skill 2: Twin Tornado — arms raised, two tornadoes converge on the foe.
            skill2: { duration: 2.0, impact: true, pose(p, w) {
                const e = envelope(p, 0.2, 0.25) * w;
                this.j.shL.rotation.x -= 2.6 * e; this.j.shR.rotation.x -= 2.6 * e;
                this.j.shL.rotation.z += 0.3 * e; this.j.shR.rotation.z -= 0.3 * e;
                this.glow *= 1 + 1.5 * e;
            }, events: [{ at: 0.25, fn(ctx) {
                const side = new THREE.Vector3().subVectors(ctx.target, this.root.position).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(5);
                [1, -1].forEach((s) => {
                    const t = ctx.vfx.tornado(ctx.target.clone().addScaledVector(side, s).setY(ctx.stage.groundY(ctx.target)), 14, 2.6, 1.6, 1);
                    const start = t.position.clone();
                    ctx.stage.tweens.add({ duration: 0.8, ease: Ease.inOutSine, onUpdate: (k) => { t.position.lerpVectors(start, ctx.target.clone().setY(start.y), k * 0.85); } });
                });
                ctx.stage.tweens.add({ duration: 0.75, onComplete: () => { ctx.vfx.windBurst(ctx.target, 1.4); ctx.impact(); } });
            } }] },

            // Ultimate: Tempest Requiem — rise, giant tornado, lightning barrage.
            ultimate: { duration: 3.6, impact: true, pose(p, w) {
                const up = win(p, 0, 0.25, Ease.outCubic) * (1 - win(p, 0.85, 1));
                this.rig.position.y += 3 * up * w;
                this.j.shL.rotation.x -= 2.8 * up * w; this.j.shR.rotation.x -= 2.8 * up * w;
                this.j.shL.rotation.z += 0.5 * up * w; this.j.shR.rotation.z -= 0.5 * up * w;
                this.j.head.rotation.x -= 0.35 * up * w;
                this.glow *= 1 + 3 * up * w;
            }, events: [
                { at: 0.15, fn(ctx) { self.roarSound(); ctx.stage.shake(0.6); } },
                { at: 0.3, fn(ctx) { ctx.vfx.tornado(ctx.target.clone().setY(ctx.stage.groundY(ctx.target)), 30, 5.5, 2.2, 1.8); } },
                ...[0.42, 0.5, 0.56, 0.62].map((at) => ({ at, fn(ctx) {
                    ctx.vfx.lightning(ctx.target.clone().add(new THREE.Vector3(rand(-5, 5), 0, rand(-5, 5))).setY(ctx.stage.groundY(ctx.target)), 1.3);
                } })),
                { at: 0.68, fn(ctx) { ctx.vfx.lightning(ctx.target.clone(), 2.2); ctx.vfx.windBurst(ctx.target, 2.4); ctx.stage.shake(1.2); ctx.impact(); } }
            ] },

            defeat: { duration: 1.8, hold: true, pose(p, w) {
                const e = Ease.inOutCubic(p) * w;
                this.rig.position.y -= 3.2 * e;
                this.rig.rotation.x -= 1.2 * e;
                this.vortexUniforms.uFade.value = 1 - e;
                this.j.shL.rotation.z -= 0.4 * e; this.j.shR.rotation.z += 0.4 * e;
                this.glow *= 1 - 0.95 * e;
            } }
        };
    }
}

// ============================================================================
// EARTH — Seismodon, the Earth Titan (original kaiju design)
// ============================================================================
class Titan extends MonsterRig {
    build() {
        const tex = repeatSet(surfaceTextures('titan-hide', { pattern: 'basalt', color: '#5b4a3a', dark: '#1d1611', light: '#8f7a62', glow: '#ff9a2e',
            seed: 17, size: 256, period: 6, crackWidth: 0.08, crackDepth: 0.5, normalStrength: 8, roughness: 0.85 }), 2, 2);
        const hide = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap,
            emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 1, metalness: 0.05 });
        this.registerGlow(hide, 1.4);
        const plateMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, emissiveMap: tex.emissiveMap, emissive: '#ffffff',
            emissiveIntensity: 2.2, color: '#a08870', roughness: 0.7, flatShading: true });
        this.registerGlow(plateMat, 2.2);
        const bone = new THREE.MeshStandardMaterial({ color: '#d9cfb8', roughness: 0.5 });
        const eye = emissiveMat('#ffb000', 5);
        this.registerGlow(eye, 5);
        this.mouthGlow = emissiveMat('#ff7a00', 0);
        this.hide = hide;
        this.plateMat = plateMat;

        const hips = this.joint('hips', new THREE.Group());
        hips.position.set(0, 3.7, -0.4);
        hips.add(sphere(1, hide, { s: [1.5, 1.3, 1.7] }));
        const torso = this.joint('torso', new THREE.Group(), hips);
        torso.position.set(0, 0.8, 0.5);
        torso.rotation.x = 0.4;
        torso.add(capsule(1.35, 2.0, hide, { p: [0, 1.4, 0.3], s: [1.15, 1, 1.05] }));
        torso.add(sphere(1, hide, { p: [0, 1.1, 1.05], s: [0.95, 1.3, 0.5] }));
        for (let i = 0; i < 6; i++) {
            const y = 0.4 + i * 0.55;
            [0, -1, 1].forEach((col) => {
                const big = col === 0;
                const plate = mesh(new THREE.OctahedronGeometry(1, 0), plateMat, {
                    p: [col * 0.55, y + (big ? 0.2 : 0), -1.0 - (big ? 0.35 : 0.1)],
                    s: [0.14, (big ? 0.95 : 0.55) * (1 - Math.abs(i - 2.5) * 0.12), (big ? 0.75 : 0.45)], r: [-0.5, 0, col * 0.35] });
                torso.add(plate);
            });
        }
        const head = this.joint('head', new THREE.Group(), torso);
        head.position.set(0, 3.15, 0.85);
        head.rotation.x = -0.35;
        head.add(sphere(1, hide, { s: [0.85, 0.75, 1.1] }));
        head.add(sphere(1, hide, { p: [0, -0.12, 1.0], s: [0.62, 0.48, 0.85] }));
        head.add(sphere(1, hide, { p: [0, 0.45, 0.55], s: [0.75, 0.2, 0.55] }));
        [-1, 1].forEach((s) => head.add(sphere(0.13, eye, { p: [0.48 * s, 0.25, 0.85] }, 12)));
        for (let i = 0; i < 4; i++) head.add(mesh(new THREE.OctahedronGeometry(1, 0), plateMat, { p: [0, 0.75 - i * 0.05, -0.1 - i * 0.35], s: [0.08, 0.4 - i * 0.06, 0.3] }));
        const jaw = this.joint('jaw', new THREE.Group(), head);
        jaw.position.set(0, -0.45, 0.35);
        jaw.add(sphere(1, hide, { p: [0, -0.1, 0.6], s: [0.55, 0.25, 0.85] }));
        for (let i = 0; i < 5; i++) [-1, 1].forEach((s) => {
            jaw.add(cone(0.05, 0.22, bone, { p: [0.36 * s, 0.1, 0.3 + i * 0.22] }, 5));
            head.add(cone(0.05, 0.22, bone, { p: [0.42 * s, -0.55, 0.75 + i * 0.2], r: [Math.PI, 0, 0] }, 5));
        });
        head.add(sphere(0.3, this.mouthGlow, { p: [0, -0.45, 1.0] }, 12));
        this.anchor('mouth', head, [0, -0.4, 1.8]);
        this.anchor('head', head, [0, 1.0, 0.4]);
        [-1, 1].forEach((s) => {
            const arm = this.joint(s > 0 ? 'armL' : 'armR', new THREE.Group(), torso);
            arm.position.set(1.3 * s, 1.9, 0.9);
            arm.rotation.set(0.6, 0, 0.25 * s);
            arm.add(capsule(0.38, 0.9, hide, { p: [0, -0.6, 0] }));
            arm.add(capsule(0.32, 0.8, hide, { p: [0, -1.4, 0.35], r: [-0.6, 0, 0] }));
            for (let c = -1; c <= 1; c++) arm.add(cone(0.07, 0.35, bone, { p: [c * 0.15, -1.9, 0.75], r: [2.2, 0, 0] }, 6));
            this.anchor(s > 0 ? 'handL' : 'handR', arm, [0, -1.9, 0.6]);
        });
        [-1, 1].forEach((s) => {
            const hip = this.joint(s > 0 ? 'legL' : 'legR', new THREE.Group(), hips);
            hip.position.set(1.15 * s, -0.3, 0);
            hip.add(capsule(0.78, 1.3, hide, { p: [0, -0.85, 0.25], r: [0.25, 0, 0] }));
            const knee = this.joint(s > 0 ? 'kneeL' : 'kneeR', new THREE.Group(), hip);
            knee.position.set(0, -1.85, 0.45);
            knee.add(capsule(0.58, 1.1, hide, { p: [0, -0.75, -0.2], r: [-0.3, 0, 0] }));
            const foot = new THREE.Group();
            foot.position.set(0, -1.5, -0.25);
            knee.add(foot);
            foot.add(mesh(new THREE.BoxGeometry(1.0, 0.45, 1.5), hide, { p: [0, 0, 0.3] }));
            for (let c = -1; c <= 1; c++) foot.add(cone(0.1, 0.45, bone, { p: [c * 0.32, -0.05, 1.15], r: [Math.PI / 2, 0, 0] }, 6));
            this.anchor(s > 0 ? 'footL' : 'footR', foot, [0, -0.2, 0.4]);
        });
        const tailBase = this.joint('tailBase', new THREE.Group(), hips);
        tailBase.position.set(0, -0.1, -1.4);
        tailBase.rotation.x = -(Math.PI / 2 + 0.5);
        const tail = this.limb('tail', { length: 7.5, radiusTop: 0.1, radiusBottom: 1.05, material: hide, curl: -0.35, dir: Math.PI / 2, waveAmp: 0.5, waveFreq: 0.6 }, tailBase);
        tail.speed = 1.2;
        [0.15, 0.3, 0.45, 0.6, 0.75].forEach((along, i) => {
            const holder = this.tip(tail, new THREE.Group(), along);
            holder.add(mesh(new THREE.OctahedronGeometry(1, 0), plateMat, { p: [0, 0, -0.75 + i * 0.12], s: [0.12, 0.5 - i * 0.07, 0.4 - i * 0.05], r: [0, 0, 0] }));
        });
    }

    idle(t) {
        const j = this.j;
        j.hips.position.y += Math.sin(t * 1.0) * 0.05;
        j.torso.scale.setScalar(1 + Math.sin(t * 1.0) * 0.015);
        j.head.rotation.y += Math.sin(t * 0.45) * 0.18;
        j.jaw.rotation.x += 0.05 + Math.sin(t) * 0.03;
        this.glow *= 0.85 + Math.sin(t * 1.3) * 0.25;
    }

    stomp(e, raise, s) {
        const hip = s > 0 ? this.j.legL : this.j.legR;
        const knee = s > 0 ? this.j.kneeL : this.j.kneeR;
        hip.rotation.x -= 0.9 * raise * e;
        knee.rotation.x += 1.1 * raise * e;
        this.j.hips.rotation.z += 0.08 * raise * s * e;
    }

    actions() {
        const self = this;
        return {
            ...this.commonActions(),
            intro: { duration: 2.0, pose(p, w) {
                const rise = 1 - Ease.outCubic(win(p, 0.05, 0.8, Ease.linear));
                this.rig.position.y -= 9 * rise;
                this.rig.rotation.x += 0.25 * rise;
            }, events: [
                { at: 0.05, fn(ctx) { ctx.vfx.earthImpact(this.root.position.clone(), 1.6); ctx.stage.shake(0.8); } },
                { at: 0.45, fn(ctx) { ctx.vfx.dust(this.root.position.clone(), 2); } }
            ] },

            roar: { duration: 1.7, pose(p, w) {
                const e = envelope(p, 0.2, 0.3) * w;
                this.j.head.rotation.x -= 0.6 * e;
                this.j.jaw.rotation.x += 0.75 * e;
                this.j.torso.rotation.x -= 0.25 * e;
                this.mouthGlow.emissiveIntensity = 6 * e;
                this.glow *= 1 + 2.5 * e;
            }, events: [{ at: 0.3, fn(ctx) { self.roarSound(); ctx.stage.shake(0.9); } }] },

            // Normal: Seismic Stomp — shockwave along the ground.
            attack: { duration: 1.3, impact: true, pose(p, w) {
                const raise = win(p, 0.05, 0.38) * (1 - win(p, 0.38, 0.5, Ease.inCubic));
                this.stomp(w, raise, 1);
                this.j.torso.rotation.x += 0.15 * raise * w;
            }, events: [{ at: 0.5, fn(ctx) {
                const foot = this.worldAnchor('footL');
                ctx.vfx.shockwave(foot.setY(ctx.stage.groundY(foot) + 0.15), '#ffcf6b', 14, 0.8, true);
                ctx.vfx.dust(foot, 1.4);
                ctx.vfx.earthImpact(ctx.target, 0.8);
                if (ctx.stage.sound && ctx.stage.sound.stomp) ctx.stage.sound.stomp();
                ctx.stage.shake(0.8);
                ctx.impact();
            } }] },

            // Skill 1: Boulder Guard — rip up a boulder and hurl it.
            skill1: { duration: 1.6, impact: true, pose(p, w) {
                const bend = envelope(win(p, 0, 0.45, Ease.linear), 0.4, 0.4);
                const thr = envelope(win(p, 0.4, 0.8, Ease.linear), 0.3, 0.5);
                this.j.torso.rotation.x += (0.55 * bend - 0.3 * thr) * w;
                this.j.armR.rotation.x += (0.6 * bend - 2.4 * thr) * w;
                this.glow *= 1 + win(p, 0.6, 0.8) * (1 - win(p, 0.9, 1)) * 2;
            }, events: [{ at: 0.52, fn(ctx) {
                ctx.vfx.boulder(this.worldAnchor('handR'), ctx.target, () => { ctx.vfx.earthImpact(ctx.target, 1.2); ctx.stage.shake(0.6); ctx.impact(); });
            } }] },

            // Skill 2: Fault Line — tail slam + glowing fissure, rock pillars erupt.
            skill2: { duration: 1.9, impact: true, pose(p, w) {
                const raise = win(p, 0.05, 0.3) * (1 - win(p, 0.3, 0.42, Ease.inCubic));
                this.stomp(w, raise, -1);
                this.j.tail.uniforms.uCurl.value -= 0.9 * raise * w;
                this.glow *= 1 + 1.5 * envelope(p, 0.3, 0.3);
            }, events: [{ at: 0.42, fn(ctx) {
                const from = this.root.position.clone().lerp(ctx.target, 0.18);
                ctx.stage.shake(0.7);
                ctx.vfx.groundCrack(from, ctx.target, 1, () => { ctx.vfx.pillars(ctx.target, 1, this.plateMat); ctx.impact(); });
            } }] },

            // Ultimate: Titan's Cataclysm — plates charge in a glowing roar (anticipation),
            // an atomic-style seismic beam (strike + recoil), then a world-cracking stomp (follow-through).
            ultimate: { duration: 4.4, impact: true, pose(p, w) {
                const charge = win(p, 0.0, 0.28) * (1 - win(p, 0.6, 0.68));
                const crouch = envelope(win(p, 0.0, 0.32, Ease.linear), 0.4, 0.25);
                const aim = envelope(win(p, 0.28, 0.62, Ease.linear), 0.15, 0.2);
                this.j.torso.rotation.x += (0.25 * crouch - 0.12 * aim) * w;       // crouch, then rear up
                this.j.head.rotation.x += (0.35 * crouch - 0.25 * aim) * w;
                this.j.jaw.rotation.x += (0.35 * crouch + 0.95 * aim) * w;
                this.j.tail.uniforms.uCurl.value -= 0.8 * charge * w;            // tail lifts as energy builds
                this.rig.position.z -= 0.7 * aim * w;                            // beam recoil
                this.mouthGlow.emissiveIntensity = 3 * crouch + 14 * aim;
                this.glow *= 1 + 7 * charge;                                     // plates blaze down the spine
                const s1 = win(p, 0.64, 0.7) * (1 - win(p, 0.7, 0.74, Ease.inCubic));
                this.stomp(w, s1, 1);
            }, events: [
                { at: 0.02, fn(ctx) { ctx.vfx.chargeAura(this.worldAnchor('head').add(new THREE.Vector3(0, -2, -1.5)), 'earth', 1.2, 1.4); } },
                { at: 0.1, fn(ctx) { self.roarSound(); ctx.stage.shake(1.0); } },
                { at: 0.32, fn(ctx) {
                    ctx.vfx.beam(this.anchors.mouth, ctx.target, '#ffb347', 1.25, 1.6, () => {
                        ctx.stage.shake(1.2);
                        ctx.vfx.shockwave(ctx.target.clone().setY(ctx.stage.groundY(ctx.target) + 0.2), '#ffcf6b', 12, 0.8, true);
                    });
                } },
                { at: 0.72, fn(ctx) { ctx.vfx.shockwave(this.root.position.clone().setY(ctx.stage.groundY(this.root.position) + 0.2), '#ffcf6b', 22, 1, true); ctx.stage.shake(0.8); } },
                { at: 0.74, fn(ctx) {
                    ctx.stage.shake(1.3);
                    ctx.vfx.groundCrack(this.root.position.clone().lerp(ctx.target, 0.15), ctx.target, 1.6, () => {
                        ctx.vfx.pillars(ctx.target, 2.2, this.plateMat);
                        for (let i = 0; i < 12; i++) {
                            ctx.vfx.debris.spawn(ctx.target.clone().add(new THREE.Vector3(rand(-6, 6), rand(14, 24), rand(-6, 6))),
                                new THREE.Vector3(0, -4, 0), rand(0.5, 1.2), ctx.stage.groundY(ctx.target), 3);
                        }
                        ctx.impact();
                    });
                } }
            ] },

            defeat: { duration: 1.9, hold: true, pose(p, w) {
                const e = Ease.inOutCubic(p) * w;
                this.rig.rotation.x -= 1.35 * e;
                this.rig.position.y -= 1.2 * e;
                this.rig.position.z -= 2 * e;
                this.glow *= 1 - 0.95 * e;
            }, events: [{ at: 0.85, fn(ctx) { ctx.vfx.dust(this.root.position.clone().add(new THREE.Vector3(0, 0.5, -5)), 3); ctx.stage.shake(1); } }] }
        };
    }
}

const CLASSES = { dragon: Dragon, kraken: Kraken, typhoeus: Typhoeus, titan: Titan };

/** Build a monster rig by key ('dragon' | 'kraken' | 'typhoeus' | 'titan'). */
export function createMonster(stage, key, def, side) {
    const Cls = CLASSES[key] || Dragon;
    const m = new Cls(stage, { ...def, key }, side);
    m.build();
    m.finalize();
    return m;
}
