export type GPTActionType =
  | "MARKET_ANALYSIS"
  | "NEGOTIATION_ADVICE"
  | "INVESTMENT_POTENTIAL"
  | "PROPERTY_DESCRIPTION"
  | "RISK_ASSESSMENT";

export interface GPTOutput {
  id: string;
  actionType: GPTActionType;
  title: string;
  content: string;
  createdAt: string;
  model: string;
  tokens?: number;
}

export interface GPTDossier {
  property: Record<string, unknown>;
  valuation: Record<string, unknown>;
  dvfContext: Record<string, unknown>;
  marketContext: Record<string, unknown>;
}
