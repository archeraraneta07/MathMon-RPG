# AGENTS.md — MathMon Development Guide

## Project Overview

MathMon is a web-based Mathematics RPG learning game that combines math practice with Pokémon-style monster battles. The project includes a client-side web game plus a Python ML backend with optional Flask API and MySQL database.

## Working Directory

```
C:\Users\User\Documents\MathMon
```

## Linting, Typecheck, and Test Commands

```bash
# Verify the HTML structure
# Open index.html in a browser and check the game loads

# Python syntax check (no linting config set up yet — validate manually)
python -m py_compile python/ml_model.py
python -m py_compile python/data_processor.py
python -m py_compile python/server.py

# Python lint (if ruff or flake8 available)
ruff check python/      # or: flake8 python/

# Run the ML demo
cd python && python ml_model.py demo

# Run the Flask server
cd python && python server.py
# Then visit http://localhost:5000

# JavaScript validation — open browser console on index.html
# Battle keys: 1-4 choose move, then type digits + Enter; L battle log, M sound
# Overworld 3D camera: drag / Z X orbit, wheel / pinch zoom, C reset
# 3D (battles + overworld) needs http(s): run server.ps1; file:// falls back to 2D
# Run automated Python coverage with: pytest -q
```

## Game Architecture

### Architecture Overview

```
index.html  (entry point)
├── css/game-shell.css      → active Phaser canvas shell styling
├── css/battle-hud.css      → battle HUD tokens (.mm-hud), CSS 3D panels, animations
├── css/style.css           → legacy DOM game styling
├── js/monsters.js          → 8 monster definitions
├── js/questions.js         → math question generator (4 categories × 10 difficulties)
├── js/ml.js                → client-side ML classifier (mirrors Python model)
├── js/battle-config.js     → MathMonBattleConfig: all battle tuning (gate, answers, hint, MP, damage, elements, monsters, stage3d)
├── js/battle-rules.js      → MathMonBattleRules: pure damage/effectiveness/MP/status functions
├── js/question-bank.js     → MATHMON_QUESTION_BANK: optional curated numeric questions ({ question, tier, hint })
├── js/question-deck.js     → MathMonQuestionDeck: tiered question generator (config.questionTiers)
├── js/battle-hud.js        → MathMonBattleHud: DOM overlay synced to the canvas rect (typed answer form)
├── js/battle-stage-2d.js   → MathMonStage2D: Phaser battle stage (fallback)
├── js/battle-vfx.js        → MathMonBattleVfx: 2D element VFX, popups, arena (Canvas-renderer safe)
├── js/battle-3d/*.js       → ES modules: 3D battle stage (stage3d, environments, monsters, vfx, core)
├── js/audio/*.js           → MathMonAudio (manager), MathMonSynth (generated SFX + music), manifest, MathMonAudioUI
├── audio/                  → optional audio files (see audio/README.md for names and sources)
├── js/title-screen.js      → MathMonTitleScreen: DOM logo + Continue / New Game / Audio menu
├── js/title-3d/title3d.js  → ES module: 3D boss line-up behind the title
├── js/world/world-data.js  → MathMonWorldData: overworld map data, collision, render3d settings
├── js/world-3d/*.js        → ES modules: 3D overworld (overworld3d, terrain, world-assets)
├── js/vendor/three/        → Three.js r160 + add-ons (import map in index.html)
├── js/phaser-game.js        → active Phaser game engine (ElementSelectScene, OverworldScene logic, BattleScene turn loop)
└── js/bootstrap.js          → starts the game after scripts load

The game uses Phaser's Canvas renderer: `setTint` and gradient fills do nothing,
so VFX use colored shapes. In Phaser 3.60, `onYoyo`/`onRepeat` fire once per
tweened property, so guard any callback that applies game state.
The player's element is stored as `stats.element` (it travels with every scene and save).

Layering: the Phaser canvas is transparent (z 1). The 3D overworld canvas
(`.mm-world3d`, z 0) sits under it so Phaser HUD/fades draw on top; the 3D battle
canvas (`.mm-stage3d`, z 2) and the DOM HUD (z 5) sit above it. Every Phaser
scene must set its own camera background (2D scenes) or leave it transparent (3D).
Classic-script globals declared with `const` (e.g. `MathMonWorldData`) are not
`window` properties — ES modules reference them by bare name.
Battles talk to a stage through a promise API (introduce/playerAction/enemyAttack/
hit/popup/statusFx/faint); keep MathMonStage2D and stage3d.js in sync.
Overworld renderers only read map data; collision, encounters, doors and saving
stay in OverworldScene.

`js/game.js` is retained as the legacy DOM-based engine and is not loaded by
the current `index.html` entry point.
```

### Python Backend

```
python/
├── ml_model.py              → RandomForest classifier (train, predict, demo)
│   ├── generate_synthetic_data(n=2000)
│   ├── train_model(csv_path, save, verbose)
│   ├── predict_performance(stats, model)
│   ├── load_model()
│   └── extract_features_from_stats(stats)   # mirror of ml.js extractFeatures()
├── data_processor.py        → Pandas-based performance analytics
│   └── PerformanceDataProcessor class
│       ├── record_attempt()
│       ├── get_player_stats()
│       ├── prepare_ml_features()
│       ├── get_performance_summary()
│       └── export_csv()
├── server.py                → Flask REST API
│   ├── /api/player          → player CRUD
│   ├── /api/battle          → battle start & result
│   ├── /api/attempt         → record attempt
│   ├── /api/player/<id>/stats → aggregated stats
│   ├── /api/ml/classify     → run classification
│   ├── /api/ml/train        → train model
│   ├── /api/monsters        → monster roster
│   └── /api/questions       → question generation
├── azure_ml_score.py        → Azure ML endpoint scoring entry point
├── deploy_azure_ml.py       → Azure ML managed endpoint deployment
└── data/                    → JSON store + CSV exports
```

### Database

```
database/schema.sql
├── Tables: players, player_sessions, monster_roster, battles,
│           question_bank, attempts, ml_classifications,
│           performance_summary, levels
├── Views: player_leaderboard, topic_performance, recent_battles
├── Procedures: GetPlayerDashboard, RecordBattleAndAttempts
└── Triggers: update_player_accuracy, update_performance_summary_on_attempt
```

## Code Conventions

### JavaScript
- Use vanilla JS ES6+ (no build step or transpilation)
- Use `const` for constants, `let` for mutable variables
- Prefer named functions over arrow functions for top-level handlers
- Use `addEventListener` for event binding (no inline onclick in HTML)
- State is managed via the `STATE` object in `game.js`
- Modules are namespaced (e.g., `MathMonGame`, `QuestionGenerator`, `MathML`)
- localStorage key: `mathmon_save`

### Python
- Use `snake_case` for functions and variables
- Use `PascalCase` for classes
- Include docstrings for all public functions
- Use `argparse` for CLI entry points
- Use `joblib` for model persistence
- Mirror client-side logic (ml.js) in ml_model.py for consistency

### CSS
- Use CSS custom properties (`--var-name`) for theme colors
- Pixel-art aesthetic with `font-family: 'Press Start 2P'`
- BEM-style class naming with hyphens
- Use `flexbox` for layout (no CSS grid unless complex)
- Animations: `fadeIn`, `float`, `grassSway`, `shake`, `pulseRed`, `healGlow`

### SQL
- Use backticks for reserved words if needed
- Comment sections with `-- ----` dividers
- Index foreign-key columns and frequently-queried columns
- Use `ON DELETE CASCADE` for player data
- Use `ON DELETE SET NULL` for optional foreign keys (e.g., monster_id)

## Key Files to Modify

| Task | File to Edit |
|------|-------------|
| Add new monsters | `js/monsters.js` + `assets/monsters.json` |
| Change XP requirements | `js/game.js` (XP_PER_LEVEL) + `database/schema.sql` (levels table) |
| Add new math categories | `js/questions.js` + `python/questions.py` |
| Change ML classification thresholds | `js/ml.js` + `python/ml_model.py` (classifyPerformance / predict_performance) |
| Add new API endpoints | `python/server.py` |
| Add new database tables | `database/schema.sql` |
| Change styling | `css/game-shell.css`, `css/battle-hud.css` (legacy: `css/style.css`) |
| Change battle balance (damage, MP costs, multipliers, timer, question rules) | `js/battle-config.js` |
| Change XP reward | `js/phaser-game.js` (BattleScene.endBattle) |
| Add / edit battle questions | `js/question-bank.js` |
| Add an element skill effect type | `js/battle-config.js` + `js/battle-rules.js` (applyEffect, describeStatuses) |
| Change battle HUD layout | `js/battle-hud.js` + `css/battle-hud.css` |
| Change skill VFX | `js/battle-3d/vfx.js` + `js/battle-3d/monsters.js` (3D), `js/battle-vfx.js` (2D) |
| Change boss monsters / arenas | `js/battle-3d/monsters.js`, `js/battle-3d/environments.js`, `js/battle-config.js` (`monsters`) |
| Change question difficulty per move | `js/battle-config.js` (`questionTiers`, `questionGate.actionTier`) |
| Edit overworld maps, buildings, NPCs | `js/world/world-data.js` (`LOCATIONS`) |
| Add / change a sound or music track | `js/audio/audio-synth.js` (generated) or a file in `audio/` + `js/audio/audio-manifest.js` |
| Trigger a sound from gameplay | `SoundManager` in `js/phaser-game.js` (routes to `MathMonAudio`) |
| Change the title / cover | `js/title-screen.js`, `js/title-3d/title3d.js`, `css/game-shell.css` (`.mm-title`) |
| Change overworld 3D look / props / camera | `js/world-3d/*.js`, `MathMonWorldData.render3d` |

## Development Checklist

Before creating new files:
- [ ] Check if the file pattern exists in the codebase
- [ ] Match existing code conventions (naming, structure, comments)
- [ ] Use existing libraries/utilities (do not introduce new ones without adding to dependencies)

After making changes:
- [ ] Verify game loads and works in browser (test character select, battle, level up)
- [ ] Verify Python files compile: `python -m py_compile python/*.py`
- [ ] Verify ML model train/predict works: `cd python && python ml_model.py demo`
- [ ] Verify Flask API endpoints respond: `curl http://localhost:5000/api/health`
- [ ] Update README.md and AGENTS.md if adding new features, commands, or dependencies
- [ ] Add new console commands to AGENTS.md

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Game not loading | Check browser console for JS errors; ensure all `js/` files are present |
| localStorage not working | Check browser privacy settings; localStorage requires HTTP/HTTPS |
| ML model not found | Run `cd python && python ml_model.py train` first |
| ModuleNotFoundError (skikit-learn, pandas, flask) | `pip install pandas scikit-learn numpy flask joblib` |
| MySQL connection errors | Verify server is running, credentials in `database/schema.sql` |
| CSS not loading | Ensure `css/style.css` path is correct from `index.html` |
