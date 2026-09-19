# MathMon Test Plan

## Scope

This plan covers the gameplay flow, performance data pipeline, API contract, database integration boundary, and machine-learning classification behavior before proposal defense.

## White-box Tests

| Area | Test | Expected result |
|------|------|-----------------|
| Data processing | Record correct and incorrect attempts for multiple topics | Pandas aggregates totals, accuracy, response time, and topic statistics correctly |
| ML feature contract | Convert stats into a feature frame | Feature names and order match `FEATURES` in `python/ml_model.py` |
| Data cleaning | Submit missing, negative, or excessive response times | Invalid records are removed or rejected before analysis |
| Classification | Train and predict with representative performance profiles | Output is one of `Needs Practice`, `Developing`, or `Proficient` |
| Recommendations | Classify a player with a weak topic | Recommendation identifies targeted practice or advanced challenge |

Automated white-box coverage is in `tests/test_data_pipeline.py`.

## Black-box Tests

| Area | Action | Expected result |
|------|--------|-----------------|
| Registration | POST `/api/player` with a valid profile | Returns `201` and persists the player |
| Attempt recording | POST `/api/attempt` with valid metrics | Returns `201` and stores the attempt |
| Validation | POST invalid category, difficulty, or response time | Returns `400` with a clear error message |
| Classification | POST `/api/ml/classify` with a player ID | Returns classification, confidence, features, and recommendations |
| Health | GET `/api/health` | Reports service and model status |
| Content | GET `/api/questions` and `/api/monsters` | Returns valid game content |

Automated black-box coverage is in `tests/test_api_contract.py`.

## Usability Evaluation

Conduct a supervised play session with elementary-learner representatives or the intended evaluator. Record:

- Whether the player can select a trainer and start a battle without assistance.
- Whether question text, answer input, feedback, and rewards are understandable.
- Whether the difficulty and pacing are appropriate for the learner.
- Whether recommendations are clear and actionable.
- Any navigation, accessibility, or readability problems.

Use a short five-point questionnaire after the session and record issues with severity, reproduction steps, and screenshots. Usability testing requires human participants and cannot be fully automated by the repository.

## Execution

```bash
pip install -r requirements.txt
pytest -q
```

For a full environment test, start `python/server.py`, open the game through the Flask URL, complete a battle, and confirm that `/api/player/<id>/stats` includes the recorded attempts.
