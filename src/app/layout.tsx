import type { Metadata, Viewport } from "next";
import { Fraunces, Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-body",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const APP_NAME = "Penny Chat";
const DESCRIPTION = "Your AI bestie — talk, type, or send pics. She remembers every chat. 💖";
// Absolute base for link-preview URLs (WhatsApp needs absolute og:image).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pennychat.marktan.ai";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: APP_NAME,
  description: DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    title: `${APP_NAME} 💖`,
    description: DESCRIPTION,
    siteName: APP_NAME,
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} 💖`,
    description: DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
