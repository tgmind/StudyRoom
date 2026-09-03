import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { PwaInstallBanner } from "@/components/ui/PwaInstallBanner";
import { PwaRegister } from "@/components/ui/PwaRegister";
import { LaunchAnnouncementModal } from "@/components/ui/LaunchAnnouncementModal";

export const metadata: Metadata = {
  title: "StudyRoom — Minimalist Live Group Study PWA",
  description: "High-accountability minimalist live group study Progressive Web App.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192x192.png",
  },
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
      <body className="h-full min-h-screen flex flex-col antialiased bg-[#090a0f] text-foreground selection:bg-zinc-800 selection:text-zinc-100">
        <PwaRegister />
        <OfflineBanner />
        <PwaInstallBanner />
        <LaunchAnnouncementModal />
        <div className="flex-1 w-full flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
