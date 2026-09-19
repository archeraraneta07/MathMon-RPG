(function createMathMonApi() {
    'use strict';

    const API_ROOT = '/api';
    const PLAYER_ID_KEY = 'mathmon_player_id';

    function getPlayerId() {
        let playerId = localStorage.getItem(PLAYER_ID_KEY);
        if (!playerId) {
            playerId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem(PLAYER_ID_KEY, playerId);
        }
        return playerId;
    }

    async function post(path, payload) {
        try {
            const response = await fetch(`${API_ROOT}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.info('[MathMon] Server sync unavailable; continuing offline.', error.message);
            return null;
        }
    }

    window.MathMonApi = {
        getPlayerId,
        registerPlayer(name, gender) {
            return post('/player', {
                player_id: getPlayerId(),
                name,
                gender
            });
        },
        recordAttempt(attempt) {
            return post('/attempt', {
                player_id: getPlayerId(),
                ...attempt
            });
        },
        recordBattle(result) {
            return post(`/battle/${encodeURIComponent(result.battle_id || 'offline')}/result`, {
                player_id: getPlayerId(),
                ...result
            });
        }
    };
})();
