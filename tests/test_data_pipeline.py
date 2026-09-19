"""White-box tests for the MathMon performance data pipeline."""

import json

from python.data_processor import PerformanceDataProcessor
from python.ml_model import FEATURES


def test_attempts_are_aggregated_into_ml_features(tmp_path):
    processor = PerformanceDataProcessor(tmp_path / 'player_performance.json')
    processor.register_player('test-player', name='Test Player', gender='male')
    processor.record_attempt('test-player', 'addition', True, 4.5, difficulty=2)
    processor.record_attempt('test-player', 'addition', False, 6.0, difficulty=2)
    processor.record_attempt('test-player', 'division', True, 8.0, difficulty=3)

    stats = processor.get_player_stats('test-player')
    features = processor.prepare_ml_features(stats)

    assert stats['totalAttempts'] == 3
    assert stats['correctAnswers'] == 2
    assert stats['topicStats']['addition']['accuracy'] == 50.0
    assert list(features.columns) == FEATURES
    assert features.iloc[0]['total_attempts'] == 3
    assert features.iloc[0]['error_rate'] == round(1 / 3, 4)
