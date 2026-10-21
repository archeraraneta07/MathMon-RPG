/**
 * MathMon battle VFX — element skill effects, damage popups and the
 * pseudo-3D arena backdrop, all drawn with Phaser shapes / canvas textures.
 *
 * The game runs on Phaser's Canvas renderer (tints and gradient fills are
 * WebGL-only), so every effect here uses filled shapes with explicit colors
 * and ADD blending, which work in both renderers.
 */
const MathMonBattleVfx = (function createBattleVfx() {
    'use strict';

    const DEPTH = 50;
    const FONT = '"Atkinson Hyperlegible", sans-serif';

    function hex(color) {
        return Phaser.Display.Color.HexStringToColor(color).color;
    }

    function rand(min, max) {
        return Phaser.Math.FloatBetween(min, max);
    }

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function fadeOut(scene, target, props) {
        scene.tweens.add({ ...props, targets: target, onComplete: () => target.destroy() });
    }

    // ---- Arena backdrop (fake perspective floor drawn once into a canvas texture)
    const THEMES = {
        grass: { sky: ['#4aa3e0', '#c4ecff'], floor: ['#7cc47a', '#2b6e33'], far: '#3d8a4c', grid: 'rgba(255,255,255,0.10)' },
        cave:  { sky: ['#140c33', '#3b2878'], floor: ['#4a3a8c', '#160f36'], far: '#251a52', grid: 'rgba(160,220,255,0.12)' },
        water: { sky: ['#3fb5ef', '#e3f6ff'], floor: ['#efd79c', '#b88f4f'], far: '#1e7fd6', grid: 'rgba(120,80,30,0.12)' }
    };

    function createArena(scene, theme) {
        const w = scene.cameras.main.width;
        const h = scene.cameras.main.height;
        const key = `arena_${theme}_${w}x${h}`;
        if (!scene.textures.exists(key)) {
            const t = THEMES[theme] || THEMES.grass;
            const tex = scene.textures.createCanvas(key, w, h);
            const ctx = tex.getContext();
            const horizon = h * 0.36;

            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            sky.addColorStop(0, t.sky[0]);
            sky.addColorStop(1, t.sky[1]);
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, w, horizon);

            // distant silhouette band (hills / crystals / sea)
            ctx.fillStyle = t.far;
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            for (let x = 0; x <= w; x += 40) {
                const peak = theme === 'water' ? 6 : theme === 'cave' ? (x / 40) % 2 ? 46 : 18 : 26 + Math.sin(x * 0.012) * 18;
                ctx.lineTo(x, horizon - peak);
            }
            ctx.lineTo(w, horizon);
            ctx.closePath();
            ctx.fill();

            const floor = ctx.createLinearGradient(0, horizon, 0, h);
            floor.addColorStop(0, t.floor[0]);
            floor.addColorStop(1, t.floor[1]);
            ctx.fillStyle = floor;
            ctx.fillRect(0, horizon, w, h - horizon);

            // perspective grid converging on a vanishing point
            ctx.strokeStyle = t.grid;
            ctx.lineWidth = 1.5;
            const vx = w / 2;
            for (let i = -12; i <= 12; i++) {
                ctx.beginPath();
                ctx.moveTo(vx + i * 14, horizon);
                ctx.lineTo(vx + i * 150, h);
                ctx.stroke();
            }
            for (let d = 1; d < 9; d++) {
                const y = horizon + (h - horizon) * Math.pow(d / 9, 1.8);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // vignette for depth
            const vignette = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.5, h * 0.95);
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, w, h);
            tex.refresh();
        }
        // Oversized so ultimate camera zoom/pan never reveals the edges.
        return scene.add.image(w / 2, h / 2, key).setDepth(0).setScale(1.5);
    }

    /** A raised "3D" disc the monster stands on, glowing in its element color. */
    function createPlatform(scene, x, y, width, element) {
        const color = hex(element.color);
        const dark = hex(element.dark);
        const group = [];
        group.push(scene.add.ellipse(x, y + 9, width, width * 0.28, 0x000000, 0.35).setDepth(1));
        group.push(scene.add.ellipse(x, y + 5, width, width * 0.28, dark, 1).setDepth(1));
        group.push(scene.add.ellipse(x, y, width, width * 0.28, color, 0.55).setDepth(1));
        group.push(scene.add.ellipse(x, y, width * 0.72, width * 0.18, 0xffffff, 0.12).setDepth(1));
        const glow = scene.add.ellipse(x, y, width * 1.1, width * 0.32).setStrokeStyle(2, color, 0.8).setDepth(1);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: glow, scaleX: 1.08, scaleY: 1.08, alpha: 0.3, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        group.push(glow);
        return group;
    }

    // ---- Damage / text popups ----------------------------------------------
    /**
     * @param {object} opts { matchup: 'strong'|'weak'|'neutral', crit, heal, text, color }
     */
    function popup(scene, x, y, value, opts) {
        const o = opts || {};
        let size = 34;
        let color = '#ffffff';
        let alpha = 1;
        let punch = 1.15;
        if (o.heal) { color = '#6bff9b'; size = 30; }
        else if (o.matchup === 'strong') { color = '#ffc046'; size = 48; punch = 1.45; }
        else if (o.matchup === 'weak') { color = '#9aa4b2'; size = 24; alpha = 0.8; punch = 1; }
        if (o.color) color = o.color;
        if (o.crit) size += 6;
        const label = o.text || `${o.heal ? '+' : '-'}${value}`;
        const text = scene.add.text(x + rand(-14, 14), y, label, {
            fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color,
            stroke: '#0b0f1a', strokeThickness: Math.round(size / 6)
        }).setOrigin(0.5).setDepth(DEPTH + 10).setAlpha(alpha).setScale(0.2);
        scene.tweens.add({ targets: text, scale: punch, duration: 160, ease: 'Back.easeOut',
            onComplete: () => scene.tweens.add({ targets: text, scale: 1, duration: 120 }) });
        fadeOut(scene, text, { y: y - 70, alpha: 0, delay: 650, duration: 600, ease: 'Cubic.easeIn' });
        if (o.crit) {
            const crit = scene.add.text(text.x, y - size * 0.75, 'CRITICAL!', {
                fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ff5252', stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(DEPTH + 10);
            fadeOut(scene, crit, { y: y - 90, alpha: 0, delay: 600, duration: 600 });
        }
        return text;
    }

    // ---- Generic building blocks --------------------------------------------
    function flashCore(scene, x, y, color, radius) {
        const core = scene.add.circle(x, y, 10, hex(color), 0.9).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
        fadeOut(scene, core, { radius, alpha: 0, duration: 380, ease: 'Cubic.easeOut' });
    }

    function ring(scene, x, y, color, radius, duration) {
        const r = scene.add.circle(x, y, 8).setStrokeStyle(4, hex(color), 0.9).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
        fadeOut(scene, r, { radius, alpha: 0, duration: duration || 420, ease: 'Cubic.easeOut' });
    }

    function sparks(scene, x, y, colors, count, spread) {
        for (let i = 0; i < count; i++) {
            const angle = rand(0, Math.PI * 2);
            const dist = rand(spread * 0.4, spread);
            const p = scene.add.circle(x, y, rand(2, 4), hex(pick(colors)), 1).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
            fadeOut(scene, p, { x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, alpha: 0, scale: 0.2, duration: rand(320, 520), ease: 'Cubic.easeOut' });
        }
    }

    // ---- Element effects -----------------------------------------------------
    function fireBurst(scene, x, y, k) {
        const colors = ['#ff3d00', '#ff6b35', '#ffd166', '#ffab40'];
        flashCore(scene, x, y, '#ffd166', 50 * k);
        for (let i = 0; i < Math.round(16 * k); i++) {
            const fx = x + rand(-45, 45) * Math.min(k, 1.6);
            const fy = y + rand(0, 40);
            const w = rand(10, 18) * Math.min(k, 1.8);
            const flame = scene.add.triangle(fx, fy, 0, w * 1.8, w / 2, 0, w, w * 1.8, hex(pick(colors)), 0.95)
                .setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
            fadeOut(scene, flame, { y: fy - rand(50, 110) * Math.min(k, 1.6), scaleX: 0.2, alpha: 0, delay: rand(0, 180), duration: rand(450, 750), ease: 'Sine.easeOut' });
        }
        for (let i = 0; i < Math.round(12 * k); i++) {
            const ember = scene.add.circle(x + rand(-50, 50), y + rand(-10, 40), rand(1.5, 3), hex('#ffcc80'), 1)
                .setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
            fadeOut(scene, ember, { x: ember.x + rand(-30, 30), y: ember.y - rand(80, 160), alpha: 0, delay: rand(100, 400), duration: rand(800, 1300), ease: 'Sine.easeOut' });
        }
    }

    function waterBurst(scene, x, y, k) {
        const colors = ['#42a5f5', '#81d4fa', '#e1f5fe', '#1e88e5'];
        // sweeping wave of droplets
        const span = 150 * Math.min(k, 1.8);
        for (let i = 0; i <= 14; i++) {
            const t = i / 14;
            const drop = scene.add.circle(x - span / 2 + t * span, y + 40 - Math.sin(t * Math.PI) * 70 * Math.min(k, 1.6), rand(5, 9) * Math.min(k, 1.5), hex(pick(colors)), 0.9)
                .setDepth(DEPTH).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: drop, alpha: 0.95, delay: i * 22, duration: 80,
                onComplete: () => fadeOut(scene, drop, { y: drop.y + 40, alpha: 0, scale: 0.4, duration: 420, ease: 'Quad.easeIn' }) });
        }
        // splashes with gravity
        for (let i = 0; i < Math.round(14 * k); i++) {
            const drop = scene.add.circle(x, y + 10, rand(2.5, 5), hex(pick(colors)), 1).setDepth(DEPTH);
            const vx = rand(-120, 120);
            const vy = rand(-220, -120);
            scene.tweens.addCounter({
                from: 0, to: 1, delay: 180, duration: rand(600, 850),
                onUpdate: (tw) => {
                    const t = tw.getValue();
                    drop.x = x + vx * t;
                    drop.y = y + 10 + vy * t + 380 * t * t;
                    drop.alpha = 1 - t;
                },
                onComplete: () => drop.destroy()
            });
        }
        for (let i = 0; i < 3; i++) {
            const ripple = scene.add.ellipse(x, y + 45, 30, 9).setStrokeStyle(3, hex('#b3e5fc'), 0.9).setDepth(DEPTH - 1);
            fadeOut(scene, ripple, { scaleX: 4 * Math.min(k, 1.6), scaleY: 4 * Math.min(k, 1.6), alpha: 0, delay: 200 + i * 140, duration: 600 });
        }
    }

    function windBurst(scene, x, y, k) {
        const colors = ['#c8fff1', '#2ec4a6', '#ffffff'];
        const slashes = Math.round(3 + 3 * k);
        for (let i = 0; i < slashes; i++) {
            const len = rand(110, 170) * Math.min(k, 1.6);
            const slash = scene.add.rectangle(x + rand(-20, 20), y + rand(-20, 20), len, rand(3, 6), hex(pick(colors)), 1)
                .setDepth(DEPTH).setAngle(rand(-60, 60)).setScale(0, 1).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: slash, scaleX: 1, delay: i * 70, duration: 110, ease: 'Expo.easeOut',
                onComplete: () => fadeOut(scene, slash, { alpha: 0, scaleY: 0.1, duration: 260 }) });
        }
        for (let i = 0; i < Math.round(2 + k); i++) {
            const swirl = scene.add.graphics({ x, y }).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
            swirl.lineStyle(3, hex(pick(colors)), 0.9);
            swirl.beginPath();
            swirl.arc(0, 0, 26 + i * 12, 0, Math.PI * 1.3);
            swirl.strokePath();
            swirl.setScale(0.4);
            fadeOut(scene, swirl, { angle: 540, scale: 1.4 * Math.min(k, 1.8), alpha: 0, delay: i * 90, duration: 700, ease: 'Cubic.easeOut' });
        }
        sparks(scene, x, y, colors, Math.round(8 * k), 90);
    }

    function earthBurst(scene, x, y, k) {
        const colors = ['#8d6e63', '#c8963e', '#6d4c41', '#a1887f'];
        const rocks = Math.round(5 * k);
        for (let i = 0; i < rocks; i++) {
            const size = rand(9, 17) * Math.min(k, 1.5);
            const points = [];
            const sides = Phaser.Math.Between(5, 7);
            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2;
                const r = size * rand(0.7, 1.1);
                points.push(Math.cos(a) * r + size, Math.sin(a) * r + size);
            }
            const tx = x + rand(-50, 50);
            const ty = y + rand(-10, 35);
            const rock = scene.add.polygon(tx, ty - 260, points, hex(pick(colors)), 1).setStrokeStyle(2, 0x3e2723).setDepth(DEPTH);
            scene.tweens.add({
                targets: rock, y: ty, angle: rand(-180, 180), delay: i * 70, duration: 330, ease: 'Quad.easeIn',
                onComplete: () => {
                    sparks(scene, tx, ty, ['#d7ccc8', '#bcaaa4'], 5, 40);
                    fadeOut(scene, rock, { alpha: 0, scale: 0.6, y: ty + 10, duration: 400, delay: 150 });
                }
            });
        }
        const delay = rocks * 70 + 250;
        for (let i = 0; i < 2; i++) {
            const wave = scene.add.ellipse(x, y + 48, 40, 12).setStrokeStyle(5, hex('#ffe08a'), 0.9).setDepth(DEPTH - 1);
            wave.setAlpha(0);
            scene.tweens.add({ targets: wave, alpha: 1, delay: delay + i * 120, duration: 40,
                onComplete: () => fadeOut(scene, wave, { scaleX: 5 * Math.min(k, 1.8), scaleY: 4 * Math.min(k, 1.8), alpha: 0, duration: 520, ease: 'Cubic.easeOut' }) });
        }
        if (k >= 1.5) scene.time.delayedCall(delay, () => scene.cameras.main.shake(220, 0.006 * k));
    }

    const BURSTS = { fire: fireBurst, water: waterBurst, wind: windBurst, earth: earthBurst };

    /** Element skill effect at a target; intensity scales count / size. */
    function elementBurst(scene, elementKey, x, y, intensity) {
        (BURSTS[elementKey] || fireBurst)(scene, x, y, intensity || 1);
    }

    /** Small physical hit spark used by normal attacks. */
    function impact(scene, x, y, color) {
        flashCore(scene, x, y, '#ffffff', 34);
        ring(scene, x, y, color, 56, 320);
        sparks(scene, x, y, ['#ffffff', color], 10, 70);
    }

    /** Glowing orb that travels from → to with a trail, then calls onImpact. */
    function projectile(scene, element, from, to, onImpact, size) {
        const color = hex(element.color);
        const r = size || 12;
        const glow = scene.add.circle(from.x, from.y, r * 1.9, color, 0.35).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
        const orb = scene.add.circle(from.x, from.y, r, hex(element.accent), 1).setDepth(DEPTH + 1);
        const trail = scene.time.addEvent({
            delay: 25, loop: true,
            callback: () => {
                const dot = scene.add.circle(orb.x, orb.y, r * 0.7, color, 0.7).setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
                fadeOut(scene, dot, { scale: 0.1, alpha: 0, duration: 260 });
            }
        });
        scene.tweens.add({
            targets: [orb, glow], x: to.x, y: to.y, duration: 340, ease: 'Quad.easeIn',
            onComplete: () => {
                trail.remove();
                orb.destroy();
                glow.destroy();
                if (onImpact) onImpact();
            }
        });
    }

    /** Converging energy rings + light pillar for an ultimate wind-up. */
    function chargeAura(scene, element, x, y, duration) {
        const color = hex(element.color);
        const pillar = scene.add.rectangle(x, y, 70, 600, color, 0).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: pillar, fillAlpha: 0.35, scaleX: 1.6, duration: duration * 0.6, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => pillar.destroy() });
        for (let i = 0; i < 5; i++) {
            const c = scene.add.circle(x, y, 140).setStrokeStyle(4, i % 2 ? hex(element.accent) : color, 0.9).setDepth(DEPTH).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: c, alpha: 1, delay: i * (duration / 6), duration: 60,
                onComplete: () => fadeOut(scene, c, { radius: 10, alpha: 0, duration: duration / 3, ease: 'Cubic.easeIn' }) });
        }
        for (let i = 0; i < 18; i++) {
            const angle = rand(0, Math.PI * 2);
            const p = scene.add.circle(x + Math.cos(angle) * 160, y + Math.sin(angle) * 160, rand(2, 4), hex(element.accent), 1)
                .setDepth(DEPTH).setBlendMode(Phaser.BlendModes.ADD);
            fadeOut(scene, p, { x, y, alpha: 0.2, delay: rand(0, duration * 0.5), duration: duration * 0.45, ease: 'Cubic.easeIn' });
        }
    }

    return { createArena, createPlatform, popup, elementBurst, impact, projectile, chargeAura, ring };
})();
