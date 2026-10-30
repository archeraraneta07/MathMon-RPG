/**
 * Server-side question generator (mirrors js/question-deck.js + the
 * questionTiers in js/battle-config.js). Only + − × ÷ with whole-number answers:
 * subtraction never goes below zero, division is built as (divisor × quotient) ÷ divisor.
 */
const TIERS = {
    easy: {
        timerSeconds: 15,
        weights: { addition: 3, subtraction: 3, multiplication: 1, division: 1 },
        addition: { a: [5, 20], b: [2, 15] },
        subtraction: { a: [10, 30], b: [2, 15] },
        multiplication: { a: [2, 5], b: [2, 9] },
        division: { divisor: [2, 5], quotient: [2, 9] }
    },
    medium: {
        timerSeconds: 20,
        weights: { addition: 1, subtraction: 1, multiplication: 3, division: 3 },
        addition: { a: [20, 79], b: [11, 49] },
        subtraction: { a: [40, 99], b: [11, 39] },
        multiplication: { a: [3, 12], b: [3, 12] },
        division: { divisor: [3, 12], quotient: [3, 12] }
    },
    hard: {
        timerSeconds: 30,
        weights: { addition: 2, subtraction: 2, multiplication: 2, division: 3 },
        addition: { a: [120, 499], b: [101, 399] },
        subtraction: { a: [300, 999], b: [101, 299] },
        multiplication: { a: [12, 25], b: [3, 9] },
        division: { divisor: [6, 12], quotient: [8, 15] }
    }
};
const SYMBOLS = { addition: '+', subtraction: '−', multiplication: '×', division: '÷' };

function randInt([min, max]) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOp(weights) {
    const entries = Object.entries(weights);
    let roll = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [op, w] of entries) {
        roll -= w;
        if (roll <= 0) return op;
    }
    return entries[0][0];
}

/** One question: { text, answer, category, tier, timerSeconds }. */
function generate(tierName, onlyOp) {
    const tier = TIERS[tierName] || TIERS.easy;
    const op = SYMBOLS[onlyOp] ? onlyOp : pickOp(tier.weights);
    const rule = tier[op];
    let a, b, answer;
    if (op === 'division') {
        b = randInt(rule.divisor);
        answer = randInt(rule.quotient);
        a = b * answer;
    } else {
        a = randInt(rule.a);
        b = randInt(rule.b);
        if (op === 'subtraction' && b > a) [a, b] = [b, a];
        answer = op === 'addition' ? a + b : op === 'subtraction' ? a - b : a * b;
    }
    return { text: `${a} ${SYMBOLS[op]} ${b}`, answer, category: op, tier: TIERS[tierName] ? tierName : 'easy', timerSeconds: tier.timerSeconds };
}

module.exports = { TIERS, generate };
