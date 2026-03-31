import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/layout/refresh-button";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-4 shrink-0 z-20">
      <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden">
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex-1" />
      <p className="text-xs text-muted-foreground">
        Haute-Savoie (74) • DVF 2020–2025 + Données récentes
      </p>
      <div className="h-5 w-px bg-border" />
      <RefreshButton />
    </header>
  );
}
