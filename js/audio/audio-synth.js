/**
 * MathMon procedural audio — every sound effect and music track generated
 * with the Web Audio API, so the game sounds complete with zero audio files.
 * (Drop real files into /audio and list them in js/audio/audio-manifest.js to
 * replace any of these; see audio/README.md.)
 *
 * SFX functions:  (ctx, out, params) → duration in seconds
 *   `out` is the voice's gain node supplied by the audio manager; params.t is
 *   the start time (ctx time). Everything uses short attack/release envelopes so
 *   sounds never click.
 * Music tracks:   { bpm, bars, step(ctx, out, stepIndex, time, stepSeconds, intensity) }
 *   Scheduled step-by-step ahead of time by the manager → seamless loops.
 */
const MathMonSynth = (function createSynth() {
    'use strict';

    // ---- Building blocks ---------------------------------------------------------
    let noiseBuf = null;
    let shaperCurve = null;

    function noiseBuffer(ctx) {
        if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        return noiseBuf;
    }

    function driveCurve() {
        if (!shaperCurve) {
            shaperCurve = new Float32Array(1024);
            for (let i = 0; i < 1024; i++) {
                const x = (i / 1023) * 2 - 1;
                shaperCurve[i] = Math.tanh(x * 3);
            }
        }
        return shaperCurve;
    }

    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

    /** Attack → hold → exponential release on an AudioParam. */
    function env(param, t, peak, a, h, r) {
        param.setValueAtTime(0.0001, t);
        param.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
        param.setValueAtTime(Math.max(0.0002, peak), t + a + h);
        param.exponentialRampToValueAtTime(0.0001, t + a + h + r);
    }

    function filter(ctx, type, f, q) {
        const fl = ctx.createBiquadFilter();
        fl.type = type;
        fl.frequency.value = f;
        if (q != null) fl.Q.value = q;
        return fl;
    }

    /**
     * Oscillator voice.
     * o: { t, type, f, f2, sweep, a, h, r, g, detune, lp, lp2, q, vibrato: [rate, depth], am: [rate, depth] }
     */
    function tone(ctx, out, o) {
        const t = o.t;
        const a = o.a ?? 0.005, h = o.h ?? 0, r = o.r ?? 0.2;
        const end = t + a + h + r;
        const osc = ctx.createOscillator();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.f, t);
        if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.sweep ?? (a + h + r)));
        if (o.detune) osc.detune.value = o.detune;
        if (o.vibrato) {
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = o.vibrato[0];
            depth.gain.value = o.vibrato[1];
            lfo.connect(depth).connect(osc.frequency);
            lfo.start(t); lfo.stop(end + 0.05);
        }
        const g = ctx.createGain();
        env(g.gain, t, o.g ?? 0.2, a, h, r);
        let node = osc;
        if (o.lp) {
            const fl = filter(ctx, 'lowpass', o.lp, o.q ?? 0.8);
            if (o.lp2) fl.frequency.exponentialRampToValueAtTime(o.lp2, t + a + h + r);
            node.connect(fl);
            node = fl;
        }
        node.connect(g);
        if (o.am) {                           // amplitude growl (roars)
            const amGain = ctx.createGain();
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            amGain.gain.value = 1 - o.am[1];
            lfo.frequency.value = o.am[0];
            depth.gain.value = o.am[1];
            lfo.connect(depth).connect(amGain.gain);
            g.connect(amGain).connect(out);
            lfo.start(t); lfo.stop(end + 0.05);
        } else {
            g.connect(out);
        }
        osc.start(t);
        osc.stop(end + 0.05);
        return end;
    }

    /** Filtered noise. o: { t, dur, type, f, f2, q, g, a, r } */
    function noise(ctx, out, o) {
        const t = o.t;
        const a = o.a ?? 0.005, r = o.r ?? 0.1, h = Math.max(0, (o.dur ?? 0.2) - a - r);
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        src.loop = true;
        const fl = filter(ctx, o.type || 'lowpass', o.f || 1000, o.q ?? 0.7);
        if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + a + h + r);
        const g = ctx.createGain();
        env(g.gain, t, o.g ?? 0.2, a, h, r);
        src.connect(fl).connect(g).connect(out);
        src.start(t, Math.random() * 1.5);
        src.stop(t + a + h + r + 0.05);
        return t + a + h + r;
    }

    /** Many tiny noise ticks scattered over a window (fire crackle, rock bits). */
    function crackle(ctx, out, o) {
        for (let i = 0; i < o.count; i++) {
            noise(ctx, out, { t: o.t + Math.random() * o.window, dur: 0.012 + Math.random() * 0.02, type: 'highpass', f: o.f || 2500, g: (o.g || 0.12) * (0.4 + Math.random()), a: 0.001, r: 0.02 });
        }
        return o.t + o.window + 0.05;
    }

    function drive(ctx, out) {
        const sh = ctx.createWaveShaper();
        sh.curve = driveCurve();
        sh.connect(out);
        return sh;
    }

    // ---- Element layers ----------------------------------------------------------------
    // k scales length/weight (0.4 = light touch … 2.2 = ultimate).
    const ELEMENT = {
        fire(ctx, out, t, k) {             // roaring flames + crackling
            noise(ctx, out, { t, dur: 0.35 + 0.35 * k, type: 'lowpass', f: 300, f2: 2200, q: 1.2, g: 0.18 * Math.min(k, 1.6), a: 0.06, r: 0.3 });
            noise(ctx, out, { t: t + 0.05, dur: 0.3 + 0.3 * k, type: 'bandpass', f: 900, f2: 400, q: 0.9, g: 0.1 * k, a: 0.04, r: 0.25 });
            tone(ctx, out, { t, type: 'sine', f: 70, f2: 45, a: 0.05, h: 0.1 * k, r: 0.35, g: 0.15 * Math.min(k, 1.6) });
            return crackle(ctx, out, { t: t + 0.05, window: 0.4 + 0.4 * k, count: Math.round(10 * k), f: 3000, g: 0.14 });
        },
        water(ctx, out, t, k) {            // rushing waves + splashes + bubbles
            noise(ctx, out, { t, dur: 0.4 + 0.3 * k, type: 'bandpass', f: 500, f2: 2600, q: 0.8, g: 0.16 * Math.min(k, 1.6), a: 0.1, r: 0.25 });
            noise(ctx, out, { t: t + 0.2 + 0.1 * k, dur: 0.25 + 0.15 * k, type: 'highpass', f: 1800, f2: 900, g: 0.16 * Math.min(k, 1.5), a: 0.005, r: 0.22 });
            for (let i = 0; i < Math.round(4 * k); i++) {
                const f = 380 + Math.random() * 500;
                tone(ctx, out, { t: t + 0.15 + Math.random() * 0.4 * k, type: 'sine', f, f2: f * 1.9, a: 0.004, r: 0.06, g: 0.06 });
            }
            return t + 0.6 + 0.4 * k;
        },
        wind(ctx, out, t, k) {             // sharp whooshes + gusts
            noise(ctx, out, { t, dur: 0.25 + 0.2 * k, type: 'bandpass', f: 350, f2: 3200, q: 2.2, g: 0.2 * Math.min(k, 1.5), a: 0.03, r: 0.12 });
            noise(ctx, out, { t: t + 0.12, dur: 0.3 + 0.3 * k, type: 'bandpass', f: 2400, f2: 500, q: 1.6, g: 0.13 * k, a: 0.06, r: 0.25 });
            noise(ctx, out, { t: t + 0.05, dur: 0.06, type: 'highpass', f: 5000, g: 0.12, a: 0.002, r: 0.05 });
            return t + 0.55 + 0.45 * k;
        },
        earth(ctx, out, t, k) {            // deep rumbles + rock impacts
            tone(ctx, out, { t, type: 'sine', f: 62, f2: 38, a: 0.02, h: 0.15 * k, r: 0.5, g: 0.28 * Math.min(k, 1.5) });
            noise(ctx, out, { t, dur: 0.5 + 0.4 * k, type: 'lowpass', f: 260, f2: 90, g: 0.22 * Math.min(k, 1.6), a: 0.02, r: 0.4 });
            for (let i = 0; i < Math.round(3 * k); i++) {
                const ti = t + 0.05 + Math.random() * 0.45 * k;
                noise(ctx, out, { t: ti, dur: 0.05, type: 'bandpass', f: 700 + Math.random() * 600, q: 1.5, g: 0.15, a: 0.002, r: 0.05 });
                tone(ctx, out, { t: ti, type: 'sine', f: 110, f2: 60, a: 0.002, r: 0.1, g: 0.12 });
            }
            return t + 0.7 + 0.4 * k;
        }
    };

    const POWER = { normal: 0.6, skill1: 1, skill2: 1.4, ultimate: 2.2 };

    // ---- Combat sounds ---------------------------------------------------------------------
    /** Move start: quick swish (normal) or a layered, skill-specific wind-up. */
    function cast(ctx, out, p) {
        const t = p.t;
        const el = p.element || 'fire';
        if (p.action === 'normal') {
            return noise(ctx, out, { t, dur: 0.12, type: 'bandpass', f: 900, f2: 4200, q: 1.4, g: 0.16, a: 0.01, r: 0.08 });
        }
        if (p.action === 'skill1') {
            tone(ctx, out, { t, type: 'triangle', f: 330, f2: 880, a: 0.02, h: 0.05, r: 0.2, g: 0.07, lp: 2400 });
            return ELEMENT[el](ctx, out, t + 0.05, 0.7);
        }
        // skill2: heavier, two-stage build with an element-specific motif
        tone(ctx, out, { t, type: 'sawtooth', f: 110, f2: 330, a: 0.08, h: 0.15, r: 0.25, g: 0.06, lp: 600, lp2: 2600 });
        const motif = { fire: [196, 261], water: [174, 233], wind: [262, 392], earth: [98, 131] }[el] || [196, 261];
        motif.forEach((f, i) => tone(ctx, out, { t: t + 0.06 * i, type: 'square', f, a: 0.01, h: 0.04, r: 0.15, g: 0.05, lp: 1800 }));
        return ELEMENT[el](ctx, out, t + 0.12, 1.1);
    }

    /**
     * Hit at the moment of impact (synced by the battle scene's onImpact).
     * p: { element, action, matchup: 'strong'|'weak'|'neutral', crit }
     * Strong → heavier sub boom + drive; weak → muffled (low-passed, quieter).
     */
    function impact(ctx, out, p) {
        const t = p.t;
        const power = POWER[p.action] || 0.6;
        const strong = p.matchup === 'strong', weak = p.matchup === 'weak';
        const bus = filter(ctx, 'lowpass', weak ? 650 : 16000, 0.7);
        const lvl = ctx.createGain();
        lvl.gain.value = weak ? 0.55 : strong ? 1.25 : 1;
        bus.connect(lvl).connect(out);
        const dest = strong ? drive(ctx, bus) : bus;

        noise(ctx, dest, { t, dur: 0.04, type: 'highpass', f: 1800, g: 0.3, a: 0.001, r: 0.04 });                       // crisp transient
        tone(ctx, dest, { t, type: 'sine', f: 160, f2: 48, a: 0.002, h: 0.02, r: 0.18 + 0.12 * power, g: 0.45 });         // body
        if (p.action === 'normal') noise(ctx, dest, { t, dur: 0.07, type: 'bandpass', f: 2200, f2: 6000, q: 2, g: 0.15, a: 0.005, r: 0.05 });
        let end = ELEMENT[p.element || 'fire'](ctx, dest, t, power * 0.7);
        if (strong) end = Math.max(end, tone(ctx, dest, { t, type: 'sine', f: 75, f2: 28, a: 0.003, h: 0.05, r: 0.55, g: 0.4 }));
        if (p.crit) {
            tone(ctx, dest, { t, type: 'triangle', f: 2400, f2: 1800, a: 0.002, r: 0.25, g: 0.08 });
            tone(ctx, dest, { t: t + 0.02, type: 'square', f: 1250, a: 0.002, r: 0.12, g: 0.04, lp: 4000 });
        }
        if (p.action === 'ultimate') {
            end = Math.max(end, tone(ctx, dest, { t, type: 'sawtooth', f: 55, f2: 30, a: 0.005, h: 0.2, r: 1.2, g: 0.25, lp: 400 }));
            noise(ctx, dest, { t, dur: 1.4, type: 'lowpass', f: 1200, f2: 80, g: 0.3, a: 0.003, r: 1.2 });
        }
        return end;
    }

    /** Ultimate charge-up riser (≈1.3 s). */
    function ultCharge(ctx, out, p) {
        const t = p.t;
        tone(ctx, out, { t, type: 'sawtooth', f: 90, f2: 900, sweep: 1.3, a: 0.4, h: 0.8, r: 0.25, g: 0.07, lp: 300, lp2: 5000, q: 4 });
        tone(ctx, out, { t, type: 'sawtooth', f: 91, f2: 905, sweep: 1.3, a: 0.4, h: 0.8, r: 0.25, g: 0.05, lp: 300, lp2: 5000, detune: 14 });
        noise(ctx, out, { t, dur: 1.4, type: 'bandpass', f: 300, f2: 6000, q: 1.2, g: 0.12, a: 1.1, r: 0.2 });
        ELEMENT[p.element || 'fire'](ctx, out, t + 0.5, 0.9);
        return t + 1.5;
    }

    // ---- Monster voices --------------------------------------------------------------------
    const MONSTER = {
        dragon: { base: 190, end: 60, wave: 'sawtooth', lp: 1300, growl: 32, breath: [900, 250] },
        kraken: { base: 95, end: 38, wave: 'triangle', lp: 700, growl: 11, breath: [380, 120], gurgle: true },
        typhoeus: { base: 150, end: 70, wave: 'sawtooth', lp: 1000, growl: 18, breath: [1600, 300], howl: true },
        titan: { base: 78, end: 32, wave: 'square', lp: 550, growl: 26, breath: [300, 60], rocks: true }
    };

    /** kind: 'roar' (attacking / intro), 'hurt' (taking damage), 'defeat' (falls). */
    function monster(ctx, out, p) {
        const m = MONSTER[p.monster] || MONSTER.dragon;
        const t = p.t;
        const kind = p.kind || 'roar';
        const len = kind === 'defeat' ? 2.0 : kind === 'hurt' ? 0.38 : (p.short ? 0.7 : 1.2);
        const f0 = kind === 'hurt' ? m.base * 1.6 : m.base;
        const f1 = kind === 'defeat' ? m.end * 0.7 : kind === 'hurt' ? m.base * 0.9 : m.end;
        const g = kind === 'hurt' ? 0.12 : 0.14;
        tone(ctx, out, { t, type: m.wave, f: f0, f2: f1, a: 0.06, h: len * 0.45, r: len * 0.5, g, lp: m.lp, am: [m.growl, 0.45], vibrato: [5, 6] });
        tone(ctx, out, { t, type: m.wave, f: f0 * 1.01, f2: f1, a: 0.06, h: len * 0.45, r: len * 0.5, g: g * 0.6, lp: m.lp, detune: 22 });
        noise(ctx, out, { t, dur: len, type: 'lowpass', f: m.breath[0], f2: m.breath[1], g: 0.1, a: 0.05, r: len * 0.6 });
        if (m.gurgle) for (let i = 0; i < 6; i++) tone(ctx, out, { t: t + Math.random() * len, type: 'sine', f: 200 + Math.random() * 300, f2: 500, a: 0.004, r: 0.07, g: 0.05 });
        if (m.howl) noise(ctx, out, { t, dur: len * 1.2, type: 'bandpass', f: 1400, f2: 300, q: 3, g: 0.12, a: 0.15, r: len * 0.6 });
        if (m.rocks && kind !== 'hurt') crackle(ctx, out, { t: t + len * 0.3, window: len * 0.6, count: kind === 'defeat' ? 18 : 8, f: 900, g: 0.12 });
        if (kind === 'defeat') noise(ctx, out, { t: t + len * 0.6, dur: 1.2, type: 'lowpass', f: 300, f2: 60, g: 0.18, a: 0.02, r: 1 });
        return t + len * 1.25;
    }

    // ---- UI / gameplay ---------------------------------------------------------------------
    const SFX = {
        'ui.click': (ctx, out, p) => tone(ctx, out, { t: p.t, type: 'square', f: 1100, f2: 800, a: 0.002, r: 0.05, g: 0.07, lp: 3500 }),
        'ui.hover': (ctx, out, p) => tone(ctx, out, { t: p.t, type: 'sine', f: 1700, a: 0.003, r: 0.035, g: 0.035 }),
        'ui.select': (ctx, out, p) => { tone(ctx, out, { t: p.t, type: 'triangle', f: 660, a: 0.003, r: 0.08, g: 0.08 }); return tone(ctx, out, { t: p.t + 0.05, type: 'triangle', f: 990, a: 0.003, r: 0.1, g: 0.08 }); },
        'ui.denied': (ctx, out, p) => tone(ctx, out, { t: p.t, type: 'square', f: 140, f2: 110, a: 0.005, h: 0.06, r: 0.1, g: 0.07, lp: 900 }),
        'ui.door': (ctx, out, p) => { tone(ctx, out, { t: p.t, type: 'square', f: 260, a: 0.004, r: 0.1, g: 0.05, lp: 1200 }); return tone(ctx, out, { t: p.t + 0.08, type: 'triangle', f: 390, a: 0.004, r: 0.16, g: 0.06 }); },
        'ui.travel': (ctx, out, p) => { noise(ctx, out, { t: p.t, dur: 0.4, type: 'bandpass', f: 400, f2: 2400, q: 1.5, g: 0.08, a: 0.1, r: 0.2 }); return tone(ctx, out, { t: p.t + 0.1, type: 'triangle', f: 523, a: 0.01, r: 0.3, g: 0.06 }); },
        'ui.levelup': (ctx, out, p) => { [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, { t: p.t + i * 0.08, type: 'square', f, a: 0.004, h: 0.05, r: 0.2, g: 0.06, lp: 3000 })); return p.t + 0.7; },
        'quiz.correct': (ctx, out, p) => {
            [880, 1320, 1760].forEach((f, i) => tone(ctx, out, { t: p.t + i * 0.06, type: 'triangle', f, a: 0.003, h: 0.02, r: 0.45, g: 0.09 }));
            noise(ctx, out, { t: p.t + 0.1, dur: 0.25, type: 'highpass', f: 6000, g: 0.04, a: 0.01, r: 0.2 });
            return p.t + 0.65;
        },
        'quiz.wrong': (ctx, out, p) => {
            tone(ctx, out, { t: p.t, type: 'square', f: 220, f2: 180, a: 0.005, h: 0.18, r: 0.15, g: 0.07, lp: 1400 });
            return tone(ctx, out, { t: p.t, type: 'square', f: 233, f2: 186, a: 0.005, h: 0.18, r: 0.15, g: 0.07, lp: 1400 });
        },
        'quiz.tick': (ctx, out, p) => tone(ctx, out, { t: p.t, type: 'square', f: 1600, a: 0.001, r: 0.03, g: 0.04, lp: 5000 }),
        'mp.charge': (ctx, out, p) => {
            const f = 420 + 900 * (p.level ?? 0.5);
            return tone(ctx, out, { t: p.t, type: 'sine', f, f2: f * 1.5, a: 0.005, r: 0.14, g: 0.07 });
        },
        'mp.ready': (ctx, out, p) => {
            [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(ctx, out, { t: p.t + i * 0.06, type: 'triangle', f, a: 0.004, h: 0.03, r: 0.5, g: 0.06 }));
            noise(ctx, out, { t: p.t, dur: 0.8, type: 'highpass', f: 5000, f2: 9000, g: 0.05, a: 0.4, r: 0.3 });
            return p.t + 1.0;
        },
        'turn.player': (ctx, out, p) => { noise(ctx, out, { t: p.t, dur: 0.18, type: 'bandpass', f: 600, f2: 2400, q: 1.5, g: 0.05, a: 0.05, r: 0.1 }); return tone(ctx, out, { t: p.t + 0.08, type: 'triangle', f: 784, a: 0.004, r: 0.18, g: 0.05 }); },
        'turn.enemy': (ctx, out, p) => { noise(ctx, out, { t: p.t, dur: 0.2, type: 'bandpass', f: 1800, f2: 400, q: 1.5, g: 0.05, a: 0.05, r: 0.12 }); return tone(ctx, out, { t: p.t + 0.06, type: 'triangle', f: 196, a: 0.004, r: 0.2, g: 0.06 }); },
        'hit.damage': (ctx, out, p) => { noise(ctx, out, { t: p.t, dur: 0.12, type: 'lowpass', f: 900, g: 0.18, a: 0.002, r: 0.1 }); return tone(ctx, out, { t: p.t, type: 'sine', f: 130, f2: 50, a: 0.002, r: 0.2, g: 0.3 }); },
        heal: (ctx, out, p) => {
            tone(ctx, out, { t: p.t, type: 'sine', f: 520, f2: 1040, a: 0.05, h: 0.1, r: 0.3, g: 0.07 });
            [1319, 1568, 2093].forEach((f, i) => tone(ctx, out, { t: p.t + 0.1 + i * 0.07, type: 'triangle', f, a: 0.004, r: 0.3, g: 0.04 }));
            return p.t + 0.7;
        },
        'status.burn': (ctx, out, p) => ELEMENT.fire(ctx, out, p.t, 0.35),
        'status.stun': (ctx, out, p) => tone(ctx, out, { t: p.t, type: 'triangle', f: 900, f2: 700, a: 0.01, h: 0.3, r: 0.2, g: 0.06, vibrato: [9, 60] }),
        'attack.cast': cast,
        'attack.impact': impact,
        'ult.charge': ultCharge,
        monster,
        'jingle.victory': (ctx, out, p) => {
            const brass = (n, t, len, g) => [0, 7].forEach((d) => tone(ctx, out, { t, type: 'sawtooth', f: midi(n), a: 0.02, h: len, r: 0.25, g, lp: 2400, detune: d }));
            [72, 76, 79].forEach((n, i) => brass(n, p.t + i * 0.13, 0.08, 0.05));
            brass(84, p.t + 0.42, 0.25, 0.06);
            [60, 64, 67, 72].forEach((n) => tone(ctx, out, { t: p.t + 0.8, type: 'sawtooth', f: midi(n), a: 0.04, h: 1.0, r: 0.8, g: 0.035, lp: 2000 }));
            [0, 0.42, 0.8].forEach((d) => tone(ctx, out, { t: p.t + d, type: 'sine', f: 98, f2: 60, a: 0.003, r: 0.35, g: 0.25 }));
            return p.t + 2.8;
        },
        'jingle.defeat': (ctx, out, p) => {
            [69, 65, 62].forEach((n, i) => tone(ctx, out, { t: p.t + i * 0.45, type: 'triangle', f: midi(n), a: 0.03, h: 0.25, r: 0.4, g: 0.08, lp: 1800 }));
            tone(ctx, out, { t: p.t + 1.35, type: 'sawtooth', f: midi(45), a: 0.3, h: 0.8, r: 1.2, g: 0.06, lp: 500 });
            tone(ctx, out, { t: p.t + 1.35, type: 'triangle', f: midi(57), a: 0.3, h: 0.8, r: 1.2, g: 0.04 });
            return p.t + 3.7;
        }
    };

    // ---- Music: instruments -------------------------------------------------------------------
    const INST = {
        kick: (ctx, out, t, g) => tone(ctx, out, { t, type: 'sine', f: 150, f2: 42, sweep: 0.12, a: 0.002, r: 0.22, g: g ?? 0.5 }),
        snare: (ctx, out, t, g) => { noise(ctx, out, { t, dur: 0.14, type: 'highpass', f: 1500, g: (g ?? 0.18), a: 0.002, r: 0.12 }); tone(ctx, out, { t, type: 'triangle', f: 210, f2: 160, a: 0.002, r: 0.08, g: (g ?? 0.18) * 0.7 }); },
        hat: (ctx, out, t, g, open) => noise(ctx, out, { t, dur: open ? 0.18 : 0.04, type: 'highpass', f: 7500, g: g ?? 0.05, a: 0.001, r: open ? 0.15 : 0.03 }),
        tom: (ctx, out, t, f) => tone(ctx, out, { t, type: 'sine', f, f2: f * 0.6, a: 0.002, r: 0.25, g: 0.22 }),
        bass: (ctx, out, t, n, len, g) => tone(ctx, out, { t, type: 'sawtooth', f: midi(n), a: 0.005, h: len * 0.6, r: len * 0.4, g: g ?? 0.09, lp: 420, q: 4 }),
        pluck: (ctx, out, t, n, g, cutoff) => tone(ctx, out, { t, type: 'square', f: midi(n), a: 0.003, r: 0.22, g: g ?? 0.04, lp: cutoff ?? 1800, lp2: 500 }),
        lead: (ctx, out, t, n, len, g, cutoff) => { tone(ctx, out, { t, type: 'sawtooth', f: midi(n), a: 0.004, h: len * 0.5, r: len * 0.6, g: g ?? 0.035, lp: cutoff ?? 2200, q: 2 }); },
        pad: (ctx, out, t, notes, len, g, cutoff) => notes.forEach((n, i) => tone(ctx, out, { t, type: i % 2 ? 'triangle' : 'sawtooth', f: midi(n), a: len * 0.3, h: len * 0.4, r: len * 0.4, g: g ?? 0.02, lp: cutoff ?? 900, detune: i * 6 - 6 })),
        bell: (ctx, out, t, n, g) => { tone(ctx, out, { t, type: 'sine', f: midi(n), a: 0.003, r: 1.2, g: g ?? 0.04 }); tone(ctx, out, { t, type: 'sine', f: midi(n) * 2.76, a: 0.003, r: 0.4, g: (g ?? 0.04) * 0.3 }); },
        stab: (ctx, out, t, notes, g) => notes.forEach((n, i) => tone(ctx, out, { t, type: 'sawtooth', f: midi(n), a: 0.004, h: 0.06, r: 0.12, g: g ?? 0.03, lp: 2600, detune: i * 7 }))
    };

    // ---- Music: tracks (step = 16th note) -------------------------------------------------------
    const MUSIC = {
        // Calm ambient for menus / title.
        menu: {
            bpm: 72, bars: 4,
            chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
            step(ctx, out, s, t, sp) {
                const bar = Math.floor(s / 16) % this.bars, st = s % 16;
                const ch = this.chords[bar];
                if (st === 0) INST.pad(ctx, out, t, ch.concat(ch[0] + 12), sp * 18, 0.018, 800);
                if (st === 0) INST.bass(ctx, out, t, ch[0] - 24, sp * 14, 0.05);
                if ([4, 10, 14].includes(st) && Math.random() < 0.7) INST.bell(ctx, out, t, ch[Math.floor(Math.random() * 3)] + 24, 0.03);
            }
        },
        // Light exploration theme for the overworld.
        overworld: {
            bpm: 104, bars: 4,
            chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
            step(ctx, out, s, t, sp) {
                const bar = Math.floor(s / 16) % this.bars, st = s % 16;
                const ch = this.chords[bar];
                if (st % 4 === 0) INST.bass(ctx, out, t, ch[0] - 24, sp * 3, 0.06);
                if (st % 2 === 0) INST.pluck(ctx, out, t, ch[[0, 1, 2, 1, 2, 1, 0, 2][(st / 2) % 8]] + 12, 0.035, 2200);
                if (st % 4 === 2) INST.hat(ctx, out, t, 0.025);
                if (st === 0) INST.pad(ctx, out, t, ch, sp * 16, 0.012, 700);
                if (st === 12 && bar % 2 === 1) INST.bell(ctx, out, t, ch[2] + 24, 0.025);
            }
        },
        // Epic battle loop; `intensity` (0..1) adds layers: 16th hats, four-on-the-floor,
        // brass stabs, open filters, tom fills, and a shimmering high arp when the ultimate is ready.
        battle: {
            bpm: 148, bars: 4,
            chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],   // Am  F  G  E
            step(ctx, out, s, t, sp, I) {
                const bar = Math.floor(s / 16) % this.bars, st = s % 16;
                const ch = this.chords[bar];
                // drums
                if (st === 0 || st === 8 || (I > 0.3 && (st === 4 || st === 12)) || (I > 0.7 && st === 14)) INST.kick(ctx, out, t, 0.42);
                if (st === 4 || st === 12) INST.snare(ctx, out, t, 0.14 + 0.06 * I);
                if (st % 2 === 0 || I > 0.5) INST.hat(ctx, out, t, st % 2 ? 0.025 : 0.04, st === 14);
                if (I > 0.6 && bar === 3 && st >= 12) INST.tom(ctx, out, t, [180, 150, 120, 95][st - 12]);
                // bass: driving 8ths with octave jumps
                if (st % 2 === 0) INST.bass(ctx, out, t, ch[0] - 24 + (st === 6 || st === 14 ? 12 : 0), sp * 1.8, 0.08);
                // arpeggio lead; filter opens with intensity
                const arp = [0, 1, 2, 1, 0, 2, 1, 2];
                INST.pluck(ctx, out, t, ch[arp[st % 8]] + 12, 0.028 + 0.012 * I, 1200 + 2800 * I);
                // pad every bar
                if (st === 0) INST.pad(ctx, out, t, ch, sp * 16, 0.015 + 0.01 * I, 700 + 900 * I);
                // brass stabs at high intensity
                if (I > 0.6 && (st === 0 || st === 3 || st === 6)) INST.stab(ctx, out, t, ch.map((n) => n + 12), 0.025);
                // melody hook on bars 0 and 2
                const hook = { 0: 76, 3: 74, 6: 72, 8: 71, 10: 72, 12: 69 };
                if ((bar === 0 || bar === 2) && hook[st] != null) INST.lead(ctx, out, t, hook[st] - (bar === 2 ? 2 : 0), sp * 2, 0.03 + 0.015 * I, 1800 + 2000 * I);
                // ultimate ready: shimmering high arp
                if (I >= 0.8) INST.bell(ctx, out, t, ch[st % 3] + 36, 0.012);
            }
        }
    };

    return { SFX, MUSIC, ELEMENT, midi, tone, noise };
})();
