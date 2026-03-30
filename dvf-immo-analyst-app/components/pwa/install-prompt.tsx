"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "estim74-pwa-dismissed";

export function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setVisible(false);
    if (outcome === "accepted") {
      localStorage.setItem(STORAGE_KEY, "true");
    }
  }

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-xs z-50 bg-white border rounded-xl shadow-xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Installer ESTIM&apos;74</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Accédez directement à l&apos;appli depuis votre écran d&apos;accueil
        </p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <Button
          size="sm"
          onClick={handleInstall}
          className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Download className="h-3 w-3" />
          Installer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-xs justify-center"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
