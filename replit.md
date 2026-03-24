# DVF Analyst — Haute-Savoie (74)

## Overview
Next.js 14 real estate analysis app for the French alpine property market (Haute-Savoie, département 74). Uses Prisma + PostgreSQL, local DVF CSV (353k rows), OpenAI GPT with rule-based fallback, recharts, and shadcn/ui.

## Stack
- **Framework**: Next.js 14 (App Router) with TypeScript
- **Database**: Prisma + Replit PostgreSQL (`DATABASE_URL`)
- **UI**: shadcn/ui + Tailwind CSS
- **Charts**: recharts
- **AI**: OpenAI GPT-4o (optional) with full rule-based fallback
- **Data**: DVF CSV 2014–2024 `dvf-immo-analyst-app/public/dvf/2014-2024_mutations_d74.csv` (353k rows)

## Project Structure
```
dvf-immo-analyst-app/
├── app/
│   ├── page.tsx                    # Homepage with streaming DVF stats
│   ├── analyses/
│   │   ├── page.tsx                # Analysis list
│   │   ├── new/page.tsx            # New analysis form
│   │   └── [id]/page.tsx           # Analysis detail page
│   └── api/
│       ├── analyses/route.ts
│       ├── gpt/route.ts            # GPT with rule-based fallback
│       ├── dvf/
│       │   ├── trend/route.ts      # Market trend by lat/lng/type
│       │   └── overview/route.ts   # Dept-wide stats (deprecated: use server import)
│       └── notaires/route.ts
├── components/
│   ├── analysis/                   # Valuation cards, confidence badge, etc.
│   ├── dvf/                        # DVFStatsPanel, DVFRecentSalesPanel, MarketTrendChart
│   └── ui/                         # shadcn/ui components
├── lib/
│   ├── dvf/
│   │   ├── csv-loader.ts           # loadAllCsvMutations() with 30-min global cache
│   │   ├── client.ts               # searchComparables() with auto-expanding radius
│   │   └── outliers.ts             # computePrixM2(), filterOutliers()
│   ├── gpt/
│   │   ├── route-handler.ts        # GPT route with fallback
│   │   └── rule-based.ts           # Full rule-based analysis engine (no API key needed)
│   ├── valuation/valuation.ts      # Core valuation logic
│   ├── constants.ts                # CONFIDENCE_COLORS, DVF_TYPE_MAP, etc.
│   └── utils.ts                    # percentile(), formatPrice(), formatPsm()
└── prisma/schema.prisma
```

## Key Features
1. **DVF data**: 353k real transactions loaded from CSV into a 30-min in-memory cache
2. **Auto-expanding radius**: 0.5km steps from requested radius up to 5km cap when < 5 transactions
3. **Indicative valuation**: amber banner + wider ±15% spread for sparse data (1–4 transactions)
4. **Rule-based AI**: Works without OpenAI API key — covers all 5 GPT action types
5. **Streaming homepage**: Suspense wraps DVF stats section; page shell renders instantly
6. **Market trend chart**: recharts line chart via `/api/dvf/trend`

## Workflow
- **Name**: Start application
- **Command**: `cd dvf-immo-analyst-app && npm run dev -- -p 5000 -H 0.0.0.0`

## Environment Variables
- `DATABASE_URL` — auto-configured by Replit PostgreSQL
- `OPENAI_API_KEY` — optional; app falls back to rule-based analysis if absent
- `NEXT_PUBLIC_APP_URL` — optional; defaults to `http://localhost:5000`

## Notes
- First page load after server restart takes ~10s (CSV load); subsequent loads ~50ms
- Notaires API returns 404/502 — non-critical, fallback market reading used
- `computePrixM2` in outliers.ts adds `prix_m2` field to mutations; must be called before filtering
- Homepage uses `export const dynamic = "force-dynamic"` + Suspense streaming
