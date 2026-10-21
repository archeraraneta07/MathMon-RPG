/**
 * MathMon battle HUD — an accessible DOM overlay that sits exactly on top of
 * the game canvas during battles (styles: css/battle-hud.css).
 *
 * The HUD is a pure view: it never changes battle state itself. BattleScene
 * calls its methods to render and receives player intent through `handlers`:
 *   onSubmitAnswer(text), onHint(), onCommand(actionKey),
 *   onLockedCommand(actionKey), onToggleSound()
 */
const MathMonBattleHud = (function createBattleHudModule() {
    'use strict';

    const ICONS = {
        fire: '<path d="M12 2.5c1.2 4 5.5 6.2 5.5 11.3a5.5 5.5 0 0 1-11 0c0-2.3 1.1-3.9 2.3-5 0 2.1 1 3.3 2.2 3.3 0-3.2-1.2-6.2 1-9.6z"/>',
        water: '<path d="M12 2.5C9 7.2 6 10.6 6 14.2a6 6 0 0 0 12 0c0-3.6-3-7-6-11.7z"/>',
        wind: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M3 8.5h11.5a3 3 0 1 0-3-3M3 12.5h15.5a3 3 0 1 1-3 3M3 16.5h7"/>',
        earth: '<path d="M1.5 20.5 8.8 7.8l4.1 6.4 3-4.4 6.6 10.7z"/>',
        soundOn: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
        soundOff: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="m16 9 5 6m0-6-5 6"/>',
        log: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 7h14M5 12h14M5 17h9"/>',
        hint: '<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 19h6v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20.5z"/>'
    };

    function icon(name, extraClass) {
        return `<svg class="mm-icon ${extraClass || ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    }

    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (html) node.innerHTML = html;
        return node;
    }

    function restartAnimation(node, className) {
        node.classList.remove(className);
        void node.offsetWidth;
        node.classList.add(className);
    }

    function isTouch() {
        return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    }

    function cardMarkup(side) {
        const mp = side === 'player'
            ? `<div class="mm-meter mm-meter--mp" role="meter" aria-label="Mana">
                   <span class="mm-meter__tag">MP</span>
                   <div class="mm-meter__track"><div class="mm-meter__fill"></div></div>
                   <span class="mm-meter__value"></span>
               </div>`
            : '';
        return `
            <div class="mm-card__head">
                <span class="mm-badge"></span>
                <span class="mm-card__name"></span>
                <span class="mm-card__level"></span>
            </div>
            <div class="mm-card__title"></div>
            <div class="mm-meter mm-meter--hp" role="meter" aria-label="Health">
                <span class="mm-meter__tag">HP</span>
                <div class="mm-meter__track"><div class="mm-meter__ghost"></div><div class="mm-meter__fill"></div></div>
                <span class="mm-meter__value"></span>
            </div>
            ${mp}
            <div class="mm-chips" aria-label="Status effects"></div>`;
    }

    function create(options) {
        const container = options.container;
        const handlers = options.handlers || {};
        const elements = options.elements || {};
        const answerCfg = options.answers || {};

        const root = el('div', 'mm-hud');
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Battle');
        root.innerHTML = `
            <div class="mm-hud__top">
                <section class="mm-card mm-card--player">${cardMarkup('player')}</section>
                <div class="mm-hud__center">
                    <div class="mm-turn" aria-live="polite"></div>
                    <div class="mm-hud__tools">
                        <span class="mm-streak" hidden></span>
                        <button type="button" class="mm-tool mm-tool--sound" aria-pressed="true" aria-label="Sound on (M)" title="Sound (M)"></button>
                        <button type="button" class="mm-tool mm-tool--log" aria-expanded="false" aria-label="Battle log (L)" title="Battle log (L)">${icon('log')}</button>
                    </div>
                </div>
                <section class="mm-card mm-card--enemy">${cardMarkup('enemy')}</section>
            </div>
            <aside class="mm-log" hidden aria-label="Battle log"><ol class="mm-log__list"></ol></aside>
            <div class="mm-popups" aria-hidden="true"></div>
            <div class="mm-banners" aria-live="assertive"></div>
            <div class="mm-ticker" aria-live="polite"></div>
            <div class="mm-tutorial" hidden role="note" aria-label="How to battle"></div>
            <div class="mm-panel">
                <div class="mm-question" hidden>
                    <div class="mm-question__row">
                        <div class="mm-question__meta">
                            <span class="mm-chip mm-question__move"></span>
                            <span class="mm-chip mm-question__cat"></span>
                        </div>
                        <p class="mm-question__text" id="mm-question-text"></p>
                        <div class="mm-timer" role="timer" aria-label="Time left">
                            <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="mm-timer__bg" cx="18" cy="18" r="15.5"/><circle class="mm-timer__ring" cx="18" cy="18" r="15.5"/></svg>
                            <span class="mm-timer__num"></span>
                        </div>
                    </div>
                    <form class="mm-answer" autocomplete="off" novalidate>
                        <input class="mm-answer__input" type="text" name="mm-answer" aria-labelledby="mm-question-text"
                               inputmode="numeric" pattern="[0-9]*"
                               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                               enterkeyhint="send" placeholder="Type the number">
                        <button type="button" class="mm-answer__hint" title="Show a hint"></button>
                        <button type="submit" class="mm-answer__submit">Submit <kbd>Enter</kbd></button>
                    </form>
                    <p class="mm-hint" hidden></p>
                    <p class="mm-reveal" hidden></p>
                </div>
                <div class="mm-commands" hidden>
                    <div class="mm-commands__row"></div>
                </div>
            </div>`;
        container.appendChild(root);

        const $ = (sel) => root.querySelector(sel);
        const cards = { player: $('.mm-card--player'), enemy: $('.mm-card--enemy') };
        const panelEl = $('.mm-panel');
        const questionEl = $('.mm-question');
        const formEl = $('.mm-answer');
        const inputEl = $('.mm-answer__input');
        const submitEl = $('.mm-answer__submit');
        const hintBtn = $('.mm-answer__hint');
        const hintEl = $('.mm-hint');
        const revealEl = $('.mm-reveal');
        const commandsEl = $('.mm-commands');
        const commandRow = $('.mm-commands__row');
        const soundBtn = $('.mm-tool--sound');
        const logBtn = $('.mm-tool--log');
        const logEl = $('.mm-log');
        const logList = $('.mm-log__list');
        const tickerEl = $('.mm-ticker');
        const bannerLayer = $('.mm-banners');
        const popupLayer = $('.mm-popups');
        const timerEl = $('.mm-timer');
        const timerRing = $('.mm-timer__ring');
        const timerNum = $('.mm-timer__num');
        const RING = 2 * Math.PI * 15.5;
        timerRing.style.strokeDasharray = `${RING}`;
        inputEl.maxLength = answerCfg.maxLength || 40;
        let answering = false;

        // ---- Answer input -----------------------------------------------------
        function updateSubmitState() {
            submitEl.disabled = !answering || inputEl.value.trim() === '';
        }

        formEl.addEventListener('submit', function onAnswerSubmit(event) {
            event.preventDefault();
            if (!answering) return;
            if (inputEl.value.trim() === '') {
                rejectEmpty();
                return;
            }
            if (handlers.onSubmitAnswer) handlers.onSubmitAnswer(inputEl.value);
        });
        // Numbers only: answers are always whole numbers.
        inputEl.addEventListener('beforeinput', (event) => {
            if (event.data && /\D/.test(event.data) && event.inputType.startsWith('insert') && event.inputType !== 'insertFromPaste') {
                event.preventDefault();
                restartAnimation(inputEl, 'is-shaking');
            }
        });
        inputEl.addEventListener('input', () => {
            const digits = inputEl.value.replace(/\D/g, '');
            if (digits !== inputEl.value) inputEl.value = digits;   // IME / autofill safety net
            updateSubmitState();
        });
        hintBtn.addEventListener('click', function onHintClick() {
            if (hintBtn.disabled || !answering) return;
            if (handlers.onHint) handlers.onHint();
            inputEl.focus({ preventScroll: true });
        });

        // Anti copy-paste: typing is the point of the exercise.
        if (answerCfg.blockPaste !== false) {
            const blockPaste = (event) => {
                event.preventDefault();
                log('Pasting is disabled. Type your answer.', 'warn');
                restartAnimation(inputEl, 'is-shaking');
            };
            inputEl.addEventListener('paste', blockPaste);
            inputEl.addEventListener('drop', blockPaste);
            inputEl.addEventListener('beforeinput', (event) => {
                if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop' || event.inputType === 'insertFromYank') blockPaste(event);
            });
        }

        function rejectEmpty() {
            log('Type an answer first.', 'warn');
            restartAnimation(inputEl, 'is-shaking');
            inputEl.focus({ preventScroll: true });
        }

        soundBtn.addEventListener('click', function onSoundClick() {
            if (handlers.onToggleSound) handlers.onToggleSound();
        });
        logBtn.addEventListener('click', toggleLog);
        // Hover feedback for every enabled HUD button (one delegated listener).
        root.addEventListener('pointerover', (event) => {
            const btn = event.target.closest('button');
            if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
            if (event.relatedTarget && btn.contains(event.relatedTarget)) return;
            if (handlers.onHover) handlers.onHover();
        });

        // ---- Keep the overlay glued to the (FIT-scaled) canvas ---------------
        function syncToCanvas() {
            const canvas = container.querySelector('canvas:not(.mm-stage3d):not(.mm-world3d)');
            if (!canvas) return;
            const c = canvas.getBoundingClientRect();
            const p = container.getBoundingClientRect();
            root.style.left = `${c.left - p.left}px`;
            root.style.top = `${c.top - p.top}px`;
            root.style.width = `${c.width}px`;
            root.style.height = `${c.height}px`;
            root.style.setProperty('--hud-w', `${c.width}px`);
            root.style.setProperty('--hud-h', `${c.height}px`);
            syncKeyboard();
        }

        /*
         * Mobile keyboards: when the on-screen keyboard shrinks the visual
         * viewport, dock the question panel just above it (position: fixed)
         * so neither the question nor the input is covered.
         */
        function syncKeyboard() {
            const vv = window.visualViewport;
            if (!vv) return;
            const keyboard = window.innerHeight - vv.height - vv.offsetTop;
            const docked = keyboard > 80 && document.activeElement === inputEl;
            root.classList.toggle('is-keyboard', docked);
            if (docked) {
                panelEl.style.left = `${vv.offsetLeft + 8}px`;
                panelEl.style.width = `${vv.width - 16}px`;
                panelEl.style.bottom = `${keyboard + 8}px`;
            } else {
                panelEl.style.left = '';
                panelEl.style.width = '';
                panelEl.style.bottom = '';
            }
        }

        const onResize = () => requestAnimationFrame(syncToCanvas);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncKeyboard);
            window.visualViewport.addEventListener('scroll', syncKeyboard);
        }
        inputEl.addEventListener('focus', () => setTimeout(syncKeyboard, 300));
        inputEl.addEventListener('blur', () => setTimeout(syncKeyboard, 100));
        let observer = null;
        const canvasNode = container.querySelector('canvas:not(.mm-stage3d):not(.mm-world3d)');
        if (canvasNode && window.ResizeObserver) {
            observer = new ResizeObserver(onResize);
            observer.observe(canvasNode);
        }
        syncToCanvas();

        // ---- Combatant cards --------------------------------------------------
        function setCombatant(side, data) {
            const card = cards[side];
            const element = elements[data.element] || {};
            card.style.setProperty('--el-color', element.color || '#9e9e9e');
            card.style.setProperty('--el-dark', element.dark || '#333');
            const badge = card.querySelector('.mm-badge');
            badge.innerHTML = `${icon(data.element)}<span>${element.name || ''}</span>`;
            badge.title = `${element.name} element`;
            card.querySelector('.mm-card__name').textContent = data.name;
            card.querySelector('.mm-card__level').textContent = data.level ? `Lv ${data.level}` : '';
            card.querySelector('.mm-card__title').textContent = data.title || '';
            setHp(side, data.hp, data.maxHp, true);
            if (side === 'player' && data.maxMp) setMp(data.mp, data.maxMp, true);
        }

        function meterUpdate(meter, value, max, instant) {
            const pct = Math.max(0, Math.min(100, (value / max) * 100));
            const fill = meter.querySelector('.mm-meter__fill');
            const ghost = meter.querySelector('.mm-meter__ghost');
            if (instant) {
                fill.style.transition = 'none';
                if (ghost) ghost.style.transition = 'none';
                requestAnimationFrame(() => {
                    fill.style.transition = '';
                    if (ghost) ghost.style.transition = '';
                });
            }
            fill.style.width = `${pct}%`;
            if (ghost) ghost.style.width = `${pct}%`;
            meter.querySelector('.mm-meter__value').textContent = `${Math.round(value)}/${max}`;
            meter.setAttribute('aria-valuenow', String(Math.round(value)));
            meter.setAttribute('aria-valuemax', String(max));
            return pct;
        }

        function setHp(side, hp, max, instant) {
            const meter = cards[side].querySelector('.mm-meter--hp');
            const pct = meterUpdate(meter, hp, max, instant);
            meter.dataset.level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
        }

        function setMp(mp, max, instant) {
            const meter = cards.player.querySelector('.mm-meter--mp');
            const pct = meterUpdate(meter, mp, max, instant);
            meter.classList.toggle('is-full', pct >= 100);
        }

        function setStatuses(side, chips) {
            const holder = cards[side].querySelector('.mm-chips');
            holder.textContent = '';
            chips.forEach((chip) => {
                const node = el('span', `mm-status mm-status--${chip.key}`);
                node.textContent = chip.label;
                holder.appendChild(node);
            });
        }

        function pulseCard(side, kind) {
            const card = cards[side];
            card.classList.remove('is-hit', 'is-heal');
            restartAnimation(card, kind === 'heal' ? 'is-heal' : 'is-hit');
        }

        // ---- Turn indicator / streak / sound ----------------------------------
        function setTurn(info) {
            const turn = $('.mm-turn');
            turn.dataset.side = info.side;
            turn.textContent = info.label;
        }

        /** Combo chip: consecutive correct answers (shown from ×2). */
        function setStreak(count, bonusPercent) {
            const streak = $('.mm-streak');
            streak.hidden = count < 2;
            streak.textContent = bonusPercent ? `Combo ×${count} · +${bonusPercent}%` : `Combo ×${count}`;
            if (count >= 2) restartAnimation(streak, 'is-fresh');
        }

        // ---- First-turn tutorial ------------------------------------------------
        const tutorialEl = $('.mm-tutorial');
        /**
         * opts: { chain: [{ key, name, color }] in beats-order, tiers: [[move, example]] }
         */
        function showTutorial(opts) {
            tutorialEl.textContent = '';
            const title = el('strong', 'mm-tutorial__title');
            title.textContent = 'How to battle';
            tutorialEl.appendChild(title);
            const steps = el('ol', 'mm-tutorial__steps');
            [
                'Pick a move (1-4). Skills cost MP; the Ultimate needs a full MP bar.',
                'Type the answer to the math question and press Enter. Harder moves ask harder math.',
                'Correct = full power (answer fast for a CRITICAL hit, chain answers for a combo). Wrong = the attack fails.'
            ].forEach((text) => {
                const li = el('li');
                li.textContent = text;
                steps.appendChild(li);
            });
            tutorialEl.appendChild(steps);
            const chart = el('div', 'mm-tutorial__chart');
            chart.setAttribute('aria-label', 'Type chart: each element beats the next one');
            opts.chain.forEach((e, i) => {
                const node = el('span', 'mm-tutorial__el', `${icon(e.key)}<span></span>`);
                node.style.setProperty('--el-color', e.color);
                node.querySelector('span').textContent = e.name;
                chart.appendChild(node);
                if (i < opts.chain.length - 1) chart.appendChild(el('span', 'mm-tutorial__arrow', 'beats ›'));
            });
            const loop = el('span', 'mm-tutorial__arrow', `beats › ${opts.chain[0].name}`);
            chart.appendChild(loop);
            tutorialEl.appendChild(chart);
            tutorialEl.hidden = false;
            restartAnimation(tutorialEl, 'is-entering');
        }

        function hideTutorial() {
            tutorialEl.hidden = true;
        }

        function setSoundEnabled(enabled) {
            soundBtn.innerHTML = icon(enabled ? 'soundOn' : 'soundOff');
            soundBtn.setAttribute('aria-pressed', String(enabled));
            soundBtn.setAttribute('aria-label', `Audio settings — sound ${enabled ? 'on' : 'off'} (M mutes)`);
            soundBtn.title = 'Audio settings (M mutes)';
        }

        // ---- Log / ticker / banners / popups ------------------------------------
        function log(text, tone) {
            const item = el('li', `mm-log__item mm-tone--${tone || 'info'}`);
            item.textContent = text;
            logList.prepend(item);
            while (logList.children.length > 30) logList.lastChild.remove();
            tickerEl.textContent = text;
            tickerEl.className = `mm-ticker mm-tone--${tone || 'info'}`;
            restartAnimation(tickerEl, 'is-fresh');
        }

        function toggleLog() {
            const open = logEl.hidden;
            logEl.hidden = !open;
            logBtn.setAttribute('aria-expanded', String(open));
        }

        function showBanner(text, opts) {
            const o = opts || {};
            const banner = el('div', `mm-banner mm-banner--${o.tone || 'info'}`);
            if (o.color) banner.style.setProperty('--banner-color', o.color);
            const title = el('strong', 'mm-banner__title');
            title.textContent = text;
            banner.appendChild(title);
            if (o.sub) {
                const sub = el('span', 'mm-banner__sub');
                sub.textContent = o.sub;
                banner.appendChild(sub);
            }
            bannerLayer.appendChild(banner);
            setTimeout(() => banner.classList.add('is-leaving'), o.duration || 1100);
            setTimeout(() => banner.remove(), (o.duration || 1100) + 400);
        }

        /**
         * Floating damage / heal number at a position given as fractions of the
         * canvas (used by the 3D stage, which renders on its own canvas).
         * opts: { matchup: 'strong'|'weak'|'neutral', crit, heal, color }
         */
        function popupAt(fx, fy, text, opts) {
            const o = opts || {};
            const kind = o.heal ? 'heal' : o.matchup === 'strong' ? 'strong' : o.matchup === 'weak' ? 'weak' : 'neutral';
            const pop = el('div', `mm-pop mm-pop--${kind}${o.crit ? ' mm-pop--crit' : ''}`);
            pop.style.left = `${(fx * 100).toFixed(2)}%`;
            pop.style.top = `${(fy * 100).toFixed(2)}%`;
            pop.style.setProperty('--jitter', `${Math.round(Math.random() * 40 - 20)}px`);
            if (o.color) pop.style.color = o.color;
            pop.textContent = text;
            if (o.crit) pop.dataset.crit = 'CRITICAL!';
            popupLayer.appendChild(pop);
            setTimeout(() => pop.remove(), 1500);
        }

        // ---- Question panel ---------------------------------------------------
        function showQuestion(q, opts) {
            commandsEl.hidden = true;
            questionEl.hidden = false;
            questionEl.classList.remove('is-correct', 'is-wrong');
            restartAnimation(questionEl, 'is-entering');
            const tierLabel = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }[q.difficulty] || 'Math';
            $('.mm-question__cat').textContent = `${tierLabel} ${'★'.repeat(q.difficulty || 1)}`;
            const move = $('.mm-question__move');
            move.hidden = !opts.moveName;
            move.textContent = opts.moveName ? `To cast: ${opts.moveName}` : '';
            if (opts.moveColor) move.style.setProperty('--move-color', opts.moveColor);
            $('.mm-question__text').textContent = `${q.text} = ?`;
            inputEl.value = '';
            inputEl.inputMode = q.inputMode || 'numeric';
            inputEl.disabled = false;
            inputEl.classList.remove('is-correct', 'is-wrong');
            hintEl.hidden = true;
            hintEl.textContent = '';
            revealEl.hidden = true;
            revealEl.textContent = '';
            answering = true;
            updateSubmitState();
            setHintButton(opts.hint || { visible: false });
            timerEl.hidden = !opts.timerEnabled;
            setTimer(1, opts.timerSeconds);
            // Auto-focus the answer box (after the slide-in starts so mobile
            // browsers accept the focus and open the keyboard).
            inputEl.focus({ preventScroll: true });
            setTimeout(() => { if (answering) inputEl.focus({ preventScroll: true }); }, 60);
        }

        /** hint: { visible, label, disabled, title } */
        function setHintButton(hint) {
            hintBtn.hidden = !hint.visible;
            hintBtn.disabled = Boolean(hint.disabled);
            hintBtn.innerHTML = `${icon('hint')}<span>${hint.label || 'Hint'}</span>`;
            hintBtn.title = hint.title || 'Show a hint';
        }

        function showHint(text) {
            hintEl.textContent = `Hint: ${text}`;
            hintEl.hidden = false;
            restartAnimation(hintEl, 'is-entering');
        }

        function setTimer(fraction, secondsLeft) {
            timerRing.style.strokeDashoffset = `${RING * (1 - Math.max(0, fraction))}`;
            timerNum.textContent = String(Math.ceil(secondsLeft));
            timerEl.classList.toggle('is-urgent', secondsLeft <= 5.05);
        }

        /** r: { correct, message, displayAnswer } */
        function revealAnswer(r) {
            answering = false;
            inputEl.disabled = true;
            submitEl.disabled = true;
            hintBtn.disabled = true;
            if (root.contains(document.activeElement)) document.activeElement.blur();
            inputEl.classList.add(r.correct ? 'is-correct' : 'is-wrong');
            questionEl.classList.add(r.correct ? 'is-correct' : 'is-wrong');
            log(r.message, r.correct ? 'good' : 'bad');
            if (!r.correct) {
                restartAnimation(inputEl, 'is-shaking');
                revealEl.innerHTML = '';
                revealEl.append('Correct answer: ');
                const strong = el('strong');
                strong.textContent = r.displayAnswer;
                revealEl.appendChild(strong);
                revealEl.hidden = false;
                restartAnimation(revealEl, 'is-entering');
            }
        }

        // ---- Command menu -----------------------------------------------------
        function showCommands(actions) {
            questionEl.hidden = true;
            commandsEl.hidden = false;
            commandsEl.classList.remove('is-busy');
            restartAnimation(commandsEl, 'is-entering');
            if (root.contains(document.activeElement)) document.activeElement.blur();
            commandRow.textContent = '';
            actions.forEach((action, index) => {
                const element = elements[action.element] || {};
                const button = el('button', `mm-command mm-command--${action.key}`);
                button.type = 'button';
                button.style.setProperty('--el-color', element.color);
                button.style.setProperty('--el-accent', element.accent);
                button.style.setProperty('--el-dark', element.dark);
                button.style.animationDelay = `${60 + index * 50}ms`;
                const costText = action.key === 'ultimate' ? 'FULL MP' : action.cost ? `${action.cost} MP` : `+${action.mpGain} MP`;
                button.innerHTML = `
                    <kbd>${action.slot}</kbd>
                    <span class="mm-command__body">
                        <span class="mm-command__kind"></span>
                        <span class="mm-command__name"></span>
                    </span>
                    <span class="mm-command__cost"></span>`;
                button.querySelector('.mm-command__kind').textContent = action.label;
                button.querySelector('.mm-command__name').textContent = action.name;
                button.querySelector('.mm-command__cost').textContent = costText;
                const tip = action.affordable
                    ? (action.description || 'Basic attack. Generates MP.')
                    : action.key === 'ultimate'
                        ? `Requires a full MP bar (${action.cost} MP)`
                        : `Requires ${action.cost} MP`;
                button.dataset.tip = tip;
                button.title = tip;
                button.setAttribute('aria-label', `${action.slot}: ${action.name}, ${costText}. ${tip}`);
                button.setAttribute('aria-disabled', String(!action.affordable));
                if (!action.affordable) button.classList.add('is-locked');
                if (action.key === 'ultimate' && action.affordable) button.classList.add('is-ready');
                button.addEventListener('click', function onCommandClick() {
                    if (commandsEl.classList.contains('is-busy')) return;
                    if (button.getAttribute('aria-disabled') === 'true') {
                        if (handlers.onLockedCommand) handlers.onLockedCommand(action.key);
                        return;
                    }
                    if (handlers.onCommand) handlers.onCommand(action.key);
                });
                commandRow.appendChild(button);
            });
        }

        function flashLockedCommand(actionKey, message) {
            const button = commandRow.querySelector(`.mm-command--${actionKey}`);
            if (button) restartAnimation(button, 'is-denied');
            log(message, 'bad');
        }

        /** Lock all input while animations play (prevents action spam). */
        function lockPanel() {
            answering = false;
            commandsEl.classList.add('is-busy');
            commandRow.querySelectorAll('button').forEach((b) => b.setAttribute('aria-disabled', 'true'));
            inputEl.disabled = true;
            submitEl.disabled = true;
        }

        function hidePanel() {
            answering = false;
            if (root.contains(document.activeElement)) document.activeElement.blur();
            questionEl.hidden = true;
            commandsEl.hidden = true;
            syncKeyboard();
        }

        function setCinematic(on) {
            root.classList.toggle('is-cinematic', Boolean(on));
        }

        function destroy() {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', syncKeyboard);
                window.visualViewport.removeEventListener('scroll', syncKeyboard);
            }
            if (observer) observer.disconnect();
            root.remove();
        }

        return {
            root,
            isTouch,
            setCombatant,
            setHp,
            setMp,
            setStatuses,
            pulseCard,
            setTurn,
            setStreak,
            showTutorial,
            hideTutorial,
            setSoundEnabled,
            log,
            toggleLog,
            showBanner,
            popupAt,
            showQuestion,
            setHintButton,
            showHint,
            setTimer,
            revealAnswer,
            rejectEmpty,
            showCommands,
            flashLockedCommand,
            lockPanel,
            hidePanel,
            setCinematic,
            syncToCanvas,
            destroy
        };
    }

    return { create };
})();
