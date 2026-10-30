/** GET /api/questions?tier=easy|medium|hard&count=5&op=addition — server-generated battle questions. */
const { app } = require('@azure/functions');
const { generate, TIERS } = require('../lib/questions');
const { json, number } = require('../lib/http');

app.http('questions', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'questions',
    handler: async (request) => {
        const tier = request.query.get('tier') || 'easy';
        if (!TIERS[tier]) return json(400, { error: 'tier must be easy, medium or hard' });
        const count = Math.round(number(request.query.get('count'), 1, 20, 5));
        const op = request.query.get('op');
        return json(200, { questions: Array.from({ length: count }, () => generate(tier, op)) });
    }
});
