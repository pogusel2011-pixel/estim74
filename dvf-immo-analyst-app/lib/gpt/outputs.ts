import { GPTOutput, GPTActionType } from "@/types/gpt";

export function buildGPTOutput(
  actionType: GPTActionType,
  title: string,
  content: string,
  model: string,
  tokens?: number
): GPTOutput {
  return {
    id: crypto.randomUUID(),
    actionType,
    title,
    content,
    createdAt: new Date().toISOString(),
    model,
    tokens,
  };
}
