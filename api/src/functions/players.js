/** Player profiles + battle results (Cosmos DB `players`). Routes match js/api-client.js and python/server.py. */
const { app } = require('@azure/functions');
const store = require('../lib/store');
const { json, readBody, playerId, text, number } = require('../lib/http');

const ELEMENTS = ['fire', 'water', 'wind', 'earth'];

function blankPlayer(id) {
    const now = new Date().toISOString();
    return { id, name: 'Trainer', gender: 'male', element: null, level: 1, xp: 0, score: 0, battles: 0, battlesWon: 0, createdAt: now, updatedAt: now };
}

// POST /api/player  { player_id, name, gender }
app.http('playerUpsert', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'player',
    handler: async (request) => {
        const body = await readBody(request);
        const id = playerId(body.player_id);
        if (!id) return json(400, { error: 'player_id is required (letters, digits, - or _)' });
        const player = (await store.getPlayer(id)) || blankPlayer(id);
        player.name = text(body.name, 24) || player.name;
        player.gender = body.gender === 'female' ? 'female' : 'male';
        player.updatedAt = new Date().toISOString();
        return json(200, { player: await store.savePlayer(player) });
    }
});

// GET /api/player/{id}
app.http('playerGet', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'player/{id}',
    handler: async (request) => {
        const id = playerId(request.params.id);
        const player = id && await store.getPlayer(id);
        return player ? json(200, { player }) : json(404, { error: 'Player not found' });
    }
});

// POST /api/battle/{battleId}/result  { player_id, won, xp_earned, score_earned, opponent_name, category, level, element }
app.http('battleResult', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'battle/{battleId}/result',
    handler: async (request) => {
        const body = await readBody(request);
        const id = playerId(body.player_id);
        if (!id) return json(400, { error: 'player_id is required' });
        const player = (await store.getPlayer(id)) || blankPlayer(id);
        // Per-battle rewards are capped so a tampered request cannot jump the leaderboard.
        player.score += number(body.score_earned, 0, 200, 0);
        player.xp += number(body.xp_earned, 0, 500, 0);
        player.battles += 1;
        if (body.won === true) player.battlesWon += 1;
        player.level = number(body.level, 1, 99, player.level);
        if (ELEMENTS.includes(body.element)) player.element = body.element;
        player.lastBattle = { opponent: text(body.opponent_name, 32), category: text(body.category, 20), won: body.won === true, at: new Date().toISOString() };
        player.updatedAt = player.lastBattle.at;
        await store.savePlayer(player);
        return json(200, { success: true, score: player.score, battlesWon: player.battlesWon });
    }
});

// GET /api/leaderboard?limit=10
app.http('leaderboard', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'leaderboard',
    handler: async (request) => {
        const limit = Math.round(number(request.query.get('limit'), 1, 50, 10));
        return json(200, { leaderboard: await store.leaderboard(limit) });
    }
});
