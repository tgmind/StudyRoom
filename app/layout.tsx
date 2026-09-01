import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { PwaInstallBanner } from "@/components/ui/PwaInstallBanner";

export const metadata: Metadata = {
  title: "StudyRoom — Minimalist Live Group Study PWA",
  description: "High-accountability minimalist live group study Progressive Web App.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StudyRoom",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full bg-background text-foreground">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="h-full flex flex-col antialiased bg-background text-foreground selection:bg-zinc-800 selection:text-zinc-100">
        <OfflineBanner />
        <PwaInstallBanner />
        <main className="flex-1 w-full max-w-xl mx-auto flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
