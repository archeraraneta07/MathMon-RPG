(function bootstrapGame() {
    console.log('[MathMon] inline init script running');
    window.updateLoadStatus('Starting game...');

    try {
        console.log('[MathMon] Phaser:', typeof Phaser);
        console.log('[MathMon] MathMonPhaser:', typeof MathMonPhaser);

        if (typeof Phaser === 'undefined') {
            window.showLoadError('Phaser is undefined after script load. Check phaser.min.js');
        } else if (typeof MathMonPhaser === 'undefined') {
            window.showLoadError('MathMonPhaser is undefined after script load. phaser-game.js may have a syntax error.');
        } else {
            const container = document.getElementById('game-container');
            if (!container) {
                window.showLoadError('Game container not found');
            } else {
                const loading = document.getElementById('loading');
                if (loading) loading.style.display = 'none';
                console.log('[MathMon] creating Phaser game...');
                const game = MathMonPhaser.createGame('game-container');
                console.log('[MathMon] Phaser game created:', game);
            }
        }
    } catch (error) {
        window.showLoadError('Init error: ' + (error.message || error));
        console.error('[MathMon] init error', error);
    }
})();
