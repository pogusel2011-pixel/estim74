import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          borderRadius: 36,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 50,
            fontWeight: 800,
            letterSpacing: "-1px",
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          ESTIM
        </span>
        <span
          style={{
            color: "white",
            fontSize: 68,
            fontWeight: 900,
            letterSpacing: "-3px",
            lineHeight: 1,
          }}
        >
          74
        </span>
      </div>
    ),
    { ...size }
  );
}
