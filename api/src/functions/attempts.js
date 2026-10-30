/**
 * POST /api/attempt — one answered battle question. Stored in Cosmos DB
 * `attempts`; rows with an adaptive feature vector are the training data for
 * the global difficulty model (GET /api/ml/training-data → python/adaptive_model.py).
 */
const { app } = require('@azure/functions');
const store = require('../lib/store');
const { json, readBody, playerId, text, number, features } = require('../lib/http');

const CATEGORIES = ['addition', 'subtraction', 'multiplication', 'division'];
const FEATURE_COUNT = 10;   // js/adaptive-ml.js FEATURE_NAMES

app.http('attemptCreate', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'attempt',
    handler: async (request) => {
        const body = await readBody(request);
        const id = playerId(body.player_id);
        if (!id) return json(400, { error: 'player_id is required' });
        if (!CATEGORIES.includes(body.category)) return json(400, { error: `category must be one of ${CATEGORIES.join(', ')}` });
        const attempt = await store.addAttempt({
            playerId: id,
            category: body.category,
            correct: body.correct === true,
            responseTime: number(body.response_time, 0, 600, null),
            difficulty: number(body.difficulty, 1, 10, 1),
            level: number(body.level, 1, 99, 1),
            features: features(body.features, FEATURE_COUNT),
            predicted: number(body.predicted, 0, 1, null),
            source: text(body.source, 16) || 'battle',
            createdAt: new Date().toISOString()
        });
        return json(201, { success: true, id: attempt.id });
    }
});
