import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "remixicon/fonts/remixicon.css";
import "./globals.css";
import Providers from "@/components/hyzr/Providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://hyzr.trade"),
  title: "HYZR | Trade Everything",
  description: "A fast, social perpetual trading terminal for crypto, equities, and commodities.",
  applicationName: "Hyzr",
  keywords: [
    "Hyzr",
    "Perpetual Trading",
    "Crypto Trading",
    "Equity Perpetuals",
    "Commodity Perpetuals",
    "Hyperliquid",
    "Crypto Perpetuals",
  ],
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/favicon.png",
  },
  openGraph: {
    title: "HYZR | Trade Everything",
    description:
      "A fast, social perpetual trading terminal for crypto, equities, and commodities.",
    siteName: "HYZR",
    images: [{ url: "/hyzr-og.png", width: 400, height: 400 }],
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@hyzrtrade",
    images: ["/hyzr-og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#090a0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
