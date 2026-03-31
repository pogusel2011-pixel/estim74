import { z } from "zod";

const optionalString = z.string().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

const optionalPostalCode = z
  .union([z.string().regex(/^\d{5}$/, "Code postal invalide"), z.literal(""), z.undefined()])
  .transform((v) => (v === "" ? undefined : v));

/**
 * Preprocess helper: converts NaN (produced by react-hook-form valueAsNumber on empty inputs)
 * to undefined, so Zod optional number fields don't reject empty inputs.
 */
function nanToUndefined(v: unknown): unknown {
  if (typeof v === "number" && isNaN(v)) return undefined;
  return v;
}

const optionalInt = (min: number, max: number) =>
  z.preprocess(nanToUndefined, z.number().int().min(min).max(max).optional());

const optionalFloat = (min: number) =>
  z.preprocess(nanToUndefined, z.number().min(min).optional());

export const propertySchema = z.object({
  address: optionalString,
  postalCode: optionalPostalCode,
  city: z.string().min(1, "La commune est requise"),
  lat: z.preprocess(nanToUndefined, z.number().optional()),
  lng: z.preprocess(nanToUndefined, z.number().optional()),
  irisCode: z.string().optional(),

  propertyType: z.enum(["APARTMENT", "HOUSE", "LAND", "COMMERCIAL"]),
  surface: z.preprocess(
    nanToUndefined,
    z.number({ required_error: "Surface requise", invalid_type_error: "Surface requise" })
      .min(1, "Surface requise")
      .max(100000)
  ),
  rooms:      optionalInt(1, 50),
  bedrooms:   optionalInt(0, 30),
  floor:      optionalInt(-2, 200),
  totalFloors: optionalInt(1, 200),
  landSurface: optionalFloat(0),
  yearBuilt:  optionalInt(1800, new Date().getFullYear() + 2),
  condition: z.enum(["TO_RENOVATE", "AVERAGE", "GOOD", "EXCELLENT"]).default("AVERAGE"),

  dpeLetter: z.enum(["A", "B", "C", "D", "E", "F", "G"]).optional(),
  ghgGrade:  z.enum(["A", "B", "C", "D", "E", "F", "G"]).optional(),

  hasParking:  z.boolean().default(false),
  hasGarage:   z.boolean().default(false),
  hasBalcony:  z.boolean().default(false),
  hasTerrace:  z.boolean().default(false),
  hasCellar:   z.boolean().default(false),
  hasPool:     z.boolean().default(false),
  hasElevator: z.boolean().default(false),
  orientation: z.enum(["N", "NE", "E", "SE", "S", "SO", "O", "NO"]).optional(),
  view: z.string().optional(),
  mitoyennete: z.enum(["individuelle", "mitoyenne_un_cote", "mitoyenne_deux_cotes"]).optional(),

  // Destinataire de l'avis de valeur (optionnel)
  clientFirstName: z.string().optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
  clientLastName:  z.string().optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
  clientEmail:     z.string().optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
  clientPhone:     z.string().optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;
