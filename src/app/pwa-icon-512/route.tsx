// 512px home-screen icon for the PWA manifest (Android splash/maskable use).

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
          fontSize: 316,
        }}
      >
        💖
      </div>
    ),
    { width: 512, height: 512 },
  );
}
