/**
 * MathMon 2D battle stage (fallback) — Phaser sprites + js/battle-vfx.js.
 *
 * Used when WebGL / ES modules are unavailable (e.g. opening index.html from
 * disk) or when MathMonBattleConfig.stage3d.enabled is false. It implements
 * the same promise-based interface as the 3D stage (js/battle-3d/stage3d.js):
 *
 *   introduce()                          → Promise
 *   playerAction(action, { onImpact })   → Promise  (onImpact fires at the hit frame)
 *   enemyAttack({ onImpact })            → Promise
 *   hit(side, strength) / popup(side, text, opts) / statusFx(side, type)
 *   shake(intensity) / faint(side) → Promise / destroy()
 */
class MathMonStage2D {
    /**
     * @param {Phaser.Scene} scene
     * @param {object} opts { config, playerMonster, enemyMonster, playerElement, enemyElement, theme }
     */
    constructor(scene, opts) {
        this.scene = scene;
        this.cfg = opts.config;
        this.playerElement = opts.playerElement;
        this.enemyElement = opts.enemyElement;
        const cw = scene.cameras.main.width;
        const ch = scene.cameras.main.height;
        this.cw = cw;
        this.ch = ch;

        MathMonBattleVfx.createArena(scene, opts.theme);
        const playerEl = this.cfg.elements[this.playerElement];
        const enemyEl = this.cfg.elements[this.enemyElement];
        this.enemyBaseX = cw * 0.72;
        this.enemyBaseY = ch * 0.40;
        this.playerBaseX = cw * 0.28;
        this.playerBaseY = ch * 0.555;
        MathMonBattleVfx.createPlatform(scene, this.enemyBaseX, this.enemyBaseY + 64, 170, enemyEl);
        MathMonBattleVfx.createPlatform(scene, this.playerBaseX, this.playerBaseY + 74, 200, playerEl);

        const trainer = scene.add.image(cw * 0.1, ch * 0.62, opts.trainerKey).setScale(2.05).setDepth(4);
        scene.tweens.add({ targets: trainer, y: trainer.y - 3, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        // Containers move for attacks/knockback; inner sprites play idle bob +
        // "turntable" breathing for a pseudo-3D feel.
        this.mons = {
            enemy: this.createMon(opts.enemyMonster.sprite2d, this.enemyBaseX + 90, this.enemyBaseY, 2.3, true),
            player: this.createMon(opts.playerMonster.sprite2d, this.playerBaseX, this.playerBaseY, 2.6, false)
        };
        this.mons.enemy.baseX = this.enemyBaseX; // slides in from +90px; rest position is the platform
        this.mons.enemy.container.setAlpha(0).setScale(0.3);
        this.mons.player.container.setAlpha(0).setScale(0.15);
    }

    createMon(textureKey, x, y, scale, isEnemy) {
        const scene = this.scene;
        const shadow = scene.add.ellipse(0, 70, 120, 20, 0x0b0f1a, 0.4);
        const sprite = scene.add.image(0, 0, textureKey).setScale(scale).setFlipX(isEnemy);
        const container = scene.add.container(x, y, [shadow, sprite]).setDepth(isEnemy ? 5 : 6);
        scene.tweens.add({ targets: sprite, y: -8, duration: isEnemy ? 720 : 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: sprite, scaleX: scale * 0.93, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: shadow, scaleX: 0.88, alpha: 0.28, duration: isEnemy ? 720 : 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        return { container, sprite, shadow, baseX: x, baseY: y, isEnemy };
    }

    wait(ms) {
        return new Promise((resolve) => this.scene.time.delayedCall(ms, resolve));
    }

    introduce() {
        const scene = this.scene;
        const playerEl = this.cfg.elements[this.playerElement];
        const ball = scene.add.circle(this.playerBaseX, this.playerBaseY + 60, 17, 0xe8eef2, 1).setStrokeStyle(3, 0x17202a).setDepth(6);
        scene.tweens.add({ targets: ball, y: this.playerBaseY + 40, duration: 260, yoyo: true, ease: 'Sine.easeOut' });
        scene.tweens.add({ targets: ball, scale: 0.1, alpha: 0, duration: 220, delay: 380, ease: 'Back.easeIn', onComplete: () => ball.destroy() });
        scene.tweens.add({ targets: this.mons.enemy.container, x: this.enemyBaseX, alpha: 1, scale: 1, duration: 600, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: this.mons.player.container, alpha: 1, scale: 1, duration: 550, delay: 420, ease: 'Back.easeOut',
            onComplete: () => MathMonBattleVfx.ring(scene, this.playerBaseX, this.playerBaseY, playerEl.color, 90, 450) });
        return this.wait(1200);
    }

    /** Dash toward a target and back; onImpact fires once at the furthest point. */
    lunge(mon, target, fraction, onImpact) {
        const c = mon.container;
        const dx = (target.x - mon.baseX) * fraction;
        const dy = (target.y - mon.baseY) * fraction;
        const depthScale = mon.isEnemy ? 1.18 : 0.9; // toward camera grows, away shrinks
        let impacted = false; // Phaser 3.60 fires onYoyo once per tweened property
        this.scene.tweens.add({
            targets: c, x: mon.baseX + dx, y: mon.baseY + dy, scale: depthScale, angle: mon.isEnemy ? -8 : 8,
            duration: 170, ease: 'Quad.easeIn', yoyo: true, hold: 60,
            onYoyo: () => {
                if (impacted) return;
                impacted = true;
                if (onImpact) onImpact();
            },
            onComplete: () => { c.x = mon.baseX; c.y = mon.baseY; c.setScale(1); c.angle = 0; }
        });
    }

    playerAction(action, opts) {
        if (action.key === 'normal') return this.playNormal(opts.onImpact);
        if (action.key === 'ultimate') return this.playUltimate(action, opts.onImpact);
        return this.playSkill(action, opts.onImpact);
    }

    playNormal(onImpact) {
        const target = this.mons.enemy.container;
        this.lunge(this.mons.player, target, 0.45, () => {
            MathMonBattleVfx.impact(this.scene, target.x, target.y, this.cfg.elements[this.playerElement].color);
            onImpact();
        });
        return this.wait(800);
    }

    playSkill(action, onImpact) {
        const scene = this.scene;
        const element = this.cfg.elements[this.playerElement];
        const k = this.cfg.vfx.intensity[action.key];
        const from = this.mons.player.container;
        const to = this.mons.enemy.container;
        scene.tweens.add({ targets: from, y: from.y - 18, scale: 1.08, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
        MathMonBattleVfx.ring(scene, from.x, from.y, element.color, 70, 300);
        scene.time.delayedCall(220, () => {
            MathMonBattleVfx.projectile(scene, element, { x: from.x + 40, y: from.y - 10 }, { x: to.x, y: to.y }, () => {
                MathMonBattleVfx.elementBurst(scene, this.playerElement, to.x, to.y, k);
                onImpact();
            }, 10 + k * 4);
        });
        return this.wait(1500);
    }

    /** Ultimate cinematic: dim, zoom on caster, charge, slow-mo impact, flash, shake. */
    playUltimate(action, onImpact) {
        const scene = this.scene;
        const cam = scene.cameras.main;
        const element = this.cfg.elements[this.playerElement];
        const color = Phaser.Display.Color.HexStringToColor(element.color);
        const caster = this.mons.player.container;
        const target = this.mons.enemy.container;

        const dim = scene.add.rectangle(this.cw / 2, this.ch / 2, this.cw * 2, this.ch * 2, 0x000000, 1).setAlpha(0).setDepth(3);
        scene.tweens.add({ targets: dim, alpha: 0.6, duration: 400 });
        cam.pan(caster.x, caster.y, 450, 'Sine.easeInOut');
        cam.zoomTo(this.cfg.vfx.ultimateZoom, 450, 'Sine.easeInOut');
        MathMonBattleVfx.chargeAura(scene, element, caster.x, caster.y, 1000);
        scene.tweens.add({ targets: caster, scale: 1.18, duration: 900, ease: 'Sine.easeIn' });

        scene.time.delayedCall(1050, () => {
            cam.pan(target.x, target.y, 260, 'Cubic.easeOut');
            scene.tweens.add({ targets: caster, scale: 1, x: caster.x + 60, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
        });
        scene.time.delayedCall(1300, () => {
            scene.tweens.timeScale = this.cfg.vfx.slowMotionScale; // slow-motion beat
            cam.flash(260, color.red, color.green, color.blue);
            cam.shake(500, 0.018);
            MathMonBattleVfx.elementBurst(scene, this.playerElement, target.x, target.y, this.cfg.vfx.intensity.ultimate);
            onImpact();
        });
        scene.time.delayedCall(2100, () => {
            scene.tweens.timeScale = 1;
            cam.zoomTo(1, 500, 'Sine.easeInOut');
            cam.pan(this.cw / 2, this.ch / 2, 500, 'Sine.easeInOut');
            scene.tweens.add({ targets: dim, alpha: 0, duration: 500, onComplete: () => dim.destroy() });
        });
        return this.wait(2750);
    }

    enemyAttack(opts) {
        const target = this.mons.player.container;
        this.lunge(this.mons.enemy, target, 0.4, () => {
            MathMonBattleVfx.elementBurst(this.scene, this.enemyElement, target.x, target.y, 0.5);
            opts.onImpact();
        });
        return this.wait(900);
    }

    /** Knockback, squash and flicker when a monster is hit. */
    hit(side, strength) {
        const mon = this.mons[side];
        const c = mon.container;
        const dir = mon.isEnemy ? 1 : -1;
        this.scene.tweens.add({ targets: c, x: mon.baseX + dir * 14 * strength, angle: dir * 6 * strength, duration: 90, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => { c.x = mon.baseX; c.angle = 0; } });
        this.scene.tweens.add({ targets: mon.sprite, alpha: 0.25, duration: 60, yoyo: true, repeat: 2, onComplete: () => mon.sprite.setAlpha(1) });
    }

    popup(side, text, opts) {
        const c = this.mons[side].container;
        const o = opts || {};
        MathMonBattleVfx.popup(this.scene, c.x, c.y - (side === 'enemy' ? 70 : 80), text, {
            matchup: o.matchup, crit: o.crit, heal: o.heal, color: o.color, text: String(text)
        });
    }

    statusFx(side, type) {
        const c = this.mons[side].container;
        if (type === 'burn') MathMonBattleVfx.elementBurst(this.scene, 'fire', c.x, c.y + 10, 0.4);
        if (type === 'stun') this.scene.tweens.add({ targets: c, angle: 8, duration: 90, yoyo: true, repeat: 3 });
        if (type === 'heal') MathMonBattleVfx.ring(this.scene, c.x, c.y, '#6bff9b', 70, 400);
    }

    shake(intensity) {
        this.scene.cameras.main.shake(220, 0.008 * (intensity || 1));
    }

    faint(side) {
        const mon = this.mons[side];
        const c = mon.container;
        this.scene.tweens.killTweensOf(c);
        this.scene.tweens.add({ targets: c, y: mon.baseY + 34, angle: mon.isEnemy ? 18 : -18, alpha: 0, scale: 0.35, duration: 700, ease: 'Back.easeIn' });
        return this.wait(800);
    }

    destroy() {
        this.scene.tweens.timeScale = 1;
    }
}
