# Deploying MathMon to Microsoft Azure

MathMon runs entirely in the browser; Azure adds online saves, a leaderboard,
shared training data and a cloud-trained difficulty model. Every Azure piece is
optional: without it the game still works offline (`js/api-client.js` swallows
network errors and the adaptive model keeps learning locally).

| Service | What it does for MathMon | Code |
|---|---|---|
| **Azure Static Web Apps** | Hosts the game (HTML/CSS/JS, no build step) on a global CDN with HTTPS, and hosts the API under `/api` | repo root, `staticwebapp.config.json`, `.github/workflows/azure-static-web-apps.yml` |
| **Azure Functions** | Serverless REST API: players, battle results, leaderboard, questions, ML calls | `api/` (Node 20, Functions v4 programming model) |
| **Azure Cosmos DB** | Player profiles + scores (leaderboard), every answered question (ML training data), the published adaptive model | `api/src/lib/store.js` |
| **Azure Machine Learning** | Trains the adaptive-difficulty model on all players' answers; hosts the performance classifier as a REST endpoint | `python/azure_ml_train_job.py`, `python/deploy_azure_ml.py`, `python/azure_ml_score.py` |

## Architecture

```
Browser (index.html, Phaser + Three.js)
 ├─ js/adaptive-ml.js  ── learns per player (TF.js / JS) ──┐
 └─ js/api-client.js   ── /api/* ──────────────────────────┤
                                                            ▼
Azure Static Web Apps ── managed Azure Functions (api/)
                           ├─ players / battles / leaderboard ─┐
                           ├─ attempts (training data) ────────┼─► Azure Cosmos DB
                           ├─ GET/PUT ml/model ────────────────┘     (players, attempts, models)
                           └─ POST ml/classify ─► Azure ML online endpoint (Random Forest)
Azure ML job (python/adaptive_model.py) ◄─ CSV from GET /api/ml/training-data
        └─ adaptive_weights.json ─► PUT /api/ml/model ─► every browser's starting model
```

## Folder structure

```
staticwebapp.config.json         SWA routing, Node 20 API runtime, blocks /python /database /tests
.github/workflows/azure-static-web-apps.yml   CI: test API helpers, deploy site + API
api/
├── host.json, package.json      Functions host + dependencies (@azure/functions v4, @azure/cosmos v4)
├── local.settings.example.json  copy to local.settings.json for `func start` (git-ignored)
├── src/functions/
│   ├── players.js               POST /api/player · GET /api/player/{id}
│   │                            POST /api/battle/{battleId}/result · GET /api/leaderboard
│   ├── attempts.js              POST /api/attempt
│   ├── questions.js             GET  /api/questions?tier=&count=&op=
│   ├── ml.js                    POST /api/ml/classify · GET|PUT /api/ml/model · GET /api/ml/training-data
│   └── health.js                GET  /api/health
├── src/lib/                     store (Cosmos / in-memory), http helpers, questions, classify
└── test/lib.test.js             `npm test` (node:test, no Azure needed)
python/
├── adaptive_model.py            train / fetch / publish the global adaptive model
├── azure_ml_train_job.py        run adaptive_model.py as an Azure ML command job
├── deploy_azure_ml.py           deploy the Random Forest classifier to a managed online endpoint
└── azure_ml_score.py            scoring script for that endpoint
```

## Environment variables

Set these as **Static Web App → Settings → Environment variables** (they are the
Functions' app settings), in `api/local.settings.json` for local runs, or in a
`.env` for the Python scripts. See `.env.example`.

| Variable | Used by | Purpose |
|---|---|---|
| `COSMOS_CONNECTION_STRING` *(or `COSMOS_ENDPOINT` + `COSMOS_KEY`)* | Functions | Cosmos DB account; unset = in-memory store |
| `COSMOS_DATABASE` | Functions | database name (default `mathmon`) |
| `AZURE_ML_ENDPOINT`, `AZURE_ML_KEY` | Functions | classifier scoring URI + key; unset = rule-based fallback |
| `ML_ADMIN_KEY` | Functions, `adaptive_model.py` | protects `PUT /api/ml/model` and `GET /api/ml/training-data` |
| `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_ML_WORKSPACE`, `AZURE_ML_COMPUTE` | Python Azure ML scripts | workspace + compute cluster |

## 1. Run everything locally

```bash
# game only (no API): any static server
./server.ps1                       # http://localhost:5000

# game + Azure Functions API, exactly like production
npm install -g azure-functions-core-tools@4 @azure/static-web-apps-cli
cd api && npm install && cp local.settings.example.json local.settings.json && npm test && cd ..
swa start . --api-location api     # http://localhost:4280  (Cosmos optional: in-memory without it)
curl http://localhost:4280/api/health
```

## 2. Create the Azure resources (Azure CLI)

```bash
az login
az group create --name mathmon-rg --location eastus2

# Cosmos DB (serverless = pay per request; the API creates the database and containers)
az cosmosdb create --name mathmon-cosmos --resource-group mathmon-rg --capabilities EnableServerless
az cosmosdb keys list --name mathmon-cosmos --resource-group mathmon-rg --type connection-strings \
  --query "connectionStrings[0].connectionString" -o tsv          # → COSMOS_CONNECTION_STRING

# Static Web App linked to your GitHub repo (creates the deployment token secret + workflow)
az staticwebapp create --name mathmon-web --resource-group mathmon-rg --location eastus2 \
  --source https://github.com/<you>/<repo> --branch main \
  --app-location "/" --api-location "api" --output-location "" --login-with-github

az staticwebapp appsettings set --name mathmon-web --setting-names \
  COSMOS_CONNECTION_STRING="<connection string>" COSMOS_DATABASE=mathmon ML_ADMIN_KEY="<long random string>"
```

If you create the Static Web App in the portal instead, add the deployment token
as the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`; the included workflow
deploys on every push to `main` (and creates preview URLs for pull requests).

## 3. Azure Machine Learning

```bash
pip install -r requirements.txt
az ml workspace create --name mathmon-ml --resource-group mathmon-rg
az ml compute create --name cpu-cluster --type AmlCompute --size Standard_DS3_v2 --min-instances 0 --max-instances 1 \
  --resource-group mathmon-rg --workspace-name mathmon-ml
export AZURE_SUBSCRIPTION_ID=... AZURE_RESOURCE_GROUP=mathmon-rg AZURE_ML_WORKSPACE=mathmon-ml
```

**a) Classifier endpoint** (Needs Practice / Developing / Proficient):

```bash
cd python
python ml_model.py train
AZURE_ML_ENDPOINT=mathmon-classifier python deploy_azure_ml.py
az ml online-endpoint show -n mathmon-classifier --query scoring_uri -o tsv      # → AZURE_ML_ENDPOINT (app setting)
az ml online-endpoint get-credentials -n mathmon-classifier --query primaryKey -o tsv   # → AZURE_ML_KEY
```

**b) Adaptive-difficulty model** (retrain whenever enough new answers have come in):

```bash
export ML_ADMIN_KEY=<same value as the app setting>
python adaptive_model.py fetch --api https://<app>.azurestaticapps.net --out attempts.csv
python azure_ml_train_job.py --csv attempts.csv            # trains on Azure ML; prints the studio URL
az ml job download --name <job-name> --output-name model --download-path out/
python adaptive_model.py publish --weights out/named-outputs/model/adaptive_weights.json \
  --api https://<app>.azurestaticapps.net
# or train locally instead of on Azure ML:
python adaptive_model.py train --csv attempts.csv --publish https://<app>.azurestaticapps.net
```

New players download the published model from `GET /api/ml/model` and keep
refining it in their own browser.

## 4. Verify

```bash
curl https://<app>.azurestaticapps.net/api/health        # storage: cosmos-db, classifier: azure-ml
curl "https://<app>.azurestaticapps.net/api/questions?tier=medium&count=3"
curl https://<app>.azurestaticapps.net/api/leaderboard
```

## Security notes

- Secrets live only in app settings / `local.settings.json` (git-ignored), never in the client.
- Admin endpoints compare `x-admin-key` in constant time and are disabled when `ML_ADMIN_KEY` is unset.
- Inputs are validated (player ids, categories, numeric ranges, feature vectors); per-battle score and XP are capped.
- The API is anonymous like the original Flask server, so scores are self-reported. For a graded or public
  leaderboard, add Static Web Apps authentication (`allowedRoles: ["authenticated"]` on `/api/*`).
