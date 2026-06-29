# ET Scout — Elastic Tree Survey Analytics

Survey intelligence platform for Elastic Tree, powered by LimeSurvey.

## Features

- **Project overview** — List all surveys with status (active / inactive / expired), response counts, and expiry dates
- **Project detail** — View completion rates, schedule, and survey questions
- **Custom analysis** — Run frequency distributions, cross-tabulations, and numeric summaries on response data
- **Live LimeSurvey connection** — Uses the LimeSurvey RemoteControl 2 (JSON-RPC) API via [citric](https://citric.readthedocs.io/)

## Prerequisites

1. A LimeSurvey instance with **JSON-RPC enabled**:
   - LimeSurvey admin → **Global settings** → **Interfaces**
   - Set **RPC interface enabled** to **JSON-RPC**
2. A LimeSurvey user account with API access to your surveys

## Quick start

### 1. Configure LimeSurvey credentials

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your LimeSurvey URL and credentials:

```env
LIMESURVEY_URL=https://your-limesurvey.com/index.php/admin/remotecontrol
LIMESURVEY_USERNAME=your_username
LIMESURVEY_PASSWORD=your_password
```

### 2. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

## Going live (hosting)

**Streamlit Community Cloud is not compatible with ET Scout.** Streamlit only runs Python Streamlit apps (`.py` files). ET Scout is a **React frontend + FastAPI backend** — a different stack.

Use **Render** (free tier) or any Docker host instead:

1. Push this repo to GitHub: [sunilmukkath/ET_Spirex](https://github.com/sunilmukkath/ET_Spirex)
2. Create a [Render](https://render.com) account → **New Web Service** → connect the repo
3. Set **Runtime** to **Docker** (uses the root `Dockerfile`)
4. Add environment variables from `backend/.env.example`:
   - `LIMESURVEY_URL`, `LIMESURVEY_USERNAME`, `LIMESURVEY_PASSWORD`
   - `CORS_ORIGINS=*` (or your Render URL)
5. Deploy — one URL serves both the dashboard UI and `/api` routes

Alternatively, run locally in production mode:

```bash
cd frontend && npm run build
cd ../backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000
# Open http://localhost:8000
```

## Project structure

```
RETLS/
├── backend/          # ET Scout API (FastAPI + LimeSurvey)
│   ├── app/
│   │   ├── lime_client.py      # Survey & response fetching
│   │   ├── services/analysis.py  # Custom analysis logic
│   │   └── routes/api.py         # REST endpoints
│   └── requirements.txt
└── frontend/         # React + Vite dashboard UI
    └── src/
        ├── pages/    # Dashboard, project detail, analysis
        └── api/      # API client
```

## Analysis (Decipher-style)

The analysis module reads your **survey structure** from LimeSurvey (question types, answer options, subquestions) and runs appropriate statistics — not raw CSV column names.

### Question profile
Auto-selects analysis by question type:
- **Single choice / 5-point / Yes-No** → labeled frequency distribution
- **Multiple choice** → % selecting each option
- **Array / matrix** → per-row distributions
- **Numeric** → mean, median, std dev, min, max
- **Text** → sample verbatims

### Banner / crosstab tables
Like Decipher banner runs:
1. Pick a **row question** (stub) — the variable to analyze down the rows
2. Pick **banner breaks** — demographic or grouping variables across columns
3. Choose metric: distribution, mean, top-2-box, bottom-2-box (based on question type)
4. Optional **significance testing** — flags cells significantly higher/lower than Total (95%)

### API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/projects/{id}/schema` | Survey variables with types, labels, answer options |
| `POST /api/projects/{id}/analysis/profile` | Question-type-aware single question analysis |
| `POST /api/projects/{id}/analysis/banner` | Banner/crosstab table with significance |

Example banner request:

```json
{
  "row_variable_id": "q123456",
  "banner_variable_ids": ["q789012"],
  "completion_status": "complete",
  "metric": "auto",
  "show_significance": true
}
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Not connected" on dashboard | Check `.env` credentials and that JSON-RPC is enabled in LimeSurvey |
| Empty project list | Verify the API user owns or has access to surveys; try setting `LIMESURVEY_FILTER_USER` |
| Column not found in analysis | LimeSurvey exports use question codes (e.g. `G01Q02`) as column names |

## Next steps

Possible extensions:
- Export analysis results to CSV/Excel
- Time-series charts for response trends
- Multi-survey comparison views
- Cached/local database for faster repeated analysis
