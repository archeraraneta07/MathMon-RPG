/**
 * MathMon 3D battle stage (ES module) — Three.js r160.
 *
 * Renders the battle on a WebGL canvas layered between the Phaser canvas and
 * the DOM HUD, and exposes the same promise-based interface as the 2D
 * fallback (js/battle-stage-2d.js):
 *
 *   introduce(), playerAction(action, { onImpact }), enemyAttack({ onImpact }),
 *   hit(side, strength), popup(side, text, opts), statusFx(side, type),
 *   shake(intensity), faint(side), destroy()
 *
 * Rendering: PBR materials, image-based lighting from the animated sky,
 * soft shadows, exponential fog, and a post chain of
 *   [SSAO] → bloom → god rays → [depth of field] → ACES tone map → color grade
 *   (vignette, heat haze, chromatic aberration, screen flash)
 * Quality tiers (high / medium / low) are picked per device and drop
 * automatically when the frame rate stays below the configured minimum.
 *
 * Exposes window.MathMonStage3D = { isSupported(), create(opts) }.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Tweens, Ease, clamp, disposeTree, detectTier as detectTierSetting, saveTier, TIERS } from './core.js';
import { buildEnvironment, ARENA } from './environments.js';
import { createMonster } from './monsters.js';
import { VFX } from './vfx.js';

// ---- Post-processing shaders ------------------------------------------------------
const GodRaysShader = {
    uniforms: {
        tDiffuse: { value: null }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uStrength: { value: 0.5 },
        uColor: { value: new THREE.Color('#ffffff') }, uThreshold: { value: 0.75 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
        #define SAMPLES 36
        uniform sampler2D tDiffuse; uniform vec2 uLight; uniform float uStrength; uniform vec3 uColor; uniform float uThreshold;
        varying vec2 vUv;
        void main(){
            vec3 base = texture2D(tDiffuse, vUv).rgb;
            if (uStrength <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
            vec2 delta = (vUv - uLight) * 0.9 / float(SAMPLES);
            vec2 c = vUv;
            float illum = 1.0;
            vec3 acc = vec3(0.0);
            for (int i = 0; i < SAMPLES; i++) {
                c -= delta;
                vec3 s = texture2D(tDiffuse, c).rgb;
                acc += max(s - uThreshold, 0.0) * illum;
                illum *= 0.955;
            }
            gl_FragColor = vec4(base + acc / float(SAMPLES) * uColor * uStrength * 3.0, 1.0);
        }`
};

const GradeShader = {
    uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 },
        uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
        uSat: { value: 1 }, uContrast: { value: 1 }, uVignette: { value: 0.4 }, uFlash: { value: new THREE.Vector3() },
        uHaze: { value: 0 }, uChroma: { value: 0 }, uAspect: { value: 4 / 3 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime, uSat, uContrast, uVignette, uHaze, uChroma, uAspect;
        uniform vec3 uLift, uGamma, uGain, uFlash;
        varying vec2 vUv;
        void main(){
            vec2 uv = vUv;
            if (uHaze > 0.0) {
                float m = smoothstep(0.7, 0.05, uv.y);
                uv += vec2(sin(uv.y * 95.0 + uTime * 3.1) + sin(uv.x * 57.0 + uTime * 2.3), cos(uv.x * 73.0 + uTime * 2.7)) * uHaze * m * 0.5;
            }
            vec2 dir = uv - 0.5;
            vec3 c = vec3(texture2D(tDiffuse, uv + dir * uChroma).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * uChroma).b);
            c = c * uGain + uLift * (1.0 - c);
            c = pow(max(c, 0.0), 1.0 / uGamma);
            c = (c - 0.5) * uContrast + 0.5;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, uSat);
            float v = smoothstep(0.95, 0.25, length(dir * vec2(uAspect, 1.0)));
            c *= mix(1.0 - uVignette, 1.0, v);
            c += uFlash;
            gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`
};

// ---- Shared renderer (one WebGL context for the whole session) ----------------------
let sharedRenderer = null;

function getRenderer() {
    if (!sharedRenderer) {
        sharedRenderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
        sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
        sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        sharedRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        sharedRenderer.domElement.className = 'mm-stage3d';
        sharedRenderer.domElement.setAttribute('aria-hidden', 'true');
    }
    return sharedRenderer;
}

function isSupported() {
    try {
        const c = document.createElement('canvas');
        return Boolean(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

function detectTier(stageCfg) {
    return detectTierSetting(stageCfg.quality);
}

const ACTION_ANIM = { normal: 'attack', skill1: 'skill1', skill2: 'skill2', ultimate: 'ultimate' };

class Stage3D {
    /**
     * @param {object} opts { container, config, playerMonster, enemyMonster, playerElement, enemyElement, hud, sound }
     */
    constructor(opts) {
        this.opts = opts;
        this.cfg = opts.config;
        this.hud = opts.hud;
        this.sound = opts.sound || {};
        this.container = opts.container;
        this.stageCfg = this.cfg.stage3d;
        this.setTier(detectTier(this.stageCfg));

        this.renderer = getRenderer();
        this.canvas = this.renderer.domElement;
        this.canvas.style.display = '';
        // The renderer canvas is reused across battles; the previous battle's
        // end-of-battle fade left it at opacity 0 (→ black battlefield). Reset it.
        this.canvas.style.transition = '';
        this.canvas.style.opacity = '';
        this.container.appendChild(this.canvas);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.3, 1400);
        this.tweens = new Tweens();
        this.timeScale = 1;
        this.time = 0;
        this.trauma = 0;
        this.flashColor = new THREE.Vector3();
        this.chroma = 0;

        // Camera rig: base framing + cinematic overrides + shake.
        // Three-quarter view from the player's right: player lower-left, enemy center-right.
        this.camDefault = { pos: new THREE.Vector3(7, 9.5, 27), target: new THREE.Vector3(0, 4.2, -2.5) };
        this.cam = { pos: this.camDefault.pos.clone(), target: this.camDefault.target.clone() };

        this.vfx = new VFX(this);
        const enemyDef = opts.enemyMonster;
        this.env = buildEnvironment(enemyDef.arena, this);
        this.scene.add(this.env.group);
        // Camera-side fill light: keeps monsters readable when the arena's sun is behind them.
        const fill = new THREE.DirectionalLight('#dfe8ff', 1.1);
        fill.position.set(14, 12, 30);
        fill.target.position.set(0, 3, -2);
        this.scene.add(fill, fill.target);
        const look = this.env.look;
        this.scene.fog = new THREE.FogExp2(look.fog[0], look.fog[1]);
        this.renderer.toneMappingExposure = look.exposure;

        // Image-based lighting from the sky dome (PBR reflections / ambient).
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const skyScene = new THREE.Scene();
        skyScene.add(this.env.sky.clone());
        this.envMap = pmrem.fromScene(skyScene, 0.02).texture;
        this.scene.environment = this.envMap;
        pmrem.dispose();

        this.monsters = {
            player: this.placeMonster(opts.playerMonster, 'player', ARENA.player, ARENA.enemy),
            enemy: this.placeMonster(enemyDef, 'enemy', ARENA.enemy, ARENA.player)
        };
        this.monsters.player.root.visible = false;
        this.monsters.enemy.root.visible = false;

        this.buildComposer();
        this.onResize = () => requestAnimationFrame(() => this.resize());
        window.addEventListener('resize', this.onResize);
        const phaserCanvas = this.container.querySelector('canvas:not(.mm-stage3d):not(.mm-world3d)');
        if (phaserCanvas && window.ResizeObserver) {
            this.observer = new ResizeObserver(this.onResize);
            this.observer.observe(phaserCanvas);
        }
        this.resize();

        this.fps = { frames: 0, time: 0, warmup: 3 };
        this.running = true;
        this.last = performance.now();
        this.loop = this.loop.bind(this);
        this.raf = requestAnimationFrame(this.loop);
    }

    setTier(tier) {
        this.tier = tier;
        const post = this.stageCfg.postFx[tier];
        this.quality = { tier, ...post };
        this.particleScale = this.stageCfg.particleScale[tier];
    }

    placeMonster(def, side, home, opponentHome) {
        const m = createMonster(this, def.key, def, side);
        const pos = home.clone();
        if (def.key === 'kraken') {
            if (this.env.water) {
                pos.y = -1.4;
            } else {
                pos.y = this.env.groundY(home) - 1.2;
                this.addPool(home);
            }
        } else if (this.env.water) {
            pos.y = this.env.addPlatform(home);
        } else {
            pos.y = this.env.groundY(home);
        }
        m.root.position.copy(pos);
        m.root.rotation.y = Math.atan2(opponentHome.x - home.x, opponentHome.z - home.z);
        m.home = pos.clone();
        this.scene.add(m.root);
        if (def.model) this.loadModelOverride(m, def.model);
        return m;
    }

    /** A kraken outside the ocean brings its own pool of dark water. */
    addPool(home) {
        const pool = new THREE.Mesh(new THREE.CircleGeometry(7.5, 64),
            new THREE.MeshPhysicalMaterial({ color: '#0a2c45', roughness: 0.05, clearcoat: 1, envMapIntensity: 1.4 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(home.x, this.env.groundY(home) + 0.08, home.z);
        pool.receiveShadow = true;
        this.scene.add(pool);
        const foam = new THREE.Mesh(new THREE.RingGeometry(7.2, 7.9, 64), new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.6 }));
        foam.rotation.x = -Math.PI / 2;
        foam.position.copy(pool.position).add(new THREE.Vector3(0, 0.02, 0));
        this.scene.add(foam);
    }

    /**
     * Optional: swap a procedural rig for a rigged .glb (see README → 3D assets).
     * Clips are matched by name: idle, attack, hit, death. Untested with real
     * assets in this repo — procedural rigs are the default.
     */
    loadModelOverride(monster, url) {
        new GLTFLoader().load(url, (gltf) => {
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            model.scale.setScalar(7 / Math.max(size.y, 0.001));
            model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            monster.rig.children.forEach((c) => { c.visible = false; });
            monster.rig.add(model);
            const mixer = new THREE.AnimationMixer(model);
            const find = (re) => gltf.animations.find((c) => re.test(c.name));
            const clips = { idle: find(/idle/i), attack: find(/attack|bite|punch|slash/i), hit: find(/hit|damage/i), defeat: find(/death|die/i) };
            let current = clips.idle ? mixer.clipAction(clips.idle).play() : null;
            monster.mixer = mixer;
            const basePlay = monster.play.bind(monster);
            monster.play = (name, o) => {
                const key = name === 'defeat' ? 'defeat' : name === 'hit' ? 'hit' : ['attack', 'skill1', 'skill2', 'ultimate'].includes(name) ? 'attack' : null;
                if (key && clips[key]) {
                    const next = mixer.clipAction(clips[key]);
                    next.reset().setLoop(key === 'defeat' ? THREE.LoopOnce : THREE.LoopOnce, 1);
                    next.clampWhenFinished = key === 'defeat';
                    next.play();
                    if (current) next.crossFadeFrom(current, 0.2, false);
                }
                return basePlay(name, o);
            };
        }, undefined, (err) => console.warn('[MathMon] Could not load model override', url, err));
    }

    // ---- Rendering pipeline ---------------------------------------------------------------
    buildComposer() {
        if (this.composer) this.composer.dispose();
        const q = this.quality;
        const r = this.renderer;
        const pr = Math.min(window.devicePixelRatio || 1, this.stageCfg.maxPixelRatio[q.tier]);
        r.setPixelRatio(pr);
        r.shadowMap.enabled = Boolean(q.shadows);
        this.env.sun.castShadow = Boolean(q.shadows);
        if (q.shadows) {
            this.env.sun.shadow.mapSize.set(q.shadows, q.shadows);
            if (this.env.sun.shadow.map) { this.env.sun.shadow.map.dispose(); this.env.sun.shadow.map = null; }
        }
        const w = Math.max(2, this.width || 800), h = Math.max(2, this.height || 600);
        const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: q.tier === 'high' ? 4 : 0 });
        const composer = new EffectComposer(r, target);
        composer.setPixelRatio(pr);
        composer.setSize(w, h);
        const look = this.env.look;
        if (q.ssao) {
            const ssao = new SSAOPass(this.scene, this.camera, w, h);
            ssao.kernelRadius = 0.6;
            ssao.minDistance = 0.0006;
            ssao.maxDistance = 0.02;
            composer.addPass(ssao);
        } else {
            composer.addPass(new RenderPass(this.scene, this.camera));
        }
        if (q.bloom) {
            composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), look.bloom.strength, look.bloom.radius, look.bloom.threshold));
        }
        this.godPass = null;
        if (q.godRays && look.godRays.strength > 0) {
            this.godPass = new ShaderPass(GodRaysShader);
            this.godPass.uniforms.uColor.value.set(look.godRays.color);
            composer.addPass(this.godPass);
        }
        this.bokeh = null;
        if (q.dof) {
            this.bokeh = new BokehPass(this.scene, this.camera, { focus: 30, aperture: 0.00008, maxblur: 0.005 });
            composer.addPass(this.bokeh);
        }
        composer.addPass(new OutputPass());
        this.grade = new ShaderPass(GradeShader);
        const g = look.grade;
        this.grade.uniforms.uLift.value.set(...g.lift);
        this.grade.uniforms.uGamma.value.set(...g.gamma);
        this.grade.uniforms.uGain.value.set(...g.gain);
        this.grade.uniforms.uSat.value = g.saturation;
        this.grade.uniforms.uContrast.value = g.contrast;
        this.grade.uniforms.uVignette.value = g.vignette;
        this.grade.uniforms.uHaze.value = look.haze || 0;
        composer.addPass(this.grade);
        this.composer = composer;
    }

    /** Glue the WebGL canvas exactly over the (FIT-scaled) Phaser canvas. */
    resize() {
        const phaserCanvas = this.container.querySelector('canvas:not(.mm-stage3d):not(.mm-world3d)');
        if (!phaserCanvas) return;
        const c = phaserCanvas.getBoundingClientRect();
        const p = this.container.getBoundingClientRect();
        Object.assign(this.canvas.style, { left: `${c.left - p.left}px`, top: `${c.top - p.top}px`, width: `${c.width}px`, height: `${c.height}px` });
        this.width = Math.round(c.width);
        this.height = Math.round(c.height);
        this.renderer.setSize(this.width, this.height, false);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        if (this.composer) this.composer.setSize(this.width, this.height);
        if (this.grade) this.grade.uniforms.uAspect.value = this.camera.aspect;
    }

    pointScale() {
        return (this.renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    }

    groundY(pos) {
        return this.env.groundY(pos);
    }

    // ---- Frame loop ------------------------------------------------------------------------------
    loop(now) {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this.loop);
        const realDt = Math.min(this.stageCfg.maxFrameDt || 0.05, (now - this.last) / 1000);
        this.last = now;
        if (this.slowUntil && now >= this.slowUntil) { this.timeScale = 1; this.slowUntil = 0; }
        const dt = realDt * this.timeScale;
        this.time += dt;

        this.tweens.update(dt);
        this.env.update(dt, this.time);
        this.monsters.player.update(dt);
        this.monsters.enemy.update(dt);
        if (this.monsters.player.mixer) this.monsters.player.mixer.update(dt);
        if (this.monsters.enemy.mixer) this.monsters.enemy.mixer.update(dt);
        this.vfx.update(dt);
        this.updateCamera(realDt);
        this.updatePost(realDt);
        this.composer.render(realDt);
        this.governFrameRate(realDt);
    }

    updateCamera(dt) {
        this.trauma = Math.max(0, this.trauma - dt * 1.4);
        const s = this.trauma * this.trauma;
        const t = this.time * 30;
        const off = new THREE.Vector3(Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5, Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.4, Math.sin(t * 1.3 + 2)).multiplyScalar(0.7 * s);
        this.camera.position.copy(this.cam.pos).add(off);
        this.camera.lookAt(this.cam.target.clone().addScaledVector(off, 0.4));
        // gentle handheld drift for life
        this.camera.position.x += Math.sin(this.time * 0.25) * 0.25;
        this.camera.position.y += Math.sin(this.time * 0.31) * 0.12;
    }

    updatePost(dt) {
        const g = this.grade.uniforms;
        g.uTime.value = this.time;
        this.flashColor.multiplyScalar(Math.max(0, 1 - dt * 4));
        g.uFlash.value.copy(this.flashColor);
        this.chroma = Math.max(0, this.chroma - dt * 0.02);
        g.uChroma.value = this.chroma;
        if (this.godPass) {
            const sunPos = this.camera.position.clone().addScaledVector(this.env.sunDir, 400);
            const ndc = sunPos.project(this.camera);
            const facing = this.camera.getWorldDirection(new THREE.Vector3()).dot(this.env.sunDir);
            const onScreen = 1 - clamp((Math.max(Math.abs(ndc.x), Math.abs(ndc.y)) - 1) / 0.8, 0, 1);
            this.godPass.uniforms.uLight.value.set((ndc.x + 1) / 2, (ndc.y + 1) / 2);
            this.godPass.uniforms.uStrength.value = facing > 0 ? this.env.look.godRays.strength * onScreen : 0;
        }
        if (this.bokeh) {
            this.bokeh.uniforms.focus.value = this.camera.position.distanceTo(this.monsters.enemy.root.position);
        }
    }

    /** Drop one quality tier if the frame rate stays low (never upgrades mid-battle). */
    governFrameRate(dt) {
        if (!this.stageCfg.autoDowngrade) return;
        if (this.fps.warmup > 0) { this.fps.warmup -= dt; return; }
        this.fps.frames++;
        this.fps.time += dt;
        if (this.fps.time < 2.5) return;
        const fps = this.fps.frames / this.fps.time;
        this.fps.frames = 0;
        this.fps.time = 0;
        const idx = TIERS.indexOf(this.tier);
        if (fps < this.stageCfg.minFps && idx < TIERS.length - 1) {
            this.setTier(TIERS[idx + 1]);
            saveTier(this.tier);
            console.info(`[MathMon] 3D quality lowered to "${this.tier}" (${fps.toFixed(0)} fps)`);
            this.buildComposer();
            this.resize();
            this.fps.warmup = 2;
        }
    }

    // ---- Camera / screen helpers ----------------------------------------------------------------
    moveCamera(pos, target, duration, ease) {
        const p0 = this.cam.pos.clone(), t0 = this.cam.target.clone();
        return new Promise((resolve) => this.tweens.add({
            duration, ease: ease || Ease.inOutCubic,
            onUpdate: (k) => { this.cam.pos.lerpVectors(p0, pos, k); this.cam.target.lerpVectors(t0, target, k); },
            onComplete: resolve
        }));
    }

    resetCamera(duration) {
        return this.moveCamera(this.camDefault.pos, this.camDefault.target, duration || 0.8);
    }

    shake(intensity) {
        this.trauma = Math.min(1, this.trauma + (intensity || 0.5) * 0.55);
    }

    flash(color, intensity) {
        const c = new THREE.Color(color);
        this.flashColor.set(c.r * intensity, c.g * intensity, c.b * intensity);
    }

    /** Slow motion for `realMs` of wall-clock time. */
    slowMotion(scale, realMs) {
        this.timeScale = scale;
        this.slowUntil = performance.now() + realMs;
    }

    chest(side) {
        const m = this.monsters[side];
        const head = m.worldAnchor('head');
        return m.root.position.clone().lerp(head, 0.55);
    }

    // ---- Battle API (mirrors MathMonStage2D) ------------------------------------------------------
    async introduce() {
        const { player, enemy } = this.monsters;
        // Sweeping establishing shot over the enemy, then settle behind the player.
        this.cam.pos.set(enemy.home.x + 22, 16, enemy.home.z + 10);
        this.cam.target.copy(enemy.home).add(new THREE.Vector3(0, 4, 0));
        enemy.root.visible = true;
        const camMove = this.moveCamera(new THREE.Vector3(14, 7, 12), enemy.home.clone().add(new THREE.Vector3(0, 4, 0)), 1.9, Ease.inOutSine);
        await enemy.play('intro', { target: this.chest('player') });
        await camMove;
        this.resetCamera(1.1);
        player.root.visible = true;
        player.root.scale.setScalar(0.01);
        this.vfx.burst(player.element, this.chest('player'), 1.2);
        this.tweens.add({ duration: 0.55, ease: Ease.outBack, onUpdate: (k) => player.root.scale.setScalar(Math.max(0.01, k)) });
        await this.tweens.wait(0.5);
        await enemy.play('roar', { target: this.chest('player') });
    }

    async playerAction(action, opts) {
        const me = this.monsters.player;
        const foe = this.monsters.enemy;
        const target = this.chest('enemy');
        const k = this.cfg.vfx.intensity[action.key] || 1;
        const anim = ACTION_ANIM[action.key] || 'attack';
        const element = this.cfg.elements[me.element] || {};

        if (action.key === 'ultimate') {
            // 1) dramatic low-angle close-up on the caster + charge
            const casterPos = me.root.position.clone();
            const side = new THREE.Vector3().subVectors(foe.root.position, casterPos).cross(new THREE.Vector3(0, 1, 0)).normalize();
            await this.moveCamera(casterPos.clone().addScaledVector(side, -9).add(new THREE.Vector3(0, 2.2, 6)), casterPos.clone().add(new THREE.Vector3(0, 4.5, 0)), 0.8);
            this.vfx.chargeAura(this.chest('player'), me.element, 1.0, 1.6);
            this.tweens.add({ duration: 1.0, ease: Ease.linear, onUpdate: (kk) => {
                this.cam.pos.addScaledVector(side, -0.03);   // slow orbit during the charge
                this.chroma = 0.004 * kk;
            } });
            await this.tweens.wait(1.0);
            // 2) wide action view while the ultimate plays; slow-mo + flash on impact
            this.moveCamera(new THREE.Vector3(12, 12, 30), new THREE.Vector3(1, 4, -4), 1.0, Ease.inOutSine);
            await me.play('ultimate', {
                target, opponent: foe, k: 2,
                onImpact: () => {
                    this.slowMotion(this.cfg.vfx.slowMotionScale, 650);
                    this.flash(element.color || '#ffffff', 0.85);
                    this.chroma = 0.012;
                    this.shake(1);
                    this.moveCamera(foe.root.position.clone().add(new THREE.Vector3(-8, 5, 12)), this.chest('enemy'), 0.5, Ease.outCubic);
                    opts.onImpact();
                }
            });
            await this.resetCamera(0.9);
            return;
        }

        // Normal / skills: a subtle push-in toward the exchange.
        const mid = me.root.position.clone().lerp(foe.root.position, 0.5);
        this.moveCamera(this.camDefault.pos.clone().lerp(mid, 0.12).add(new THREE.Vector3(0, -0.4, 0)), this.camDefault.target.clone().lerp(foe.root.position, 0.15), 0.6);
        await me.play(anim, { target, opponent: foe, k, onImpact: () => { if (action.key !== 'normal') this.flash(element.color, 0.18); opts.onImpact(); } });
        await this.resetCamera(0.6);
    }

    async enemyAttack(opts) {
        const foe = this.monsters.enemy;
        const anim = Math.random() < 0.6 ? 'attack' : 'skill1';
        await foe.play(anim, { target: this.chest('player'), opponent: this.monsters.player, k: 0.8, onImpact: opts.onImpact });
    }

    hit(side, strength) {
        this.monsters[side].play('hit');
        if (strength >= 1.5) this.shake(0.35 * strength);
    }

    popup(side, text, opts) {
        if (!this.hud) return;
        const head = this.monsters[side].worldAnchor('head').add(new THREE.Vector3(0, 1.5, 0));
        const ndc = head.project(this.camera);
        this.hud.popupAt(clamp((ndc.x + 1) / 2, 0.08, 0.92), clamp((1 - ndc.y) / 2, 0.18, 0.7), String(text), opts);
    }

    statusFx(side, type) {
        const chest = this.chest(side);
        if (type === 'burn') this.vfx.burnTick(chest);
        if (type === 'stun') this.vfx.stunStars(this.monsters[side].worldAnchor('head').add(new THREE.Vector3(0, 1.2, 0)));
        if (type === 'heal') this.vfx.heal(chest);
    }

    faint(side) {
        return this.monsters[side].play('defeat');
    }

    destroy() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this.onResize);
        if (this.observer) this.observer.disconnect();
        this.tweens.clear();
        this.vfx.dispose();
        disposeTree(this.scene);
        if (this.envMap) this.envMap.dispose();
        if (this.composer) this.composer.dispose();
        this.renderer.renderLists.dispose();
        this.canvas.style.display = 'none';
        this.canvas.style.opacity = '';
    }
}

window.MathMonStage3D = {
    isSupported,
    /** @returns {Stage3D} throws if the stage cannot be built (caller falls back to 2D). */
    create(opts) { return new Stage3D(opts); }
};
window.dispatchEvent(new Event('mathmon-stage3d-ready'));
