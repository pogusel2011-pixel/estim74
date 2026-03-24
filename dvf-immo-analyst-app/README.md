# DVF Immo Analyst

Outil d'estimation immobilière pour le marché alpin (Haute-Savoie 74), basé sur :
- **DVF** : transactions réelles 2014–2024 (CSV local + API data.gouv.fr)
- **MoteurImmo** : annonces actives comparables
- **Notaires de France** : tendances de marché
- **GPT-4o** (optionnel) : analyses qualitatives

## Stack

- **Next.js 14** (App Router)
- **Prisma** (PostgreSQL en prod, SQLite en dev)
- **TypeScript** strict
- **Tailwind CSS** + shadcn/ui
- **Recharts** pour les graphiques

## Setup

```bash
# 1. Dépendances
npm install

# 2. Variables d'environnement
cp .env.example .env.local
# → renseigner DATABASE_URL, MOTEURIMMO_API_KEY, OPENAI_API_KEY

# 3. Base de données
npm run db:generate
npm run db:push       # ou db:migrate en prod
npm run db:seed       # données exemple

# 4. Placer les fichiers de données
# → data/dvf/2014-2024_mutations_d74.csv
# → data/iris/reference_IRIS_geo2025.xlsx

# 5. Démarrer
npm run dev
```

## Architecture

```
lib/
  dvf/          → Chargement CSV + API, stats, comparables, outliers
  valuation/    → Moteur d'estimation : ajustements, scoring, confiance
  geo/          → Géocodage BAN, périmètre, IRIS
  moteurimmo/   → Client API, normalisation, recherche
  notaires/     → Tendances marché
  gpt/          → Dossier, prompts, outputs

app/api/
  estimate/     → Endpoint principal d'estimation
  analyses/     → CRUD analyses
  dvf/          → Recherche DVF standalone
  moteurimmo/   → Recherche annonces standalone
  gpt/          → Génération IA
```

## Périmètre DVF

Le CSV couvre le **département 74 (Haute-Savoie)** de 2014 à 2024.
Pour d'autres départements, ajouter les CSV correspondants ou s'appuyer uniquement sur l'API DVF.

## Moteur de valorisation

1. Médiane DVF filtrée (rayon, type, période, outliers IQR)
2. Ajustements qualitatifs : état, DPE, étage, orientation, vue, options (+/- %)
3. Pondération avec annonces actives si échantillon DVF insuffisant
4. Intervalle de confiance ±8% autour du prix médian ajusté
5. Score de fiabilité (taille échantillon, fraîcheur, dispersion)
