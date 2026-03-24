"use client";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div className="flex h-screen overflow-hidden bg-background print:block print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      </div>
      <div className={cn("flex flex-col flex-1 overflow-hidden transition-all duration-200 print:ml-0 print:overflow-visible print:h-auto print:block", sidebarOpen ? "ml-56" : "ml-14")}>
        <div className="print:hidden">
          <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        </div>
        <main className="flex-1 overflow-y-auto p-6 print:p-0 print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
