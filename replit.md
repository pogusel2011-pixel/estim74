# ESTIM'74 — Haute-Savoie (74)

## Overview
ESTIM'74 is a Next.js 14 real estate analysis app for the French alpine property market (Haute-Savoie, département 74). Uses Prisma + PostgreSQL, local DVF CSV (353k rows), OpenAI GPT with rule-based fallback, recharts, and shadcn/ui.

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
- `MOTEURIMMO_API_KEY` — immoapi.app API key; used by `lib/dvf/client.ts` (live mutations) and `lib/dvf/dept-stats.ts` (/v1/stats benchmark)
- `NEXT_PUBLIC_APP_URL` — optional; defaults to `http://localhost:5000`

## Audit Recette — Adjustments Engine (Estim74 Spec)
Implemented in `lib/valuation/adjustments.ts` and aligned in `lib/mapping/energy.ts` + `lib/valuation/valuation.ts`:
- **Condition**: Refait neuf +5% | Bon état 0% | Rafraîchissement -4% | Travaux lourds -10%
- **DPE**: A/B +2% | C/D 0% | E -3% | F -6% | G -7% (both `energy.ts` and fallback in `valuation.ts`)
- **Étage appartement**: RDC -4% | Élevé sans ascenseur -6.5% | Élevé avec ascenseur +1% (ratio ≥ 70%)
- **Garage**: Appartement +5% | Maison +3%
- **Balcon** +2% | **Terrasse** +3% | **Parking** +2%
- **Jardin/terrain**: < 300m² +1%, 300–1000m² +2%, > 1000m² +3% (maison surtout)
- **Piscine** +2.5% | **Cave** +1%
- **Vue**: lac/montagne +2%, dégagée +1.5%, jardin +1%, cour -1%
- **Plafond global ±20%** with brut vs retenu logging

## gptPayload
`Analysis.gptPayload String?` (Prisma) — JSON string built in `app/api/estimate/route.ts`:
- Contains: adresse, type, surface, DVF stats (médianes, Q1/Q3, rayon), estimation fourchette, ajustements détaillés, psmBase/Ajuste, confidenceLabel

## Comparables Table Column Order (Spec Estim74)
[badge] | Date | Distance (m) | Nature du bien | Surface (m²) | Pièces | Prix DVF | €/m² | Adresse/parcelle | Source
(Both web table `components/dvf/dvf-comparables-table.tsx` and print page `app/analyses/[id]/print/page.tsx`)

## V2 Features

### Chantier 1 — Export PDF livrable client
- **Button**: `components/analysis/pdf-download-button.tsx` — "Télécharger PDF" (replaces "Exporter PDF" link)
- **Implementation**: `html2canvas` + `jsPDF` (dynamically imported) — loads print page in hidden iframe with `?noprint=1`, captures `.print-sheet`, slices into A4 pages
- **Print page improvements**: `?noprint=1` skips auto-print; blob annonces actives section added (count, price range, PSM listing vs DVF signed + écart); footer updated to full legal mention "Estimation fondée sur les prix signés DVF · Source DGFiP 2014–2024 · Usage professionnel"
- **Packages**: `jspdf`, `html2canvas` (v1.4.x)

### Chantier 2 — Sélection intelligente des comparables
- **Scoring 4 dimensions** in `lib/dvf/comparables.ts` — `scoreComparable()`:
  - Distance 40% : `max(0, 1 - distanceM/2000)`, neutre 0.4 si inconnu
  - Surface  30% : `(min/max)^1.5` (pénalise davantage les grands écarts)
  - Récence  20% : `max(0, 1 - ageDays / (365*3))` — zéro à 3 ans
  - Pièces   10% : 1.0 exact, 0.7 ±1, 0.3 ±2, 0 sinon (0.5 si inconnu)
- **Top N = 8** comparables marqués `topComparable: true` dans `DVFComparable`
- **Table**: top comparables en fond bleu + badge "★ Comparable clé" en première colonne ; résumé dans le header (badge avec comptage)
- **Confidence**: `lib/valuation/confidence.ts` utilise les surfaces réelles des top comparables pour `surfaceMatch` (plus de valeur fixe à 0.7)
- **Propagation**: `rooms` passé à `toComparables()` dans estimate route, resimulate route, analyses/[id]/page, print/page

## V3 Features

### Temporal Indexation (Notaires 74)
- `lib/dvf/temporal-index.ts` — index table 2014-2025 (base 100=2014), `applyTemporalIndex(pricePsm, year)` brings prices to 2025 equivalents
- `computeDVFStats()` now uses indexed PSMs → medianPsm/meanPsm/Q1/Q3 all in 2025 values; `DVFStats.isIndexed = true`
- `DVFComparable.indexedPricePsm` — 2025-indexed price per m² shown in the comparables table (original raw in tooltip)
- `DVFStatsPanel` shows "Prix indexés 2025" emerald badge when `stats.isIndexed === true`

### ImmoAPI CSV-First Strategy
- `lib/dvf/client.ts` — API base changed to `https://immoapi.app/v1`; env var `MOTEURIMMO_API_KEY`
- `_fetchAtRadius()` now tries CSV first; ImmoAPI is called only when CSV returns < 5 results
- Expansion loop (0.5km steps up to 5km) iterates: CSV → if insufficient, ImmoAPI → if still insufficient, expand radius

### Département Benchmark Panel
- `lib/dvf/dept-stats.ts` — calls `GET /v1/stats?code_departement=74&type_local=` with 1h cache
- `DeptBenchmark` type in `types/dvf.ts` — medianPsm, evolutionPct, totalTransactions
- `components/dvf/dept-benchmark-panel.tsx` — shows dept median, annual evolution %, gap vs subject property (above/below %)
- Integrated in the "Marché" tab of `app/analyses/[id]/page.tsx`; falls back silently if API unavailable

## Notes
- First page load after server restart takes ~10s (CSV load); subsequent loads ~50ms
- Notaires API returns 404/502 — non-critical, fallback market reading used
- `computePrixM2` in outliers.ts adds `prix_m2` field to mutations; must be called before filtering
- Homepage uses `export const dynamic = "force-dynamic"` + Suspense streaming
