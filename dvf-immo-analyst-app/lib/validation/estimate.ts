import { z } from "zod";
import { propertySchema } from "./property";

export const estimateRequestSchema = z.object({
  property: propertySchema,
  radiusKm: z.number().min(0.1).max(10).default(0.5),
  monthsBack: z.number().min(6).max(60).default(24),
  excludeOutliers: z.boolean().default(true),
  includeListings: z.boolean().default(true),
});

export type EstimateRequest = z.infer<typeof estimateRequestSchema>;
