"use client";
import React from "react";
import { GPTOutput } from "@/types/gpt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Info, Sparkles } from "lucide-react";

interface Props { output: GPTOutput; }

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) parts.push(<strong key={i++}>{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={i++}>{match[2]}</em>);
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let orderedItems: React.ReactNode[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length > 0) {
      nodes.push(<ul key={key++} className="my-2 space-y-0.5 pl-4 list-disc">{listItems}</ul>);
      listItems = [];
    }
    if (orderedItems.length > 0) {
      nodes.push(<ol key={key++} className="my-2 space-y-0.5 pl-4 list-decimal">{orderedItems}</ol>);
      orderedItems = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line) {
      flushList();
      continue;
    }

    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    const bullet = line.match(/^[-*•]\s+(.+)/);
    const numbered = line.match(/^\d+\.\s+(.+)/);

    if (h1 || h2 || h3) {
      flushList();
      const txt = (h1?.[1] ?? h2?.[1] ?? h3?.[1])!;
      const cls = h1
        ? "text-sm font-bold text-foreground mt-3 mb-1"
        : h2
        ? "text-sm font-bold text-foreground mt-3 mb-1"
        : "text-[13px] font-semibold text-foreground mt-2 mb-0.5";
      nodes.push(<p key={key++} className={cls}>{renderInline(txt)}</p>);
    } else if (bullet) {
      if (orderedItems.length > 0) flushList();
      listItems.push(<li key={key++} className="text-sm leading-relaxed">{renderInline(bullet[1])}</li>);
    } else if (numbered) {
      if (listItems.length > 0) flushList();
      orderedItems.push(<li key={key++} className="text-sm leading-relaxed">{renderInline(numbered[1])}</li>);
    } else {
      flushList();
      nodes.push(
        <p key={key++} className="text-sm leading-relaxed mb-1.5">{renderInline(line)}</p>
      );
    }
  }
  flushList();
  return <div className="space-y-0.5">{nodes}</div>;
}

export function GPTOutputCard({ output }: Props) {
  const isGpt = output.model && output.model !== "rule-based";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            {output.title}
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Badge
              variant={isGpt ? "default" : "outline"}
              className={`text-xs ${isGpt ? "bg-primary/10 text-primary border-primary/20" : ""}`}
            >
              {output.model}
            </Badge>
            {output.tokens && (
              <span className="text-xs text-muted-foreground">{output.tokens} tokens</span>
            )}
            <span className="text-xs text-muted-foreground">{formatDate(output.createdAt)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MarkdownContent text={output.content} />
        <div className="flex items-start gap-1.5 rounded-md border border-muted bg-muted/40 px-3 py-2">
          <Info className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            Analyse textuelle IA — Ne modifie pas l'estimation calculée. Les chiffres restent ceux issus des données DVF officielles.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
