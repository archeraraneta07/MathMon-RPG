"""
MathMon Question Generator - Python Edition
==============================================

Generates math questions for the four categories (addition, subtraction,
multiplication, division) across 10 difficulty tiers, mirroring the
JavaScript version in js/questions.js.

Used by:
    - server.py (Flask API /api/questions endpoint)
    - ml_model.py (feature extraction and synthetic data generation)
    - data_processor.py (attempt categorization)

Usage:
    from questions import QuestionGenerator

    q = QuestionGenerator.generateQuestion('addition', 3)
    # {'category': 'addition', 'question': '15 + 22 = ?', 'answer': 37, ...}
"""

import random

MATH_CATEGORIES = [
    {'key': 'addition',       'label': 'Addition',       'icon': '➕', 'color': '#FF6B35'},
    {'key': 'subtraction',    'label': 'Subtraction',    'icon': '➖', 'color': '#2196F3'},
    {'key': 'multiplication', 'label': 'Multiplication', 'icon': '✖️', 'color': '#FFC107'},
    {'key': 'division',       'label': 'Division',       'icon': '➗', 'color': '#9C27B0'}
]

DIFFICULTY_LEVELS = {
    1:  {'min': 2,  'max': 10,  'operands': 2},
    2:  {'min': 5,  'max': 15,  'operands': 2},
    3:  {'min': 8,  'max': 20,  'operands': 2},
    4:  {'min': 10, 'max': 25,  'operands': 3},
    5:  {'min': 12, 'max': 30,  'operands': 3},
    6:  {'min': 15, 'max': 40,  'operands': 3},
    7:  {'min': 20, 'max': 50,  'operands': 3},
    8:  {'min': 25, 'max': 60,  'operands': 4},
    9:  {'min': 30, 'max': 70,  'operands': 4},
    10: {'min': 35, 'max': 80,  'operands': 4}
}

XP_PER_LEVEL = [0, 100, 250, 450, 700, 1000, 1400, 1900,
                2500, 3200, 4000, 4900, 6000, 7200, 8500, 10000]


def rand_int(min_val, max_val):
    """Generate a random integer between min_val and max_val (inclusive)."""
    return random.randint(int(min_val), int(max_val))


def get_difficulty_for_level(level):
    """Map a player level to a difficulty tier (1-10)."""
    if level <= 2: return 1
    if level <= 4: return 2
    if level <= 6: return 3
    if level <= 8: return 4
    if level <= 10: return 5
    if level <= 14: return 6
    if level <= 18: return 7
    if level <= 25: return 8
    if level <= 35: return 9
    return 10


def generate_question(category, difficulty):
    """
    Generate a single math question for the given category and difficulty.

    Args:
        category: 'addition', 'subtraction', 'multiplication', or 'division'
        difficulty: Difficulty tier (1-10)

    Returns:
        dict with keys: id, category, categoryLabel, categoryIcon,
                       difficulty, question, answer, hint, timestamp
    """
    diff = DIFFICULTY_LEVELS.get(min(difficulty, 10), DIFFICULTY_LEVELS[1])
    min_val = diff['min']
    max_val = diff['max']
    operand_count = diff['operands']

    operand1, operand2, operand3, operand4 = 0, 0, 0, 0
    answer = 0
    question_text = ""
    hint = ""

    cat_info = next(c for c in MATH_CATEGORIES if c['key'] == category)

    if category == 'addition':
        operand1 = rand_int(min_val, max_val)
        operand2 = rand_int(min_val, max_val)
        if operand_count >= 3:
            operand3 = rand_int(min_val, max_val)
        if operand_count >= 4:
            operand4 = rand_int(min_val, max_val)
        answer = operand1 + operand2 + (operand3 if operand_count >= 3 else 0) + (operand4 if operand_count >= 4 else 0)
        question_text = f"{operand1} + {operand2}"
        if operand_count >= 3:
            question_text += f" + {operand3}"
        if operand_count >= 4:
            question_text += f" + {operand4}"
        hint = "Add the numbers together step by step."

    elif category == 'subtraction':
        operand1 = rand_int(max_val, max_val + 20)
        operand2 = rand_int(min_val, min(max_val, operand1 - 1))
        if operand_count >= 3:
            operand3 = rand_int(1, max(1, operand1 - operand2 - 1))
            answer = operand1 - operand2 - operand3
            question_text = f"{operand1} - {operand2} - {operand3}"
        else:
            answer = operand1 - operand2
            question_text = f"{operand1} - {operand2}"
        if operand_count >= 4:
            operand4 = rand_int(1, max(1, answer - 1))
            answer -= operand4
            question_text += f" - {operand4}"
        hint = "Subtract from left to right."

    elif category == 'multiplication':
        operand1 = rand_int(min_val, min(max_val, 12))
        operand2 = rand_int(min_val, min(max_val, 12))
        if operand_count >= 3:
            operand3 = rand_int(2, min(max_val, 10))
        if operand_count >= 4:
            operand4 = rand_int(2, min(max_val, 8))
        answer = operand1 * operand2
        question_text = f"{operand1} × {operand2}"
        if operand_count >= 3:
            answer *= operand3
            question_text += f" × {operand3}"
        if operand_count >= 4:
            answer *= operand4
            question_text += f" × {operand4}"
        hint = "Multiply the first two numbers, then continue."

    elif category == 'division':
        if operand_count >= 3:
            operand2 = rand_int(2, min(max_val, 12))
            operand3 = rand_int(2, min(max_val, 10))
            operand1 = operand2 * operand3 * rand_int(2, min(max_val, 6))
            answer = operand1 // operand2 // operand3
            question_text = f"{operand1} ÷ {operand2} ÷ {operand3}"
        else:
            operand2 = rand_int(2, min(max_val, 12))
            operand1 = operand2 * rand_int(2, min(max_val, operand_count == 2 and 12 or 20))
            answer = operand1 // operand2
            question_text = f"{operand1} ÷ {operand2}"
        if operand_count >= 4:
            operand4 = rand_int(2, min(max_val, 8))
            answer = answer // operand4
            question_text += f" ÷ {operand4}"
        hint = "Divide step by step from left to right."

    return {
        'id': f"{random.randint(0, 999999)}_{random.randint(0, 999999)}",
        'category': category,
        'categoryLabel': cat_info['label'],
        'categoryIcon': cat_info['icon'],
        'difficulty': difficulty,
        'question': question_text + " = ?",
        'answer': answer,
        'hint': hint,
        'operands': [o for o in [operand1, operand2, operand3, operand4] if o != 0],
        'timestamp': int(__import__('time').time() * 1000)
    }


def generate_random_question(player_level=1):
    """Generate a question for a random category at the player's difficulty."""
    categories = [c['key'] for c in MATH_CATEGORIES]
    category = categories[rand_int(0, len(categories) - 1)]
    difficulty = get_difficulty_for_level(player_level)
    return generate_question(category, difficulty)


class QuestionGenerator:
    """Static interface for question generation, mirroring the JS module."""

    MATH_CATEGORIES = MATH_CATEGORIES
    DIFFICULTY_LEVELS = DIFFICULTY_LEVELS

    generateQuestion = staticmethod(generate_question)
    generateRandomQuestion = staticmethod(generate_random_question)
    getDifficultyForLevel = staticmethod(get_difficulty_for_level)
    randInt = staticmethod(rand_int)


# ----- Monster data (mirrors js/monsters.js) -----

MONSTER_DATA = [
    {'id': 'add_1', 'name': 'Pluspy',     'type': 'addition',       'level': 1, 'hp': 30, 'attack': 8,  'defense': 5, 'description': 'A friendly fire-bodied monster that loves addition problems.',       'sprite': '🔥🧮', 'color': '#FF6B35'},
    {'id': 'add_2', 'name': 'Sumslime',   'type': 'addition',       'level': 2, 'hp': 45, 'attack': 12, 'defense': 8, 'description': 'A gelatinous creature formed from adding numbers together.',          'sprite': '🟢➕', 'color': '#4CAF50'},
    {'id': 'sub_1', 'name': 'Minusquid',  'type': 'subtraction',    'level': 1, 'hp': 30, 'attack': 7,  'defense': 5, 'description': 'A cool blue monster that subtracts from your confidence... then builds it back.', 'sprite': '🌀➖', 'color': '#2196F3'},
    {'id': 'sub_2', 'name': 'Diffdrake',  'type': 'subtraction',    'level': 2, 'hp': 45, 'attack': 13, 'defense': 8, 'description': 'A wise dragon that knows the difference between right and wrong answers.', 'sprite': '🟦🐉', 'color': '#1976D2'},
    {'id': 'mul_1', 'name': 'Timeshell',  'type': 'multiplication', 'level': 1, 'hp': 30, 'attack': 9,  'defense': 5, 'description': 'A swift turtle whose shell multiplies your speed.',                      'sprite': '🟡🐢', 'color': '#FFC107'},
    {'id': 'mul_2', 'name': 'Productrus', 'type': 'multiplication', 'level': 2, 'hp': 50, 'attack': 14, 'defense': 9, 'description': 'A citrusy beast that amplifies the product of your efforts.',              'sprite': '🟧🍋', 'color': '#FF9800'},
    {'id': 'div_1', 'name': 'Splitling',   'type': 'division',       'level': 1, 'hp': 30, 'attack': 8,  'defense': 5, 'description': 'A small creature that splits problems into manageable pieces.',            'sprite': '🟣✂️', 'color': '#9C27B0'},
    {'id': 'div_2', 'name': 'Quotientail', 'type': 'division',       'level': 2, 'hp': 50, 'attack': 13, 'defense': 9, 'description': 'A tail-wagging companion that divides and conquers every challenge.',       'sprite': '🟪🦊', 'color': '#7B1FA2'},
]


def get_monsters():
    """Return the monster roster data."""
    return MONSTER_DATA


if __name__ == '__main__':
    import json
    print(json.dumps(generate_random_question(5), indent=2))
