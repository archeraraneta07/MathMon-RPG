/**
 * MathMon curated question bank (optional — used when
 * MathMonBattleConfig.questionGate.source is 'bank' or 'mixed').
 * By default battles generate questions from the tier rules in
 * MathMonBattleConfig.questionTiers, so this list never runs out.
 *
 * HOW TO EDIT
 *   - question  "a OP b" with whole numbers; OP is +  −  ×  ÷  (also - x * / accepted)
 *   - tier      'easy' (Normal Attack) | 'medium' (Skills) | 'hard' (Ultimate)
 *   - hint      optional; shown when the player buys a hint
 *   The answer is computed automatically. Entries whose answer is not a
 *   whole number ≥ 0 (e.g. 7 ÷ 2, 3 − 8) are skipped with a console warning.
 */
const MATHMON_QUESTION_BANK = [
    // ---- Easy: Normal Attack ---------------------------------------------------
    { question: '12 + 7', tier: 'easy', hint: 'Count up 7 from 12.' },
    { question: '9 + 8', tier: 'easy', hint: '9 + 8 is one less than 9 + 9.' },
    { question: '15 − 7', tier: 'easy', hint: 'What do you add to 7 to make 15?' },
    { question: '20 − 9', tier: 'easy', hint: '20 − 10 = 10, then add 1 back.' },
    { question: '4 × 6', tier: 'easy', hint: 'Four groups of six.' },
    { question: '5 × 7', tier: 'easy', hint: 'Count by fives seven times.' },
    { question: '18 ÷ 3', tier: 'easy', hint: 'How many 3s fit into 18?' },
    { question: '20 ÷ 5', tier: 'easy', hint: 'Half of 20 is 10; half again is 5 — so…' },

    // ---- Medium: Skills -----------------------------------------------------------
    { question: '8 × 6', tier: 'medium', hint: '8 × 5 = 40, plus one more 8.' },
    { question: '7 × 8', tier: 'medium', hint: '5, 6, 7, 8 → 56 = 7 × 8.' },
    { question: '9 × 12', tier: 'medium', hint: '9 × 10 + 9 × 2.' },
    { question: '56 ÷ 7', tier: 'medium', hint: '7 × ? = 56' },
    { question: '72 ÷ 9', tier: 'medium', hint: '9 × ? = 72' },
    { question: '47 + 28', tier: 'medium', hint: '47 + 30 − 2.' },
    { question: '83 − 37', tier: 'medium', hint: '83 − 40 + 3.' },

    // ---- Hard: Ultimate ------------------------------------------------------------
    { question: '144 ÷ 12', tier: 'hard', hint: '12 × 12 = 144.' },
    { question: '132 ÷ 11', tier: 'hard', hint: '11 × 12 = 132.' },
    { question: '348 + 276', tier: 'hard', hint: 'Add hundreds, tens, then ones: 500 + 110 + 14.' },
    { question: '612 − 287', tier: 'hard', hint: '612 − 300 + 13.' },
    { question: '23 × 7', tier: 'hard', hint: '20 × 7 + 3 × 7.' },
    { question: '96 ÷ 8', tier: 'hard', hint: '8 × 12 = 96.' }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MATHMON_QUESTION_BANK;
}
