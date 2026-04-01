"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Plus, BarChart3, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/analyses", label: "Analyses", icon: FileText },
  { href: "/analyses/new", label: "Nouvelle estimation", icon: Plus },
];

interface SidebarProps { open: boolean; onToggle: () => void; }

export function Sidebar({ open, onToggle }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className={cn("fixed left-0 top-0 h-full bg-card border-r border-border flex flex-col z-30 transition-all duration-200", open ? "w-56" : "w-14")}>
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b border-border shrink-0">
        <BarChart3 className="h-5 w-5 text-primary shrink-0" />
        {open && <span className="ml-2 font-bold text-sm tracking-tight text-foreground truncate">ESTIM&#39;74</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Icon className="h-4 w-4 shrink-0" />
              {open && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Toggle */}
      <div className="p-2 border-t border-border">
        <Button variant="ghost" size="sm" onClick={onToggle} className="w-full justify-center">
          <ChevronLeft className={cn("h-4 w-4 transition-transform", !open && "rotate-180")} />
        </Button>
      </div>
    </aside>
  );
}
