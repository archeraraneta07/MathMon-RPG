/**
 * MathMon UI theme — one design system for every screen.
 *
 *   Tokens      colors / font / border shared by the DOM (written to CSS custom
 *               properties on :root) and the Phaser scenes (MathMonTheme.TOKENS).
 *   Re-theme    MathMonTheme.apply(element) switches the accent of the whole UI
 *               to the partner monster's element (null = neutral gold).
 *   Ambient     a pixelated DOM canvas over the game (z 3, under the battle HUD)
 *               with the element's particles: embers, bubbles, wind, dust.
 *   Components  Phaser helpers drawn the same way everywhere: backdrop, pixel
 *               text, bordered cards, buttons, dialog boxes and a touch D-pad.
 *
 * Phaser runs on the Canvas renderer (no tints, no gradient fills), so the
 * components layer solid rectangles: outer rect = border, inner rect = panel.
 */
const MathMonTheme = (function createTheme() {
    'use strict';

    const TOKENS = {
        bg: '#1a1625',
        bgDeep: '#120f1a',
        panel: '#0d0a14',
        panelHi: '#1b1529',
        line: '#3d3356',
        title: '#ffd740',
        text: '#ffffff',
        muted: '#b9b0cc',
        good: '#6bff9b',
        bad: '#ff6b6b',
        boy: '#42a5f5',
        girl: '#ec407a',
        border: 3,
        fontPixel: '"Press Start 2P", monospace',
        fontBody: '"Atkinson Hyperlegible", sans-serif'
    };

    // Element look on top of the battle colors (MathMonBattleConfig.elements).
    const ELEMENT_FX = {
        fire:  { particle: 'ember',  arena: 'volcano', mapName: 'Volcanic Caldera' },
        water: { particle: 'bubble', arena: 'ocean',   mapName: 'Abyssal Ocean' },
        wind:  { particle: 'swirl',  arena: 'sky',     mapName: 'Storm Peak' },
        earth: { particle: 'dust',   arena: 'rocky',   mapName: 'Rocky Badlands' }
    };
    const NEUTRAL = { accent: TOKENS.title, glow: '#fff3b0', deep: '#2a2140', particle: 'star', arena: null, mapName: '' };

    let current = null;

    function elementDefs() {
        return typeof MathMonBattleConfig !== 'undefined' ? MathMonBattleConfig.elements : {};
    }

    /** Look for an element (or the neutral look for null / unknown). */
    function look(element) {
        const el = elementDefs()[element];
        if (!el || !ELEMENT_FX[element]) return { key: null, ...NEUTRAL };
        return { key: element, accent: el.color, glow: el.accent, deep: el.dark, ...ELEMENT_FX[element] };
    }

    function hex(color) {
        return Phaser.Display.Color.HexStringToColor(color).color;
    }

    /** Blend two '#rrggbb' colors (t = 0 → a, 1 → b), returned as '#rrggbb'. */
    function mix(a, b, t) {
        const ca = Phaser.Display.Color.HexStringToColor(a);
        const cb = Phaser.Display.Color.HexStringToColor(b);
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(t * 100));
        return Phaser.Display.Color.RGBToString(Math.round(c.r), Math.round(c.g), Math.round(c.b), 0, '#');
    }

    // ---- DOM side: tokens → CSS custom properties -----------------------------
    function writeTokens() {
        const style = document.documentElement.style;
        style.setProperty('--mm-bg-primary', TOKENS.bg);
        style.setProperty('--mm-bg-deep', TOKENS.bgDeep);
        style.setProperty('--mm-panel', TOKENS.panel);
        style.setProperty('--mm-panel-hi', TOKENS.panelHi);
        style.setProperty('--mm-line-color', TOKENS.line);
        style.setProperty('--mm-title-color', TOKENS.title);
        style.setProperty('--mm-text-color', TOKENS.text);
        style.setProperty('--mm-muted-color', TOKENS.muted);
        style.setProperty('--mm-border-w', `${TOKENS.border}px`);
    }

    function writeLook(l) {
        const style = document.documentElement.style;
        style.setProperty('--mm-theme-accent', l.accent);
        style.setProperty('--mm-theme-glow', l.glow);
        style.setProperty('--mm-theme-deep', l.deep);
        document.documentElement.dataset.element = l.key || 'none';
    }

    /**
     * Re-theme the whole UI to an element ('fire' | 'water' | 'wind' | 'earth' | null).
     * CSS colors transition (registered @property in game-shell.css), the ambient
     * particles cross-fade, and a soft accent wash sweeps the screen on a change.
     */
    function apply(element, opts) {
        const next = ELEMENT_FX[element] ? element : null;
        const changed = next !== current;
        current = next;
        const l = look(next);
        writeLook(l);
        Ambient.setMode(l, changed && !(opts && opts.instant));
        if (changed && !(opts && opts.instant)) wash(l.accent);
        if (changed) window.dispatchEvent(new CustomEvent('mathmon-theme', { detail: { element: next, look: l } }));
        return l;
    }

    function wash(color) {
        const host = Ambient.host();
        if (!host) return;
        const node = document.createElement('div');
        node.className = 'mm-theme-wash';
        node.style.setProperty('--wash', color);
        Ambient.place(node);
        host.appendChild(node);
        node.addEventListener('animationend', () => node.remove());
    }

    /** Resolve once the pixel font can render (Phaser text would otherwise bake in the fallback). */
    function fontsReady(timeoutMs) {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        const load = Promise.all([
            document.fonts.load('16px "Press Start 2P"'),
            document.fonts.load('700 16px "Atkinson Hyperlegible"')
        ]).catch(() => undefined);
        return Promise.race([load, new Promise((r) => setTimeout(r, timeoutMs || 2500))]);
    }

    // ---- Ambient particle layer ---------------------------------------------------
    /*
     * Rendered at 1/3 resolution and upscaled with `image-rendering: pixelated`,
     * so every particle is a chunky pixel that matches the art style.
     */
    const Ambient = (function createAmbient() {
        const SCALE = 3;
        let canvas = null, ctx = null, gameCanvas = null, container = null;
        let particles = [], mode = NEUTRAL, density = 1, last = 0, w = 0, h = 0;
        let fadeIn = 1;   // 0 → 1 cross-fade after a theme change
        const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function mount(phaserCanvas) {
            if (canvas || !phaserCanvas) return;
            gameCanvas = phaserCanvas;
            container = phaserCanvas.parentElement;
            canvas = document.createElement('canvas');
            canvas.className = 'mm-ambient';
            canvas.setAttribute('aria-hidden', 'true');
            container.appendChild(canvas);
            ctx = canvas.getContext('2d');
            sync();
            if (window.ResizeObserver) new ResizeObserver(sync).observe(gameCanvas);
            window.addEventListener('resize', sync);
            requestAnimationFrame(frame);
        }

        function host() { return container; }

        function sync() {
            if (!canvas) return;
            const c = gameCanvas.getBoundingClientRect();
            const p = container.getBoundingClientRect();
            Object.assign(canvas.style, { left: `${c.left - p.left}px`, top: `${c.top - p.top}px`, width: `${c.width}px`, height: `${c.height}px` });
            const nw = Math.max(1, Math.round(c.width / SCALE)), nh = Math.max(1, Math.round(c.height / SCALE));
            if (nw !== w || nh !== h) {
                w = canvas.width = nw;
                h = canvas.height = nh;
                particles = [];
            }
            container.querySelectorAll('.mm-theme-wash').forEach(place);
        }

        /** Lay a DOM node exactly over the game canvas. */
        function place(node) {
            if (!canvas) return;
            ['left', 'top', 'width', 'height'].forEach((k) => { node.style[k] = canvas.style[k]; });
        }

        function target() {
            const base = mode.particle === 'star' ? 34 : 46;
            return Math.round(base * density * (reduced ? 0.35 : 1) * (w * h) / (267 * 200));
        }

        function rnd(a, b) { return a + Math.random() * (b - a); }

        function spawn(initial) {
            const colors = [mode.accent, mode.glow, mode.particle === 'ember' ? '#fff1a8' : '#ffffff'];
            const p = { kind: mode.particle, x: rnd(0, w), y: rnd(0, h), age: 0, life: rnd(4, 9), seed: Math.random() * 10,
                color: colors[Math.floor(Math.random() * colors.length)], size: Math.random() < 0.25 ? 2 : 1, vx: 0, vy: 0 };
            if (p.kind === 'ember') { p.y = initial ? p.y : h + 2; p.vy = -rnd(8, 20); p.vx = rnd(-2, 2); }
            if (p.kind === 'bubble') { p.y = initial ? p.y : h + 3; p.vy = -rnd(6, 14); p.size = Math.random() < 0.4 ? 3 : 2; p.color = Math.random() < 0.5 ? mode.glow : '#ffffff'; }
            if (p.kind === 'swirl') { p.x = initial ? p.x : -4; p.vx = rnd(22, 44); p.amp = rnd(3, 9); p.color = Math.random() < 0.6 ? '#ffffff' : mode.glow; }
            if (p.kind === 'dust') { p.y = initial ? p.y : -3; p.vy = rnd(3, 8); p.vx = rnd(3, 10); p.color = Math.random() < 0.5 ? mode.accent : mode.deep;
                if (Math.random() < 0.15) { p.size = 2; p.vy *= 2.4; p.color = mode.glow; } }
            if (p.kind === 'star') { p.life = rnd(3, 7); p.color = Math.random() < 0.6 ? '#fff3b0' : '#b39ddb'; }
            if (reduced) { p.vx *= 0.3; p.vy *= 0.3; }
            return p;
        }

        function frame(now) {
            requestAnimationFrame(frame);
            if (!ctx || document.hidden) { last = now; return; }
            const dt = Math.min(0.05, (now - (last || now)) / 1000);
            last = now;
            const want = target();
            while (particles.length < want) particles.push(spawn(true));   // scatter new ones across the screen
            if (particles.length > want) particles.length = want;
            ctx.clearRect(0, 0, w, h);
            fadeIn = Math.min(1, fadeIn + dt * 1.2);
            const fade = fadeIn;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.age += dt;
                if (p.kind === 'swirl') { p.x += p.vx * dt; p.y += Math.cos(p.age * 3 + p.seed) * p.amp * dt; }
                else if (p.kind === 'bubble') { p.y += p.vy * dt; p.x += Math.sin(p.age * 2.4 + p.seed) * 6 * dt; }
                else { p.x += (p.vx + Math.sin(p.age * 1.7 + p.seed) * 2) * dt; p.y += p.vy * dt; }
                const out = p.y < -6 || p.y > h + 6 || p.x < -8 || p.x > w + 8 || p.age > p.life * (p.kind === 'star' ? 1 : 3);
                if (out) { particles[i] = spawn(false); continue; }
                const lifeT = p.age / p.life;
                let alpha = p.kind === 'star' ? Math.sin(Math.PI * Math.min(1, lifeT)) * 0.8
                    : p.kind === 'ember' ? (0.55 + Math.sin(p.age * 14 + p.seed) * 0.35) * Math.max(0, 1 - lifeT * 0.4)
                    : 0.6;
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * fade;
                ctx.fillStyle = p.color;
                const x = Math.round(p.x), y = Math.round(p.y);
                if (p.kind === 'bubble') {
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 0.5, y + 0.5, p.size, p.size);
                } else if (p.kind === 'swirl') {
                    ctx.fillRect(x, y, 2, 1);
                    ctx.globalAlpha *= 0.45;
                    ctx.fillRect(x - 3, Math.round(p.y - Math.cos(p.age * 3 + p.seed) * 1.5), 2, 1);
                } else {
                    ctx.fillRect(x, y, p.size, p.size);
                }
            }
            ctx.globalAlpha = 1;
        }

        function setMode(l, crossfade) {
            const changed = l.particle !== mode.particle || l.accent !== mode.accent;
            mode = l;
            if (changed) {
                particles = [];
                if (crossfade) fadeIn = 0;
            }
        }

        function setDensity(d) { density = Math.max(0, d); }
        function setVisible(v) { if (canvas) canvas.style.visibility = v ? '' : 'hidden'; }

        return { mount, host, place, setMode, setDensity, setVisible, sync };
    })();

    function init(phaserCanvas) {
        writeTokens();
        writeLook(look(current));
        Ambient.mount(phaserCanvas);
    }

    // ---- Phaser components ----------------------------------------------------------

    /** Pixel-font text. opts: size, color, align, wrap, originX/Y, stroke. */
    function text(scene, x, y, str, opts) {
        const o = opts || {};
        const size = o.size || 10;
        const t = scene.add.text(x, y, str, {
            fontFamily: o.body ? TOKENS.fontBody : TOKENS.fontPixel,
            fontSize: `${size}px`,
            fontStyle: o.bold ? 'bold' : 'normal',
            color: o.color || TOKENS.text,
            align: o.align || 'center',
            lineSpacing: o.lineSpacing != null ? o.lineSpacing : Math.round(size * 0.7),
            wordWrap: o.wrap ? { width: o.wrap } : {},
            stroke: o.stroke || '#000000',
            strokeThickness: o.stroke ? (o.strokeThickness || 4) : 0
        });
        t.setOrigin(o.originX != null ? o.originX : 0.5, o.originY != null ? o.originY : 0.5);
        if (o.shadow !== false && !o.body) t.setShadow(0, Math.max(2, Math.round(size / 5)), 'rgba(0,0,0,0.85)', 0, false, true);
        return t;
    }

    /** Screen title: yellow, uppercase pixel font with a hard drop shadow. */
    function title(scene, x, y, str, size) {
        return text(scene, x, y, String(str).toUpperCase(), { size: size || 16, color: TOKENS.title });
    }

    /*
     * Backdrop shared by the menu screens: navy/purple base, faint pixel dither,
     * a vignette and a soft accent glow on the floor that follows the theme.
     */
    function backdrop(scene) {
        const w = scene.cameras.main.width, h = scene.cameras.main.height;
        scene.cameras.main.setBackgroundColor(TOKENS.bg);
        const key = `mm_backdrop_${w}x${h}`;
        if (!scene.textures.exists(key)) {
            const tex = scene.textures.createCanvas(key, w, h);
            const ctx = tex.getContext();
            ctx.fillStyle = TOKENS.bg;
            ctx.fillRect(0, 0, w, h);
            // 4px dither so the flat background reads as pixel art
            for (let y = 0; y < h; y += 4) {
                for (let x = (y / 4) % 2 ? 0 : 4; x < w; x += 8) {
                    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                    if (n - Math.floor(n) < 0.18) {
                        ctx.fillStyle = 'rgba(122, 96, 170, 0.07)';
                        ctx.fillRect(x, y, 4, 4);
                    }
                }
            }
            const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(6,4,12,0.65)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, w, h);
            tex.refresh();
        }
        const img = scene.add.image(w / 2, h / 2, key).setScrollFactor(0).setDepth(-100);
        const l = look(current);
        const glow = scene.add.ellipse(w / 2, h * 0.94, w * 1.1, h * 0.26, hex(l.accent), 0.05).setScrollFactor(0).setDepth(-99);
        return {
            image: img,
            glow,
            setAccent(color) { glow.setFillStyle(hex(color), 0.05); }
        };
    }

    /**
     * Bordered card: 3px solid colored border, near-black inner panel, outer glow.
     * opts: color, onSelect, onHover, glow (true). Add children to card.container
     * in card-local coordinates (0,0 = card center).
     */
    function card(scene, x, y, w, h, opts) {
        const o = opts || {};
        const color = hex(o.color || TOKENS.title);
        const b = TOKENS.border;
        const container = scene.add.container(x, y);
        const glowOuter = scene.add.rectangle(0, 0, w + 18, h + 18, color, 0);
        const glowInner = scene.add.rectangle(0, 0, w + 8, h + 8, color, 0);
        const border = scene.add.rectangle(0, 0, w, h, color, 1);
        const panel = scene.add.rectangle(0, 0, w - b * 2, h - b * 2, hex(TOKENS.panel), 1);
        container.add([glowOuter, glowInner, border, panel]);
        const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
        container.add(zone);
        let pulse = null, focused = false;

        function setFocused(on) {
            if (on === focused) return;
            focused = on;
            scene.tweens.killTweensOf([container, glowOuter, glowInner]);
            if (pulse) { pulse.stop(); pulse = null; border.setAlpha(1); }
            scene.tweens.add({ targets: container, scale: on ? 1.06 : 1, duration: 160, ease: 'Quad.easeOut' });
            scene.tweens.add({ targets: glowOuter, fillAlpha: on ? 0.12 : 0, duration: 200 });
            scene.tweens.add({ targets: glowInner, fillAlpha: on ? 0.28 : 0, duration: 200 });
            if (on) pulse = scene.tweens.add({ targets: border, alpha: 0.55, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }

        function setColor(c) {
            const n = hex(c);
            border.setFillStyle(n, 1);
            glowOuter.setFillStyle(n, glowOuter.fillAlpha);
            glowInner.setFillStyle(n, glowInner.fillAlpha);
        }

        /** Selection feedback: white flash on the border and a quick squash. */
        function flash() {
            const old = border.fillColor;
            border.setFillStyle(0xffffff, 1);
            scene.tweens.add({ targets: container, scale: 1.12, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
            scene.time.delayedCall(180, () => border.setFillStyle(old, 1));
        }

        zone.on('pointerover', () => { if (o.onHover) o.onHover(); });
        zone.on('pointerout', () => { if (o.onOut) o.onOut(); });
        zone.on('pointerdown', () => { if (o.onSelect) o.onSelect(); });
        return { container, zone, panel, border, setFocused, setColor, flash, add: (c) => container.add(c) };
    }

    /**
     * Pixel button. opts: width, height, size, primary (filled accent), color, onClick.
     * Returns { container, setFocused, setEnabled, setLabel, setColor }.
     */
    function button(scene, x, y, label, opts) {
        const o = opts || {};
        const w = o.width || 220, h = o.height || 44, b = TOKENS.border;
        let color = o.color || look(current).accent;
        const container = scene.add.container(x, y);
        const shadow = scene.add.rectangle(0, 4, w, h, 0x000000, 0.6);
        const border = scene.add.rectangle(0, 0, w, h, hex(color), 1);
        const fill = scene.add.rectangle(0, 0, w - b * 2, h - b * 2, o.primary ? hex(color) : hex(TOKENS.panel), 1);
        const shine = scene.add.rectangle(0, -h / 2 + b + 2, w - b * 2 - 4, 3, 0xffffff, o.primary ? 0.35 : 0.08);
        const txt = text(scene, 0, 0, String(label).toUpperCase(), { size: o.size || 10, color: o.primary ? TOKENS.panel : TOKENS.text, shadow: !o.primary });
        container.add([shadow, border, fill, shine, txt]);
        const zone = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
        container.add(zone);
        let enabled = true;
        const lift = (dy) => { [border, fill, shine, txt].forEach((n, i) => { n.y = (i === 2 ? -h / 2 + b + 2 : 0) + dy; }); };
        function setFocused(on) {
            fill.setFillStyle(o.primary ? hex(on ? mix(color, '#ffffff', 0.25) : color) : hex(on ? TOKENS.panelHi : TOKENS.panel), 1);
            lift(on ? -2 : 0);
        }
        function setColor(c) {
            color = c;
            border.setFillStyle(hex(c), 1);
            if (o.primary) fill.setFillStyle(hex(c), 1);
        }
        zone.on('pointerover', () => { if (!enabled) return; setFocused(true); if (o.onHover) o.onHover(); });
        zone.on('pointerout', () => setFocused(false));
        zone.on('pointerdown', () => { if (enabled) lift(2); });
        zone.on('pointerup', () => {
            if (!enabled) return;
            lift(0);
            if (o.onClick) o.onClick();
        });
        return {
            container, zone, setFocused, setColor,
            setLabel: (s) => txt.setText(String(s).toUpperCase()),
            setEnabled(on) { enabled = on; container.setAlpha(on ? 1 : 0.45); },
            click() { if (enabled && o.onClick) o.onClick(); }
        };
    }

    /**
     * Dialog box (bottom of the screen) with typewriter text and optional choices.
     *   opts: { speaker, pages: string | string[], choices: [{ label, value }],
     *           onChoose(value), onClose(), color, sound: { type(), select() } }
     * Keys: Enter / Space / E advance or confirm, ↑/↓ (W/S) move, Esc closes.
     * Touch / click: tap the box to advance, tap a choice to pick it.
     */
    function dialog(scene, opts) {
        const o = opts || {};
        const cw = scene.cameras.main.width, ch = scene.cameras.main.height;
        const pages = [].concat(o.pages || '');
        const choices = o.choices || [];
        const accent = o.color || look(current).accent;
        const bw = cw - 48, bh = 132, bx = cw / 2, by = ch - bh / 2 - 16;
        const root = scene.add.container(0, 0).setDepth(1000).setScrollFactor(0);
        const box = card(scene, bx, by, bw, bh, { color: accent });
        box.zone.removeInteractive();
        root.add(box.container);
        let speaker = null;
        if (o.speaker) {
            const tag = scene.add.container(bx - bw / 2 + 18, by - bh / 2);
            const label = text(scene, 0, 0, o.speaker.toUpperCase(), { size: 8, color: TOKENS.panel, originX: 0, shadow: false });
            const tw = label.width + 18;
            tag.add([scene.add.rectangle(tw / 2 - 9, 0, tw, 20, hex(accent), 1), label]);
            label.x = 0;
            root.add(tag);
            speaker = tag;
        }
        const textX = bx - bw / 2 + 22, textY = by - bh / 2 + 22;
        const wrapWidth = choices.length ? bw - 260 : bw - 60;
        const body = text(scene, textX, textY, '', { size: 10, color: TOKENS.text, align: 'left', originX: 0, originY: 0, lineSpacing: 9 });
        root.add(body);
        const more = text(scene, bx + bw / 2 - 24, by + bh / 2 - 18, 'v', { size: 8, color: accent }).setVisible(false);
        root.add(more);
        scene.tweens.add({ targets: more, y: more.y + 3, duration: 380, yoyo: true, repeat: -1 });

        const choiceNodes = choices.map((c, i) => {
            const cy = by - bh / 2 + 26 + i * 24;
            const t = text(scene, bx + bw / 2 - 210, cy, `  ${c.label.toUpperCase()}`, { size: 9, color: TOKENS.muted, align: 'left', originX: 0 });
            t.setInteractive({ useHandCursor: true });
            t.on('pointerover', () => select(i));
            t.on('pointerdown', () => { select(i); confirm(); });
            t.setVisible(false);
            root.add(t);
            return t;
        });
        if (choices.length) {
            const divider = scene.add.rectangle(bx + bw / 2 - 226, by, 3, bh - 24, hex(accent), 0.6);
            root.add(divider);
        }

        let page = 0, shown = 0, full = '', typing = null, index = 0, closed = false;
        root.setAlpha(0);
        root.y = 12;
        scene.tweens.add({ targets: root, alpha: 1, y: 0, duration: 160, ease: 'Quad.easeOut' });

        function showPage(i) {
            page = i;
            // wrap once up front so words don't jump lines while they type out
            body.setWordWrapWidth(wrapWidth);
            full = body.getWrappedText(pages[i]).join('\n');
            body.setWordWrapWidth(null);
            shown = 0;
            body.setText('');
            more.setVisible(false);
            choiceNodes.forEach((n) => n.setVisible(false));
            if (typing) typing.remove();
            typing = scene.time.addEvent({ delay: 18, loop: true, callback: () => {
                shown = Math.min(full.length, shown + 2);
                body.setText(full.slice(0, shown));
                if (shown % 6 === 0 && o.sound && o.sound.type) o.sound.type();
                if (shown >= full.length) finishPage();
            } });
        }

        function finishPage() {
            if (typing) { typing.remove(); typing = null; }
            shown = full.length;
            body.setText(full);
            const last = page === pages.length - 1;
            more.setVisible(!last || !choices.length);
            if (last && choices.length) { choiceNodes.forEach((n) => n.setVisible(true)); select(index); }
        }

        function select(i) {
            if (!choices.length) return;
            index = (i + choices.length) % choices.length;
            choiceNodes.forEach((n, k) => {
                n.setText(`${k === index ? '>' : ' '} ${choices[k].label.toUpperCase()}`);
                n.setColor(k === index ? accent : TOKENS.muted);
            });
        }

        function confirm() {
            if (closed) return;
            if (shown < full.length) { finishPage(); return; }
            if (page < pages.length - 1) { showPage(page + 1); return; }
            if (o.sound && o.sound.select) o.sound.select();
            const value = choices.length ? choices[index].value : undefined;
            close();
            if (choices.length && o.onChoose) o.onChoose(value);
        }

        function onKey(event) {
            if (closed) return;
            const k = event.key;
            if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E') confirm();
            else if (k === 'Escape') {
                // Esc = the last choice (by convention the "cancel / leave" option)
                close();
                if (choices.length && o.onChoose) o.onChoose(choices[choices.length - 1].value);
            }
            else if ((k === 'ArrowUp' || k === 'w' || k === 'W') && shown >= full.length) select(index - 1);
            else if ((k === 'ArrowDown' || k === 's' || k === 'S') && shown >= full.length) select(index + 1);
        }

        function close() {
            if (closed) return;
            closed = true;
            if (typing) typing.remove();
            scene.input.keyboard.off('keydown', onKey);
            scene.tweens.add({ targets: root, alpha: 0, y: 10, duration: 120, onComplete: () => root.destroy() });
            if (o.onClose) o.onClose();
        }

        // tap anywhere on the text area advances
        const tap = scene.add.zone(bx - (choices.length ? 120 : 0), by, bw - (choices.length ? 240 : 0), bh).setInteractive();
        tap.on('pointerdown', confirm);
        root.addAt(tap, 1);
        // the opening key press must not also confirm
        scene.time.delayedCall(60, () => { if (!closed) scene.input.keyboard.on('keydown', onKey); });
        showPage(0);
        return { close, isOpen: () => !closed, root, speaker };
    }

    /**
     * On-screen pixel D-pad + action button (touch and mouse).
     * Returns { direction: {x,y}, destroy() }; onAction fires on the A button.
     */
    function dpad(scene, opts) {
        const o = opts || {};
        const ch = scene.cameras.main.height, cw = scene.cameras.main.width;
        const state = { direction: { x: 0, y: 0 } };
        const accent = hex(o.color || look(current).accent);
        const nodes = [];
        const pad = (label, x, y, dir, onPress) => {
            const border = scene.add.rectangle(x, y, 44, 44, accent, 0.9).setScrollFactor(0).setDepth(900);
            const fill = scene.add.rectangle(x, y, 38, 38, hex(TOKENS.panel), 0.88).setScrollFactor(0).setDepth(901);
            const t = text(scene, x, y, label, { size: 10, color: TOKENS.text }).setScrollFactor(0).setDepth(902);
            border.setInteractive({ useHandCursor: true });
            border.on('pointerdown', () => { fill.setFillStyle(accent, 0.5); if (dir) state.direction = dir; if (onPress) onPress(); });
            const release = () => { fill.setFillStyle(hex(TOKENS.panel), 0.88); if (dir) state.direction = { x: 0, y: 0 }; };
            ['pointerup', 'pointerout', 'pointerupoutside', 'pointercancel'].forEach((e) => border.on(e, release));
            nodes.push(border, fill, t);
        };
        const px = 70, py = ch - 78;
        pad('^', px, py - 46, { x: 0, y: -1 });
        pad('v', px, py + 46, { x: 0, y: 1 });
        pad('<', px - 46, py, { x: -1, y: 0 });
        pad('>', px + 46, py, { x: 1, y: 0 });
        if (o.onAction) pad('A', cw - 64, ch - 78, null, o.onAction);
        state.setVisible = (v) => nodes.forEach((n) => n.setVisible(v));
        state.destroy = () => nodes.forEach((n) => n.destroy());
        return state;
    }

    return {
        TOKENS,
        init,
        apply,
        look,
        element: () => current,
        accent: () => look(current).accent,
        hex,
        mix,
        fontsReady,
        ambient: { setDensity: (d) => Ambient.setDensity(d), setVisible: (v) => Ambient.setVisible(v) },
        ui: { text, title, backdrop, card, button, dialog, dpad }
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonTheme;
}
