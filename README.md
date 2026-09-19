# MathMon — A Web-Based Mathematics RPG Learning Game

**MathMon** is a web-based Mathematics Role-Playing Game that combines basic mathematics practice with classic RPG battle mechanics. Inspired by Pokémon, players answer math questions to attack monsters, earn XP, level up, and receive machine learning-powered performance recommendations.

> **Game Flow:** Encounter Monster → Answer Math Question → Attack Monster → Earn XP → Level Up

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Game Mechanics](#game-mechanics)
- [Machine Learning](#machine-learning)
- [Study Objective Coverage](#study-objective-coverage)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)

---

## Features

### Core Gameplay
- **Character Selection** — Choose a male or female trainer to begin
- **Monster Battles** — Battle 8 unique MathMon across 4 math categories
- **Four Math Categories:**
  - 🔴 Addition (+ Pluspy, Sumslime)
  - 🔵 Subtraction (− Minusquid, Diffdrake)
  - 🟡 Multiplication (× Timeshell, Productrus)
  - 🟣 Division (÷ Splitling, Quotientail)
- **Progressive Difficulty** — 10 difficulty tiers scaling with your level
- **Leveling System** — Earn XP from battles to level up your trainer (max level 15)
- **Scoring & Accuracy Tracking** — Real-time score, XP, and accuracy display

### Battle Mechanics
- Answer a math question correctly to **deal damage** to the monster
- Incorrect answers cause the **monster to recover HP** and attack back
- **Hint button** provides strategies for each question type
- **Run option** allows escaping from battles (with some risk)
- Turn-based combat with visual feedback (shakes, flashes)

### Performance Tracking
- Tracks **correct/incorrect answers per topic**
- Records **response times** for every question
- Calculates **overall and per-topic accuracy**
- Session-based stats for focused performance analysis

### Machine Learning
- **Classification** into three performance tiers:
  - 🟥 **Needs Practice** — Accuracy below 50%
  - 🟨 **Developing** — Accuracy 50–79%
  - 🟩 **Proficient** — Accuracy 80%+ with balanced topic mastery
- **Personalized Recommendations** based on your weakest and strongest topics
- Uses **scikit-learn RandomForest** classifier trained on synthetic performance data
- Mirrors client-side classifier in `js/ml.js` for offline play

---

## Technology Stack

| Layer              | Technology                                      |
|--------------------|-------------------------------------------------|
| **Frontend UI**    | HTML5, CSS3 (pixel-art RPG theme), vanilla JS   |
| **Game Engine**    | Phaser 3 (bundled locally)                        |
| **Data Persistence** | localStorage (standalone) / MySQL             |
| **ML Model**       | Python, scikit-learn, Pandas, NumPy, joblib     |
| **ML Cloud**       | Microsoft Azure Machine Learning (optional)     |
| **Backend API**    | Python Flask REST API                           |
| **Database**       | MySQL 8.0 (schema with triggers, views, procs)  |
| **Question Gen**   | Python/JavaScript math question generators      |
| **Font**           | Press Start 2P (Google Fonts, pixel style)      |

---

## Project Structure

```
MathMon/
├── index.html              # Main game page and dependency entry point
├── css/
│   ├── game-shell.css      # Active Phaser canvas shell styling
│   └── style.css           # Legacy DOM-based game styling
├── js/
│   ├── bootstrap.js        # Starts the Phaser game after dependencies load
│   ├── phaser-game.js      # Active Phaser game implementation
│   ├── phaser.min.js       # Bundled Phaser runtime
│   ├── monsters.js         # Monster roster (8 MathMon)
│   ├── questions.js        # Math question generator (4 categories, 10 difficulties)
│   ├── ml.js               # Client-side ML classification (mirrors Python model)
│   └── game.js             # Legacy DOM-based game engine
├── python/
│   ├── ml_model.py         # scikit-learn RandomForest classifier
│   ├── data_processor.py   # Pandas-based performance data processing
│   ├── server.py           # Flask REST API server
│   ├── questions.py        # Python question generator (for API use)
│   ├── azure_ml_score.py   # Azure ML online endpoint scoring entry point
│   ├── deploy_azure_ml.py  # Azure ML managed endpoint deployment script
│   └── data/               # Player performance JSON store + CSV exports
├── database/
│   └── schema.sql          # Full MySQL schema with triggers, views, procedures
├── assets/
│   └── monsters.json       # Monster data (JSON)
├── docs/
│   └── TEST_PLAN.md        # White-box, black-box, and usability test plan
├── tests/
│   ├── test_data_pipeline.py # Pandas and ML feature tests
│   └── test_api_contract.py  # Flask API contract tests
├── requirements.txt        # Python and test dependencies
├── README.md               # This file
└── AGENTS.md               # Development agent guidance
```

The browser entry point is `index.html`. It loads the bundled Phaser runtime,
game data, and game logic in dependency order, then starts the game through
`js/bootstrap.js`. The lightweight `server.ps1` serves the same relative paths
with browser-correct MIME types.

---

## Quick Start

### Option 1: Play the Game Locally

The game runs entirely in the browser using `localStorage` for save data.

```bash
# Start the lightweight local server on Windows
./server.ps1
# Then open http://localhost:5000
```

The local server makes asset loading consistent by serving JavaScript, CSS,
JSON, SVG, and HTML with their correct MIME types.

### Share the Game Through a URL

For students on the same Wi-Fi or wired network, run the Flask server because
it serves both the game and the ML API:

```powershell
cd python
python server.py
```

Find the host computer's local IPv4 address with `ipconfig`, for example
`192.168.1.25`, then students open:

```text
http://192.168.1.25:5000
```

Allow Python through Windows Firewall when prompted. The host computer must
remain powered on and connected to the same network. The Flask server already
binds to `0.0.0.0`, which permits other devices to connect.

The PowerShell server is useful for frontend-only classroom testing:

```powershell
./server.ps1 -BindAddress +
```

This serves the game at `http://<HOST-COMPUTER-IP>:5000`, but server-side ML
endpoints require the Flask server.

For students outside the local network, deploy the Flask application to a
public Python host such as Azure App Service, Render, or Railway. The public
HTTPS address supplied by that host becomes the student URL. Do not expose the
development server directly to the public internet; configure HTTPS, secrets,
authentication, and a production WSGI server first.

#### Render Deployment

This repository includes `render.yaml` for a repeatable Render deployment.

1. Push the MathMon project to a GitHub repository.
2. Create an account at [Render](https://render.com) and select **New > Blueprint**.
3. Connect the GitHub repository and select `render.yaml`.
4. Create the web service and wait for the build to finish.
5. Open the generated HTTPS address, for example `https://mathmon.onrender.com`.
6. Share that address with students.

The deployment uses Gunicorn and starts `python/server.py` through the Flask
application object. Render checks `/api/health` after deployment. The free
service may sleep when unused, so the first request after inactivity can take
longer.

The game is responsive for phones and tablets. Touch users receive a native
trainer-name field and answer field with mobile numeric input; desktop users
can continue using the keyboard. Test the deployed URL in both portrait and
landscape orientations after each frontend deployment.

For a manual Render setup, use:

```text
Build command: pip install -r requirements.txt
Start command: gunicorn --chdir python --bind 0.0.0.0:$PORT server:app
Health check:  /api/health
```

### Option 2: Run with Flask Backend + ML

For the full experience with server-side scikit-learn classification:

```bash
# Install Python dependencies
pip install pandas scikit-learn numpy flask joblib

# Train the ML model (first time)
cd python
python ml_model.py train

# Start the Flask server
python server.py

# Open http://localhost:5000
```

### Option 3: With MySQL Database

```bash
# Start MySQL server
# Import the schema
mysql -u root -p < database/schema.sql

# Install MySQL connector
pip install mysql-connector-python

# Configure database connection in your Flask app (see server.py for integration)
```

---

## Game Mechanics

### XP and Leveling

| Level | XP Required | Cumulative |
|-------|-------------|------------|
| 1     | 0           | 0          |
| 2     | 100         | 100        |
| 3     | 250         | 350        |
| 4     | 450         | 800        |
| 5     | 700         | 1,500      |
| 6     | 1,000       | 2,500      |
| 7     | 1,400       | 3,900      |
| 8     | 1,900       | 5,800      |
| 9     | 2,500       | 8,300      |
| 10    | 3,200       | 11,500     |
| ...   | ...         | ...        |
| 15    | 8,500       | 40,000     |

### Battle Rewards

- **Victory:** 50 XP + 30 score (scaled by level)
- **Defeat:** 20 XP (participation) + 5 score
- **Level Up:** +10 bonus XP

### Question Difficulty

| Difficulty | Operand Range | Operands | Example                      |
|------------|---------------|----------|------------------------------|
| 1          | 2–10          | 2        | 7 + 3 = ?                    |
| 5          | 12–30         | 3        | 15 + 22 + 13 = ?             |
| 10         | 35–80         | 4        | 52 × 38 × 21 × 15 = ?        |

---

## Machine Learning

### Classification Logic

The ML model classifies player performance into three tiers using features:
`accuracy`, `correct_answers`, `incorrect_answers`, `total_attempts`,
`avg_response_time`, `correctness_ratio`, `error_rate`,
`avg_topic_accuracy`, `topic_variance`, `current_level`, `difficulty`

| Classification     | Criteria                                                   |
|--------------------|------------------------------------------------------------|
| Needs Practice     | accuracy < 50% OR insufficient data (< 5 attempts)        |
| Developing         | 50% ≤ accuracy < 80%                                       |
| Proficient         | accuracy ≥ 80% AND avg_topic_accuracy ≥ 75% AND error_rate ≤ 25% |

### Training the Model

```bash
cd python
python ml_model.py train       # Train on synthetic data
python ml_model.py demo         # Run interactive demo
python ml_model.py predict --player-id 1  # Classify a player
```

### Azure Machine Learning Integration

The trained model can be deployed to an Azure ML managed online endpoint. The
deployment is optional and requires an Azure subscription, workspace, and
authenticated CLI session:

```python
pip install azure-ai-ml azure-identity
cd python
python ml_model.py train
az login
$env:AZURE_SUBSCRIPTION_ID = "<subscription-id>"
$env:AZURE_RESOURCE_GROUP = "<resource-group>"
$env:AZURE_ML_WORKSPACE = "<workspace-name>"
$env:AZURE_ML_ENDPOINT = "mathmon-classifier"
python deploy_azure_ml.py
```

The script publishes `mathmon_model.joblib` with the same feature contract as
the Flask service. Azure resources and credentials are intentionally supplied
by the deployment environment rather than stored in the repository.

## Study Objective Coverage

| Objective | Implementation status | Evidence |
|-----------|----------------------|----------|
| Web-based mathematics RPG | Implemented | Phaser scenes, trainer selection, world exploration, battles, scoring, XP, and levels in `js/phaser-game.js` |
| ML performance classification | Implemented | Pandas feature preparation and scikit-learn Random Forest in `python/data_processor.py` and `python/ml_model.py` |
| Four operations and leveled questions | Implemented | JavaScript and Python generators support addition, subtraction, multiplication, and division across ten difficulty levels |
| MySQL data model | Implemented at schema level; optional runtime integration | `database/schema.sql` defines players, sessions, battles, attempts, summaries, and ML classifications; the default lightweight runtime uses JSON storage |
| Personalized recommendations | Implemented | Classification-specific and weakest-topic recommendations in `python/ml_model.py` and `js/ml.js` |
| Azure ML deployment | Deployment-ready | `python/azure_ml_score.py` and `python/deploy_azure_ml.py`; requires the researcher's Azure subscription and credentials |
| System testing | Automated foundation implemented | `tests/test_data_pipeline.py` provides white-box feature tests and `tests/test_api_contract.py` provides black-box API tests; usability testing remains a scheduled human evaluation activity |

Run the automated tests after installing the Python dependencies:

```bash
pip install -r requirements.txt
pytest -q
```

---

## Database Schema

### Tables

| Table                  | Description                                    |
|------------------------|------------------------------------------------|
| `players`              | Player profiles, XP, level, score, accuracy    |
| `player_sessions`      | Login/session tracking                        |
| `monster_roster`       | All game monsters and their stats             |
| `battles`              | Battle encounter records                      |
| `question_bank`        | Pre-generated math questions                  |
| `attempts`             | Individual question attempt logs              |
| `ml_classifications`   | ML predictions and recommendations            |
| `performance_summary`  | Cached per-topic performance aggregates       |
| `levels`               | XP thresholds per level                       |

### Views & Procedures

- `player_leaderboard` — Top 100 players by score
- `topic_performance` — Cross-player per-topic analytics
- `recent_battles` — Last 50 battles
- `GetPlayerDashboard(p_player_id)` — Comprehensive per-player dashboard
- `RecordBattleAndAttempts(...)` — Atomic battle recording

### Triggers

- `update_player_accuracy` — Auto-updates player accuracy on each attempt
- `update_performance_summary_on_attempt` — Updates cached topic stats

---

## API Reference

### Player Management

| Method | Endpoint                  | Description              |
|--------|---------------------------|--------------------------|
| POST   | `/api/player`             | Register a new player    |
| GET    | `/api/player/<id>`        | Get player profile       |
| PUT    | `/api/player/<id>`        | Update player profile    |

### Battle System

| Method | Endpoint                       | Description                    |
|--------|----------------------------------|--------------------------------|
| POST   | `/api/battle`                    | Start a battle + get question  |
| POST   | `/api/battle/<id>/result`        | Submit battle results          |

### Attempts

| Method | Endpoint          | Description                       |
|--------|-------------------|-----------------------------------|
| POST   | `/api/attempt`    | Record a question attempt         |

### Performance & Stats

| Method | Endpoint                          | Description                        |
|--------|-----------------------------------|------------------------------------|
| GET    | `/api/player/<id>/stats`          | Get aggregated player stats        |
| GET    | `/api/player/<id>/performance`    | Get performance summary            |

### Machine Learning

| Method | Endpoint                              | Description                        |
|--------|---------------------------------------|------------------------------------|
| POST   | `/api/ml/classify`                    | Classify player performance        |
| GET    | `/api/ml/recommendations/<id>`        | Get ML recommendations             |
| POST   | `/api/ml/train`                       | Train/retrain the ML model         |
| GET    | `/api/ml/demo`                        | Run demo on synthetic players      |

### Content

| Method | Endpoint              | Description                |
|--------|-----------------------|----------------------------|
| GET    | `/api/monsters`       | Get monster roster         |
| GET, POST | `/api/questions`    | Generate math questions    |
| POST   | `/api/export/<id>`    | Export player CSV          |
| GET    | `/api/health`         | Server health check        |

---

## How to Play

1. **Start Adventure** on the landing page
2. **Choose your trainer** (Boy or Girl)
3. **Enter the grass** to encounter wild MathMon
4. **Answer math questions** correctly to attack
5. **Earn XP** for correct answers and defeating monsters
6. **Level up** when XP threshold is reached
7. **Check stats** to see your ML-powered performance assessment
8. **Read recommendations** to find weak topics and improve

---

## License

This project was created as a student project proposal for IT 122/122L SAD (SAD01). Built with HTML, CSS, JavaScript, Python, Pandas, scikit-learn, and MySQL.
