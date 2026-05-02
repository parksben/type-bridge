import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TypeBridge — Speak via Feishu, Type Anywhere",
  description:
    "macOS menu bar app that forwards Feishu bot messages directly into your focused input field. Voice-driven desktop typing.",
  metadataBase: new URL("https://typebridge.parksben.xyz"),
  openGraph: {
    title: "TypeBridge",
    description:
      "Speak via Feishu, Type Anywhere. A macOS menu bar app that bridges Feishu messages into your desktop input.",
    url: "https://typebridge.parksben.xyz",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.bunny.net" />
        <link
          href="https://fonts.bunny.net/css?family=geist:400,500,600|instrument-serif:400i&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
