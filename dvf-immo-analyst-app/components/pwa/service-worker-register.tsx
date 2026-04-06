"use client";
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        console.log("[SW] Registered:", reg.scope);

        // Immediately check for a newer SW on every page load / PWA open.
        // This ensures the installed PWA always picks up the latest version.
        reg.update().catch(() => {});

        // When a new SW is waiting, activate it right away without waiting
        // for all tabs to close (we already call skipWaiting in the SW).
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "activated" &&
              navigator.serviceWorker.controller
            ) {
              // New SW has taken over — reload so the user gets the fresh bundle
              window.location.reload();
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
  }, []);

  return null;
}
