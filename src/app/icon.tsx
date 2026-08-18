// Favicon, generated to match the link-preview card.

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ff9ac4 0%, #c084fc 60%, #818cf8 100%)",
          borderRadius: 14,
          fontSize: 42,
        }}
      >
        💖
      </div>
    ),
    size,
  );
}
