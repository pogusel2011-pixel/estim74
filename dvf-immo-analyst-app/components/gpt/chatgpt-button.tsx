"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Check, Copy } from "lucide-react";
import { GPT_URL } from "@/lib/gpt/chatgpt-prompt-builder";

interface Props {
  promptText: string;
  variant?: "default" | "outline" | "secondary";
  size?: "sm" | "default";
  showInstructions?: boolean;
}

export function ChatGPTButton({
  promptText,
  variant = "default",
  size = "sm",
  showInstructions = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      window.open(GPT_URL, "_blank", "noopener,noreferrer");
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // Fallback si clipboard API indisponible (contexte non-sécurisé)
      setError("Copiez manuellement le prompt — accès presse-papier refusé");
      window.open(GPT_URL, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={
          variant === "default"
            ? "gap-2 bg-[#10a37f] hover:bg-[#0d8f6f] text-white border-0"
            : "gap-2"
        }
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        )}
        {copied ? "Prompt copié !" : "Ouvrir dans DVF Immo Analyst"}
      </Button>

      {/* Instruction affichée après clic */}
      {copied && showInstructions && (
        <p className="text-xs text-emerald-700 flex items-start gap-1.5 animate-in fade-in slide-in-from-top-1">
          <Check className="h-3 w-3 mt-0.5 shrink-0" />
          Prompt copié — colle-le dans la conversation ChatGPT pour générer le rapport
        </p>
      )}

      {error && (
        <p className="text-xs text-amber-700 flex items-start gap-1.5">
          <Copy className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
