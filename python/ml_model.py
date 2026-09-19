"""
MathMon ML Model - scikit-learn Classification
===============================================

This module implements the Machine Learning component of the MathMon game.
It classifies a player's mathematics performance into one of three categories:

    0 -> Needs Practice  (accuracy < 50%)
    1 -> Developing       (50% <= accuracy < 80%)
    2 -> Proficient       (accuracy >= 80%)

The model uses a RandomForest classifier trained on synthetic performance
data that mirrors the real data schema used by the web frontend.

Dependencies:
    - pandas
    - scikit-learn
    - numpy
    - azure-ai-ml (optional, for Azure cloud deployments)
    - joblib (for model persistence)

Usage:
    # Train a fresh model
    python ml_model.py train

    # Predict on a single player
    python ml_model.py predict --player-id 1

    # Interactive demo with synthetic data
    python ml_model.py demo
"""

import argparse
import json
import os
import sys

try:
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, accuracy_score
    from sklearn.preprocessing import LabelEncoder
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    import joblib
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install pandas scikit-learn numpy joblib")
    sys.exit(1)


# ----- Configuration -----

MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'python', 'mathmon_model.joblib')
DATA_PATH = os.path.join(os.path.dirname(__file__), '..', 'python', 'performance_data.csv')

CLASS_LABELS = {
    0: "Needs Practice",
    1: "Developing",
    2: "Proficient"
}

LABEL_TO_CLASS = {v: k for k, v in CLASS_LABELS.items()}

FEATURES = [
    'accuracy', 'correct_answers', 'incorrect_answers', 'total_attempts',
    'avg_response_time', 'correctness_ratio', 'error_rate',
    'avg_topic_accuracy', 'topic_variance', 'current_level', 'difficulty'
]

MATH_TOPICS = ['addition', 'subtraction', 'multiplication', 'division']

# Difficulty thresholds used to assign a difficulty label in the feature set
DIFFICULTY_LEVELS = {
    1: {'min': 2, 'max': 10, 'operands': 2},
    2: {'min': 5, 'max': 15, 'operands': 2},
    3: {'min': 8, 'max': 20, 'operands': 2},
    4: {'min': 10, 'max': 25, 'operands': 3},
    5: {'min': 12, 'max': 30, 'operands': 3},
    6: {'min': 15, 'max': 40, 'operands': 3},
    7: {'min': 20, 'max': 50, 'operands': 3},
    8: {'min': 25, 'max': 60, 'operands': 4},
    9: {'min': 30, 'max': 70, 'operands': 4},
    10: {'min': 35, 'max': 80, 'operands': 4}
}


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


# ----- Synthetic data generation -----

def generate_synthetic_data(n_samples=2000, random_state=42):
    """
    Generate synthetic player performance data for training the model.

    The label assignment follows the same logic as the client-side ml.js
    classifier to keep the model consistent with the live game:
      accuracy >= 80 & avg_topic_acc >= 75 & error_rate <= 0.25 -> Proficient
      accuracy >= 50                                    -> Developing
      else                                              -> Needs Practice
    """
    rng = np.random.RandomState(random_state)
    records = []

    for _ in range(n_samples):
        total_attempts = rng.randint(5, 200)
        accuracy = rng.randint(10, 100)
        correct = int(total_attempts * accuracy / 100)
        incorrect = total_attempts - correct
        avg_response_time = round(rng.uniform(3, 30), 2)
        correctness_ratio = round(correct / total_attempts, 4)
        error_rate = round(incorrect / total_attempts, 4)
        current_level = rng.randint(1, 36)
        difficulty = get_difficulty_for_level(current_level)

        # Per-topic stats
        topic_accuracies = []
        for topic in MATH_TOPICS:
            acc = rng.randint(10, 100)
            topic_accuracies.append(acc)
        avg_topic_accuracy = round(np.mean(topic_accuracies), 2)
        topic_variance = round(np.var(topic_accuracies) / 10000, 4)

        # Label assignment
        if total_attempts < 5:
            label = 0
        elif accuracy >= 80 and avg_topic_accuracy >= 75 and error_rate <= 0.25:
            label = 2
        elif accuracy >= 50:
            label = 1
        else:
            label = 0

        records.append({
            'accuracy': accuracy,
            'correct_answers': correct,
            'incorrect_answers': incorrect,
            'total_attempts': total_attempts,
            'avg_response_time': avg_response_time,
            'correctness_ratio': correctness_ratio,
            'error_rate': error_rate,
            'avg_topic_accuracy': avg_topic_accuracy,
            'topic_variance': topic_variance,
            'current_level': current_level,
            'difficulty': difficulty,
            'label': label,
            'label_text': CLASS_LABELS[label]
        })

    return pd.DataFrame(records)


def augment_with_topic_columns(df):
    """Add per-topic accuracy and attempt columns for richer features."""
    for topic in MATH_TOPICS:
        df[f'topic_{topic}_acc'] = np.random.randint(10, 100, len(df))
        df[f'topic_{topic}_attempts'] = np.random.randint(0, 50, len(df))
    return df


# ----- Model training -----

def train_model(csv_path=None, save=True, verbose=True):
    """
    Train a RandomForestClassifier on synthetic performance data.

    Args:
        csv_path: Optional path to pre-collected performance CSV.
        save: If True, persist the model to MODEL_PATH.
        verbose: Print training metrics.

    Returns:
        The trained pipeline.
    """
    if csv_path and os.path.exists(csv_path):
        df = pd.read_csv(csv_path)
        if verbose:
            print(f"Loaded {len(df)} records from {csv_path}")
    else:
        df = generate_synthetic_data(n_samples=2000)
        if verbose:
            print(f"Generated {len(df)} synthetic records")

    df = augment_with_topic_columns(df)

    X = df[FEATURES]
    y = df['label']

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('classifier', RandomForestClassifier(
            n_estimators=200,
            max_depth=15,
            min_samples_split=10,
            min_samples_leaf=5,
            random_state=42,
            class_weight='balanced',
            n_jobs=-1
        ))
    ])

    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    test_acc = accuracy_score(y_test, y_pred)

    if verbose:
        print(f"\nModel trained: RandomForest (200 trees, max_depth=15)")
        print(f"Test accuracy: {test_acc:.4f}")
        print(f"\nClassification report:\n{classification_report(y_test, y_pred, target_names=list(CLASS_LABELS.values()))}")

    if save:
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        joblib.dump(pipeline, MODEL_PATH)
        if verbose:
            print(f"Model saved to: {MODEL_PATH}")

    return pipeline


# ----- Prediction -----

def extract_features_from_stats(stats):
    """
    Extract ML features from a player stats dictionary (same schema as frontend).

    Expected keys in stats:
        accuracy, correct_answers, incorrect_answers, total_attempts,
        avg_response_time, topic_stats, level
    """
    accuracy = stats.get('accuracy', 0) or 0
    correct = stats.get('correctAnswers', stats.get('correct_answers', 0))
    incorrect = stats.get('incorrectAnswers', stats.get('incorrect_answers', 0))
    total = stats.get('totalAttempts', stats.get('total_attempts', 0))

    if total > 0:
        correctness_ratio = round(correct / total, 4)
        error_rate = round(incorrect / total, 4)
    else:
        correctness_ratio = 0
        error_rate = 0

    avg_response_time = stats.get('avgResponseTime', stats.get('avg_response_time', 0)) or 0
    current_level = stats.get('level', stats.get('current_level', 1))
    difficulty = get_difficulty_for_level(current_level)

    topic_stats = stats.get('topicStats', stats.get('topic_stats', {}))
    topic_accuracies = []
    for topic in MATH_TOPICS:
        ts = topic_stats.get(topic, {})
        attempts = ts.get('attempts', 0)
        correct_t = ts.get('correct', 0)
        if attempts > 0:
            topic_accuracies.append(correct_t / attempts * 100)
        else:
            topic_accuracies.append(0)

    avg_topic_accuracy = round(np.mean(topic_accuracies), 2) if topic_accuracies else 0
    topic_variance = round(np.var(topic_accuracies) / 10000, 4) if len(topic_accuracies) > 1 else 0

    # Weaken variance to a small number
    topic_variance = float(topic_variance)

    features = {
        'accuracy': float(accuracy),
        'correct_answers': int(correct),
        'incorrect_answers': int(incorrect),
        'total_attempts': int(total),
        'avg_response_time': float(avg_response_time),
        'correctness_ratio': float(correctness_ratio),
        'error_rate': float(error_rate),
        'avg_topic_accuracy': float(avg_topic_accuracy),
        'topic_variance': topic_variance,
        'current_level': int(current_level),
        'difficulty': int(difficulty)
    }

    return features


def predict_performance(stats, model=None):
    """
    Classify a player's performance using the trained model.

    Args:
        stats: Player stats dictionary.
        model: Trained pipeline (loaded automatically if None).

    Returns:
        dict with classification, confidence, features, recommendation
    """
    if model is None:
        model = load_model()

    features = extract_features_from_stats(stats)
    feature_df = pd.DataFrame([features], columns=FEATURES)

    predicted_class = int(model.predict(feature_df)[0])
    probabilities = model.predict_proba(feature_df)[0]
    confidence = round(float(max(probabilities)) * 100, 1)

    classification = CLASS_LABELS[predicted_class]

    recommendation = generate_recommendation(classification, features, stats)

    return {
        'classification': classification,
        'class_id': predicted_class,
        'confidence': confidence,
        'label_color': classification.replace(' ', '-').lower(),
        'features': features,
        'probabilities': {
            CLASS_LABELS[0]: round(float(probabilities[0]) * 100, 1),
            CLASS_LABELS[1]: round(float(probabilities[1]) * 100, 1),
            CLASS_LABELS[2]: round(float(probabilities[2]) * 100, 1),
        },
        'recommendation': recommendation
    }


def generate_recommendation(classification, features, stats):
    """Generate personalized recommendations based on classification and features."""
    recommendations = []

    if classification == "Needs Practice":
        recommendations.append("Focus on additional practice with topics you're struggling in.")
        recommendations.append("Review basic concepts before attempting harder questions.")
        recommendations.append("Slow down and double-check your calculations.")
    elif classification == "Developing":
        recommendations.append("Good progress! Consistent practice will help you improve.")
        if features['avg_response_time'] > 15:
            recommendations.append("Try to improve your response time with more practice.")
        recommendations.append("Consider reviewing mixed-topic battles to build versatility.")
    elif classification == "Proficient":
        recommendations.append("Excellent performance! You've mastered the fundamentals.")
        recommendations.append("Take on more challenging difficulty levels.")
        recommendations.append("Try mixed-category battles for an extra challenge.")

    # Topic-specific recommendation based on weakest topic
    topic_stats = stats.get('topicStats', stats.get('topic_stats', {}))
    weakest = None
    weakest_acc = 101
    for topic in MATH_TOPICS:
        ts = topic_stats.get(topic, {})
        attempts = ts.get('attempts', 0)
        if attempts > 0:
            acc = (ts.get('correct', 0) / attempts) * 100
            if acc < weakest_acc:
                weakest_acc = acc
                weakest = topic

    if weakest and classification != "Proficient":
        recommendations.append(f"Target weak area: {weakest.replace('_', ' ').title()} (accuracy: {round(weakest_acc, 1)}%).")

    return recommendations


def load_model(path=None):
    """Load a trained model from disk."""
    model_path = path or MODEL_PATH
    if not os.path.exists(model_path):
        print(f"Model not found at {model_path}. Training a new one...")
        return train_model()
    return joblib.load(model_path)


# ----- Demo -----

def demo():
    """Run an interactive demo of the ML model with synthetic players."""
    print("=" * 60)
    print("MathMon ML Model - Demo")
    print("=" * 60)

    print("\nTraining model on synthetic data...")
    model = train_model(save=False)

    print("\n--- Testing with sample players ---\n")

    sample_players = [
        {
            'name': 'Struggling Student',
            'stats': {
                'accuracy': 35, 'correctAnswers': 15, 'incorrectAnswers': 28,
                'totalAttempts': 43, 'avgResponseTime': 22.5,
                'topicStats': {
                    'addition': {'attempts': 12, 'correct': 5},
                    'subtraction': {'attempts': 10, 'correct': 3},
                    'multiplication': {'attempts': 11, 'correct': 4},
                    'division': {'attempts': 10, 'correct': 3},
                },
                'level': 1
            }
        },
        {
            'name': 'Average Student',
            'stats': {
                'accuracy': 68, 'correctAnswers': 34, 'incorrectAnswers': 16,
                'totalAttempts': 50, 'avgResponseTime': 12.3,
                'topicStats': {
                    'addition': {'attempts': 15, 'correct': 12},
                    'subtraction': {'attempts': 12, 'correct': 8},
                    'multiplication': {'attempts': 13, 'correct': 9},
                    'division': {'attempts': 10, 'correct': 5},
                },
                'level': 3
            }
        },
        {
            'name': 'Advanced Student',
            'stats': {
                'accuracy': 88, 'correctAnswers': 44, 'incorrectAnswers': 6,
                'totalAttempts': 50, 'avgResponseTime': 7.2,
                'topicStats': {
                    'addition': {'attempts': 15, 'correct': 14},
                    'subtraction': {'attempts': 12, 'correct': 11},
                    'multiplication': {'attempts': 13, 'correct': 12},
                    'division': {'attempts': 10, 'correct': 9},
                },
                'level': 8
            }
        },
    ]

    for player in sample_players:
        result = predict_performance(player['stats'], model)
        print(f"Player: {player['name']}")
        print(f"  Classification: {result['classification']}")
        print(f"  Confidence: {result['confidence']}%")
        print(f"  Probabilities: {result['probabilities']}")
        print(f"  Recommendation: {'; '.join(result['recommendation'])}")
        print()

    # Save the model
    model = train_model(save=True, verbose=True)
    print("\nDemo complete. Model saved for use.")


# ----- CLI -----

def main():
    parser = argparse.ArgumentParser(description='MathMon ML Model - Train or Predict')
    parser.add_argument('command', choices=['train', 'predict', 'demo'],
                        help='train: train and save model | predict: classify a player | demo: run demo')
    parser.add_argument('--player-id', type=int, default=1,
                        help='Player ID for prediction (simulated)')
    parser.add_argument('--csv', type=str, default=None,
                        help='Path to custom CSV data file')
    parser.add_argument('--stats-json', type=str, default=None,
                        help='JSON string of player stats for prediction')
    args = parser.parse_args()

    if args.command == 'train':
        train_model(csv_path=args.csv)

    elif args.command == 'predict':
        stats = None
        if args.stats_json:
            stats = json.loads(args.stats_json)
        else:
            # Simulate a player based on player_id
            stats = generate_synthetic_data(n_samples=args.player_id + 1).iloc[-1].to_dict()
            stats = {
                'accuracy': stats['accuracy'],
                'correctAnswers': stats['correct_answers'],
                'incorrectAnswers': stats['incorrect_answers'],
                'totalAttempts': stats['total_attempts'],
                'avgResponseTime': stats['avg_response_time'],
                'topicStats': {},
                'level': stats['current_level']
            }

        model = load_model()
        result = predict_performance(stats, model)
        print(json.dumps(result, indent=2))

    elif args.command == 'demo':
        demo()


if __name__ == '__main__':
    main()
