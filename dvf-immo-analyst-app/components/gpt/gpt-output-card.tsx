import { GPTOutput } from "@/types/gpt";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface Props { output: GPTOutput; }

export function GPTOutputCard({ output }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            {output.title}
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-xs">{output.model}</Badge>
            {output.tokens && <span className="text-xs text-muted-foreground">{output.tokens} tokens</span>}
            <span className="text-xs text-muted-foreground">{formatDate(output.createdAt)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none text-foreground">
          {output.content.split("\n").map((line, i) => (
            <p key={i} className="mb-2 last:mb-0 text-sm leading-relaxed">{line}</p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
