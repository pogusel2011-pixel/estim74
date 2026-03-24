export interface ActiveListing {
  id: string;
  source: string;
  url?: string;
  title: string;
  address?: string;
  city: string;
  postalCode?: string;
  propertyType: string;
  surface: number;
  rooms?: number;
  floor?: number;
  price: number;
  pricePsm: number;
  description?: string;
  publishedAt?: string;
  photos?: string[];
  features?: string[];
  dpe?: string;
  lat?: number;
  lng?: number;
}

export interface QualitativeComparison {
  listingId: string;
  subjectScore: number;
  listingScore: number;
  delta: number;
  adjustedPrice: number;
  factors: {
    label: string;
    impact: "positive" | "negative" | "neutral";
    value: string;
  }[];
}
