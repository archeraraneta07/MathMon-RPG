/**
 * Machine-learning endpoints.
 *   POST /api/ml/classify       player stats → Needs Practice / Developing / Proficient
 *                               (Azure ML endpoint when configured, else rules)
 *   GET  /api/ml/model          the global adaptive-difficulty model for js/adaptive-ml.js
 *   PUT  /api/ml/model          publish a newly trained model          (x-admin-key)
 *   GET  /api/ml/training-data  attempts with feature vectors as CSV   (x-admin-key)
 */
const { app } = require('@azure/functions');
const store = require('../lib/store');
const { classify } = require('../lib/classify');
const { json, readBody, number, isAdmin } = require('../lib/http');

const MODEL_ID = 'adaptive-latest';
const FEATURE_NAMES = ['bias', 'op_subtraction', 'op_multiplication', 'op_division', 'difficulty',
    'recent_accuracy', 'op_accuracy', 'response_time', 'streak', 'damage_taken'];

app.http('mlClassify', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'ml/classify',
    handler: async (request, context) => {
        const body = await readBody(request);
        const stats = body.stats && typeof body.stats === 'object' ? body.stats : body;
        return json(200, await classify(stats, (m) => context.warn(m)));
    }
});

app.http('mlModelGet', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'ml/model',
    handler: async () => {
        const model = await store.getModel(MODEL_ID);
        if (!model) return json(404, { error: 'No trained model published yet' });
        const { features, weights, trainedAt, samples, metrics } = model;
        return json(200, { features, weights, trainedAt, samples, metrics });
    }
});

app.http('mlModelPut', {
    methods: ['PUT'],
    authLevel: 'anonymous',   // protected by the x-admin-key header instead
    route: 'ml/model',
    handler: async (request) => {
        if (!isAdmin(request)) return json(403, { error: 'Admin key required' });
        const body = await readBody(request);
        const weights = Array.isArray(body.weights) ? body.weights.map(Number) : [];
        if (JSON.stringify(body.features) !== JSON.stringify(FEATURE_NAMES)) return json(400, { error: 'features must match js/adaptive-ml.js FEATURE_NAMES' });
        if (weights.length !== FEATURE_NAMES.length || !weights.every((w) => Number.isFinite(w) && Math.abs(w) < 50)) {
            return json(400, { error: `weights must be ${FEATURE_NAMES.length} finite numbers` });
        }
        const doc = {
            id: MODEL_ID,
            features: FEATURE_NAMES,
            weights,
            samples: Math.round(number(body.samples, 0, 1e9, 0)),
            metrics: body.metrics && typeof body.metrics === 'object' ? body.metrics : {},
            trainedAt: new Date().toISOString()
        };
        await store.saveModel(doc);
        return json(200, { success: true, trainedAt: doc.trainedAt });
    }
});

app.http('mlTrainingData', {
    methods: ['GET'],
    authLevel: 'anonymous',   // protected by the x-admin-key header instead
    route: 'ml/training-data',
    handler: async (request) => {
        if (!isAdmin(request)) return json(403, { error: 'Admin key required' });
        const limit = Math.round(number(request.query.get('limit'), 1, 50000, 20000));
        const rows = await store.trainingData(limit);
        const header = [...FEATURE_NAMES, 'correct'].join(',');
        const lines = rows
            .filter((r) => Array.isArray(r.features) && r.features.length === FEATURE_NAMES.length)
            .map((r) => [...r.features, r.correct ? 1 : 0].join(','));
        return { status: 200, body: [header, ...lines].join('\n'), headers: { 'Content-Type': 'text/csv', 'Cache-Control': 'no-store' } };
    }
});
