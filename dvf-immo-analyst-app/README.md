# DVF Immo Analyst

Outil d'estimation immobilière pour le marché alpin (Haute-Savoie 74), basé sur :
- **DVF** : transactions réelles 2020–2025 (Neon PostgreSQL + API data.gouv.fr)
- **MoteurImmo** : annonces actives comparables
- **Notaires de France** : tendances de marché
- **GPT-4o** (optionnel) : analyses qualitatives

## Stack

- **Next.js 14.2.35** (App Router)
- **Prisma + Neon** (PostgreSQL serverless)
- **TypeScript** strict
- **Tailwind CSS** + shadcn/ui
- **Recharts** pour les graphiques
- **Vercel Analytics** (monitoring)

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
# → data/dvf/2020-2025_mutations_d74.csv
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

## Mise à jour annuelle DVF → Neon

Le script `update-dvf-neon.ts` permet de maintenir la base Neon à jour avec les dernières transactions DVF publiées sur data.gouv.fr, **sans réimporter l'intégralité des données existantes**.

### Fonctionnement

1. Interroge Neon pour connaître le nombre de transactions et la date max déjà en base
2. Télécharge en streaming le fichier DVF géolocalisé complet depuis data.gouv.fr (toute France, format `.csv.gz`)
3. Filtre les lignes du **département 74** en temps réel
4. Déduplique par `id_mutation` — n'insère que les transactions absentes de la base
5. Insère en **lots de 1 000 lignes** pour éviter les timeouts Neon
6. Affiche un rapport : nouvelles transactions ajoutées, plage de dates, total en base

### Commandes

```bash
# Simulation (aucune écriture en base)
npm run dvf:update-neon:dry

# Mise à jour réelle
npm run dvf:update-neon
```

### Quand l'exécuter ?

**Une fois par an**, typiquement en **juillet** (DVF de l'année précédente publié en mai–juin).

```
Calendrier recommandé :
  - Juillet N   → importe les transactions de l'année N-1
  - Juillet N+1 → importe les transactions de l'année N
```

### Prérequis

- `DATABASE_URL` configurée dans `.env.local` (connexion Neon)
- Connexion internet (téléchargement ~150 Mo compressé)
- `tsx` disponible (`npm install` suffit)

### Exemple de rapport

```
══════════════════════════════════════════════════════════════
  RAPPORT DE MISE À JOUR
══════════════════════════════════════════════════════════════
  Lignes lues (France entière) : 4 200 000
  Lignes dept 74 trouvées      : 385 000
  Nouvelles transactions        : +32 000
  Total en base avant           : 353 000
  Total en base après           : 385 000
  Ancienne date max             : 2024-06-30
  Nouvelle date max             : 2025-06-30
══════════════════════════════════════════════════════════════
```

## Monitoring

### Health endpoint

`GET /api/health` — Retourne le statut de l'application et de la base Neon.

```json
{
  "status": "ok",
  "timestamp": "2026-04-08T10:00:00.000Z",
  "app": "ESTIM'74",
  "database": {
    "status": "ok",
    "latencyMs": 42,
    "dvfMutations": 353000,
    "analyses": 12
  }
}
```

Codes HTTP : `200` si tout est OK, `503` si la base est inaccessible.

### Vercel Analytics

Les visites et performances de pages sont automatiquement remontées dans le dashboard Vercel (onglet **Analytics**). Aucune configuration supplémentaire requise.

## Moteur de valorisation

1. Médiane DVF filtrée (rayon, type, période, outliers IQR)
2. Ajustements qualitatifs : état, DPE, étage, orientation, vue, options (+/- %)
3. Pondération avec annonces actives si échantillon DVF insuffisant
4. Intervalle de confiance ±8% autour du prix médian ajusté
5. Score de fiabilité (taille échantillon, fraîcheur, dispersion)
