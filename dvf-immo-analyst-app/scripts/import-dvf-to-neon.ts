/**
 * Import DVF CSV → Neon (table DvfMutation) — streaming mode
 *
 * Usage:
 *   cd dvf-immo-analyst-app
 *   npx tsx scripts/import-dvf-to-neon.ts
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 2000;

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val).trim().replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function parseOptionalNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseNumber(val);
  return n > 0 ? n : null;
}

type BatchRow = {
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

async function main() {
  const csvPath = path.join(
    process.cwd(),
    process.env.DVF_CSV_PATH ?? "data/dvf/2020-2025_mutations_d74.csv",
  );

  if (!fs.existsSync(csvPath)) {
    console.error(`[import-dvf] CSV introuvable: ${csvPath}`);
    process.exit(1);
  }

  // Resume mode: skip already-imported rows
  const resume = process.argv.includes("--resume");
  const existingCount = await prisma.dvfMutation.count();

  if (!resume || existingCount === 0) {
    console.log(`[import-dvf] Suppression ancienne table...`);
    await prisma.dvfMutation.deleteMany({});
    console.log(`[import-dvf] Table vidée. Début du streaming CSV: ${csvPath}`);
  } else {
    console.log(`[import-dvf] Reprise depuis la ligne ${existingCount} (${existingCount} déjà importées)`);
  }

  const skipRows = resume ? existingCount : 0;
  let inserted = 0;
  let totalRows = 0;
  let batch: BatchRow[] = [];

  const parser = fs.createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      delimiter: ",",
      cast: false,
    }),
  );

  for await (const row of parser) {
    const r = row as Record<string, unknown>;
    totalRows++;

    // Skip rows already imported in previous run
    if (totalRows <= skipRows) continue;

    batch.push({
      id_mutation: String(r.id_mutation ?? ""),
      date_mutation: String(r.date_mutation ?? ""),
      nature_mutation: String(r.nature_mutation ?? ""),
      valeur_fonciere: parseNumber(r.valeur_fonciere),
      adresse_numero: r.adresse_numero ? String(r.adresse_numero) : null,
      adresse_nom_voie: r.adresse_nom_voie ? String(r.adresse_nom_voie) : null,
      code_postal: r.code_postal
        ? String(r.code_postal).padStart(5, "0")
        : null,
      nom_commune: String(r.nom_commune ?? ""),
      code_commune: String(r.code_commune ?? ""),
      code_departement: String(r.code_departement ?? ""),
      id_parcelle: r.id_parcelle ? String(r.id_parcelle) : null,
      type_local: r.type_local ? String(r.type_local) : null,
      surface_reelle_bati: parseOptionalNumber(r.surface_reelle_bati),
      lot1_surface_carrez: parseOptionalNumber(r.lot1_surface_carrez),
      nombre_pieces_principales: parseOptionalNumber(r.nombre_pieces_principales),
      surface_terrain: parseOptionalNumber(r.surface_terrain),
      lat: r.latitude ? (parseNumber(r.latitude) || null) : null,
      lon: r.longitude ? (parseNumber(r.longitude) || null) : null,
    });

    if (totalRows % 10000 === 0) {
      process.stdout.write(`[import-dvf] ${totalRows} lignes lues, ${inserted} insérées...\n`);
    }

    if (batch.length >= BATCH_SIZE) {
      await prisma.dvfMutation.createMany({ data: batch });
      inserted += batch.length;
      batch = [];
      process.stdout.write(`[import-dvf] Batch inséré: ${inserted} total\n`);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await prisma.dvfMutation.createMany({ data: batch });
    inserted += batch.length;
  }

  const finalCount = await prisma.dvfMutation.count();
  console.log(`[import-dvf] ✅ Import terminé — ${inserted} insérées, ${finalCount} total dans Neon (${totalRows} lignes CSV lues)`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[import-dvf] Erreur:", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
