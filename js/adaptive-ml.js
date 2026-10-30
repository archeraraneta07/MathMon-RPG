/**
 * MathMon adaptive difficulty — a small machine-learning model that learns how
 * likely THIS player is to answer a question correctly, then uses it to keep
 * every question in the "desirable difficulty" zone (~72% success).
 *
 * Model: logistic regression  P(correct) = sigmoid(w · x)
 *   x = FEATURE_NAMES below: the question (operation, difficulty) plus the
 *       player's recent form (accuracy, per-operation accuracy, response time,
 *       streak, damage taken this battle).
 * Learning:
 *   - online: one SGD step after every answer (instant, works offline)
 *   - batch:  every RETRAIN_EVERY answers the whole history is refit with
 *             TensorFlow.js (lazy-loaded from the CDN); if TF.js cannot load,
 *             the same model is refit with plain-JS gradient descent
 *   - global: a model trained on all players (python/adaptive_model.py, run as
 *             an Azure ML job) can be served at GET /api/ml/model and is used as
 *             the starting point for new players
 * Outputs:
 *   plan()      → which operation, number range (scale) and timer for the next question
 *   enemyPlan() → enemy AI: normal / heavy strike / hesitation, and damage scale
 *
 * The feature list is mirrored in python/adaptive_model.py (FEATURES) — keep them in sync.
 */
const MathMonAdaptive = (function createAdaptive() {
    'use strict';

    const STORE_KEY = 'mathmon_adaptive_v1';
    const FEATURE_NAMES = ['bias', 'op_subtraction', 'op_multiplication', 'op_division', 'difficulty',
        'recent_accuracy', 'op_accuracy', 'response_time', 'streak', 'damage_taken'];
    // Hand-set prior: harder questions and slow answers lower the odds, good form raises them.
    const PRIOR = [1.4, -0.1, -0.35, -0.5, -1.3, 1.6, 1.2, -0.9, 0.35, -0.4];
    const OPS = ['addition', 'subtraction', 'multiplication', 'division'];
    const TIER_LEVEL = { easy: 0, medium: 0.5, hard: 1 };
    const TARGET = 0.72;                      // aim for ~72% success: challenging, not discouraging
    const SCALES = [0.6, 0.8, 1, 1.25, 1.5];  // number-range multipliers the deck can apply
    const MAX_SAMPLES = 500;
    const MIN_RETRAIN = 20;
    const RETRAIN_EVERY = 10;
    const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js';

    let state = load();
    let tfPromise = null;
    let training = false;

    function fresh() {
        return {
            version: 1,
            weights: PRIOR.slice(),
            source: 'prior',               // prior | server | online | tfjs | js
            samples: [],                   // { x: number[], y: 0|1 }
            sinceRetrain: 0,
            recentAccuracy: 0.7,           // exponential moving averages
            opAccuracy: { addition: 0.7, subtraction: 0.7, multiplication: 0.7, division: 0.7 },
            responseTime: 8
        };
    }

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (saved && saved.version === 1 && Array.isArray(saved.weights) && saved.weights.length === FEATURE_NAMES.length) return saved;
        } catch (e) { /* storage unavailable or corrupt: start fresh */ }
        return fresh();
    }

    function save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    }

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const sigmoid = (z) => 1 / (1 + Math.exp(-z));
    const dot = (w, x) => w.reduce((s, wi, i) => s + wi * x[i], 0);

    /** Feature vector for a question (op, tier, scale) given the battle context. */
    function features(op, tier, scale, ctx) {
        const c = ctx || {};
        return [
            1,
            op === 'subtraction' ? 1 : 0,
            op === 'multiplication' ? 1 : 0,
            op === 'division' ? 1 : 0,
            (TIER_LEVEL[tier] != null ? TIER_LEVEL[tier] : 0.5) + (scale - 1),
            state.recentAccuracy - 0.5,
            (state.opAccuracy[op] != null ? state.opAccuracy[op] : 0.7) - 0.5,
            clamp((state.responseTime - 8) / 10, -1, 3),
            Math.min(c.streak || 0, 5) / 5,
            clamp(c.damageTaken || 0, 0, 1)
        ];
    }

    function predict(x) {
        return sigmoid(dot(state.weights, x));
    }

    function weightedPick(entries) {
        const total = entries.reduce((s, e) => s + e.weight, 0);
        let roll = Math.random() * total;
        for (const e of entries) {
            roll -= e.weight;
            if (roll <= 0) return e;
        }
        return entries[entries.length - 1];
    }

    /**
     * Plan the next question.
     * @param {object} o { tier, category?: forced operation, tierWeights?: {op: weight}, streak, damageTaken }
     * @returns {{ op, scale, predicted, timerFactor, features }}
     */
    function plan(o) {
        const ops = o.category ? [o.category] : OPS.filter((op) => !o.tierWeights || o.tierWeights[op] > 0);
        const options = ops.map((op) => {
            let best = null;
            SCALES.forEach((scale) => {
                const x = features(op, o.tier, scale, o);
                const p = predict(x);
                const miss = Math.abs(p - TARGET) + Math.abs(scale - 1) * 0.02;   // tie-break toward the normal range
                if (!best || miss < best.miss) best = { op, scale, predicted: p, features: x, miss };
            });
            // Practise weak operations a little more often (their range is already eased above).
            const acc = state.opAccuracy[op] != null ? state.opAccuracy[op] : 0.7;
            best.weight = ((o.tierWeights && o.tierWeights[op]) || 1) * (1 + 0.8 * (1 - acc));
            return best;
        });
        const pick = weightedPick(options);
        const slow = Math.max(0, (state.responseTime - 10) / 30);
        return {
            op: pick.op,
            scale: pick.scale,
            predicted: pick.predicted,
            timerFactor: clamp(1 + (TARGET - pick.predicted) * 1.2 + slow, 0.85, 1.4),
            features: pick.features
        };
    }

    /** Learn from one answered question (x = the features used when it was planned). */
    function record(x, correct, responseTime, op) {
        if (!Array.isArray(x) || x.length !== FEATURE_NAMES.length) return;
        const y = correct ? 1 : 0;
        // online SGD step
        const err = predict(x) - y;
        state.weights = state.weights.map((w, i) => w - 0.05 * err * x[i]);
        if (state.source === 'prior' || state.source === 'server') state.source = 'online';
        state.samples.push({ x, y });
        if (state.samples.length > MAX_SAMPLES) state.samples.shift();
        state.recentAccuracy = 0.8 * state.recentAccuracy + 0.2 * y;
        if (state.opAccuracy[op] != null) state.opAccuracy[op] = 0.75 * state.opAccuracy[op] + 0.25 * y;
        state.responseTime = 0.8 * state.responseTime + 0.2 * Math.min(Number(responseTime) || 0, 40);
        state.sinceRetrain++;
        save();
        if (state.sinceRetrain >= RETRAIN_EVERY && state.samples.length >= MIN_RETRAIN) retrain();
    }

    /**
     * Enemy AI for its next attack. A player who is cruising gets the occasional
     * heavy strike; a struggling player sees the enemy hesitate more often.
     * @param {object} o { playerHpRatio, streak, damageTaken }
     */
    function enemyPlan(o) {
        const p = predict(features('multiplication', 'medium', 1, o));
        const hp = o.playerHpRatio != null ? o.playerHpRatio : 1;
        const damageScale = clamp(0.85 + (p - 0.5) * 0.6, 0.8, 1.15);
        if ((p < 0.5 || hp < 0.3) && Math.random() < 0.35) {
            return { kind: 'feint', multiplier: damageScale * 0.6, predicted: p };
        }
        if (p > 0.82 && hp > 0.5 && Math.random() < 0.3) {
            return { kind: 'heavy', multiplier: damageScale * 1.35, predicted: p };
        }
        return { kind: 'normal', multiplier: damageScale, predicted: p };
    }

    // ---- Batch retraining ---------------------------------------------------------------
    function loadTf() {
        if (window.tf) return Promise.resolve(window.tf);
        if (!tfPromise) {
            tfPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = TF_URL;
                s.async = true;
                s.onload = () => (window.tf ? resolve(window.tf) : reject(new Error('tf missing')));
                s.onerror = () => reject(new Error('TensorFlow.js failed to load'));
                document.head.appendChild(s);
            }).catch((error) => {
                console.info('[MathMon] TensorFlow.js unavailable; using the built-in trainer.', error.message);
                return null;
            });
        }
        return tfPromise;
    }

    async function fitWithTf(tf, samples, weights) {
        const n = FEATURE_NAMES.length - 1;     // the bias column becomes the layer's bias
        const xs = tf.tensor2d(samples.map((s) => s.x.slice(1)));
        const ys = tf.tensor2d(samples.map((s) => [s.y]));
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 1, inputShape: [n], activation: 'sigmoid',
            kernelRegularizer: tf.regularizers.l2({ l2: 0.005 }) }));
        const kernel0 = tf.tensor2d(weights.slice(1), [n, 1]);
        const bias0 = tf.tensor1d([weights[0]]);
        model.layers[0].setWeights([kernel0, bias0]);   // start from the current model, not from scratch
        model.compile({ optimizer: tf.train.adam(0.03), loss: 'binaryCrossentropy' });
        await model.fit(xs, ys, { epochs: 40, batchSize: 32, shuffle: true, verbose: 0 });
        const [kernel, bias] = model.layers[0].getWeights();
        const result = [bias.dataSync()[0], ...kernel.dataSync()];
        tf.dispose([xs, ys, kernel0, bias0]);
        model.dispose();
        return result;
    }

    /** Plain-JS fallback: full-batch gradient descent with L2 pull toward the prior. */
    function fitWithJs(samples, weights) {
        let w = weights.slice();
        for (let iter = 0; iter < 250; iter++) {
            const grad = new Array(w.length).fill(0);
            samples.forEach((s) => {
                const err = sigmoid(dot(w, s.x)) - s.y;
                for (let i = 0; i < w.length; i++) grad[i] += err * s.x[i];
            });
            w = w.map((wi, i) => wi - 0.3 * (grad[i] / samples.length + 0.01 * (wi - PRIOR[i])));
        }
        return w;
    }

    async function retrain() {
        if (training) return;
        training = true;
        state.sinceRetrain = 0;
        const samples = state.samples.slice();
        try {
            const tf = await loadTf();
            const weights = tf ? await fitWithTf(tf, samples, state.weights) : fitWithJs(samples, state.weights);
            if (weights.every(Number.isFinite)) {
                state.weights = weights;
                state.source = tf ? 'tfjs' : 'js';
                save();
            }
        } catch (error) {
            console.warn('[MathMon] Adaptive retrain failed; keeping the online model.', error);
        } finally {
            training = false;
        }
    }

    /** Adopt the global model from the API (only while this player has little data of their own). */
    function syncFromServer() {
        if (!window.MathMonApi || !window.MathMonApi.getModel || state.samples.length >= 30) return Promise.resolve(false);
        return window.MathMonApi.getModel().then((model) => {
            const ok = model && Array.isArray(model.weights) && model.weights.length === FEATURE_NAMES.length &&
                model.weights.every(Number.isFinite) && JSON.stringify(model.features) === JSON.stringify(FEATURE_NAMES);
            if (!ok) return false;
            state.weights = model.weights.slice();
            state.source = 'server';
            save();
            return true;
        });
    }

    /** Summary for the UI (house shrine, results screen). */
    function insight() {
        const perOp = {};
        OPS.forEach((op) => { perOp[op] = Math.round(predict(features(op, 'medium', 1, {})) * 100); });
        const level = state.recentAccuracy > 0.85 ? 'On fire' : state.recentAccuracy > 0.65 ? 'Steady' : state.recentAccuracy > 0.45 ? 'Warming up' : 'Needs support';
        return {
            samples: state.samples.length,
            source: state.source,
            recentAccuracy: Math.round(state.recentAccuracy * 100),
            responseTime: Math.round(state.responseTime * 10) / 10,
            perOp,
            level
        };
    }

    function reset() {
        state = fresh();
        save();
    }

    return { FEATURE_NAMES, TARGET, plan, record, enemyPlan, retrain, syncFromServer, insight, reset,
        debug: () => JSON.parse(JSON.stringify(state)) };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonAdaptive;
}
