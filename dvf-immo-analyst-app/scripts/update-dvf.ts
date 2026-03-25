#!/usr/bin/env tsx
/**
 * ESTIM'74 — Script de mise à jour du fichier DVF géolocalisé (département 74)
 *
 * Usage :  npx tsx scripts/update-dvf.ts
 * Options: --dry-run     Simule sans écrire ni modifier les fichiers
 *          --force       Écrase le fichier cible même si même taille
 *          --no-update   Télécharge et filtre sans mettre à jour csv-loader.ts
 *
 * Source : data.gouv.fr — DVF géolocalisées (toute France, toutes années)
 */

import https from "https";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import readline from "readline";

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────────

const DVF_SOURCE_URL =
  "https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres-geolocalisees/latest/dvf.csv.gz";

const DATA_DIR = path.join(process.cwd(), "data", "dvf");
const CSV_LOADER_PATH = path.join(process.cwd(), "lib", "dvf", "csv-loader.ts");

const DEPT_CODE = "74";
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const NO_CODE_UPDATE = process.argv.includes("--no-update");

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[DVF Update] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[DVF Update] ⚠  ${msg}`);
}

function ok(msg: string) {
  console.log(`[DVF Update] ✓ ${msg}`);
}

function err(msg: string) {
  console.error(`[DVF Update] ✗ ${msg}`);
}

/** Compte les lignes d'un fichier CSV local (hors en-tête). */
function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1); // -1 pour l'en-tête
}

/** Trouve le fichier DVF actuel dans DATA_DIR. */
function findCurrentCsvFile(): string | null {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  if (files.length === 0) return null;
  // Prend le plus récent par mtime
  const sorted = files
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return path.join(DATA_DIR, sorted[0].name);
}

/** Infère l'année de fin couverte à partir des données filtrées (dernière date_mutation). */
function inferYearRange(csvPath: string): { start: number; end: number } {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { start: 2014, end: new Date().getFullYear() };

  const headers = lines[0].split(",");
  const dateIdx = headers.indexOf("date_mutation");
  if (dateIdx < 0) return { start: 2014, end: new Date().getFullYear() };

  const years: number[] = [];
  for (let i = 1; i < Math.min(lines.length, 5000); i++) {
    const cols = lines[i].split(",");
    const dateStr = cols[dateIdx]?.trim();
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      years.push(parseInt(dateStr.slice(0, 4)));
    }
  }
  // Échantillon depuis la fin du fichier
  for (let i = Math.max(1, lines.length - 5000); i < lines.length; i++) {
    const cols = lines[i].split(",");
    const dateStr = cols[dateIdx]?.trim();
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      years.push(parseInt(dateStr.slice(0, 4)));
    }
  }

  if (years.length === 0) return { start: 2014, end: new Date().getFullYear() };
  return { start: Math.min(...years), end: Math.max(...years) };
}

// ──────────────────────────────────────────────────────────────────────────────
// TÉLÉCHARGEMENT + FILTRAGE EN STREAMING
// ──────────────────────────────────────────────────────────────────────────────

async function downloadAndFilter(tempPath: string): Promise<{ totalRows: number; filteredRows: number; header: string }> {
  return new Promise((resolve, reject) => {
    log(`Téléchargement depuis : ${DVF_SOURCE_URL}`);
    log("(Fichier volumineux — patience, cela peut prendre plusieurs minutes)");

    const writeStream = fs.createWriteStream(tempPath);
    let header = "";
    let totalRows = 0;
    let filteredRows = 0;
    let headerWritten = false;

    const req = https.get(DVF_SOURCE_URL, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirection sans Location header"));
        log(`Redirection → ${location}`);
        https.get(location, handleResponse);
        return;
      }
      handleResponse(res);
    });

    req.on("error", reject);

    function handleResponse(res: import("http").IncomingMessage) {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} — ${res.statusMessage}`));
      }

      const totalBytes = parseInt(res.headers["content-length"] ?? "0");
      log(`Taille annoncée : ${totalBytes > 0 ? `${(totalBytes / 1024 / 1024).toFixed(1)} Mo` : "inconnue"}`);

      const gunzip = zlib.createGunzip();
      res.pipe(gunzip);

      const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });
      let isFirstLine = true;
      let codeCommIdx = -1;

      rl.on("line", (line) => {
        if (isFirstLine) {
          header = line;
          const cols = line.split(",");
          codeCommIdx = cols.indexOf("code_commune");
          if (codeCommIdx < 0) {
            // Essaie "code_departement"
            codeCommIdx = cols.indexOf("code_departement");
          }
          if (codeCommIdx < 0) {
            warn(`Colonne code_commune introuvable dans l'en-tête — filtrage dept impossible`);
            warn(`En-tête : ${line.slice(0, 200)}`);
          }
          writeStream.write(line + "\n");
          headerWritten = true;
          isFirstLine = false;
          return;
        }

        if (!line.trim()) return;
        totalRows++;

        if (totalRows % 500_000 === 0) {
          log(`  ... ${totalRows.toLocaleString("fr-FR")} lignes lues, ${filteredRows.toLocaleString("fr-FR")} dept 74`);
        }

        // Filtrage département 74
        const cols = line.split(",");
        const codeVal = cols[codeCommIdx]?.trim() ?? "";
        const isDept74 = codeVal.startsWith(DEPT_CODE) || codeVal === DEPT_CODE;

        if (isDept74) {
          writeStream.write(line + "\n");
          filteredRows++;
        }
      });

      rl.on("close", () => {
        writeStream.end(() => {
          if (!headerWritten) {
            reject(new Error("Aucun contenu reçu — fichier vide ou format inattendu"));
          } else {
            resolve({ totalRows, filteredRows, header });
          }
        });
      });

      rl.on("error", reject);
      gunzip.on("error", reject);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// MISE À JOUR DE csv-loader.ts
// ──────────────────────────────────────────────────────────────────────────────

function updateCsvLoaderReference(newRelativePath: string) {
  if (!fs.existsSync(CSV_LOADER_PATH)) {
    warn(`csv-loader.ts introuvable à ${CSV_LOADER_PATH} — mise à jour manuelle requise`);
    return;
  }

  const content = fs.readFileSync(CSV_LOADER_PATH, "utf-8");
  // Remplace le chemin dans le pattern : DVF_CSV_PATH ?? "data/dvf/xxx.csv"
  const updated = content.replace(
    /DVF_CSV_PATH \?\? ["']([^"']+)["']/,
    `DVF_CSV_PATH ?? "${newRelativePath}"`
  );

  if (updated === content) {
    warn("Pattern non trouvé dans csv-loader.ts — vérifiez manuellement la référence au fichier CSV");
    return;
  }

  if (!DRY_RUN) {
    fs.writeFileSync(CSV_LOADER_PATH, updated, "utf-8");
    ok(`csv-loader.ts mis à jour → ${newRelativePath}`);
  } else {
    log(`[DRY-RUN] csv-loader.ts serait mis à jour → ${newRelativePath}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  ESTIM'74 — Mise à jour DVF géolocalisé département 74");
  console.log("════════════════════════════════════════════════════════\n");

  if (DRY_RUN) log("Mode DRY-RUN activé — aucun fichier ne sera modifié\n");

  // 1. Fichier actuel
  const currentFile = findCurrentCsvFile();
  const currentLines = currentFile ? countLines(currentFile) : 0;
  if (currentFile) {
    log(`Fichier actuel : ${path.basename(currentFile)} (${currentLines.toLocaleString("fr-FR")} transactions)`);
  } else {
    warn("Aucun fichier DVF trouvé dans data/dvf/ — première installation");
  }

  // 2. Préparer les chemins
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempPath = path.join(DATA_DIR, `_dvf_download_tmp_${Date.now()}.csv`);

  try {
    // 3. Télécharger et filtrer
    const { totalRows, filteredRows, header } = await downloadAndFilter(tempPath);

    log(`\nTéléchargement terminé :`);
    log(`  Lignes totales (France entière) : ${totalRows.toLocaleString("fr-FR")}`);
    log(`  Lignes dept 74 extraites        : ${filteredRows.toLocaleString("fr-FR")}`);

    if (filteredRows === 0) {
      err("Aucune ligne du département 74 trouvée — vérifiez le format du fichier source");
      fs.unlinkSync(tempPath);
      process.exit(1);
    }

    // 4. Vérification de fraîcheur (comparaison au nombre de lignes actuel)
    if (!FORCE && currentFile && filteredRows <= currentLines) {
      warn(
        `Le fichier téléchargé (${filteredRows.toLocaleString("fr-FR")} lignes) n'est pas plus complet que l'actuel (${currentLines.toLocaleString("fr-FR")} lignes).`
      );
      warn("Utilisez --force pour écraser quand même.");
      fs.unlinkSync(tempPath);
      process.exit(0);
    }

    // 5. Inférer la période couverte et générer le nom du nouveau fichier
    log("\nAnalyse de la période couverte...");
    const { start, end } = inferYearRange(tempPath);
    const newFileName = `${start}-${end}_mutations_d74.csv`;
    const newFilePath = path.join(DATA_DIR, newFileName);
    const newRelativePath = `data/dvf/${newFileName}`;

    log(`Période détectée : ${start}–${end}`);
    log(`Nouveau fichier  : ${newFileName}`);

    if (!DRY_RUN) {
      // Archiver l'ancien fichier si différent
      if (currentFile && path.basename(currentFile) !== newFileName) {
        const archivePath = currentFile + ".bak";
        fs.copyFileSync(currentFile, archivePath);
        log(`Ancien fichier archivé : ${path.basename(archivePath)}`);
      }

      // Déplacer le fichier temporaire vers le chemin final
      fs.renameSync(tempPath, newFilePath);
      ok(`Nouveau fichier sauvegardé : ${newRelativePath}`);

      // 6. Mettre à jour la référence dans csv-loader.ts
      if (!NO_CODE_UPDATE) {
        updateCsvLoaderReference(newRelativePath);
      }
    } else {
      log(`[DRY-RUN] Fichier temporaire : ${tempPath}`);
      log(`[DRY-RUN] Serait renommé en : ${newFilePath}`);
      if (!NO_CODE_UPDATE) {
        updateCsvLoaderReference(newRelativePath);
      }
      fs.unlinkSync(tempPath);
    }

    // 7. Résumé final
    const delta = filteredRows - currentLines;
    console.log("\n════════════════════════════════════════════════════════");
    console.log("  RÉSUMÉ DE LA MISE À JOUR");
    console.log("════════════════════════════════════════════════════════");
    console.log(`  Ancien fichier : ${currentFile ? path.basename(currentFile) : "—"}`);
    console.log(`  Ancien compte  : ${currentLines.toLocaleString("fr-FR")} transactions`);
    console.log(`  Nouveau fichier: ${newFileName}`);
    console.log(`  Nouveau compte : ${filteredRows.toLocaleString("fr-FR")} transactions`);
    console.log(`  Delta          : +${delta.toLocaleString("fr-FR")} nouvelles transactions`);
    console.log(`  Période        : ${start}–${end}`);
    if (DRY_RUN) console.log("\n  ⚠  Mode DRY-RUN — aucun fichier modifié");
    console.log("════════════════════════════════════════════════════════\n");

    if (!DRY_RUN) {
      log("Redémarrez le serveur Next.js pour recharger le cache CSV.");
    }
  } catch (e) {
    err(`Erreur : ${(e as Error).message}`);
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
      log("Fichier temporaire supprimé.");
    }
    process.exit(1);
  }
}

main();
