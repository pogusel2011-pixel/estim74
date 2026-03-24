import { z } from "zod";

const optionalString = z.string().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

const optionalPostalCode = z
  .union([z.string().regex(/^\d{5}$/, "Code postal invalide"), z.literal(""), z.undefined()])
  .transform((v) => (v === "" ? undefined : v));

export const propertySchema = z.object({
  address: optionalString,
  postalCode: optionalPostalCode,
  city: optionalString,
  lat: z.number().optional(),
  lng: z.number().optional(),
  irisCode: z.string().optional(),

  propertyType: z.enum(["APARTMENT", "HOUSE", "LAND", "COMMERCIAL"]),
  surface: z.number().min(1, "Surface requise").max(100000),
  rooms: z.number().int().min(1).max(50).optional(),
  bedrooms: z.number().int().min(0).max(30).optional(),
  floor: z.number().int().min(-2).max(200).optional(),
  totalFloors: z.number().int().min(1).max(200).optional(),
  landSurface: z.number().min(0).optional(),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear() + 2).optional(),
  condition: z.enum(["TO_RENOVATE", "AVERAGE", "GOOD", "EXCELLENT"]).default("AVERAGE"),

  dpeLetter: z.enum(["A", "B", "C", "D", "E", "F", "G"]).optional(),
  ghgGrade: z.enum(["A", "B", "C", "D", "E", "F", "G"]).optional(),

  hasParking: z.boolean().default(false),
  hasGarage: z.boolean().default(false),
  hasBalcony: z.boolean().default(false),
  hasTerrace: z.boolean().default(false),
  hasCellar: z.boolean().default(false),
  hasPool: z.boolean().default(false),
  hasElevator: z.boolean().default(false),
  orientation: z.enum(["N", "NE", "E", "SE", "S", "SO", "O", "NO"]).optional(),
  view: z.string().optional(),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;
