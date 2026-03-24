"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Code } from "lucide-react";

interface Props { data: unknown; title?: string; }

export function JSONPreview({ data, title = "Données brutes" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors">
        <span className="flex items-center gap-2"><Code className="h-3.5 w-3.5" />{title}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <pre className="p-4 text-xs overflow-x-auto bg-background text-muted-foreground max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
