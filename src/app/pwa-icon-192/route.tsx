// 192px home-screen icon for the PWA manifest (Android).

import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET() {
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
          fontSize: 118,
        }}
      >
        💖
      </div>
    ),
    { width: 192, height: 192 },
  );
}
