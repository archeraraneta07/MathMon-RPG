/**
 * MathMon title screen (DOM overlay over the canvas): logo, tagline, element
 * type chart, and the main menu (Continue / New Game / Audio).
 * TitleScene (js/phaser-game.js) owns what each choice does; this module only
 * renders and reports intent. Keyboard: ↑/↓ choose, Enter confirms.
 */
const MathMonTitleScreen = (function createTitleScreen() {
    'use strict';

    const ICONS = {
        fire: '<path d="M12 2.5c1.2 4 5.5 6.2 5.5 11.3a5.5 5.5 0 0 1-11 0c0-2.3 1.1-3.9 2.3-5 0 2.1 1 3.3 2.2 3.3 0-3.2-1.2-6.2 1-9.6z"/>',
        water: '<path d="M12 2.5C9 7.2 6 10.6 6 14.2a6 6 0 0 0 12 0c0-3.6-3-7-6-11.7z"/>',
        wind: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M3 8.5h11.5a3 3 0 1 0-3-3M3 12.5h15.5a3 3 0 1 1-3 3M3 16.5h7"/>',
        earth: '<path d="M1.5 20.5 8.8 7.8l4.1 6.4 3-4.4 6.6 10.7z"/>'
    };

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    /**
     * @param {object} o { container, save, elements, monsters, onContinue, onNewGame, onAudio, onHover, onSelect }
     *   save: { playerName, level, elementName } | null
     */
    function mount(o) {
        const root = el('div', 'mm-title');
        root.setAttribute('role', 'main');
        root.setAttribute('aria-label', 'MathMon Quest title screen');

        const brand = el('header', 'mm-title__brand');
        brand.append(el('p', 'mm-title__eyebrow', 'A Math Monster RPG'));
        const logo = el('h1', 'mm-title__logo');
        logo.setAttribute('aria-label', 'MathMon Quest');
        logo.innerHTML = '<span class="mm-title__word mm-title__word--math" aria-hidden="true">MATH</span><span class="mm-title__word mm-title__word--mon" aria-hidden="true">MON</span>';
        brand.append(logo, el('p', 'mm-title__quest', 'QUEST'), el('p', 'mm-title__tagline', 'Answer fast. Strike hard. Master the elements.'));

        // Type chart strip: Water › Fire › Wind › Earth › (Water)
        const chart = el('ol', 'mm-title__chart');
        chart.setAttribute('aria-label', 'Type chart: each element beats the next');
        ['water', 'fire', 'wind', 'earth'].forEach((key, i) => {
            const e = o.elements[key];
            const m = o.monsters[e.monster];
            const li = el('li', 'mm-title__el');
            li.style.setProperty('--el-color', e.color);
            li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ICONS[key]}</svg>`;
            const label = el('span', 'mm-title__el-text');
            label.append(el('strong', null, e.name), el('small', null, m.name));
            li.append(label);
            chart.append(li);
            if (i < 3) {
                const arrow = el('li', 'mm-title__beats', '›');
                arrow.setAttribute('aria-hidden', 'true');
                chart.append(arrow);
            }
        });

        // Menu
        const menu = el('nav', 'mm-title__menu');
        menu.setAttribute('aria-label', 'Main menu');
        const buttons = [];
        const addButton = (label, sub, cls, onClick) => {
            const b = el('button', `mm-title__btn ${cls}`);
            b.type = 'button';
            b.append(el('span', 'mm-title__btn-label', label));
            if (sub) b.append(el('span', 'mm-title__btn-sub', sub));
            b.addEventListener('click', () => onClick(b));
            b.addEventListener('pointerenter', () => { if (o.onHover) o.onHover(); b.focus({ preventScroll: true }); });
            menu.append(b);
            buttons.push(b);
            return b;
        };
        let confirmTimer = null;
        if (o.save) {
            addButton('Continue', `${o.save.playerName} · Lv ${o.save.level} · ${o.save.elementName}`, 'mm-title__btn--primary', () => o.onContinue());
            addButton('New Game', 'Start a new trainer', 'mm-title__btn--ghost', (b) => {
                // Two-step confirm: a new game replaces the saved trainer.
                if (!b.classList.contains('is-confirming')) {
                    b.classList.add('is-confirming');
                    b.querySelector('.mm-title__btn-label').textContent = 'Replace save?';
                    b.querySelector('.mm-title__btn-sub').textContent = 'Press again to confirm';
                    if (o.onSelect) o.onSelect();
                    clearTimeout(confirmTimer);
                    confirmTimer = setTimeout(() => {
                        b.classList.remove('is-confirming');
                        b.querySelector('.mm-title__btn-label').textContent = 'New Game';
                        b.querySelector('.mm-title__btn-sub').textContent = 'Start a new trainer';
                    }, 3500);
                    return;
                }
                o.onNewGame();
            });
        } else {
            addButton('Start Adventure', 'Choose your trainer and element', 'mm-title__btn--primary', () => o.onNewGame());
        }
        addButton('Audio', 'Music & effects volume', 'mm-title__btn--ghost mm-title__btn--small', () => o.onAudio());

        const hint = el('p', 'mm-title__hint');
        hint.innerHTML = '<kbd>Enter</kbd> start &nbsp;·&nbsp; <kbd>↑</kbd><kbd>↓</kbd> choose &nbsp;·&nbsp; <kbd>M</kbd> mute';

        root.append(brand, chart, menu, hint, el('p', 'mm-title__footer', 'MathMon Quest'));
        o.container.append(root);

        // Keep the overlay on the (FIT-scaled) Phaser canvas.
        const sync = () => {
            const pc = o.container.querySelector('canvas:not(.mm-title3d):not(.mm-world3d):not(.mm-stage3d)');
            if (!pc) return;
            const c = pc.getBoundingClientRect(), p = o.container.getBoundingClientRect();
            Object.assign(root.style, { left: `${c.left - p.left}px`, top: `${c.top - p.top}px`, width: `${c.width}px`, height: `${c.height}px` });
            root.style.setProperty('--title-w', `${c.width}px`);
        };
        const onResize = () => requestAnimationFrame(sync);
        window.addEventListener('resize', onResize);
        sync();
        setTimeout(sync, 50);

        const onKey = (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const i = buttons.indexOf(document.activeElement);
            const next = i < 0 ? buttons[0] : buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length];
            next.focus({ preventScroll: true });
            if (o.onHover) o.onHover();
        };
        document.addEventListener('keydown', onKey);
        requestAnimationFrame(() => root.classList.add('is-ready'));

        return {
            /** The menu button Enter should trigger when nothing is focused. */
            primary: buttons[0],
            focused: () => (root.contains(document.activeElement) ? document.activeElement : null),
            fadeOut() { root.classList.add('is-leaving'); },
            destroy() {
                clearTimeout(confirmTimer);
                window.removeEventListener('resize', onResize);
                document.removeEventListener('keydown', onKey);
                root.remove();
            }
        };
    }

    return { mount };
})();
