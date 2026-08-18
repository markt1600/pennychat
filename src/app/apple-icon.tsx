// Home-screen icon for iOS (iOS rounds the corners itself).

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 110,
        }}
      >
        💖
      </div>
    ),
    size,
  );
}
