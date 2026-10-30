/**
 * Player classification (Needs Practice / Developing / Proficient).
 *
 * With AZURE_ML_ENDPOINT (+ AZURE_ML_KEY) set, the stats are scored by the
 * Random Forest deployed to an Azure ML managed online endpoint
 * (python/deploy_azure_ml.py + python/azure_ml_score.py). Otherwise — or if the
 * endpoint fails — the same rules as js/ml.js classifyPerformance() are used.
 */
const TOPICS = ['addition', 'subtraction', 'multiplication', 'division'];

function rules(stats) {
    const s = stats || {};
    const total = Number(s.totalAttempts) || 0;
    const accuracy = total ? ((Number(s.correctAnswers) || 0) / total) * 100 : 0;
    const errorRate = total ? (Number(s.incorrectAnswers) || 0) / total : 0;
    const topicAcc = TOPICS.map((t) => {
        const ts = (s.topicStats || {})[t] || {};
        return ts.attempts ? (ts.correct || 0) / ts.attempts : 0;
    });
    const avgTopicAccuracy = (topicAcc.reduce((a, b) => a + b, 0) / TOPICS.length) * 100;
    if (total < 5) {
        return { classification: 'Needs Practice', confidence: 30, source: 'rules', reason: 'Insufficient data: keep playing for a more accurate assessment.' };
    }
    if (accuracy >= 80 && avgTopicAccuracy >= 75 && errorRate <= 0.25) {
        return { classification: 'Proficient', confidence: Math.min(99, Math.round(85 + (accuracy - 80) * 1.2)), source: 'rules' };
    }
    if (accuracy >= 50) {
        return { classification: 'Developing', confidence: Math.round(70 + (accuracy - 50) * 0.8), source: 'rules' };
    }
    return { classification: 'Needs Practice', confidence: Math.round(80 - accuracy), source: 'rules' };
}

async function azureMl(stats) {
    const endpoint = process.env.AZURE_ML_ENDPOINT;
    if (!endpoint || !/^https:\/\//.test(endpoint)) return null;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AZURE_ML_KEY || ''}` },
        body: JSON.stringify({ stats }),
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`Azure ML endpoint returned ${response.status}`);
    let body = await response.json();
    if (typeof body === 'string') body = JSON.parse(body);   // scoring scripts often return a JSON string
    return { ...body, source: 'azure-ml' };
}

async function classify(stats, log) {
    try {
        const result = await azureMl(stats);
        if (result && result.classification) return result;
    } catch (error) {
        if (log) log(`Azure ML scoring failed, using rules: ${error.message}`);
    }
    return rules(stats);
}

module.exports = { classify, rules };
