# ET Scout — Elastic Tree Survey Analytics

Survey intelligence platform for Elastic Tree, powered by LimeSurvey.

**Live app:** [https://et-spirex.onrender.com/](https://et-spirex.onrender.com/)

## Features

- **Dashboard** — Survey list with favorites, status filters, and response counts
- **Survey home** — Per-study overview: sample size, QC snapshot, quota status, quick links
- **Questions** — Profile (single-question) and Compare (multi-banner crosstabs with sig testing)
- **Charts** — 30+ chart types with PNG and CSV export
- **Statistics** — Correlation, regression, chi-square, t-test, ANOVA, descriptives
- **Fielding monitor** — Daily completes and interviewer throughput
- **Field team** — Interviewer QC performance and rejection rates
- **Field quotas** — Single-question and layered quota targets with min/max bounds
- **Response QC** — Speeders, duplicates, straight-lining, gibberish, custom rules
- **Setup** — Custom variables (recode, combine, net score) and survey weighting
- **Reports** — Assemble profile and crosstab sections into PDF/PPT decks
- **Data** — Paginated raw data, full CSV export, and codebook export
- **Settings** — Connection status and active team sessions

## Prerequisites

1. A LimeSurvey instance with **JSON-RPC enabled**
2. A LimeSurvey user account with API access to your surveys

## Quick start

See `backend/.env.example` for LimeSurvey credentials, then:

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Or build and run the combined Docker image (serves API + SPA on one port).

## Workspace tabs

| Tab | Purpose |
|-----|---------|
| Home | Study overview and shortcuts |
| Questions | Profile / Compare sub-views |
| Charts | Visualisation builder |
| Fielding | Completion pace over time |
| Reports | Client deck builder |
| Statistics | Multivariate analysis |
| Field team | Interviewer performance |
| Setup | Questions + custom variables + weighting |
| Fields | Quota management |
| Quality | QC scan and review |
| Data | Raw response table |

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts
- **Backend:** FastAPI, pandas, scipy, citric (LimeSurvey JSON-RPC)
