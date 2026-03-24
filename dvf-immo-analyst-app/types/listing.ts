export interface ActiveListing {
  id: string;
  source: string;
  url?: string;
  title: string;
  address?: string;
  city: string;
  postalCode?: string;
  inseeCode?: string;
  propertyType: string;
  surface: number;
  rooms?: number;
  bedrooms?: number;
  floor?: number;
  price: number;
  pricePsm: number;
  description?: string;
  publishedAt?: string;
  lastEventDate?: string;
  photos?: string[];
  pictureUrl?: string;
  features?: string[];
  dpe?: string;
  lat?: number;
  lng?: number;
  distance?: number;
  publisher?: { name?: string; phone?: string };
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
