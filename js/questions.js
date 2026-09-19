const MATH_CATEGORIES = [
    { key: 'addition',       label: 'Addition',       icon: '➕', color: '#FF6B35' },
    { key: 'subtraction',    label: 'Subtraction',    icon: '➖', color: '#2196F3' },
    { key: 'multiplication', label: 'Multiplication', icon: '✖️', color: '#FFC107' },
    { key: 'division',       label: 'Division',       icon: '➗', color: '#9C27B0' }
];

const DIFFICULTY_LEVELS = {
    1: { min: 2,   max: 10,  operands: 2 },
    2: { min: 5,   max: 15,  operands: 2 },
    3: { min: 8,   max: 20,  operands: 2 },
    4: { min: 10,  max: 25,  operands: 3 },
    5: { min: 12,  max: 30,  operands: 3 },
    6: { min: 15,  max: 40,  operands: 3 },
    7: { min: 20,  max: 50,  operands: 3 },
    8: { min: 25,  max: 60,  operands: 4 },
    9: { min: 30,  max: 70,  operands: 4 },
    10: { min: 35, max: 80,  operands: 4 }
};

function getDifficultyForLevel(level) {
    if (level <= 2) return 1;
    if (level <= 4) return 2;
    if (level <= 6) return 3;
    if (level <= 8) return 4;
    if (level <= 10) return 5;
    if (level <= 14) return 6;
    if (level <= 18) return 7;
    if (level <= 25) return 8;
    if (level <= 35) return 9;
    return 10;
}

function generateQuestion(category, difficulty) {
    const diff = DIFFICULTY_LEVELS[Math.min(difficulty, 10)] || DIFFICULTY_LEVELS[1];
    const min = diff.min;
    const max = diff.max;
    const operandCount = diff.operands;

    let operand1, operand2, operand3, operand4;
    let answer, questionText, hint;

    switch (category) {
        case 'addition':
            operand1 = randInt(min, max);
            operand2 = randInt(min, max);
            if (operandCount >= 3) operand3 = randInt(min, max);
            if (operandCount >= 4) operand4 = randInt(min, max);
            answer = operand1 + operand2 + (operandCount >= 3 ? operand3 : 0) + (operandCount >= 4 ? operand4 : 0);
            questionText = `${operand1} + ${operand2}` +
                (operandCount >= 3 ? ` + ${operand3}` : '') +
                (operandCount >= 4 ? ` + ${operand4}` : '');
            hint = `Add the numbers together step by step.`;
            break;

        case 'subtraction':
            operand1 = randInt(max, max + 20);
            operand2 = randInt(min, Math.min(max, operand1 - 1));
            if (operandCount >= 3) {
                operand3 = randInt(1, Math.max(1, operand1 - operand2 - 1));
                answer = operand1 - operand2 - operand3;
                questionText = `${operand1} - ${operand2} - ${operand3}`;
            } else {
                answer = operand1 - operand2;
                questionText = `${operand1} - ${operand2}`;
            }
            if (operandCount >= 4) {
                operand4 = randInt(1, Math.max(1, answer - 1));
                answer -= operand4;
                questionText += ` - ${operand4}`;
            }
            hint = `Subtract from left to right.`;
            break;

        case 'multiplication':
            operand1 = randInt(min, Math.min(max, 12));
            operand2 = randInt(min, Math.min(max, 12));
            if (operandCount >= 3) operand3 = randInt(2, Math.min(max, 10));
            if (operandCount >= 4) operand4 = randInt(2, Math.min(max, 8));
            answer = operand1 * operand2 * (operandCount >= 3 ? operand3 : 1) * (operandCount >= 4 ? operand4 : 1);
            questionText = `${operand1} × ${operand2}` +
                (operandCount >= 3 ? ` × ${operand3}` : '') +
                (operandCount >= 4 ? ` × ${operand4}` : '');
            hint = `Multiply the first two numbers, then continue.`;
            break;

        case 'division':
            if (operandCount >= 3) {
                operand2 = randInt(2, Math.min(max, 12));
                operand3 = randInt(2, Math.min(max, 10));
                operand1 = operand2 * operand3 * randInt(2, Math.min(max, 6));
                answer = operand1 / operand2 / operand3;
                questionText = `${operand1} ÷ ${operand2} ÷ ${operand3}`;
            } else {
                operand2 = randInt(2, Math.min(max, 12));
                operand1 = operand2 * randInt(2, Math.min(max, operandCount === 2 ? 12 : 20));
                answer = operand1 / operand2;
                questionText = `${operand1} ÷ ${operand2}`;
            }
            if (operandCount >= 4) {
                operand4 = randInt(2, Math.min(max, 8));
                const prevAnswer = answer;
                answer = prevAnswer / operand4;
                questionText += ` ÷ ${operand4}`;
            }
            hint = `Divide step by step from left to right.`;
            answer = Math.floor(answer);
            break;

        default:
            return generateQuestion('addition', difficulty);
    }

    return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        category: category,
        categoryLabel: MATH_CATEGORIES.find(c => c.key === category).label,
        categoryIcon: MATH_CATEGORIES.find(c => c.key === category).icon,
        difficulty: difficulty,
        question: questionText,
        answer: answer,
        hint: hint,
        timestamp: Date.now()
    };
}

function randInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomQuestion(playerLevel) {
    const categories = MATH_CATEGORIES.map(c => c.key);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const difficulty = getDifficultyForLevel(playerLevel);
    return generateQuestion(randomCategory, difficulty);
}

function pickBalancedCategory(playerStats, playerLevel) {
    const categories = [...MATH_CATEGORIES];
    const topicStats = playerStats.topicStats || {};
    const weakCategories = categories
        .filter(cat => {
            const ts = topicStats[cat.key];
            if (!ts) return Math.random() < 0.3;
            return ts.accuracy < 70;
        });
    if (weakCategories.length > 0 && Math.random() < 0.4) {
        return weakCategories[Math.floor(Math.random() * weakCategories.length)].key;
    }
    return categories[Math.floor(Math.random() * categories.length)].key;
}

const QuestionGenerator = {
    MATH_CATEGORIES: MATH_CATEGORIES,
    DIFFICULTY_LEVELS: DIFFICULTY_LEVELS,
    getDifficultyForLevel: getDifficultyForLevel,
    generateQuestion: generateQuestion,
    generateRandomQuestion: generateRandomQuestion,
    pickBalancedCategory: pickBalancedCategory,
    randInt: randInt
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuestionGenerator;
}
