"""
MathMon Server - Flask API
============================

Provides a RESTful API that bridges the web frontend with the Python ML
backend (ml_model.py + data_processor.py). The frontend can either:

    1. Run standalone using localStorage + client-side ML (js/ml.js)
    2. Connect to this API for full server-side processing with
       scikit-learn and MySQL persistence

Endpoints:
    GET  /                         -> Health check / serve the game
    POST /api/player               -> Register a new player
    GET  /api/player/<id>          -> Get player profile
    PUT  /api/player/<id>          -> Update player profile
    POST /api/battle               -> Start a battle
    POST /api/battle/<id>/result   -> Submit battle results
    POST /api/attempt              -> Record a question attempt
    GET  /api/player/<id>/stats    -> Get aggregated stats
    POST /api/ml/classify          -> Run ML classification
    GET  /api/ml/recommendations/<id> -> Get ML recommendations
    POST /api/ml/train             -> Train the ML model
    GET  /api/monsters             -> Get monster roster
    GET  /api/questions            -> Generate questions
    POST /api/export/<id>          -> Export player data to CSV

Dependencies:
    pip install flask pandas scikit-learn numpy joblib
    pip install mysql-connector-python  # optional, for MySQL

Usage:
    python server.py
    # Then open http://localhost:5000
"""

import json
import os
import random
import time
from datetime import datetime

from flask import Flask, request, jsonify, send_from_directory, send_file
from data_processor import PerformanceDataProcessor, get_difficulty_for_level
from ml_model import (
    predict_performance, load_model, train_model,
    CLASS_LABELS, FEATURES, generate_synthetic_data,
    get_difficulty_for_level as ml_get_difficulty
)
from questions import QuestionGenerator, MONSTER_DATA, get_monsters

app = Flask(__name__,
            static_folder='../',
            static_url_path='')

processor = PerformanceDataProcessor()

# Try to load the ML model; train a fresh one if not found
try:
    ml_model = load_model()
except Exception:
    ml_model = train_model(save=True, verbose=True)

# Question generator and monster roster are imported from questions.py


# ----- Static file serving -----

@app.route('/')
def serve_game():
    """Serve the main game page."""
    return send_from_directory('..', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS, assets)."""
    return send_from_directory('..', filename)


# ----- Player API -----

@app.route('/api/player', methods=['POST'])
def register_player():
    """Register a new player."""
    data = request.get_json() or {}
    name = data.get('name', 'New Trainer')
    gender = data.get('gender', 'male')

    player_id = str(int(time.time()))

    player = {
        'player_id': player_id,
        'name': name,
        'gender': gender,
        'level': 1,
        'xp': 0,
        'score': 0,
        'total_battles': 0,
        'battles_won': 0,
        'created_at': datetime.utcnow().isoformat()
    }

    return jsonify({
        'success': True,
        'player': player,
        'message': f'Welcome, {name}! Trainer {player_id} registered.'
    }), 201


@app.route('/api/player/<player_id>', methods=['GET'])
def get_player(player_id):
    """Get player profile."""
    stats = processor.get_player_stats(player_id)
    return jsonify({
        'success': True,
        'player': {
            'player_id': player_id,
            'name': stats.get('name', f'Player_{player_id}'),
            'level': stats.get('level', 1),
            'xp': stats.get('xp', 0),
            'score': stats.get('score', 0),
            'total_battles': stats.get('total_battles', 0),
            'battles_won': stats.get('battles_won', 0)
        }
    })


@app.route('/api/player/<player_id>', methods=['PUT'])
def update_player(player_id):
    """Update player profile."""
    data = request.get_json() or {}
    data['player_id'] = player_id
    # In a full MySQL setup, this would UPDATE the players table
    return jsonify({
        'success': True,
        'message': f'Player {player_id} updated.'
    })


# ----- Battle API -----

@app.route('/api/battle', methods=['POST'])
def start_battle():
    """Start a new battle — select a monster and generate a question."""
    data = request.get_json() or {}
    player_id = data.get('player_id', '1')
    category = data.get('category', random.choice(
        ['addition', 'subtraction', 'multiplication', 'division']
    ))
    level = data.get('level', 1)

    try:
        import json as json_module
        monsters_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'monsters.json')
        if os.path.exists(monsters_path):
            with open(monsters_path, 'r') as f:
                monsters = json_module.load(f)
        else:
            monsters = MONSTER_DATA
    except Exception:
        monsters = MONSTER_DATA

    difficulty = get_difficulty_for_level(level)
    candidates = [m for m in monsters if m.get('type') == category and m.get('level', 1) <= difficulty]
    if not candidates:
        candidates = [m for m in monsters if m.get('type') == category]

    monster = random.choice(candidates)

    monster_instance = {
        'name': monster['name'],
        'sprite': monster['sprite'],
        'type': monster['type'],
        'max_hp': monster['hp'] + (level - 1) * 5,
        'current_hp': monster['hp'] + (level - 1) * 5,
        'attack': monster['attack'] + int(level * 0.5),
        'defense': monster['defense'] + int(level * 0.3),
        'level': monster['level'],
        'color': monster.get('color', '#FFFFFF')
    }

    if QuestionGenerator:
        question = QuestionGenerator.generateQuestion(category, difficulty)
    else:
        question = {
            'category': category,
            'question': '5 + 3 = ?',
            'answer': 8,
            'hint': 'Add the two numbers together.'
        }

    battle_id = f"{player_id}_{int(time.time())}"

    return jsonify({
        'success': True,
        'battle_id': battle_id,
        'monster': monster_instance,
        'question': {
            'id': question.get('id', battle_id + '_q'),
            'category': question['category'],
            'categoryLabel': question.get('categoryLabel', category.title()),
            'categoryIcon': question.get('categoryIcon', '🔢'),
            'question': question['question'],
            'answer': question['answer'],
            'difficulty': difficulty
        }
    })


@app.route('/api/battle/<battle_id>/result', methods=['POST'])
def submit_battle_result(battle_id):
    """Submit battle results and update player stats."""
    data = request.get_json() or {}
    player_id = data.get('player_id', '1')
    won = data.get('won', False)
    xp_earned = data.get('xp_earned', 0)
    score_earned = data.get('score_earned', 0)
    opponent_name = data.get('opponent_name', 'Unknown')
    category = data.get('category', 'addition')

    processor.record_battle(player_id, won, xp_earned, score_earned, opponent_name, category)

    return jsonify({
        'success': True,
        'message': f'Battle result recorded for player {player_id}.',
        'xp_earned': xp_earned,
        'score_earned': score_earned
    })


# ----- Attempt API -----

@app.route('/api/attempt', methods=['POST'])
def record_attempt():
    """Record a single question attempt."""
    data = request.get_json() or {}
    player_id = data.get('player_id', '1')
    category = data.get('category', 'addition')
    correct = data.get('correct', False)
    response_time = data.get('response_time', 0)
    difficulty = data.get('difficulty', 1)
    answer_given = data.get('answer_given')
    correct_answer = data.get('correct_answer')
    battle_id = data.get('battle_id')
    level = data.get('level', 1)

    attempt = processor.record_attempt(
        player_id=player_id,
        category=category,
        correct=correct,
        response_time=response_time,
        difficulty=difficulty,
        answer_given=answer_given,
        correct_answer=correct_answer,
        battle_id=battle_id,
        level=level
    )

    return jsonify({
        'success': True,
        'attempt_id': attempt.get('timestamp'),
        'message': 'Attempt recorded.'
    }), 201


# ----- Stats API -----

@app.route('/api/player/<player_id>/stats', methods=['GET'])
def get_player_stats(player_id):
    """Get aggregated player statistics."""
    stats = processor.get_player_stats(player_id)

    if not stats:
        return jsonify({'success': False, 'message': 'Player not found.'}), 404

    return jsonify({
        'success': True,
        'stats': stats
    })


@app.route('/api/player/<player_id>/performance', methods=['GET'])
def get_performance_summary(player_id):
    """Get a human-readable performance summary."""
    summary = processor.get_performance_summary(player_id)
    return jsonify({
        'success': True,
        'summary': summary
    })


# ----- ML API -----

@app.route('/api/ml/classify', methods=['POST'])
def classify_player():
    """Classify a player's performance using the trained ML model."""
    data = request.get_json() or {}
    player_id = data.get('player_id')
    force_retrain = data.get('force_retrain', False)

    if force_retrain:
        global ml_model
        ml_model = train_model(save=True, verbose=True)

    if player_id:
        stats = processor.get_player_stats(player_id)
        features = processor.prepare_ml_features(stats)
    else:
        # Classify based on raw stats provided
        stats = data.get('stats', {})
        features = processor.prepare_ml_features(stats) if stats else None
        if not features:
            return jsonify({
                'success': False,
                'message': 'Provide player_id or stats data.'
            }), 400

    result = predict_performance(stats, ml_model)

    return jsonify({
        'success': True,
        'result': result
    })


@app.route('/api/ml/recommendations/<player_id>', methods=['GET'])
def get_recommendations(player_id):
    """Get ML-powered recommendations for a player."""
    stats = processor.get_player_stats(player_id)

    if not stats:
        return jsonify({
            'success': False,
            'message': f'Player {player_id} not found.'
        }), 404
    if stats.get('totalAttempts', 0) == 0:
        return jsonify({
            'success': True,
            'recommendations': ['Start playing to generate performance data for analysis.'],
            'classification': 'Needs Practice'
        })

    result = predict_performance(stats, ml_model)

    return jsonify({
        'success': True,
        'classification': result['classification'],
        'confidence': result['confidence'],
        'recommendations': result['recommendation'],
        'features': result['features']
    })


@app.route('/api/ml/train', methods=['POST'])
def train_endpoint():
    """Train or retrain the ML model."""
    data = request.get_json() or {}
    csv_path = data.get('csv_path')

    model = train_model(csv_path=csv_path, save=True, verbose=True)
    global ml_model
    ml_model = model

    return jsonify({
        'success': True,
        'message': 'Model trained and saved successfully.',
        'model_type': 'RandomForestClassifier',
        'features': FEATURES,
        'classes': list(CLASS_LABELS.values())
    })


@app.route('/api/ml/demo', methods=['GET'])
def ml_demo():
    """Run a demo classification on synthetic players."""
    df = generate_synthetic_data(n_samples=3)

    results = []
    for idx, row in df.iterrows():
        stats = {
            'accuracy': row['accuracy'],
            'correctAnswers': row['correct_answers'],
            'incorrectAnswers': row['incorrect_answers'],
            'totalAttempts': row['total_attempts'],
            'avgResponseTime': row['avg_response_time'],
            'topicStats': {},
            'level': row['current_level'],
            'avg_topic_accuracy': row['avg_topic_accuracy'],
            'topic_variance': row['topic_variance'],
            'correctness_ratio': row['correctness_ratio'],
            'error_rate': row['error_rate']
        }
        result = predict_performance(stats, ml_model)
        results.append({
            'classification': result['classification'],
            'confidence': result['confidence'],
            'features': result['features'],
            'recommendation': result['recommendation']
        })

    return jsonify({
        'success': True,
        'demo_results': results
    })


# ----- Content API -----

@app.route('/api/monsters', methods=['GET'])
def get_monsters():
    """Get the full monster roster."""
    try:
        import json as json_module
        monsters_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'monsters.json')
        if os.path.exists(monsters_path):
            with open(monsters_path, 'r') as f:
                monsters = json_module.load(f)
        else:
            monsters = MONSTER_DATA
    except Exception:
        monsters = MONSTER_DATA

    return jsonify({
        'success': True,
        'monsters': monsters
    })


@app.route('/api/questions', methods=['GET'])
def get_questions():
    """Generate a set of questions."""
    args = request.args
    category = args.get('category', 'random')
    difficulty = int(args.get('difficulty', 3))
    count = int(args.get('count', 5))

    questions = []
    for _ in range(count):
        if category == 'random':
            q = QuestionGenerator.generateRandomQuestion(max(1, difficulty))
        else:
            q = QuestionGenerator.generateQuestion(category, difficulty)
        questions.append(q)

    return jsonify({
        'success': True,
        'questions': questions
    })


@app.route('/api/questions', methods=['POST'])
def post_questions():
    """Generate questions via POST for more complex parameters."""
    data = request.get_json() or {}
    categories = data.get('categories', ['addition', 'subtraction', 'multiplication', 'division'])
    difficulty = data.get('difficulty', 3)
    count = data.get('count', 10)

    questions = []
    for _ in range(count):
        cat = random.choice(categories) if categories != ['random'] else None
        if cat:
            q = QuestionGenerator.generateQuestion(cat, difficulty)
        else:
            q = QuestionGenerator.generateRandomQuestion(max(1, difficulty))
        questions.append(q)

    return jsonify({
        'success': True,
        'questions': questions
    })


# ----- Export API -----

@app.route('/api/export/<player_id>', methods=['POST'])
def export_player_data(player_id):
    """Export a player's data to CSV."""
    filepath = processor.export_csv(player_id)

    if filepath and os.path.exists(filepath):
        return send_file(filepath, as_attachment=True)
    else:
        return jsonify({
            'success': False,
            'message': 'Export failed or no data available.'
        }), 404


# ----- Health check -----

@app.route('/api/health', methods=['GET'])
def health_check():
    """Check server and model status."""
    return jsonify({
        'success': True,
        'service': 'MathMon Game Server',
        'version': '1.0.0',
        'ml_model_loaded': ml_model is not None,
        'ml_model_type': 'RandomForestClassifier' if ml_model else None,
        'timestamp': datetime.utcnow().isoformat()
    })


# ----- Error handlers -----

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'message': 'Endpoint not found.'
    }), 404


@app.errorhandler(500)
def server_error(error):
    return jsonify({
        'success': False,
        'message': 'Internal server error.'
    }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
