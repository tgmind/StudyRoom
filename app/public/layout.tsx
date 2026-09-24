import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Study Room — Live Group Study • Built for Consistency",
  description:
    "A focused virtual study platform for serious students who want accountability, live synchronization, and real study-time tracking without video-call distractions.",
  keywords: [
    "study room",
    "group study",
    "virtual study room",
    "JEE study room",
    "NEET study room",
    "UPSC study group",
    "study timer",
    "study accountability",
    "rivalry arena",
  ],
  openGraph: {
    title: "Study Room — Live Group Study",
    description: "Serious self-study in a focused, synchronized group environment.",
    type: "website",
    locale: "en_US",
    siteName: "Study Room",
  },
  twitter: {
    card: "summary_large_image",
    title: "Study Room — Study Together • Grow Together",
    description: "Silent, server-synchronized live virtual study rooms for serious students.",
  },
};

export const viewport: Viewport = {
  themeColor: "#071a3a",
  width: "device-width",
  initialScale: 1,
};

export default function PublicWebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="studyroom-public-site min-h-screen bg-white text-[#102c58] font-sans antialiased selection:bg-blue-100 selection:text-[#071a3a]">
      {children}
    </div>
  );
}
