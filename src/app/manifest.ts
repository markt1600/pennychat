// PWA manifest so "Add to Home Screen" installs Penny Chat as a proper
// full-screen app with the heart icon (iOS uses apple-icon; Android uses
// the 192/512 icons below).

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Penny Chat",
    short_name: "Penny Chat",
    description: "Your AI bestie — talk, type, or send pics. She remembers every chat.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5efe2",
    theme_color: "#c084fc",
    icons: [
      { src: "/pwa-icon-192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
