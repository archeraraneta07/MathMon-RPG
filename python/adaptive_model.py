"""
MathMon adaptive-difficulty model — global trainer
==================================================

The browser model (js/adaptive-ml.js) is a logistic regression that predicts
P(correct) for a question from 10 features. Each player's copy learns from
their own answers; this script trains ONE model on every player's answers
(exported from Cosmos DB through GET /api/ml/training-data) so new players
start from a well-calibrated model instead of the hand-set prior.

Pipeline:
    attempts (Cosmos DB) -> CSV -> train (scikit-learn, locally or as an Azure ML
    job: azure_ml_train_job.py) -> adaptive_weights.json -> PUT /api/ml/model
    -> browsers fetch it from GET /api/ml/model

Usage:
    python adaptive_model.py demo
    python adaptive_model.py train --csv attempts.csv --out data/adaptive_weights.json
    python adaptive_model.py fetch --api https://<app>.azurestaticapps.net --out attempts.csv
    python adaptive_model.py publish --weights data/adaptive_weights.json --api https://<app>.azurestaticapps.net

The admin key for fetch / publish is read from the ML_ADMIN_KEY environment variable.
"""

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss
from sklearn.model_selection import train_test_split

# Must match FEATURE_NAMES in js/adaptive-ml.js (and api/src/functions/ml.js).
FEATURES = ['bias', 'op_subtraction', 'op_multiplication', 'op_division', 'difficulty',
            'recent_accuracy', 'op_accuracy', 'response_time', 'streak', 'damage_taken']
PRIOR = [1.4, -0.1, -0.35, -0.5, -1.3, 1.6, 1.2, -0.9, 0.35, -0.4]
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), 'data', 'adaptive_weights.json')


def generate_synthetic_attempts(n_samples=3000, random_state=7):
    """Create attempts shaped like the browser's feature vectors, labelled by a known model."""
    rng = np.random.default_rng(random_state)
    ops = rng.integers(0, 4, n_samples)
    rows = np.zeros((n_samples, len(FEATURES)))
    rows[:, 0] = 1
    for i, op in enumerate(ops):
        if op > 0:
            rows[i, op] = 1
    rows[:, 4] = rng.choice([0, 0.5, 1], n_samples) + rng.choice([-0.4, -0.2, 0, 0.25, 0.5], n_samples)
    rows[:, 5] = rng.uniform(-0.4, 0.45, n_samples)
    rows[:, 6] = np.clip(rows[:, 5] + rng.normal(0, 0.12, n_samples), -0.5, 0.5)
    rows[:, 7] = rng.uniform(-0.6, 1.8, n_samples)
    rows[:, 8] = rng.integers(0, 6, n_samples) / 5
    rows[:, 9] = rng.uniform(0, 1, n_samples)
    true_w = np.array([1.2, -0.2, -0.5, -0.7, -1.6, 1.8, 1.3, -0.8, 0.3, -0.5])
    p = 1 / (1 + np.exp(-(rows @ true_w)))
    df = pd.DataFrame(rows, columns=FEATURES)
    df['correct'] = (rng.uniform(size=n_samples) < p).astype(int)
    return df


def load_attempts(csv_path):
    """Load a training CSV (columns = FEATURES + 'correct')."""
    df = pd.read_csv(csv_path)
    missing = [c for c in FEATURES + ['correct'] if c not in df.columns]
    if missing:
        raise ValueError(f'CSV is missing columns: {missing}')
    return df[FEATURES + ['correct']].dropna()


def train(df, verbose=True):
    """Fit the logistic regression; returns the weights document served by GET /api/ml/model."""
    if len(df) < 50 or df['correct'].nunique() < 2:
        raise ValueError('Need at least 50 attempts with both correct and wrong answers to train.')
    X = df[FEATURES[1:]].to_numpy()        # 'bias' becomes the intercept
    y = df['correct'].to_numpy()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    model = LogisticRegression(C=1.0, max_iter=1000)
    model.fit(X_train, y_train)
    proba = model.predict_proba(X_test)[:, 1]
    metrics = {
        'accuracy': round(float(accuracy_score(y_test, proba >= 0.5)), 4),
        'log_loss': round(float(log_loss(y_test, proba)), 4),
        'test_samples': int(len(y_test)),
    }
    weights = [float(model.intercept_[0])] + [float(w) for w in model.coef_[0]]
    if verbose:
        print(f'Trained on {len(y_train)} attempts: accuracy {metrics["accuracy"]:.1%}, log loss {metrics["log_loss"]}')
        for name, w in zip(FEATURES, weights):
            print(f'  {name:<18} {w:+.3f}')
    return {
        'features': FEATURES,
        'weights': [round(w, 5) for w in weights],
        'samples': int(len(df)),
        'metrics': metrics,
        'trainedAt': datetime.now(timezone.utc).isoformat(),
    }


def save_weights(doc, out_path=DEFAULT_OUT):
    """Write the weights JSON (also served by the Flask server at /api/ml/model)."""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, indent=2)
    return out_path


def _admin_request(url, method='GET', body=None):
    key = os.getenv('ML_ADMIN_KEY')
    if not key:
        raise RuntimeError('Set ML_ADMIN_KEY to the value configured on the API.')
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'x-admin-key': key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')


def fetch_training_data(api_base, out_csv):
    """Download attempts with feature vectors from GET /api/ml/training-data."""
    csv = _admin_request(f'{api_base.rstrip("/")}/api/ml/training-data')
    with open(out_csv, 'w', encoding='utf-8') as f:
        f.write(csv)
    return out_csv


def publish(doc, api_base):
    """Upload trained weights to PUT /api/ml/model so every browser can use them."""
    return _admin_request(f'{api_base.rstrip("/")}/api/ml/model', method='PUT', body=doc)


def main():
    parser = argparse.ArgumentParser(description='Train the MathMon adaptive-difficulty model')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('demo', help='train on synthetic attempts and print the weights')
    p_train = sub.add_parser('train', help='train from a CSV of attempts')
    p_train.add_argument('--csv', required=True)
    p_train.add_argument('--out', default=DEFAULT_OUT)
    p_train.add_argument('--publish', metavar='API_BASE', help='also PUT the weights to this API')
    p_fetch = sub.add_parser('fetch', help='download training data from the API')
    p_fetch.add_argument('--api', required=True)
    p_fetch.add_argument('--out', default='attempts.csv')
    p_pub = sub.add_parser('publish', help='upload an existing weights JSON')
    p_pub.add_argument('--weights', default=DEFAULT_OUT)
    p_pub.add_argument('--api', required=True)
    args = parser.parse_args()

    if args.command == 'demo':
        doc = train(generate_synthetic_attempts())
        print(f'Saved {save_weights(doc)}')
    elif args.command == 'train':
        doc = train(load_attempts(args.csv))
        print(f'Saved {save_weights(doc, args.out)}')
        if args.publish:
            print(publish(doc, args.publish))
    elif args.command == 'fetch':
        print(f'Saved {fetch_training_data(args.api, args.out)}')
    elif args.command == 'publish':
        with open(args.weights, encoding='utf-8') as f:
            print(publish(json.load(f), args.api))
    return 0


if __name__ == '__main__':
    sys.exit(main())
