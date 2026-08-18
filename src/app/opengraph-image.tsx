// The link-preview card (WhatsApp, iMessage, socials). Next serves this at
// /opengraph-image and wires the og:image/twitter:image tags automatically.

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Penny Chat — your AI bestie";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          background: "linear-gradient(135deg, #ff9ac4 0%, #c084fc 55%, #818cf8 100%)",
        }}
      >
        <div style={{ display: "flex", fontSize: 150 }}>💖</div>
        <div
          style={{
            display: "flex",
            fontSize: 112,
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: -3,
          }}
        >
          Penny Chat
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 42,
            color: "rgba(255,255,255,0.96)",
          }}
        >
          your AI bestie — talk, type, send pics ✨
        </div>
      </div>
    ),
    size,
  );
}
