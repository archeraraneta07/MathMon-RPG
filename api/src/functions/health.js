/** GET /api/health — liveness plus which backing services are configured. */
const { app } = require('@azure/functions');
const store = require('../lib/store');
const { json } = require('../lib/http');

app.http('health', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'health',
    handler: async () => json(200, {
        status: 'ok',
        storage: store.usingCosmos() ? 'cosmos-db' : 'memory',
        classifier: process.env.AZURE_ML_ENDPOINT ? 'azure-ml' : 'rules',
        time: new Date().toISOString()
    })
});
