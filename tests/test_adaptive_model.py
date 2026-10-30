"""Tests for the global adaptive-difficulty trainer (python/adaptive_model.py)."""

import json
import re
from pathlib import Path

from python.adaptive_model import FEATURES, PRIOR, generate_synthetic_attempts, save_weights, train

ROOT = Path(__file__).resolve().parents[1]


def test_feature_names_match_browser_and_api():
    """The browser model, the API and the trainer must agree on the feature order."""
    js = (ROOT / 'js' / 'adaptive-ml.js').read_text(encoding='utf-8')
    api = (ROOT / 'api' / 'src' / 'functions' / 'ml.js').read_text(encoding='utf-8')
    for source in (js, api):
        block = re.search(r'FEATURE_NAMES = \[(.*?)\];', source, re.S).group(1)
        assert re.findall(r"'(\w+)'", block) == FEATURES
    assert len(PRIOR) == len(FEATURES)


def test_training_recovers_a_useful_model(tmp_path):
    doc = train(generate_synthetic_attempts(2000), verbose=False)
    assert doc['features'] == FEATURES
    assert len(doc['weights']) == len(FEATURES)
    assert doc['metrics']['accuracy'] > 0.6
    # harder questions must lower the odds, good recent form must raise them
    assert doc['weights'][FEATURES.index('difficulty')] < 0
    assert doc['weights'][FEATURES.index('recent_accuracy')] > 0
    out = save_weights(doc, tmp_path / 'weights.json')
    assert json.loads(Path(out).read_text())['weights'] == doc['weights']
