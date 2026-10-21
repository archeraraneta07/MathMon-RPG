/**
 * MathMon audio controls: a speaker button + popover with separate Music and
 * Effects volume sliders and a mute toggle. Settings persist via MathMonAudio.
 * The battle HUD's sound button opens the same panel (MathMonAudioUI.toggle()).
 * Keyboard: M toggles mute anywhere (handled in phaser-game.js), Esc closes.
 */
const MathMonAudioUI = (function createAudioUI() {
    'use strict';

    const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
    const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m16 9 5 6m0-6-5 6"/></svg>';
    let button = null, panel = null;

    function init() {
        const container = document.getElementById('game-container');
        if (!container || button) return;
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'mm-audio-btn';
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', function onAudioButton() { toggle(); });

        panel = document.createElement('div');
        panel.className = 'mm-audio-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Audio settings');
        panel.hidden = true;
        panel.innerHTML = `
            <strong class="mm-audio-panel__title">Audio</strong>
            <label class="mm-audio-row"><span>Music</span><input type="range" min="0" max="100" step="1" data-kind="music"><output></output></label>
            <label class="mm-audio-row"><span>Effects</span><input type="range" min="0" max="100" step="1" data-kind="sfx"><output></output></label>
            <button type="button" class="mm-audio-mute"></button>
            <p class="mm-audio-note">M mutes / unmutes at any time.</p>`;
        container.append(button, panel);

        panel.querySelectorAll('input[type=range]').forEach((input) => {
            input.addEventListener('input', () => {
                const v = Number(input.value) / 100;
                if (input.dataset.kind === 'music') MathMonAudio.setMusicVolume(v);
                else MathMonAudio.setSfxVolume(v);
            });
            input.addEventListener('change', () => { if (input.dataset.kind === 'sfx') MathMonAudio.play('ui.select'); });
        });
        panel.querySelector('.mm-audio-mute').addEventListener('click', () => {
            MathMonAudio.toggleMute();
            MathMonAudio.play('ui.click');
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
        document.addEventListener('pointerdown', (e) => {
            if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('.mm-audio-btn, .mm-tool--sound')) close();
        });
        MathMonAudio.onChange(render);
        render(MathMonAudio.getSettings());
    }

    function render(s) {
        if (!button) return;
        button.innerHTML = s.muted ? SPEAKER_OFF : SPEAKER_ON;
        button.setAttribute('aria-label', `Audio settings (sound ${s.muted ? 'off' : 'on'})`);
        button.title = 'Audio settings (M to mute)';
        panel.querySelectorAll('input[type=range]').forEach((input) => {
            const v = Math.round((input.dataset.kind === 'music' ? s.music : s.sfx) * 100);
            input.value = String(v);
            input.nextElementSibling.textContent = `${v}%`;
            input.disabled = s.muted;
        });
        const mute = panel.querySelector('.mm-audio-mute');
        mute.textContent = s.muted ? 'Unmute' : 'Mute all';
        mute.setAttribute('aria-pressed', String(s.muted));
    }

    function open() {
        init();
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        panel.querySelector('input').focus({ preventScroll: true });
    }

    function close() {
        if (!panel) return;
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
    }

    function toggle() {
        if (!panel || panel.hidden) open();
        else close();
    }

    /** Hide the floating button where the screen already has its own (battle HUD). */
    function setButtonVisible(on) {
        init();
        button.hidden = !on;
        if (!on) close();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { open, close, toggle, setButtonVisible };
})();
