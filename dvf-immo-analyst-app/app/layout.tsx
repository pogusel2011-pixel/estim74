import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "ESTIM'74",
  description: "Outil d'estimation immobilière terrain — Haute-Savoie (74)",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ESTIM'74",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <AppShell>{children}</AppShell>
        <ServiceWorkerRegister />
        <InstallPrompt />
        <Analytics />
      </body>
    </html>
  );
}
