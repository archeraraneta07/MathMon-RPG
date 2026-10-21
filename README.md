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
- **Living Overworld** — Explore a village with residential homes, commercial buildings, agricultural fields, villagers, a cave trade district, and a beach community
- **Four Math Categories:**
  - 🔴 Addition (+ Pluspy, Sumslime)
  - 🔵 Subtraction (− Minusquid, Diffdrake)
  - 🟡 Multiplication (× Timeshell, Productrus)
  - 🟣 Division (÷ Splitling, Quotientail)
- **Progressive Difficulty** — 10 difficulty tiers scaling with your level
- **Leveling System** — Earn XP from battles to level up your trainer (max level 15)
- **Scoring & Accuracy Tracking** — Real-time score, XP, and accuracy display

### Battle Mechanics
- **Choose, then answer** — each turn you pick a move, then **type** the answer to a
  math question before it resolves. Difficulty matches the move: Normal Attack = easy
  (e.g. `12 + 7`, 15 s), Skills = medium (`8 × 6`, 20 s), Ultimate = hard but basic
  (`144 ÷ 12`, `348 + 276`, 30 s). Only + − × ÷, always whole-number answers
  (division divides exactly, subtraction never goes negative). The input accepts
  digits only; Enter or Submit answers; paste is blocked
- **Correct** → the attack launches at full power; answering within 4 s makes it a
  **CRITICAL** hit (×1.3) and consecutive correct answers build a **combo** (+5% each,
  up to +25%, plus +15 MP every 3). **Wrong / timeout** → "Incorrect, the answer was X"
  and the attack fails (MP refunded) — or, in `lenient` mode, lands at half damage.
  An optional **hint** costs −25% damage
- **First-turn tutorial** explains the type chart and the typed-answer rule;
  **victory / defeat screens** show correct answers, accuracy, damage dealt and taken,
  best combo and critical hits
- **Battle Command Menu** — Normal Attack (+10 MP), 1st Skill (20 MP), 2nd Skill
  (40 MP, secondary effect), Ultimate (full 100 MP bar, cinematic, resets MP)
- **Elemental system** — choose Fire, Water, Wind or Earth. Water beats Fire, Fire
  beats Wind, Wind beats Earth, Earth beats Water: 1.5× "Super Effective!", 0.5×
  "Not Very Effective...". Each element
  has its own skill names, colors, VFX and status effects (burn, slow, shred, stun,
  shield, heal, crit)
- **Boss monsters** — each element has a signature monster: Pyrovex the Fire Dragon,
  the Kraken, Typhoeus the storm giant, and Seismodon the Earth Titan (an original
  rock-plated kaiju). Each has its own arena: volcanic crater, stormy ocean, peak
  above the clouds, ruined city canyon
- **3D battles (Three.js)** — procedural, animated rigs with idle / attack / hit / defeat
  and signature moves; PBR materials, image-based lighting, soft shadows, fog,
  animated skies, bloom, god rays, SSAO and depth of field (by quality tier), color
  grading, camera shake, slow motion and screen flash on Ultimates. Falls back to the
  2D Phaser stage automatically when WebGL / ES modules are unavailable
- **3D overworld** — the three towns are a real 3D environment (terrain with elevation,
  instanced trees / rocks / crystals / grass, PBR buildings, NPCs, follow-and-orbit
  camera) driven by a deterministic map-data module, with collision; see
  [Overworld map](#overworld-map)
- **Accessible HUD** — real buttons, keyboard shortcuts, screen-reader live regions,
  reduced-motion support, sound toggle

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
| **3D Rendering**   | Three.js r160 (bundled locally in `js/vendor/three/`) |
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
│   ├── battle-hud.css      # Battle HUD design tokens, CSS 3D panels, animations
│   └── style.css           # Legacy DOM-based game styling
├── js/
│   ├── bootstrap.js        # Starts the Phaser game after dependencies load
│   ├── battle-config.js    # ALL battle tuning: gate rules, answers, hints, MP, damage, elements, monsters, 3D quality
│   ├── battle-rules.js     # Pure battle math: effectiveness, damage, MP, status effects
│   ├── question-bank.js    # Optional curated numeric questions per tier (data only)
│   ├── question-deck.js    # Tiered + − × ÷ question generator (whole numbers), bank shuffle bag
│   ├── battle-hud.js       # DOM battle HUD (cards, typed answer form, command menu, popups)
│   ├── battle-stage-2d.js  # 2D Phaser battle stage (fallback; same API as the 3D stage)
│   ├── battle-vfx.js       # Phaser element VFX for the 2D stage
│   ├── battle-3d/          # 3D battle stage (ES modules)
│   │   ├── stage3d.js      #   renderer, camera rig, post-processing, quality tiers, battle API
│   │   ├── environments.js #   volcano / ocean / peak / ruins arenas + animated sky dome
│   │   ├── monsters.js     #   Pyrovex, Kraken, Typhoeus, Seismodon rigs + actions
│   │   ├── vfx.js          #   GPU particles, debris, element / lightning / tornado effects
│   │   └── core.js         #   tweens, easing, procedural PBR textures, bend-limb shader, quality tiers
│   ├── world/
│   │   └── world-data.js   # Overworld map data: tiles, objects, NPCs, collision, 3D settings
│   ├── world-3d/           # 3D overworld renderer (ES modules)
│   │   ├── overworld3d.js  #   engine, location scenes, instanced chunk LOD, camera, labels
│   │   ├── terrain.js      #   heightfield + splat-blended PBR ground + water
│   │   └── world-assets.js #   procedural buildings, trees, props, characters
│   ├── vendor/three/       # Three.js r160 + post-processing / glTF loader add-ons (MIT)
│   ├── phaser-game.js      # Active Phaser game implementation (scenes, BattleScene turn loop)
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

The table above describes the overworld/training generator in `js/questions.js`.
**Battles** use `js/question-deck.js`, which builds questions per move tier from
`MathMonBattleConfig.questionTiers` (default) or draws from the curated
`js/question-bank.js` (`questionGate.source: 'bank' | 'mixed'`). Recently asked
questions are not repeated.

### Battle Turn Flow

```
Player turn ─► Command menu (1/2/3/4; MP checked)   [tutorial card on turn 1]
             ─► Question for that move's tier (type digits, Enter, timer, optional hint)
                 ├─ correct ─► "Correct!" (+ CRITICAL if fast, + combo) ─► MP spent ─► attack animation
                 └─ wrong / timeout ─► "Incorrect, the answer was X" ─► (strict) attack fails, MP kept
                                                                      (lenient) attack at ×0.5
Enemy turn  ─► burn ticks ─► stunned? skip : enemy attacks ─► statuses count down ─► next turn
Battle end  ─► Victory / Defeat screen with battle stats
```

The battle scene talks to a **stage** through one promise-based API
(`introduce`, `playerAction`, `enemyAttack`, `hit`, `popup`, `statusFx`, `faint`).
`js/battle-3d/stage3d.js` implements it in Three.js; `js/battle-stage-2d.js`
implements it with Phaser sprites and is used automatically when the 3D module
cannot load (for example when `index.html` is opened straight from disk — ES
modules need `http://`, so use `server.ps1`).

### Battle System Tuning

Every number lives in `js/battle-config.js` (`MathMonBattleConfig`):

| What to change | Config key | Default |
|----------------|-----------|---------|
| Wrong answer: attack fails vs. reduced damage | `questionGate.rule` | `'strict'` (`'lenient'`) |
| Damage on a wrong answer (lenient) | `questionGate.wrongAnswerDamageMultiplier` | `0.5` |
| Keep MP when an attack fails | `questionGate.refundMpOnMiss` | `true` |
| Which tier each move asks | `questionGate.actionTier` | normal easy, skills medium, ultimate hard |
| Number ranges, operation mix, timer per tier | `questionTiers.easy/medium/hard` (`a`, `b`, `divisor`, `quotient`, `weights`, `timerSeconds`) | 15 / 20 / 30 s |
| Fast-answer critical | `questionGate.fastAnswerSeconds`, `fastCritMultiplier` | `4`, `1.3` |
| Combo bonus | `questionGate.comboStep`, `maxComboBonus` | `0.05`, `0.25` |
| Timer on/off | `questionGate.timerEnabled` | `true` |
| Answer length / block paste | `answers.maxLength`, `answers.blockPaste` | `6`, `true` |
| First-turn tutorial | `tutorial.enabled`, `tutorial.everyBattle` | `true`, `true` |
| Hint button and its cost | `hint.enabled`, `hint.penalty` (`'damage'`/`'mp'`), `damagePenalty`, `mpCost` | on, `'damage'`, `0.25`, `10` |
| Boss monster per element / arena / optional `.glb` | `elements.<el>.monster`, `monsters.<key>` (`arena`, `model`) | dragon / kraken / typhoeus / titan |
| 3D quality, post FX, auto-downgrade | `stage3d.quality`, `postFx`, `autoDowngrade`, `minFps` | `'auto'`, tiered, on, `48` |
| Streak MP bonus | `questionGate.streakLength`, `streakMpBonus` | `3`, `15` |
| MP per correct answer | `questionGate.mpPerCorrectAnswer` | `5` |
| Question source | `questionGate.source` | `'generated'` (`'bank'`, `'mixed'`) |
| Skill MP costs / power | `actions.normal/skill1/skill2/ultimate` (`cost`, `power`, `mpGain`) | 0/20/40/100 MP, 1.0/1.6/2.2/4.0× |
| Max MP | `mp.max` | `100` |
| Player base damage | `damage.playerBase + level × damage.playerPerLevel` | `10 + 1.5/level` |
| Enemy HP / damage | `enemy.hpBase`, `hpPerLevel`, `damageBase`, `damagePerLevel`, gym multipliers | 55 + 8/level, 8 + 0.4/level |
| Type multipliers | `effectiveness.strong/weak/neutral.multiplier` | `1.5 / 0.5 / 1.0` |
| Type chart | `elements.<el>.beats` | Fire>Wind>Earth>Water>Fire |
| Skill names / effects | `elements.<el>.skills.<action>` (`name`, `description`, `effect`) | see file |
| Enemy heals on wrong answer (old rule) | `enemy.wrongAnswerHealPercent` | `0` |
| VFX scale, slow-mo, ultimate zoom | `vfx.intensity`, `slowMotionScale`, `ultimateZoom` | |
| Sound default | `sound.enabled` | `true` |

Damage formula (`js/battle-rules.js`):
`round((playerBase + level × playerPerLevel) × power × typeMultiplier × turnMultiplier × statusMultipliers × crit × random(0.9–1.1))`.

To add curated questions, append `{ question: '144 ÷ 12', tier: 'hard', hint: '…' }`
to `MATHMON_QUESTION_BANK` (operators `+ − × ÷`; `- x * /` also work). The answer is
computed automatically; entries without a whole-number answer ≥ 0 are skipped with
a console warning. Typed answers must match exactly (digits only).

---

## Audio

All audio runs through `js/audio/` (Web Audio API) and works with **zero files** —
every effect and music track is generated in code. Real recordings can replace
any of them: see [`audio/README.md`](audio/README.md) for the full file list,
setup and free sources.

| Module | Role |
|--------|------|
| `audio-manager.js` (`MathMonAudio`) | Buses (music / effects → limiter), echo reverb, voice limiting (per-category caps, 40 ms fade-outs, cooldowns), autoplay unlock on first click/key, preloading, settings in localStorage (`mathmon_audio`) |
| `audio-synth.js` (`MathMonSynth`) | Generated SFX (element layers, impacts, monster voices, UI, jingles) and step-sequenced music (menu, overworld, battle with intensity layers) |
| `audio-manifest.js` | Optional file names per sound id; `filesEnabled: true` turns file loading on |
| `audio-ui.js` (`MathMonAudioUI`) | Speaker button → Music / Effects sliders + mute (M toggles mute anywhere) |

**What plays when:** menu ambient on the title, a light theme in towns, the battle
loop in fights (it intensifies at low HP and when the Ultimate is ready), a fanfare
or somber sting on the results screen. Attacks play a cast sound at launch and an
element-themed impact on the animation's hit frame — heavier for super-effective
hits, muffled for weak ones; Ultimates add a charge-up riser and an echo tail.
Each boss has its own roar, hurt cry and defeat cry. UI clicks / hovers, the
correct-answer chime and wrong-answer buzz, MP charge ticks, the "Ultimate ready"
cue, turn changes, damage and heals all have sounds. Code calls go through
`SoundManager` in `js/phaser-game.js`, so scenes never touch the audio engine directly.

## Title screen

The cover (`js/title-screen.js` + `js/title-3d/title3d.js`) shows the four boss
monsters on the storm peak at sunset behind the logo, with **Continue** (your
trainer, level and element), **New Game** (asks before replacing a save) and
**Audio**. Keyboard: ↑ / ↓ and Enter. Without WebGL (or while the 3D module
loads) a painted 2D sunset line-up is shown instead.

## Overworld map

### Architecture

```
js/world/world-data.js      MAP DATA   tiles, objects, NPCs, collision, heights, 3D settings
        │                               (deterministic: same map on every visit)
        ├──► OverworldScene  GAME LOGIC movement + collision, encounters, doors, NPC greetings,
        │    (phaser-game.js)           location changes, saving, camera-relative input
        ├──► js/world-3d/    3D RENDER  terrain, props, buildings, characters, labels, camera
        └──► render2DMap()   2D RENDER  Phaser tile sprites (fallback)
```

Rendering never decides gameplay: both renderers only read map data, and the
scene owns every rule. Positions are stored in game pixels (32 px per tile) as
before, so saves remain compatible; old saves that point into a wall are moved
to the nearest walkable tile.

**Units:** 1 tile = 2 m in 3D (`TILE_METERS`), +X east, +Z south, +Y up; the
trainer is ~1.7 m tall, houses are 3 × 3 tiles (6 m).

### Editing the map

All edits happen in the `LOCATIONS` array in `js/world/world-data.js`:

| To… | Do this |
|-----|---------|
| Move / add a building | add `{ type, tx, ty, label }` to `objects` (types: `house`, `apartment`, `market`, `cafe`, `gym`, `barn`, `palm`; footprints in `FOOTPRINTS`). `door: 'home'` marks the enterable house |
| Add an NPC | add `{ name, tx, ty, color, line }` to `npcs` (they greet the player when approached) |
| Paint areas | add `{ tile, rect: [x0, y0, x1, y1] }` to `regions` |
| Scatter details | add `{ tile, on, chance }` (or `edgeRows`) to `scatter` |
| Hand-draw a whole map | give the location an `ascii` array of 30 strings × 40 chars using `ASCII_LEGEND` |
| Add a location | append to `LOCATIONS` (walking off the east/west edge cycles through them) |
| Add a tile type | extend `T` and `TILE_INFO` (`walkable`, `height`, `tex2d`), then add its splat weights in `js/world-3d/terrain.js` → `splatFor` and any props in `overworld3d.js` → `buildProps` |
| Use authored models | set `render3d.models`, e.g. `{ house: 'assets/models/house.glb' }` — loaded lazily, scaled to the footprint, PBR materials preserved |

Doors, NPC spots, the main road and the east/west exits are carved walkable
automatically, so scattered trees or walls can never trap the player.

### 3D renderer

- **Terrain:** heightfield (1 vertex / m) blended between tile heights + noise,
  extending 14 tiles past the map (hills, cave walls, open sea) to hide edges;
  ground shading mixes four procedural PBR textures through a per-tile splat map,
  and slopes turn to rock automatically.
- **Props:** trees, rocks, crystals, flowers, grass, crops and pier planks are
  `InstancedMesh`es grouped in 8 × 8-tile chunks. Each chunk is a `THREE.LOD`
  (detailed near, low-poly far, grass and flowers dropped far) with its own
  bounding sphere for frustum culling.
- **Lighting:** sky-dome IBL (PBR reflections), hemisphere + sun with soft
  shadows that follow the player, exponential fog, bloom; a theme per location
  (sunny meadow, crystal-lit cave with glowing spores, bright coast).
- **Camera:** follow cam with orbit and zoom — drag empty space or press **Z / X**
  to rotate, mouse wheel or pinch to zoom, **C** to reset. Movement is
  camera-relative.
- **Performance:** quality tier (`render3d.quality`, shared with battles) sets
  pixel ratio, shadow map size, MSAA, bloom and grass density; it drops a tier
  automatically when FPS stays below `minFps`. Locations are built on first
  visit and cached; one WebGL context is reused.
- **Accessibility:** follows `prefers-reduced-motion` (no camera easing, grass sway
  or idle bob; `render3d.reducedMotion` forces it); labels use high-contrast pills;
  keyboard and touch controls both work.

### Free asset sources (if you replace the procedural models)

| Kind | Source | License |
|------|--------|---------|
| Models (glTF/GLB) | [Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com), [Poly Pizza](https://poly.pizza) | CC0 (check each model) |
| Rigged creatures | [Quaternius](https://quaternius.com) monster & animal packs, [Sketchfab](https://sketchfab.com) (filter: downloadable, CC-BY / CC0) | CC0 / CC-BY |
| PBR textures | [ambientCG](https://ambientcg.com), [Poly Haven](https://polyhaven.com/textures) | CC0 |
| HDRI skies | [Poly Haven HDRIs](https://polyhaven.com/hdris) | CC0 |
| Sounds | [Kenney audio](https://kenney.nl/assets?q=audio), [freesound.org](https://freesound.org), [OpenGameArt](https://opengameart.org) | CC0 / CC-BY |

Battle monsters accept a `.glb` per monster via `MathMonBattleConfig.monsters.<key>.model`
(clips named `idle` / `attack` / `hit` / `death` are matched automatically). Both
model hooks are provided but have not been exercised with real assets in this
repository; the procedural models are the default.

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
2. **Choose your trainer** (Boy or Girl), enter a name, and **pick your element**
3. **Enter the grass** to encounter wild MathMon
   (in 3D: drag / Z X to orbit the camera, wheel or pinch to zoom, C to reset)
4. **Pick a move** (1/2/3/4 keys or tap). Skills cost MP; save a full bar for your Ultimate
5. **Type the answer** (digits) and press Enter before the timer runs out — fast answers crit,
   streaks build a combo. L opens the battle log; M toggles sound
6. **Earn XP** for correct answers and defeating monsters
7. **Level up** when XP threshold is reached
8. **Check stats** to see your ML-powered performance assessment
9. **Read recommendations** to find weak topics and improve

---

## License

This project was created as a student project proposal for IT 122/122L SAD (SAD01). Built with HTML, CSS, JavaScript, Python, Pandas, scikit-learn, and MySQL.
