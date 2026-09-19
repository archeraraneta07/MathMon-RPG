"""
MathMon Data Processor - pandas-based Performance Analytics
============================================================

This module handles all player performance data collection, cleaning,
aggregation, and preparation for the ML pipeline.

It bridges the web frontend (which sends raw performance events) and the
ML model (which expects a clean feature vector).

Dependencies:
    - pandas
    - numpy

Usage:
    from data_processor import PerformanceDataProcessor

    processor = PerformanceDataProcessor()
    processor.record_attempt(player_id=1, category='addition', correct=True, response_time=5.2)
    stats = processor.get_player_stats(player_id=1)
    features = processor.prepare_ml_features(stats)
"""

import json
import os
from datetime import datetime

import numpy as np
import pandas as pd

MATH_TOPICS = ['addition', 'subtraction', 'multiplication', 'division']
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'python', 'data')
PLAYER_DATA_PATH = os.path.join(DATA_DIR, 'player_performance.json')

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

XP_PER_LEVEL = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200,
                4000, 4900, 6000, 7200, 8500, 10000]


def get_difficulty_for_level(level):
    """Map player level to difficulty tier (1-10)."""
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


class PerformanceDataProcessor:
    """
    Collects, stores, and processes player attempt data for the ML pipeline.

    Data is persisted to a JSON file (player_performance.json) that acts as a
    lightweight store before syncing to MySQL.
    """

    def __init__(self, data_file=None):
        self.data_file = data_file or PLAYER_DATA_PATH
        os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
        self._ensure_data_file()

    def _ensure_data_file(self):
        """Create the data file with an empty structure if it doesn't exist."""
        if not os.path.exists(self.data_file):
            with open(self.data_file, 'w') as f:
                json.dump({"players": {}, "attempts": []}, f, indent=2)

    def _load_data(self):
        """Load raw data from the JSON store."""
        try:
            with open(self.data_file, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {"players": {}, "attempts": []}

    def _save_data(self, data):
        """Persist data to the JSON store."""
        with open(self.data_file, 'w') as f:
            json.dump(data, f, indent=2)

    def record_attempt(self, player_id, category, correct, response_time,
                       difficulty=None, answer_given=None, correct_answer=None,
                       battle_id=None, level=None):
        """
        Record a single question attempt.

        Args:
            player_id: Unique player identifier.
            category: Math topic (addition/subtraction/multiplication/division).
            correct: Whether the answer was correct.
            response_time: Time in seconds to answer.
            difficulty: Difficulty tier (1-10).
            answer_given: Player's answer.
            correct_answer: The correct answer.
            battle_id: ID of the current battle.
            level: Player's level at time of attempt.
        """
        data = self._load_data()

        attempt = {
            'player_id': str(player_id),
            'timestamp': datetime.utcnow().isoformat(),
            'category': category,
            'correct': bool(correct),
            'response_time': float(response_time),
            'difficulty': difficulty or 1,
            'answer_given': answer_given,
            'correct_answer': correct_answer,
            'battle_id': battle_id,
            'level': level or 1
        }

        data['attempts'].append(attempt)

        # Initialize player record if new
        if str(player_id) not in data['players']:
            data['players'][str(player_id)] = {
                'player_id': str(player_id),
                'name': f'Player_{player_id}',
                'created_at': datetime.utcnow().isoformat(),
                'level': 1,
                'xp': 0,
                'score': 0,
                'total_battles': 0,
                'battles_won': 0
            }

        self._save_data(data)
        return attempt
    def register_player(self, player_id, name=None, gender=None):
        """Create or update a player record in the store (idempotent)."""
        data = self._load_data()
        key = str(player_id)

        player = data['players'].get(key)
        if player is None:
            player = {
                'player_id': key,
                'name': name or f'Player_{player_id}',
                'gender': gender or 'male',
                'created_at': datetime.utcnow().isoformat(),
                'level': 1,
                'xp': 0,
                'score': 0,
                'total_battles': 0,
                'battles_won': 0
            }
            data['players'][key] = player
        else:
            if name:
                player['name'] = name
            if gender:
                player['gender'] = gender
        self._save_data(data)
        return player
    def get_player(self, player_id):
        """Retrieve a stored player record, or None if not registered."""
        data = self._load_data()
        return data['players'].get(str(player_id))

    def record_battle(self, player_id, won, xp_earned, score_earned, opponent_name, category):
        """Record a completed battle."""
        data = self._load_data()

        if str(player_id) in data['players']:
            player = data['players'][str(player_id)]
            player['total_battles'] += 1
            if won:
                player['battles_won'] += 1
            player['xp'] = player.get('xp', 0) + xp_earned
            player['score'] = player.get('score', 0) + score_earned
            # Check level up
            while player['xp'] >= XP_PER_LEVEL[min(player['level'], len(XP_PER_LEVEL) - 1)]:
                player['level'] += 1
        self._save_data(data)

    def get_player_attempts(self, player_id):
        """Retrieve all attempt records for a player."""
        data = self._load_data()
        return [a for a in data['attempts'] if a['player_id'] == str(player_id)]

    def get_player_attempts_df(self, player_id):
        """Retrieve player attempts as a pandas DataFrame."""
        attempts = self.get_player_attempts(player_id)
        if not attempts:
            return pd.DataFrame()
        return pd.DataFrame(attempts)

    def get_player_stats(self, player_id):
        """
        Compute aggregated performance statistics for a player.

        Returns a dict with overall stats and per-topic breakdowns.
        """
        df = self.get_player_attempts_df(player_id)

        if df.empty:
            return self._empty_stats(player_id)

        # Clean data
        df = self._clean_attempts(df)

        total_attempts = len(df)
        correct = df['correct'].sum()
        incorrect = total_attempts - correct
        accuracy = round((correct / total_attempts) * 100, 2) if total_attempts > 0 else 0
        avg_response_time = round(df['response_time'].mean(), 2) if total_attempts > 0 else 0

        # Per-topic stats
        topic_stats = {}
        for topic in MATH_TOPICS:
            topic_df = df[df['category'] == topic]
            if not topic_df.empty:
                t_correct = topic_df['correct'].sum()
                t_total = len(topic_df)
                topic_stats[topic] = {
                    'attempts': int(t_total),
                    'correct': int(t_correct),
                    'incorrect': int(t_total - t_correct),
                    'accuracy': round((t_correct / t_total) * 100, 2),
                    'avg_response_time': round(topic_df['response_time'].mean(), 2),
                    'total_time': round(topic_df['response_time'].sum(), 2)
                }
            else:
                topic_stats[topic] = {
                    'attempts': 0, 'correct': 0, 'incorrect': 0,
                    'accuracy': 0, 'avg_response_time': 0, 'total_time': 0
                }

        # Topic-level metrics for ML
        topic_accuracies = [ts['accuracy'] for ts in topic_stats.values()]
        avg_topic_accuracy = round(np.mean(topic_accuracies), 2)
        topic_variance = round(float(np.var(topic_accuracies) / 10000), 4) if len(topic_accuracies) > 1 else 0

        # Current player level
        data = self._load_data()
        player = data['players'].get(str(player_id), {})
        level = player.get('level', 1)

        return {
            'player_id': str(player_id),
            'name': player.get('name', f'Player_{player_id}'),
            'level': level,
            'correctAnswers': int(correct),
            'incorrectAnswers': int(incorrect),
            'totalAttempts': int(total_attempts),
            'accuracy': accuracy,
            'avgResponseTime': avg_response_time,
            'totalResponseTime': round(df['response_time'].sum(), 2),
            'topicStats': topic_stats,
            'avg_topic_accuracy': avg_topic_accuracy,
            'topic_variance': topic_variance,
            'correctness_ratio': round(correct / total_attempts, 4) if total_attempts > 0 else 0,
            'error_rate': round(incorrect / total_attempts, 4) if total_attempts > 0 else 0,
            'difficulty': get_difficulty_for_level(level),
            'battles_won': player.get('battles_won', 0),
            'total_battles': player.get('total_battles', 0),
            'score': player.get('score', 0),
            'xp': player.get('xp', 0)
        }

    def _empty_stats(self, player_id):
        """Return empty stats structure for a new player."""
        topic_stats = {}
        for topic in MATH_TOPICS:
            topic_stats[topic] = {
                'attempts': 0, 'correct': 0, 'incorrect': 0,
                'accuracy': 0, 'avg_response_time': 0, 'total_time': 0
            }

        return {
            'player_id': str(player_id),
            'name': f'Player_{player_id}',
            'level': 1,
            'correctAnswers': 0,
            'incorrectAnswers': 0,
            'totalAttempts': 0,
            'accuracy': 100,
            'avgResponseTime': 0,
            'totalResponseTime': 0,
            'topicStats': topic_stats,
            'avg_topic_accuracy': 0,
            'topic_variance': 0,
            'correctness_ratio': 0,
            'error_rate': 0,
            'difficulty': 1,
            'battles_won': 0,
            'total_battles': 0,
            'score': 0,
            'xp': 0
        }

    def _clean_attempts(self, df):
        """Apply data cleaning rules to attempt data."""
        # Remove attempts with missing values
        df = df.dropna(subset=['category', 'correct', 'response_time'])

        # Ensure correct types
        df['correct'] = df['correct'].astype(bool)
        df['response_time'] = pd.to_numeric(df['response_time'], errors='coerce')
        df = df.dropna(subset=['response_time'])

        # Remove negative response times
        df = df[df['response_time'] >= 0]

        # Cap absurd response times (> 120s)
        df = df[df['response_time'] <= 120]

        # Normalize category names
        df['category'] = df['category'].str.lower().str.strip()

        return df

    def prepare_ml_features(self, stats):
        """
        Prepare the feature vector for the ML model.

        This converts the stats dict into the exact column order the model expects.
        """
        from ml_model import FEATURES, get_difficulty_for_level

        features = {
            'accuracy': float(stats.get('accuracy', 0) or 0),
            'correct_answers': int(stats.get('correctAnswers', stats.get('correct_answers', 0))),
            'incorrect_answers': int(stats.get('incorrectAnswers', stats.get('incorrect_answers', 0))),
            'total_attempts': int(stats.get('totalAttempts', stats.get('total_attempts', 0))),
            'avg_response_time': float(stats.get('avgResponseTime', stats.get('avg_response_time', 0)) or 0),
            'correctness_ratio': float(stats.get('correctness_ratio',
                stats.get('correctAnswers', 0) / max(1, stats.get('totalAttempts', 1)))),
            'error_rate': float(stats.get('error_rate',
                stats.get('incorrectAnswers', 0) / max(1, stats.get('totalAttempts', 1)))),
            'avg_topic_accuracy': float(stats.get('avg_topic_accuracy', 0) or 0),
            'topic_variance': float(stats.get('topic_variance', 0) or 0),
            'current_level': int(stats.get('level', stats.get('current_level', 1))),
            'difficulty': int(stats.get('difficulty', get_difficulty_for_level(
                stats.get('level', stats.get('current_level', 1)))))
        }

        return pd.DataFrame([features], columns=FEATURES)

    def export_to_dataframe(self, player_id=None):
        """Export attempt data to a pandas DataFrame, optionally filtered by player."""
        data = self._load_data()
        attempts = data['attempts']

        if player_id is not None:
            attempts = [a for a in attempts if a['player_id'] == str(player_id)]

        if not attempts:
            return pd.DataFrame()

        df = pd.DataFrame(attempts)
        df = self._clean_attempts(df)
        return df

    def export_csv(self, player_id=None, filepath=None):
        """Export attempt data to CSV."""
        df = self.export_to_dataframe(player_id)

        if df.empty:
            print("No data to export.")
            return

        if filepath is None:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            if player_id is not None:
                filepath = os.path.join(DATA_DIR, f'player_{player_id}_{timestamp}.csv')
            else:
                filepath = os.path.join(DATA_DIR, f'all_players_{timestamp}.csv')

        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        df.to_csv(filepath, index=False)
        print(f"Exported {len(df)} records to {filepath}")
        return filepath

    def get_weak_topics(self, player_id, threshold=60):
        """Identify topics where the player's accuracy is below threshold."""
        stats = self.get_player_stats(player_id)
        weak = []
        for topic in MATH_TOPICS:
            ts = stats['topicStats'].get(topic, {})
            if ts.get('attempts', 0) > 0 and ts['accuracy'] < threshold:
                weak.append({
                    'topic': topic,
                    'accuracy': ts['accuracy'],
                    'attempts': ts['attempts']
                })
        return weak

    def get_performance_summary(self, player_id):
        """Return a human-readable performance summary for recommendations."""
        stats = self.get_player_stats(player_id)

        summary = {
            'overall_accuracy': stats['accuracy'],
            'total_attempts': stats['totalAttempts'],
            'total_correct': stats['correctAnswers'],
            'total_incorrect': stats['incorrectAnswers'],
            'avg_response_time': stats['avgResponseTime'],
            'weak_topics': self.get_weak_topics(player_id),
            'strongest_topic': max(MATH_TOPICS,
                                   key=lambda t: stats['topicStats'].get(t, {}).get('accuracy', 0)),
        }

        return summary


def main():
    """CLI entry point for data processing."""
    import argparse

    parser = argparse.ArgumentParser(description='MathMon Data Processor')
    parser.add_argument('--player-id', type=int, default=1, help='Player ID')
    parser.add_argument('--export', action='store_true', help='Export data to CSV')
    parser.add_argument('--summary', action='store_true', help='Print performance summary')
    args = parser.parse_args()

    processor = PerformanceDataProcessor()

    if args.summary:
        summary = processor.get_performance_summary(args.player_id)
        print(json.dumps(summary, indent=2))
    elif args.export:
        processor.export_csv(args.player_id)
    else:
        stats = processor.get_player_stats(args.player_id)
        print(json.dumps(stats, indent=2))


if __name__ == '__main__':
    main()
