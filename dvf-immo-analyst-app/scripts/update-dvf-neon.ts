#!/usr/bin/env tsx
/**
 * ESTIM'74 — Mise à jour annuelle DVF → Neon PostgreSQL
 *
 * Ce script télécharge la dernière version du fichier DVF géolocalisé
 * (département 74) depuis data.gouv.fr, compare avec les données déjà
 * présentes dans Neon, et importe UNIQUEMENT les nouvelles transactions.
 *
 * Usage :
 *   cd dvf-immo-analyst-app
 *   npx tsx scripts/update-dvf-neon.ts
 *   npx tsx scripts/update-dvf-neon.ts --dry-run   # Simule sans écrire
 *
 * Le script déduplique par id_mutation : aucune double insertion.
 * Traitement par lots de 1 000 lignes pour éviter les timeouts.
 */

import https from "https";
import http from "http";
import zlib from "zlib";
import readline from "readline";
import { PrismaClient } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────────────────────────

const DVF_URL =
  "https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres-geolocalisees/latest/dvf.csv.gz";

const DEPT_CODE = "74";
const BATCH_SIZE = 1_000;
const DRY_RUN = process.argv.includes("--dry-run");

const prisma = new PrismaClient({ log: [] });

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`[dvf:neon] ${msg}`); }
function ok(msg: string)  { console.log(`[dvf:neon] ✅ ${msg}`); }
function warn(msg: string){ console.warn(`[dvf:neon] ⚠  ${msg}`); }
function fail(msg: string){ console.error(`[dvf:neon] ❌ ${msg}`); }

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).trim().replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function parseOptional(val: unknown): number | null {
  const n = parseNumber(val);
  return n > 0 ? n : null;
}

type Row = {
  id_mutation: string;
  date_mutation: string;
  nature_mutation: string;
  valeur_fonciere: number;
  adresse_numero: string | null;
  adresse_nom_voie: string | null;
  code_postal: string | null;
  nom_commune: string;
  code_commune: string;
  code_departement: string;
  id_parcelle: string | null;
  type_local: string | null;
  surface_reelle_bati: number | null;
  lot1_surface_carrez: number | null;
  nombre_pieces_principales: number | null;
  surface_terrain: number | null;
  lat: number | null;
  lon: number | null;
};

// ──────────────────────────────────────────────────────────────────────────────
// STEP 1 — Récupère les id_mutation déjà en base et la date max
// ──────────────────────────────────────────────────────────────────────────────

async function getDbState(): Promise<{ count: number; maxDate: string | null; existingIds: Set<string> }> {
  log("Interrogation de Neon...");
  const count = await prisma.dvfMutation.count();

  const maxRow = await prisma.dvfMutation.findFirst({
    orderBy: { date_mutation: "desc" },
    select: { date_mutation: true },
  });
  const maxDate = maxRow?.date_mutation ?? null;

  // On charge seulement les id_mutation récents (12 derniers mois) pour la dédup
  // pour éviter de charger 350k ids en mémoire si la base est déjà pleine
  const cutoff = maxDate
    ? new Date(maxDate.slice(0, 10))
    : new Date("1970-01-01");
  cutoff.setMonth(cutoff.getMonth() - 12);

  const recent = await prisma.dvfMutation.findMany({
    where: { date_mutation: { gte: cutoff.toISOString().slice(0, 10) } },
    select: { id_mutation: true },
  });

  const existingIds = new Set(recent.map((r) => r.id_mutation));

  log(`  → ${count.toLocaleString("fr-FR")} transactions en base`);
  log(`  → Date max : ${maxDate ?? "aucune"}`);
  log(`  → ${existingIds.size.toLocaleString("fr-FR")} id_mutation récents chargés pour dédup`);

  return { count, maxDate, existingIds };
}

// ──────────────────────────────────────────────────────────────────────────────
// STEP 2 — Téléchargement streaming + import différentiel
// ──────────────────────────────────────────────────────────────────────────────

async function downloadAndImport(
  existingIds: Set<string>,
  maxDate: string | null
): Promise<{ totalRead: number; dept74: number; newInserted: number; newMaxDate: string | null }> {
  return new Promise((resolve, reject) => {
    log(`Téléchargement : ${DVF_URL}`);
    log("(Fichier volumineux — patience, plusieurs minutes possibles)");

    let totalRead = 0;
    let dept74 = 0;
    let newInserted = 0;
    let newMaxDate: string | null = maxDate;

    let headers: string[] = [];
    let codeCommIdx = -1;
    let dateIdx = -1;
    let idMutIdx = -1;
    let isFirstLine = true;

    let batch: Row[] = [];

    async function flushBatch() {
      if (batch.length === 0) return;
      if (!DRY_RUN) {
        await prisma.dvfMutation.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
      newInserted += batch.length;
      batch = [];
    }

    function makeRequest(url: string) {
      const mod = url.startsWith("https") ? https : http;
      const req = (mod as typeof https).get(url, async (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (!loc) { reject(new Error("Redirection sans Location")); return; }
          log(`Redirection → ${loc}`);
          makeRequest(loc);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const gunzip = zlib.createGunzip();
        res.pipe(gunzip);

        const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });

        rl.on("line", async (line) => {
          if (!line.trim()) return;

          if (isFirstLine) {
            headers = line.split(",");
            codeCommIdx = headers.indexOf("code_commune");
            if (codeCommIdx < 0) codeCommIdx = headers.indexOf("code_departement");
            dateIdx    = headers.indexOf("date_mutation");
            idMutIdx   = headers.indexOf("id_mutation");
            isFirstLine = false;
            if (codeCommIdx < 0 || dateIdx < 0 || idMutIdx < 0) {
              warn(`Colonnes manquantes dans l'en-tête. Vérifiez le format DVF.`);
            }
            return;
          }

          totalRead++;
          if (totalRead % 500_000 === 0) {
            log(`  ... ${totalRead.toLocaleString("fr-FR")} lues, ${dept74.toLocaleString("fr-FR")} dept 74, ${newInserted.toLocaleString("fr-FR")} nouvelles`);
          }

          const cols = line.split(",");
          const codeVal = cols[codeCommIdx]?.trim() ?? "";
          if (!codeVal.startsWith(DEPT_CODE) && codeVal !== DEPT_CODE) return;

          dept74++;

          const idMut  = cols[idMutIdx]?.trim() ?? "";
          const dateMut = cols[dateIdx]?.trim() ?? "";

          // Déduplication — skip si déjà en base
          if (existingIds.has(idMut)) return;
          // Skip si date ≤ maxDate (ne peut être nouvelle que si > maxDate ou pas de maxDate)
          // Mais on garde quand même si id_mutation pas vu, car certaines mutations
          // peuvent être rétroactives. La dédup par id_mutation est suffisante.

          // Mise à jour de newMaxDate
          if (!newMaxDate || dateMut > newMaxDate) newMaxDate = dateMut;

          const row: Row = {
            id_mutation: idMut,
            date_mutation: dateMut,
            nature_mutation: cols[headers.indexOf("nature_mutation")]?.trim() ?? "",
            valeur_fonciere: parseNumber(cols[headers.indexOf("valeur_fonciere")]),
            adresse_numero: cols[headers.indexOf("adresse_numero")]?.trim() || null,
            adresse_nom_voie: cols[headers.indexOf("adresse_nom_voie")]?.trim() || null,
            code_postal: cols[headers.indexOf("code_postal")]?.trim()?.padStart(5, "0") || null,
            nom_commune: cols[headers.indexOf("nom_commune")]?.trim() ?? "",
            code_commune: cols[headers.indexOf("code_commune")]?.trim() ?? "",
            code_departement: cols[headers.indexOf("code_departement")]?.trim() ?? "",
            id_parcelle: cols[headers.indexOf("id_parcelle")]?.trim() || null,
            type_local: cols[headers.indexOf("type_local")]?.trim() || null,
            surface_reelle_bati: parseOptional(cols[headers.indexOf("surface_reelle_bati")]),
            lot1_surface_carrez: parseOptional(cols[headers.indexOf("lot1_surface_carrez")]),
            nombre_pieces_principales: parseOptional(cols[headers.indexOf("nombre_pieces_principales")]),
            surface_terrain: parseOptional(cols[headers.indexOf("surface_terrain")]),
            lat: parseOptional(cols[headers.indexOf("latitude")]),
            lon: parseOptional(cols[headers.indexOf("longitude")]),
          };

          batch.push(row);
          existingIds.add(idMut); // évite les doublons dans le même fichier

          if (batch.length >= BATCH_SIZE) {
            rl.pause();
            await flushBatch();
            rl.resume();
          }
        });

        rl.on("close", async () => {
          await flushBatch();
          resolve({ totalRead, dept74, newInserted, newMaxDate });
        });

        rl.on("error", reject);
        gunzip.on("error", reject);
      });
      req.on("error", reject);
    }

    makeRequest(DVF_URL);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  ESTIM'74 — Mise à jour DVF → Neon (différentielle)");
  console.log("══════════════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    warn("Mode DRY-RUN : aucune écriture en base\n");
  }

  try {
    // 1. État initial de la base
    const { count: countBefore, maxDate, existingIds } = await getDbState();

    // 2. Téléchargement + import
    const { totalRead, dept74, newInserted, newMaxDate } = await downloadAndImport(existingIds, maxDate);

    // 3. Compte final
    const countAfter = DRY_RUN ? countBefore : await prisma.dvfMutation.count();

    // 4. Rapport
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("  RAPPORT DE MISE À JOUR");
    console.log("══════════════════════════════════════════════════════════════");
    console.log(`  Lignes lues (France entière) : ${totalRead.toLocaleString("fr-FR")}`);
    console.log(`  Lignes dept 74 trouvées      : ${dept74.toLocaleString("fr-FR")}`);
    console.log(`  Nouvelles transactions        : +${newInserted.toLocaleString("fr-FR")}`);
    console.log(`  Total en base avant           : ${countBefore.toLocaleString("fr-FR")}`);
    console.log(`  Total en base après           : ${countAfter.toLocaleString("fr-FR")}`);
    console.log(`  Ancienne date max             : ${maxDate ?? "—"}`);
    console.log(`  Nouvelle date max             : ${newMaxDate ?? "—"}`);
    if (DRY_RUN) {
      console.log("\n  ⚠  DRY-RUN — aucune écriture effectuée");
    }
    console.log("══════════════════════════════════════════════════════════════\n");

    if (newInserted === 0) {
      ok("Base déjà à jour — aucune nouvelle transaction.");
    } else {
      ok(`${newInserted.toLocaleString("fr-FR")} nouvelles transactions importées.`);
    }
  } catch (e) {
    fail(`Erreur : ${(e as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

main();
