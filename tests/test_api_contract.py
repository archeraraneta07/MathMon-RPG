"""Black-box tests for public Flask API validation and persistence."""

import pytest

flask = pytest.importorskip('flask')
pandas = pytest.importorskip('pandas')
pytest.importorskip('sklearn')

from python import server
from python.data_processor import PerformanceDataProcessor


def test_registration_persists_player(tmp_path, monkeypatch):
    monkeypatch.setattr(
        server,
        'processor',
        PerformanceDataProcessor(tmp_path / 'player_performance.json'),
    )
    client = server.app.test_client()

    response = client.post('/api/player', json={
        'player_id': 'black-box-player',
        'name': 'Ada',
        'gender': 'female',
    })

    assert response.status_code == 201
    assert server.processor.get_player('black-box-player')['name'] == 'Ada'


def test_attempt_endpoint_rejects_invalid_metrics():
    client = server.app.test_client()

    response = client.post('/api/attempt', json={
        'player_id': 'test-player',
        'category': 'geometry',
        'correct': True,
        'response_time': 2,
    })

    assert response.status_code == 400
    assert response.get_json()['success'] is False
