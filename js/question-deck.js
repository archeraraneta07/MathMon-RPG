/**
 * MathMon question deck — math questions for the battle Question Gate.
 *
 * Each move asks for a difficulty tier (config.questionGate.actionTier):
 *   Normal Attack → easy, Skills → medium, Ultimate → hard.
 * Questions use only + − × ÷ and always have a whole-number answer ≥ 0:
 *   - subtraction keeps the larger number first
 *   - division is built as (divisor × quotient) ÷ divisor
 * Sources: generated from config.questionTiers (default, never runs out),
 * the curated MATHMON_QUESTION_BANK, or a mix. Recently asked questions are
 * not repeated; bank questions use a shuffle bag (all used before repeats).
 */
const MathMonQuestionDeck = (function createQuestionDeck() {
    'use strict';

    const OPS = {
        addition: { symbol: '+', solve: (a, b) => a + b },
        subtraction: { symbol: '−', solve: (a, b) => a - b },
        multiplication: { symbol: '×', solve: (a, b) => a * b },
        division: { symbol: '÷', solve: (a, b) => a / b }
    };
    const SYMBOL_TO_OP = { '+': 'addition', '-': 'subtraction', '−': 'subtraction', '×': 'multiplication', 'x': 'multiplication', '*': 'multiplication', '÷': 'division', '/': 'division' };
    const TIER_STARS = { easy: 1, medium: 2, hard: 3 };

    const recent = [];                 // last N question texts (generated)
    const RECENT_LIMIT = 40;
    const bags = {};                   // tier → remaining bank indexes
    let bank = null;

    function randInt(range) {
        const [min, max] = range;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function shuffle(list) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function pickWeighted(weights, only) {
        const entries = Object.entries(weights).filter(([op, w]) => w > 0 && (!only || op === only));
        if (!entries.length) return only || 'addition';
        let roll = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
        for (const [op, w] of entries) {
            roll -= w;
            if (roll <= 0) return op;
        }
        return entries[0][0];
    }

    function hintFor(op, a, b) {
        if (op === 'addition') return b >= 10 ? `Add the tens first, then the ones: ${a} + ${Math.floor(b / 10) * 10} + ${b % 10}.` : `Count up ${b} from ${a}.`;
        if (op === 'subtraction') return b >= 10 ? `Take away the tens, then the ones: ${a} − ${Math.floor(b / 10) * 10} − ${b % 10}.` : `What do you add to ${b} to make ${a}?`;
        if (op === 'multiplication') {
            const big = Math.max(a, b), small = Math.min(a, b);
            if (big <= 10) return `${small} groups of ${big}.`;
            return big - 10 > 0 ? `Split it: ${small} × 10 + ${small} × ${big - 10}.` : `${small} × 10.`;
        }
        return `Think: ${b} × ? = ${a}`;
    }

    /** Build one question from a tier's rules. */
    function generate(tierName, tiers, onlyOp) {
        const tier = tiers[tierName] || tiers.easy;
        for (let attempt = 0; attempt < 25; attempt++) {
            const op = pickWeighted(tier.weights, onlyOp);
            const rule = tier[op];
            let a, b;
            if (op === 'division') {
                b = randInt(rule.divisor);
                a = b * randInt(rule.quotient);
            } else {
                a = randInt(rule.a);
                b = randInt(rule.b);
                if (op === 'subtraction' && b > a) [a, b] = [b, a];
                if (op === 'multiplication' && Math.random() < 0.5) [a, b] = [b, a];
            }
            const text = `${a} ${OPS[op].symbol} ${b}`;
            if (recent.includes(text) && attempt < 24) continue;
            recent.push(text);
            if (recent.length > RECENT_LIMIT) recent.shift();
            return { text, answer: OPS[op].solve(a, b), category: op, tier: tierName, hint: hintFor(op, a, b), generated: true };
        }
        return null;
    }

    /** Parse + validate the curated bank once ("a OP b", whole-number answers only). */
    function getBank() {
        if (bank) return bank;
        const raw = typeof MATHMON_QUESTION_BANK !== 'undefined' ? MATHMON_QUESTION_BANK : [];
        bank = [];
        raw.forEach((entry, index) => {
            const m = String(entry.question || '').match(/^\s*(\d+)\s*([+\-−×x*÷/])\s*(\d+)\s*$/);
            const op = m && SYMBOL_TO_OP[m[2]];
            const a = m ? Number(m[1]) : NaN, b = m ? Number(m[3]) : NaN;
            const answer = op ? OPS[op].solve(a, b) : NaN;
            if (!op || !Number.isInteger(answer) || answer < 0 || !TIER_STARS[entry.tier]) {
                console.warn('[MathMon] Skipping invalid question-bank entry at index', index, entry);
                return;
            }
            bank.push({ text: `${a} ${OPS[op].symbol} ${b}`, answer, category: op, tier: entry.tier, hint: entry.hint || hintFor(op, a, b) });
        });
        return bank;
    }

    function drawFromBank(tierName, onlyOp) {
        const pool = getBank().map((q, i) => ({ q, i })).filter(({ q }) => q.tier === tierName && (!onlyOp || q.category === onlyOp));
        if (!pool.length) return null;
        const key = `${tierName}:${onlyOp || 'all'}`;
        if (!bags[key] || !bags[key].length) bags[key] = shuffle(pool.map((p) => p.i));
        return getBank()[bags[key].pop()];
    }

    /**
     * Next question for a move.
     * @param {object} opts { tier: 'easy'|'medium'|'hard', category?: op name (training), config: MathMonBattleConfig }
     * @returns {{ text, answer, acceptedAnswers, displayAnswer, hint, category, tier, difficulty, timerSeconds, inputMode }}
     */
    function next(opts) {
        const cfg = opts.config;
        const gate = cfg.questionGate;
        const tierName = cfg.questionTiers[opts.tier] ? opts.tier : 'easy';
        const useBank = gate.source === 'bank' || (gate.source === 'mixed' && Math.random() < (gate.mixedBankChance || 0.4));
        const q = (useBank && drawFromBank(tierName, opts.category)) || generate(tierName, cfg.questionTiers, opts.category);
        return {
            ...q,
            acceptedAnswers: [String(q.answer)],
            displayAnswer: String(q.answer),
            difficulty: TIER_STARS[tierName],
            timerSeconds: cfg.questionTiers[tierName].timerSeconds,
            inputMode: 'numeric'
        };
    }

    return { next, generate, getBank, OPS };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MathMonQuestionDeck;
}
