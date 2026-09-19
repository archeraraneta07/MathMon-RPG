"""Azure Machine Learning online endpoint entry point for MathMon."""

import json
import os

import joblib
import pandas as pd

from ml_model import FEATURES, extract_features_from_stats


MODEL = None


def init():
    """Load the packaged Random Forest model when the endpoint starts."""
    global MODEL
    model_path = os.path.join(os.getenv('AZUREML_MODEL_DIR', '.'), 'mathmon_model.joblib')
    MODEL = joblib.load(model_path)


def run(raw_data):
    """Classify one player stats payload received by the Azure endpoint."""
    payload = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
    stats = payload.get('stats', payload)
    features = extract_features_from_stats(stats)
    feature_frame = pd.DataFrame([features], columns=FEATURES)
    predicted_class = int(MODEL.predict(feature_frame)[0])
    probabilities = MODEL.predict_proba(feature_frame)[0]

    labels = {0: 'Needs Practice', 1: 'Developing', 2: 'Proficient'}
    return {
        'classification': labels[predicted_class],
        'class_id': predicted_class,
        'confidence': round(float(max(probabilities)) * 100, 1),
        'features': features,
    }
