import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIOS-ARC | Bio-Impedance Telemetry & Pattern Explorer",
  description: "Tree and ESP32 node bio-impedance CSV time-series charting, pattern identification, and cross-dataset similarity matching.",
  keywords: ["bioimpedance", "telemetry", "ESP32", "BIOS-ARC", "CSV", "pattern matching"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-arc-bg text-arc-text font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
