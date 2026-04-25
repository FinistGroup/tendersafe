# TenderSafe

AI-powered government tender pipeline for South African SMMEs.

## Setup (3 steps)

**1. Install dependencies**
```
npm install
```

**2. Add your Anthropic API key**
```
cp .env.example .env
```
Open `.env` and replace `your_api_key_here` with your key from https://console.anthropic.com

**3. Run**
```
npm start
```

Open http://localhost:3000

---

## What it does

- **Dashboard** — KPI cards, monthly pipeline (March/April/May), probability matrix (sector × win probability), activity feed
- **Evaluate tender** — 4-step engine: details → disqualifiers → weighted scorecard → bid/no-bid result
- **Agent John** — AI strategist (Anthropic-powered): verdict, key risks, positioning moves, next 48 hours
- **Persistence** — all tenders saved to `data/tenders.json`, survives restarts

## Dev mode (auto-restart on file changes)
```
npm run dev
```
