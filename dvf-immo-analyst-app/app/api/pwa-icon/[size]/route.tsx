import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: { size: string } }
) {
  const size = parseInt(params.size, 10) || 192;
  const labelSize = Math.round(size * 0.28);
  const numSize = Math.round(size * 0.38);
  const pad = Math.round(size * 0.08);

  return new ImageResponse(
    (
      <div
        style={{
          background: "#2563EB",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: size * 0.18,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: labelSize,
            fontWeight: 800,
            letterSpacing: "-1px",
            lineHeight: 1,
            marginBottom: pad * 0.3,
          }}
        >
          ESTIM
        </span>
        <span
          style={{
            color: "white",
            fontSize: numSize,
            fontWeight: 900,
            letterSpacing: "-2px",
            lineHeight: 1,
          }}
        >
          74
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
