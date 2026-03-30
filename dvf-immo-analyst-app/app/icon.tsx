import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#2563EB",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-1px",
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
