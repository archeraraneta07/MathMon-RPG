// Unit tests for the API helpers (no Azure resources needed): `cd api && npm test`
const test = require('node:test');
const assert = require('node:assert');
const { generate, TIERS } = require('../src/lib/questions');
const { rules } = require('../src/lib/classify');
const { playerId, features, number, text } = require('../src/lib/http');

test('generated questions have whole, non-negative answers', () => {
    for (const tier of Object.keys(TIERS)) {
        for (let i = 0; i < 500; i++) {
            const q = generate(tier);
            assert.ok(Number.isInteger(q.answer) && q.answer >= 0, `${tier}: ${q.text} = ${q.answer}`);
            const [a, sym, b] = q.text.split(' ');
            const expected = { '+': +a + +b, '−': a - b, '×': a * b, '÷': a / b }[sym];
            assert.strictEqual(q.answer, expected, q.text);
        }
    }
});

test('a forced operation is respected', () => {
    for (let i = 0; i < 50; i++) assert.strictEqual(generate('medium', 'division').category, 'division');
});

test('rule classifier matches js/ml.js thresholds', () => {
    assert.strictEqual(rules({ totalAttempts: 3, correctAnswers: 3 }).classification, 'Needs Practice');
    const topicStats = Object.fromEntries(['addition', 'subtraction', 'multiplication', 'division'].map((t) => [t, { attempts: 10, correct: 9 }]));
    assert.strictEqual(rules({ totalAttempts: 40, correctAnswers: 36, incorrectAnswers: 4, topicStats }).classification, 'Proficient');
    assert.strictEqual(rules({ totalAttempts: 20, correctAnswers: 12, incorrectAnswers: 8 }).classification, 'Developing');
    assert.strictEqual(rules({ totalAttempts: 20, correctAnswers: 4, incorrectAnswers: 16 }).classification, 'Needs Practice');
});

test('input validation', () => {
    assert.strictEqual(playerId('web-123-abc'), 'web-123-abc');
    assert.strictEqual(playerId('../etc/passwd'), null);
    assert.strictEqual(playerId(''), null);
    assert.deepStrictEqual(features([1, 2, 3], 3), [1, 2, 3]);
    assert.strictEqual(features([1, 'x', 3], 3), null);
    assert.strictEqual(features([1, 2], 3), null);
    assert.strictEqual(number('999', 0, 200, 0), 200);
    assert.strictEqual(number('abc', 0, 200, 7), 7);
    assert.strictEqual(text('<b>Leo</b>', 24), 'bLeo/b');
});
