import { PropertyInput } from "./property";
import { DVFStats, DVFComparable } from "./dvf";
import { ActiveListing } from "./listing";
import { ValuationResult } from "./valuation";
import { GPTOutput } from "./gpt";

export type AnalysisStatus = "DRAFT" | "COMPLETE" | "ARCHIVED";

export interface Analysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: AnalysisStatus;
  property: PropertyInput;
  dvfStats?: DVFStats;
  dvfComparables?: DVFComparable[];
  listings?: ActiveListing[];
  valuation?: ValuationResult;
  gptOutputs?: GPTOutput[];
  marketReading?: MarketReading;
  notes?: string;
}

export interface MarketReading {
  trend: "hausse" | "stable" | "baisse";
  trendPercent?: number;
  supplyDemand: "tendu" | "equilibre" | "detendu";
  avgDaysOnMarket?: number;
  commentary: string;
  notairesData?: {
    annualChange?: number;
    quarterlyChange?: number;
    volumeIndex?: number;
    source: string;
  };
}

export interface AnalysisSummary {
  id: string;
  createdAt: string;
  address: string;
  city: string;
  propertyType: string;
  surface: number;
  valuationMid?: number;
  confidence?: number;
  confidenceLabel?: string;
  status: AnalysisStatus;
  notes?: string;
}
