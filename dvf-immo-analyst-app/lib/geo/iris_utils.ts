/**
 * Utilitaires IRIS — correspondance communes/codes INSEE Haute-Savoie 74
 * Gère les communes fusionnées (ex: Annecy intègre Cran-Gévrier, Seynod, etc.)
 * Chargement optionnel depuis fichier Excel IRIS (xlsx), fallback hardcodé.
 */

import path from "path";
import fs from "fs";

interface InseeMapping {
  currentCode: string;
  name: string;
  postalCodes: string[];
  allCodes: string[]; // inclut les anciens codes des communes fusionnées
}

/**
 * Table hardcodée des fusions connues en Haute-Savoie (74).
 * Les codes "allCodes" permettent de retrouver les ventes DVF
 * enregistrées sous l'ANCIEN code INSEE (avant fusion).
 */
const HAUTE_SAVOIE_MERGERS: InseeMapping[] = [
  {
    currentCode: "74010",
    name: "annecy",
    postalCodes: ["74000", "74370", "74960", "74600"],
    allCodes: [
      "74010", // Annecy chef-lieu
      "74012", // Annecy-le-Vieux (fusionné 2017)
      "74059", // Cran-Gévrier (fusionné 2017)
      "74065", // Meythet (fusionné 2017)
      "74228", // Seynod (fusionné 2017)
      "74162", // Pringy (fusionné 2017)
    ],
  },
  {
    currentCode: "74108",
    name: "epagny metz-tessy",
    postalCodes: ["74330"],
    allCodes: [
      "74108", // Épagny (fusionné 2016 → Épagny Metz-Tessy)
      "74178", // Metz-Tessy
    ],
  },
  {
    currentCode: "74013",
    name: "argonay",
    postalCodes: ["74370"],
    allCodes: ["74013"],
  },
  {
    currentCode: "74042",
    name: "chamonix-mont-blanc",
    postalCodes: ["74400"],
    allCodes: ["74042"],
  },
  {
    currentCode: "74281",
    name: "thonon-les-bains",
    postalCodes: ["74200"],
    allCodes: ["74281"],
  },
  {
    currentCode: "74009",
    name: "annemasse",
    postalCodes: ["74100"],
    allCodes: ["74009"],
  },
  {
    currentCode: "74218",
    name: "sallanches",
    postalCodes: ["74700"],
    allCodes: ["74218"],
  },
  {
    currentCode: "74263",
    name: "saint-gervais-les-bains",
    postalCodes: ["74170"],
    allCodes: ["74263"],
  },
  {
    currentCode: "74016",
    name: "bonneville",
    postalCodes: ["74130"],
    allCodes: ["74016"],
  },
  {
    currentCode: "74080",
    name: "cluses",
    postalCodes: ["74300"],
    allCodes: ["74080"],
  },
  {
    currentCode: "74191",
    name: "megeve",
    postalCodes: ["74120"],
    allCodes: ["74191"],
  },
  {
    currentCode: "74264",
    name: "saint-jean-de-sixt",
    postalCodes: ["74450"],
    allCodes: ["74264"],
  },
  {
    currentCode: "74056",
    name: "contamines-montjoie",
    postalCodes: ["74170"],
    allCodes: ["74056"],
  },
];

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_']/g, " ")
    .trim();
}

let xlsxCache: Map<string, string[]> | null = null;

/**
 * Tente de charger le fichier Excel IRIS si présent.
 * Retourne un map nom_commune → [code_commune, ...]
 */
async function loadXlsxMappings(): Promise<Map<string, string[]>> {
  if (xlsxCache) return xlsxCache;
  xlsxCache = new Map();

  const candidates = [
    path.join(process.cwd(), "data", "iris", "reference_IRIS_geo2025.xlsx"),
    path.join(process.cwd(), "public", "iris", "reference_IRIS_geo2025.xlsx"),
    path.join(process.cwd(), "data", "iris.xlsx"),
  ];

  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) return xlsxCache;

  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    for (const row of rows) {
      const commune = normalize(String(row.NOM_COM ?? row.nom_commune ?? row.commune ?? ""));
      const code = String(row.CODE_COM ?? row.code_commune ?? row.code_insee ?? "").padStart(5, "0");
      if (!commune || !code || code.length < 5) continue;
      if (!xlsxCache.has(commune)) xlsxCache.set(commune, []);
      const codes = xlsxCache.get(commune)!;
      if (!codes.includes(code)) codes.push(code);
    }
    console.log(`[IRIS] Fichier xlsx chargé : ${rows.length} lignes, ${xlsxCache.size} communes`);
  } catch (err) {
    console.warn("[IRIS] Impossible de charger le fichier xlsx:", err);
  }

  return xlsxCache;
}

/**
 * Retourne tous les codes INSEE pertinents pour une commune et un code postal.
 * Gère les fusions de communes : Annecy 74000 → [74010, 74012, 74059, 74065, 74228, 74162]
 *
 * @param city - Nom de la commune (ex: "Annecy", "cran-gevrier")
 * @param postalCode - Code postal (ex: "74000")
 * @returns Tableau de codes INSEE à rechercher dans le DVF
 */
export async function getInseeCodesForCity(
  city: string,
  postalCode?: string
): Promise<string[]> {
  const normalizedCity = normalize(city);

  // 1. Lookup dans la table hardcodée (priorité aux fusions connues)
  const hardcoded = HAUTE_SAVOIE_MERGERS.find((m) => {
    if (normalize(m.name) === normalizedCity) return true;
    if (postalCode && m.postalCodes.includes(postalCode)) return true;
    return false;
  });
  if (hardcoded) return hardcoded.allCodes;

  // 2. Lookup dans le fichier xlsx si disponible
  const xlsxMap = await loadXlsxMappings();
  if (xlsxMap.size > 0) {
    const fromXlsx = xlsxMap.get(normalizedCity);
    if (fromXlsx?.length) return fromXlsx;
  }

  // 3. Fallback : appel API géo pour obtenir le code INSEE
  try {
    const query = postalCode ? `${city} ${postalCode}` : city;
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&type=municipality&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const code = data.features?.[0]?.properties?.citycode;
      if (code) return [code];
    }
  } catch {
    // pas critique
  }

  // 4. Aucun résultat — retourne un tableau vide (le caller utilisera lat/lon à la place)
  return [];
}

/**
 * Retourne le code INSEE courant d'une commune (résout les fusions).
 */
export function getCurrentInseeCode(oldCode: string): string {
  for (const m of HAUTE_SAVOIE_MERGERS) {
    if (m.allCodes.includes(oldCode) && oldCode !== m.currentCode) {
      return m.currentCode;
    }
  }
  return oldCode;
}
