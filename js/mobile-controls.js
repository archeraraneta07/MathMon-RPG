(function createMobileControls() {
    'use strict';

    const control = document.getElementById('mobile-input');
    const submit = document.getElementById('mobile-submit');
    if (!control || !submit) return;

    let submitHandler = null;

    function isTouchDevice() {
        return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    }

    function requestLandscape() {
        if (!isTouchDevice()) return Promise.resolve(false);
        document.body.classList.add('gameplay-landscape');
        const orientation = screen.orientation;
        const container = document.getElementById('game-container');
        const enterFullscreen = document.fullscreenElement || !container || !container.requestFullscreen
            ? Promise.resolve()
            : container.requestFullscreen().catch(() => undefined);

        return enterFullscreen.then(() => {
            if (orientation && orientation.lock) {
                return orientation.lock('landscape').then(() => true).catch(() => false);
            }
            return false;
        });
    }

    function show(options) {
        if (!isTouchDevice()) return;
        control.type = options.type || 'text';
        control.inputMode = options.inputMode || 'text';
        control.autocomplete = 'off';
        control.placeholder = options.placeholder || '';
        control.value = options.value || '';
        submit.textContent = options.submitLabel || 'Submit';
        submitHandler = options.onSubmit || null;
        control.parentElement.hidden = false;
        control.focus({ preventScroll: true });
    }

    function hide() {
        control.parentElement.hidden = true;
        submitHandler = null;
        control.blur();
    }

    function submitValue() {
        if (submitHandler) submitHandler(control.value);
    }

    control.addEventListener('input', () => {
        if (control.value.length > 32) control.value = control.value.slice(0, 32);
    });
    control.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitValue();
        }
    });
    submit.addEventListener('click', submitValue);

    window.MathMonMobile = { show, hide, isTouchDevice, requestLandscape };
})();
