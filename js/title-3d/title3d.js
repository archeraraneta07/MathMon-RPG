/**
 * MathMon 3D title backdrop (ES module).
 *
 * The four boss monsters — Pyrovex, Kraken, Typhoeus and Seismodon — stand on
 * the storm-peak summit at sunset while a slow cinematic camera drifts across
 * them and they take turns to roar. Reuses the battle engine's environment,
 * monster rigs and VFX, so the cover always matches the game.
 *
 * Renders under the transparent Phaser canvas; the logo and menu are DOM
 * (js/title-screen.js). Exposes window.MathMonTitle3D = { isSupported, mount }.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Tweens, detectTier, prefersReducedMotion, disposeTree } from '../battle-3d/core.js';
import { buildEnvironment } from '../battle-3d/environments.js';
import { createMonster } from '../battle-3d/monsters.js';
import { VFX } from '../battle-3d/vfx.js';

/* global MathMonBattleConfig */
const BATTLE = MathMonBattleConfig;

// Line-up (meters): Seismodon anchors the back, the others frame it.
// Kept out of the bottom-center where the menu sits.
const LINEUP = [
    { key: 'titan', pos: [0, -9], yaw: 0, scale: 1.3 },
    { key: 'dragon', pos: [-11, -4], yaw: 0.5, scale: 1.05 },
    { key: 'typhoeus', pos: [11, -5], yaw: -0.5, scale: 1 },
    { key: 'kraken', pos: [-6.5, -11], yaw: 0.3, scale: 0.75 }
];

function isSupported() {
    try {
        return Boolean(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

class TitleStage {
    constructor(container) {
        this.container = container;
        const tier = detectTier(BATTLE.stage3d.quality);
        this.quality = { tier, shadows: tier === 'low' ? 0 : 1024 };
        this.particleScale = BATTLE.stage3d.particleScale[tier];
        this.reduced = prefersReducedMotion();

        this.renderer = new THREE.WebGLRenderer({ antialias: tier === 'high', powerPreference: 'high-performance' });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = Boolean(this.quality.shadows);
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.canvas = this.renderer.domElement;
        this.canvas.className = 'mm-title3d';
        this.canvas.setAttribute('aria-hidden', 'true');
        container.prepend(this.canvas);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.3, 1400);
        this.tweens = new Tweens();
        this.sound = null;                 // the title is silent apart from the menu music
        this.time = 0;

        this.env = buildEnvironment('peak', this);
        this.scene.add(this.env.group);
        this.scene.fog = new THREE.FogExp2(this.env.look.fog[0], this.env.look.fog[1] * 0.45);   // clearer than in battle
        this.renderer.toneMappingExposure = 1.05;
        const fill = new THREE.DirectionalLight('#ffe2c4', 1.3);
        fill.position.set(6, 10, 30);
        this.scene.add(fill);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const skyScene = new THREE.Scene();
        skyScene.add(this.env.sky.clone());
        this.envMap = pmrem.fromScene(skyScene, 0.02).texture;
        this.scene.environment = this.envMap;
        pmrem.dispose();

        this.vfx = new VFX(this);
        this.monsters = LINEUP.map((m) => {
            const rig = createMonster(this, m.key, BATTLE.monsters[m.key], 'title');
            const pos = new THREE.Vector3(m.pos[0], 0, m.pos[1]);
            pos.y = m.key === 'kraken' ? this.env.groundY(pos) - 1.2 : this.env.groundY(pos);
            rig.root.position.copy(pos);
            rig.root.rotation.y = m.yaw;
            rig.root.scale.setScalar(m.scale);
            this.scene.add(rig.root);
            if (m.key === 'kraken') this.addPool(pos);
            return rig;
        });
        this.nextRoar = 1.5;
        this.roarIndex = 0;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        if (tier !== 'low') this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(800, 600), 0.55, 0.6, 0.85));
        this.composer.addPass(new OutputPass());

        this.onResize = () => requestAnimationFrame(() => this.resize());
        window.addEventListener('resize', this.onResize);
        const pc = this.phaserCanvas();
        if (pc && window.ResizeObserver) {
            this.observer = new ResizeObserver(this.onResize);
            this.observer.observe(pc);
        }
        this.resize();
        this.running = true;
        this.last = performance.now();
        this.loop = this.loop.bind(this);
        this.raf = requestAnimationFrame(this.loop);
        requestAnimationFrame(() => this.canvas.classList.add('is-visible'));   // CSS fade-in
    }

    addPool(pos) {
        const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 48),
            new THREE.MeshPhysicalMaterial({ color: '#0a2c45', roughness: 0.05, clearcoat: 1, envMapIntensity: 1.4 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(pos.x, this.env.groundY(pos) + 0.08, pos.z);
        this.scene.add(pool);
    }

    phaserCanvas() {
        return this.container.querySelector('canvas:not(.mm-title3d):not(.mm-world3d):not(.mm-stage3d)');
    }

    groundY(p) { return this.env.groundY(p); }
    pointScale() { return (this.renderer.domElement.height / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)); }
    shake() { /* no camera shake on the title — keeps the logo readable */ }

    resize() {
        const pc = this.phaserCanvas();
        if (!pc) return;
        const c = pc.getBoundingClientRect();
        const p = this.container.getBoundingClientRect();
        Object.assign(this.canvas.style, { left: `${c.left - p.left}px`, top: `${c.top - p.top}px`, width: `${c.width}px`, height: `${c.height}px` });
        const w = Math.max(2, Math.round(c.width)), h = Math.max(2, Math.round(c.height));
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, BATTLE.stage3d.maxPixelRatio[this.quality.tier]));
        this.renderer.setSize(w, h, false);
        this.composer.setPixelRatio(this.renderer.getPixelRatio());
        this.composer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    loop(now) {
        if (!this.running) return;
        this.raf = requestAnimationFrame(this.loop);
        const dt = Math.min(BATTLE.stage3d.maxFrameDt || 0.05, (now - this.last) / 1000);
        this.last = now;
        this.time += dt;
        this.tweens.update(dt);
        this.env.update(dt, this.time);
        this.monsters.forEach((m) => m.update(dt));
        this.vfx.update(dt);

        // Monsters take turns to roar (idle breathing in between).
        this.nextRoar -= dt;
        if (this.nextRoar <= 0 && !this.reduced) {
            this.nextRoar = 4.5;
            const rig = this.monsters[this.roarIndex++ % this.monsters.length];
            rig.play('roar', { target: new THREE.Vector3(0, 4, 20) });
        }

        // Slow cinematic drift (static under reduced motion).
        const t = this.reduced ? 0 : this.time;
        const a = Math.sin(t * 0.07) * 0.32;
        const r = 27 - Math.sin(t * 0.05) * 2;
        this.camera.position.set(Math.sin(a) * r, 3.2 + Math.sin(t * 0.11) * 0.5, 2 + Math.cos(a) * r);
        this.camera.lookAt(0, 3.4, -6);   // low angle: monsters tower above the menu
        this.composer.render(dt);
    }

    destroy() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this.onResize);
        if (this.observer) this.observer.disconnect();
        this.vfx.dispose();
        disposeTree(this.scene);
        this.envMap.dispose();
        this.composer.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss();   // free the WebGL context; battles/overworld use their own
        this.canvas.remove();
    }
}

window.MathMonTitle3D = {
    isSupported,
    mount(container) { return new TitleStage(container); }
};
window.dispatchEvent(new Event('mathmon-title3d-ready'));
