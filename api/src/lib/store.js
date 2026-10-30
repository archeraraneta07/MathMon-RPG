/**
 * Storage for the MathMon API — Azure Cosmos DB (NoSQL API).
 *
 * Containers (created on first use):
 *   players   partition /id        profile + running totals (leaderboard source)
 *   attempts  partition /playerId  every answered question = ML training data
 *   models    partition /id        the trained adaptive-difficulty model
 *
 * Without COSMOS_CONNECTION_STRING (or COSMOS_ENDPOINT + COSMOS_KEY) the API
 * falls back to an in-memory store, so `func start` works with no Azure account
 * (data is lost when the host restarts).
 */
const { CosmosClient } = require('@azure/cosmos');
const { randomUUID } = require('crypto');

const CONTAINERS = { players: '/id', attempts: '/playerId', models: '/id' };
const memory = { players: new Map(), attempts: [], models: new Map() };
let ready = null;

function usingCosmos() {
    return Boolean(process.env.COSMOS_CONNECTION_STRING || (process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY));
}

/** Lazily connect and create the database / containers once per host instance. */
function containers() {
    if (!usingCosmos()) return Promise.resolve(null);
    if (!ready) {
        ready = (async () => {
            const client = process.env.COSMOS_CONNECTION_STRING
                ? new CosmosClient(process.env.COSMOS_CONNECTION_STRING)
                : new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
            const { database } = await client.databases.createIfNotExists({ id: process.env.COSMOS_DATABASE || 'mathmon' });
            const out = {};
            for (const [id, path] of Object.entries(CONTAINERS)) {
                const { container } = await database.containers.createIfNotExists({ id, partitionKey: { paths: [path] } });
                out[id] = container;
            }
            return out;
        })().catch((error) => {
            ready = null;   // retry on the next request
            throw error;
        });
    }
    return ready;
}

async function readItem(container, id, partitionKey) {
    try {
        const { resource } = await container.item(id, partitionKey).read();
        return resource || null;
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

async function getPlayer(id) {
    const c = await containers();
    return c ? readItem(c.players, id, id) : memory.players.get(id) || null;
}

async function savePlayer(doc) {
    const c = await containers();
    if (!c) {
        memory.players.set(doc.id, doc);
        return doc;
    }
    const { resource } = await c.players.items.upsert(doc);
    return resource;
}

async function addAttempt(doc) {
    const item = { id: randomUUID(), ...doc };
    const c = await containers();
    if (!c) {
        memory.attempts.push(item);
        if (memory.attempts.length > 5000) memory.attempts.shift();
        return item;
    }
    await c.attempts.items.create(item);
    return item;
}

async function leaderboard(limit) {
    const c = await containers();
    if (!c) {
        return [...memory.players.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit)
            .map(({ id, name, score, level, battlesWon, element }) => ({ id, name, score, level, battlesWon, element }));
    }
    const { resources } = await c.players.items.query({
        query: 'SELECT TOP @n c.id, c.name, c.score, c.level, c.battlesWon, c.element FROM c ORDER BY c.score DESC',
        parameters: [{ name: '@n', value: limit }]
    }).fetchAll();
    return resources;
}

/** Most recent attempts that carry an adaptive feature vector (for training). */
async function trainingData(limit) {
    const c = await containers();
    if (!c) return memory.attempts.filter((a) => Array.isArray(a.features)).slice(-limit);
    const { resources } = await c.attempts.items.query({
        query: 'SELECT TOP @n c.features, c.correct, c.category, c.responseTime FROM c WHERE IS_ARRAY(c.features) ORDER BY c._ts DESC',
        parameters: [{ name: '@n', value: limit }]
    }).fetchAll();
    return resources;
}

async function getModel(id) {
    const c = await containers();
    return c ? readItem(c.models, id, id) : memory.models.get(id) || null;
}

async function saveModel(doc) {
    const c = await containers();
    if (!c) {
        memory.models.set(doc.id, doc);
        return doc;
    }
    const { resource } = await c.models.items.upsert(doc);
    return resource;
}

module.exports = { usingCosmos, getPlayer, savePlayer, addAttempt, leaderboard, trainingData, getModel, saveModel };
