/**
 * MathMon audio manager (Web Audio API).
 *
 *   master ─ limiter ─► speakers
 *     ├─ musicBus  (music volume)  ◄─ looping tracks, jingles
 *     └─ sfxBus    (effects volume) ◄─ voices ◄─ (optional) reverb send for echoes
 *
 * - Starts only after the first user interaction (browser autoplay rules).
 * - Plays a file from the manifest when one is loaded, otherwise the generated
 *   sound from js/audio/audio-synth.js — so it always works with zero files.
 * - Voice limiting: per-category caps + a global cap; the oldest voice in a full
 *   category fades out in 40 ms. Per-sound cooldowns stop machine-gun repeats.
 * - Music: seamless looping (lookahead-scheduled sequencer or looped buffers),
 *   crossfades between tracks, and a smoothed 0..1 `intensity` that adds layers.
 * - Settings (music volume, effects volume, mute) persist in localStorage.
 *
 * Public API: window.MathMonAudio (see the return statement at the bottom).
 */
const MathMonAudio = (function createAudioManager() {
    'use strict';

    const SETTINGS_KEY = 'mathmon_audio';
    const CATEGORY_LIMITS = { ui: 4, combat: 8, voice: 2, jingle: 1 };
    const GLOBAL_LIMIT = 18;
    const DEFAULT_COOLDOWN = { 'ui.hover': 0.06, 'ui.click': 0.03, 'quiz.tick': 0.2, 'mp.charge': 0.08, 'hit.damage': 0.05 };

    const settings = Object.assign({ music: 0.55, sfx: 0.85, muted: false }, readSettings());
    const listeners = new Set();
    const voices = [];
    const lastPlayed = new Map();
    const buffers = new Map();
    let ctx = null, master = null, musicBus = null, sfxBus = null, reverbIn = null;
    let unlocked = false;
    let pendingTrack = null;
    let music = null;                 // current music player
    let targetIntensity = 0;
    let preloadPromise = null;

    function readSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
    }

    function saveSettings() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
        listeners.forEach((fn) => fn({ ...settings }));
    }

    // ---- Graph -------------------------------------------------------------------------
    function ensureContext() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC({ latencyHint: 'interactive' });
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        master = ctx.createGain();
        musicBus = ctx.createGain();
        sfxBus = ctx.createGain();
        musicBus.connect(master);
        sfxBus.connect(master);
        master.connect(limiter).connect(ctx.destination);
        // Generated stereo impulse response → convolution reverb for echoes/tails.
        const conv = ctx.createConvolver();
        const len = Math.floor(ctx.sampleRate * 2.4);
        const ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
        }
        conv.buffer = ir;
        reverbIn = ctx.createGain();
        reverbIn.gain.value = 0.6;
        reverbIn.connect(conv).connect(sfxBus);
        applyVolumes(true);
        document.addEventListener('visibilitychange', () => {
            if (!ctx || !unlocked) return;
            if (document.hidden) ctx.suspend();
            else ctx.resume();
        });
        return ctx;
    }

    function applyVolumes(instant) {
        if (!ctx) return;
        const t = ctx.currentTime;
        const set = (param, v) => (instant ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, 0.05));
        set(master.gain, settings.muted ? 0 : 1);
        set(musicBus.gain, settings.music * settings.music);   // perceptual (squared) curve
        set(sfxBus.gain, settings.sfx * settings.sfx);
    }

    /** Called on the first user gesture (browsers block audio before that). */
    function unlock() {
        if (unlocked) return;
        if (!ensureContext()) return;
        ctx.resume();
        unlocked = true;
        ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, unlock, true));
        preload();
        if (pendingTrack) {
            const track = pendingTrack;
            pendingTrack = null;
            playMusic(track);
        }
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, true));

    // ---- Files (optional) -----------------------------------------------------------------
    function preload() {
        if (preloadPromise) return preloadPromise;
        const manifest = typeof MathMonAudioManifest !== 'undefined' ? MathMonAudioManifest : null;
        if (!manifest || !manifest.filesEnabled || !ensureContext()) return (preloadPromise = Promise.resolve());
        const jobs = [];
        const load = (key, path) => jobs.push(fetch(manifest.basePath + path)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
            .then((data) => ctx.decodeAudioData(data))
            .then((buf) => buffers.set(key, buf))
            .catch(() => { /* missing file → generated sound */ }));
        Object.entries(manifest.sfx).forEach(([id, path]) => load(id, path));
        Object.entries(manifest.music).forEach(([track, m]) => {
            load(`music.${track}`, m.file);
            if (m.intense) load(`music.${track}.intense`, m.intense);
        });
        preloadPromise = Promise.all(jobs);
        return preloadPromise;
    }

    // ---- Voices -------------------------------------------------------------------------------
    function categoryOf(id) {
        if (/^(ui|quiz|mp|turn)\./.test(id)) return 'ui';
        if (id.startsWith('monster')) return 'voice';
        if (id.startsWith('jingle')) return 'jingle';
        return 'combat';
    }

    function stopVoice(v, fade) {
        if (v.stopped) return;
        v.stopped = true;
        const t = ctx.currentTime;
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(v.gain.gain.value, t);
        v.gain.gain.linearRampToValueAtTime(0, t + (fade || 0.04));
        setTimeout(() => v.gain.disconnect(), ((fade || 0.04) + 0.05) * 1000);
        const i = voices.indexOf(v);
        if (i >= 0) voices.splice(i, 1);
    }

    function allocVoice(category, bus, reverb) {
        const same = voices.filter((v) => v.category === category);
        if (same.length >= (CATEGORY_LIMITS[category] || 6)) stopVoice(same[0]);
        if (voices.length >= GLOBAL_LIMIT) stopVoice(voices[0]);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.008);   // short fade-in, no clicks
        gain.connect(bus);
        if (reverb) {
            const send = ctx.createGain();
            send.gain.value = reverb;
            gain.connect(send).connect(reverbIn);
        }
        const v = { gain, category, started: ctx.currentTime, stopped: false };
        voices.push(v);
        return v;
    }

    function playBuffer(buf, out, opts) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        if (opts.rate) src.playbackRate.value = opts.rate;
        let node = src;
        if (opts.lowpass) {
            const fl = ctx.createBiquadFilter();
            fl.type = 'lowpass';
            fl.frequency.value = opts.lowpass;
            node.connect(fl);
            node = fl;
        }
        const g = ctx.createGain();
        g.gain.value = opts.gain ?? 1;
        node.connect(g).connect(out);
        src.start(ctx.currentTime);
        return ctx.currentTime + buf.duration / (opts.rate || 1);
    }

    /**
     * Play a sound by id.
     * @param {string} id        e.g. 'quiz.correct', 'attack.impact', 'monster'
     * @param {object} [params]  passed to the generator (element, action, matchup, monster, kind…)
     *   params.fileIds  ids to try in the manifest first (most specific first)
     *   params.reverb   0..1 send to the echo reverb
     *   params.bus      'music' to route jingles through the music volume
     *   params.cooldown seconds before the same id may play again
     */
    function play(id, params) {
        if (!unlocked || !ctx || settings.muted) return null;
        const p = params || {};
        const key = p.cooldownKey || id;
        const cd = p.cooldown ?? DEFAULT_COOLDOWN[key] ?? 0.025;
        const now = ctx.currentTime;
        if (now - (lastPlayed.get(key) ?? -1) < cd) return null;
        lastPlayed.set(key, now);

        const category = categoryOf(id);
        const voice = allocVoice(category, p.bus === 'music' ? musicBus : sfxBus, p.reverb);
        let end;
        const fileId = (p.fileIds || [id]).find((f) => buffers.has(f));
        if (fileId) {
            end = playBuffer(buffers.get(fileId), voice.gain, {
                lowpass: p.matchup === 'weak' ? 700 : null,
                gain: p.matchup === 'weak' ? 0.55 : p.matchup === 'strong' ? 1.2 : 1
            });
            if (p.matchup === 'strong' && MathMonSynth.SFX['attack.impact']) {
                MathMonSynth.tone(ctx, voice.gain, { t: now, type: 'sine', f: 75, f2: 28, a: 0.003, h: 0.05, r: 0.55, g: 0.35 });
            }
        } else {
            const gen = MathMonSynth.SFX[id];
            if (!gen) { stopVoice(voice, 0.01); return null; }
            end = gen(ctx, voice.gain, { ...p, t: now + 0.005 });
        }
        const lifetime = Math.max(0.1, end - now) + (p.reverb ? 2.4 : 0.15);
        setTimeout(() => stopVoice(voice, 0.05), lifetime * 1000);
        return voice;
    }

    // ---- Game-facing helpers ----------------------------------------------------------------
    function attackCast(element, action) {
        return play('attack.cast', { element, action, fileIds: [`attack.cast.${element}.${action}`, `attack.cast.${element}`], cooldown: 0.05 });
    }

    /** Hit at the moment of impact. matchup: 'strong' → heavier, 'weak' → muffled. */
    function impact(o) {
        const ids = o.action === 'ultimate' ? ['attack.impact.ultimate', `attack.impact.${o.element}`] : [`attack.impact.${o.element}.${o.action}`, `attack.impact.${o.element}`];
        return play('attack.impact', { ...o, fileIds: ids, reverb: o.action === 'ultimate' ? 0.55 : o.action === 'skill2' ? 0.15 : 0, cooldown: 0.04, cooldownKey: `impact.${o.element}` });
    }

    function ultCharge(element) {
        return play('ult.charge', { element, reverb: 0.25, cooldown: 0.5 });
    }

    /** Monster voice: kind 'roar' | 'hurt' | 'defeat'. */
    function monster(key, kind, opts) {
        return play('monster', { monster: key, kind, ...opts, fileIds: [`monster.${key}.${kind}`], reverb: kind === 'hurt' ? 0.1 : 0.3,
            cooldownKey: `monster.${key}.${kind}`, cooldown: kind === 'hurt' ? 0.6 : 0.8 });
    }

    // ---- Music --------------------------------------------------------------------------------
    function makeProceduralPlayer(name) {
        const track = MathMonSynth.MUSIC[name];
        if (!track) return null;
        const out = ctx.createGain();
        out.gain.value = 0;
        out.connect(musicBus);
        const player = { name, out, step: 0, next: ctx.currentTime + 0.1, intensity: targetIntensity, timer: null };
        const sp = 60 / track.bpm / 4;
        player.timer = setInterval(() => {
            while (player.next < ctx.currentTime + 0.15) {
                player.intensity += (targetIntensity - player.intensity) * 0.08;   // smooth build-ups
                track.step(ctx, out, player.step, player.next, sp, player.intensity);
                player.next += sp;
                player.step++;
            }
        }, 25);
        player.stop = (fade) => {
            clearInterval(player.timer);
            fadeOutAndDisconnect(out, fade);
        };
        return player;
    }

    function makeFilePlayer(name) {
        const main = buffers.get(`music.${name}`);
        if (!main) return null;
        const out = ctx.createGain();
        out.gain.value = 0;
        out.connect(musicBus);
        const start = ctx.currentTime + 0.05;
        const loop = (buf, gainValue) => {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = true;                       // sample-accurate, gapless loop
            const g = ctx.createGain();
            g.gain.value = gainValue;
            src.connect(g).connect(out);
            src.start(start);
            return { src, g };
        };
        const base = loop(main, 1);
        const intenseBuf = buffers.get(`music.${name}.intense`);
        const layer = intenseBuf ? loop(intenseBuf, targetIntensity) : null;
        const player = { name, out, layer, intensity: targetIntensity };
        player.timer = layer ? setInterval(() => layer.g.gain.setTargetAtTime(targetIntensity, ctx.currentTime, 0.6), 200) : null;
        player.stop = (fade) => {
            clearInterval(player.timer);
            fadeOutAndDisconnect(out, fade, () => { base.src.stop(); if (layer) layer.src.stop(); });
        };
        return player;
    }

    function fadeOutAndDisconnect(node, fade, after) {
        const t = ctx.currentTime;
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(node.gain.value, t);
        node.gain.linearRampToValueAtTime(0, t + (fade ?? 0.8));
        setTimeout(() => { if (after) after(); node.disconnect(); }, ((fade ?? 0.8) + 0.2) * 1000);
    }

    /** Crossfade to a looping track ('menu' | 'overworld' | 'battle'); null stops music. */
    function playMusic(name, opts) {
        if (!unlocked) { pendingTrack = name; return; }
        if (music && music.name === name) return;
        if (music) music.stop((opts && opts.fade) ?? 0.8);
        music = null;
        if (!name) return;
        if (name !== 'battle') targetIntensity = 0;
        music = makeFilePlayer(name) || makeProceduralPlayer(name);
        if (music) {
            music.out.gain.setValueAtTime(0, ctx.currentTime);
            music.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.0);
        }
    }

    function stopMusic(fade) {
        pendingTrack = null;
        playMusic(null, { fade });
    }

    /** 0 = calm … 1 = maximum (low HP, ultimate ready). Smoothed by the player. */
    function setIntensity(v) {
        targetIntensity = Math.max(0, Math.min(1, v));
    }

    /** Victory / defeat jingle: stops the loop and plays through the music volume. */
    function playJingle(kind) {
        stopMusic(0.4);
        return play(`jingle.${kind}`, { bus: 'music', reverb: 0.35, cooldown: 1 });
    }

    // ---- Settings ------------------------------------------------------------------------------
    function setMusicVolume(v) { settings.music = Math.max(0, Math.min(1, v)); applyVolumes(); saveSettings(); }
    function setSfxVolume(v) { settings.sfx = Math.max(0, Math.min(1, v)); applyVolumes(); saveSettings(); }
    function setMuted(m) {
        settings.muted = Boolean(m);
        if (settings.muted) voices.slice().forEach((v) => stopVoice(v, 0.05));
        applyVolumes();
        saveSettings();
    }

    return {
        unlock,
        isUnlocked: () => unlocked,
        preload,
        play,
        attackCast,
        impact,
        ultCharge,
        monster,
        playMusic,
        stopMusic,
        setIntensity,
        playJingle,
        getSettings: () => ({ ...settings }),
        setMusicVolume,
        setSfxVolume,
        setMuted,
        toggleMute: () => { setMuted(!settings.muted); return settings.muted; },
        isMuted: () => settings.muted,
        onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
    };
})();
