# Procédure de mise à jour des données DVF — ESTIM'74

## Contexte

ESTIM'74 utilise un fichier CSV local des Demandes de Valeurs Foncières (DVF) géolocalisées du
département 74 (Haute-Savoie), fourni par la DGFiP via data.gouv.fr.

**Couverture actuelle :** 2014–2024 (`data/dvf/2014-2024_mutations_d74.csv`, ~353 000 transactions)

Le script `scripts/update-dvf.ts` automatise la mise à jour en téléchargeant le fichier national,
en extrayant uniquement les lignes du département 74, et en mettant à jour la référence dans le code.

---

## Calendrier de publication data.gouv.fr

| Millésime | Publication indicative |
|-----------|----------------------|
| S2-2024   | Juin 2025            |
| S1-2025   | Décembre 2025        |
| S2-2025   | Juin 2026            |
| Annuel    | Mi-année (N+1)       |

Vérifiez l'URL de référence : [data.gouv.fr — DVF géolocalisées](https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/)

---

## Commandes

### Test à blanc (sans modification)

```bash
cd dvf-immo-analyst-app
npx tsx scripts/update-dvf.ts --dry-run
```

### Mise à jour complète

```bash
cd dvf-immo-analyst-app
npx tsx scripts/update-dvf.ts
```

### Forcer l'écrasement même si fichier identique

```bash
cd dvf-immo-analyst-app
npx tsx scripts/update-dvf.ts --force
```

### Télécharger sans modifier csv-loader.ts

```bash
cd dvf-immo-analyst-app
npx tsx scripts/update-dvf.ts --no-update
```

---

## Ce que fait le script

1. **Télécharge** le fichier DVF géolocalisé national depuis :
   `https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres-geolocalisees/latest/dvf.csv.gz`

2. **Décompresse** à la volée (gzip → CSV) sans stocker le fichier complet sur disque.

3. **Filtre** uniquement les lignes dont `code_commune` commence par `74`.

4. **Compare** le nombre de lignes avec l'actuel. Si le nouveau fichier n'est pas plus complet,
   il s'arrête (sauf `--force`).

5. **Infère** la période couverte (année min/max de `date_mutation`) pour nommer le fichier :
   `{start}-{end}_mutations_d74.csv` — ex: `2014-2025_mutations_d74.csv`.

6. **Archive** l'ancien fichier en `.bak` avant remplacement.

7. **Met à jour** la référence dans `lib/dvf/csv-loader.ts` (pattern `DVF_CSV_PATH ?? "..."`)
   automatiquement.

8. **Affiche** un résumé : ancien nombre de lignes → nouveau nombre, delta, période.

---

## Vérification qualité avant remplacement

Après téléchargement (`--no-update`), vérifiez manuellement :

```bash
# Compter les lignes dept 74 dans le nouveau fichier
wc -l data/dvf/*_mutations_d74.csv

# Vérifier les dates extrêmes
head -5 data/dvf/*_mutations_d74.csv
grep "2025" data/dvf/*_mutations_d74.csv | tail -5

# Spot-check d'une commune connue (ex: Annecy = 74010)
grep "74010" data/dvf/*_mutations_d74.csv | head -10
```

Le nouveau fichier est valide si :
- Il contient **plus de lignes** que l'actuel (≥353 000 pour le dept 74)
- Les `date_mutation` les plus récentes sont **postérieures à 2024**
- La structure des colonnes est identique (même en-tête)

---

## Rollback en cas de problème

Le script archive automatiquement l'ancien fichier en `.bak` :

```bash
# Retrouver l'archive
ls dvf-immo-analyst-app/data/dvf/*.bak

# Restaurer
mv data/dvf/2014-2024_mutations_d74.csv.bak data/dvf/2014-2024_mutations_d74.csv

# Remettre la référence dans csv-loader.ts (manuellement)
# Chercher : DVF_CSV_PATH ?? "data/dvf/xxx.csv"
# Remettre l'ancien nom de fichier
```

Puis redémarrer le serveur Next.js pour vider le cache CSV.

---

## Après la mise à jour

1. **Redémarrer** l'application pour recharger le cache en mémoire :
   ```bash
   # Dans le workflow Replit : Stop → Start
   # Ou en CLI :
   pkill -f "next dev" && npm run dev
   ```

2. **Tester** une estimation sur une commune de référence (ex: Annecy, Chamonix)
   et vérifier que les dates DVF les plus récentes sont bien celles du nouveau millésime.

3. **Mettre à jour** le bloc Notaires dans `components/analysis/notaires-panel.tsx` :
   - Changer le libellé de fraîcheur (ex: "Fraîcheur S1-2025" → "Fraîcheur S2-2025")

---

## Variable d'environnement alternative

Si vous ne voulez pas modifier le code source, vous pouvez pointer vers un fichier custom via :

```env
# Dans .env.local
DVF_CSV_PATH=data/dvf/2014-2025_mutations_d74.csv
```

Le script met à jour directement le fallback dans le code, mais la variable d'environnement
a la priorité si elle est définie.
