"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ESTIM74 GlobalError]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "#f8fafc",
          }}
        >
          <div
            style={{
              maxWidth: "440px",
              width: "100%",
              background: "#fff",
              border: "1px solid #fee2e2",
              borderRadius: "12px",
              padding: "40px 32px",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                fontSize: "40px",
                marginBottom: "16px",
              }}
            >
              ⚠️
            </div>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: "600",
                color: "#1e293b",
                marginBottom: "8px",
              }}
            >
              Erreur critique de l&apos;application
            </h1>
            <p
              style={{
                color: "#64748b",
                fontSize: "14px",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              Une erreur inattendue a empêché le chargement de la page. Veuillez
              recharger l&apos;application.
            </p>
            {error.digest && (
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  marginBottom: "20px",
                }}
              >
                Réf : {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: "10px 24px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Recharger
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
