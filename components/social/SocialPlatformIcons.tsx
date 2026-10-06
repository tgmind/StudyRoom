import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

export function WhatsAppIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c2.2 0 4.27.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.45 0-2.86-.38-4.11-1.11l-.29-.17-3.06.8.82-2.98-.19-.3a8.2 8.2 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.64c-.25-.12-1.47-.72-1.7-.8-.23-.08-.39-.12-.56.12-.17.25-.64.8-.79.97-.15.17-.3.19-.55.07-.25-.12-1.06-.39-2.02-1.25-.75-.67-1.25-1.49-1.4-1.74-.15-.25-.02-.38.1-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.12.17 1.78 2.71 4.3 3.8.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.15-1.18-.06-.1-.23-.16-.47-.28z" />
    </svg>
  );
}

export function TelegramIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
    </svg>
  );
}

export function YouTubeIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function InstagramIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export function TwitterXIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function RedditIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.609a1.24 1.24 0 0 1 1.108-.695zM8.5 13.5c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm7 0c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm-5.466 4.31a.49.49 0 0 0-.08.686c.642.793 1.597 1.18 2.046 1.18.45 0 1.405-.387 2.047-1.18a.49.49 0 1 0-.766-.62c-.44.544-.988.8-1.281.8-.293 0-.84-.256-1.28-.8a.49.49 0 0 0-.686-.066z" />
    </svg>
  );
}

export function GenericLinkIcon({ className = "w-4 h-4", size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function SocialPlatformIcon({
  platform,
  className = "w-4 h-4",
  size = 16,
}: {
  platform: string;
  className?: string;
  size?: number;
}) {
  const norm = (platform || "").toLowerCase().trim();
  switch (norm) {
    case "whatsapp":
      return <WhatsAppIcon className={className} size={size} />;
    case "telegram":
      return <TelegramIcon className={className} size={size} />;
    case "youtube":
      return <YouTubeIcon className={className} size={size} />;
    case "instagram":
      return <InstagramIcon className={className} size={size} />;
    case "twitter":
    case "x":
      return <TwitterXIcon className={className} size={size} />;
    case "reddit":
      return <RedditIcon className={className} size={size} />;
    default:
      return <GenericLinkIcon className={className} size={size} />;
  }
}

/**
 * Returns platform visual badge themes that match the StudyRoom dark design system.
 */
export function getPlatformBadgeStyle(platform: string): {
  badgeBg: string;
  badgeBorder: string;
  textColor: string;
  hoverBorder: string;
} {
  const norm = (platform || "").toLowerCase().trim();
  switch (norm) {
    case "whatsapp":
      return {
        badgeBg: "bg-emerald-500/10",
        badgeBorder: "border-emerald-500/25",
        textColor: "text-emerald-400",
        hoverBorder: "hover:border-emerald-500/40",
      };
    case "telegram":
      return {
        badgeBg: "bg-sky-500/10",
        badgeBorder: "border-sky-500/25",
        textColor: "text-sky-400",
        hoverBorder: "hover:border-sky-500/40",
      };
    case "youtube":
      return {
        badgeBg: "bg-rose-500/10",
        badgeBorder: "border-rose-500/25",
        textColor: "text-rose-400",
        hoverBorder: "hover:border-rose-500/40",
      };
    case "instagram":
      return {
        badgeBg: "bg-fuchsia-500/10",
        badgeBorder: "border-fuchsia-500/25",
        textColor: "text-fuchsia-400",
        hoverBorder: "hover:border-fuchsia-500/40",
      };
    case "twitter":
    case "x":
      return {
        badgeBg: "bg-zinc-500/10",
        badgeBorder: "border-zinc-500/25",
        textColor: "text-zinc-200",
        hoverBorder: "hover:border-zinc-400/40",
      };
    case "reddit":
      return {
        badgeBg: "bg-orange-500/10",
        badgeBorder: "border-orange-500/25",
        textColor: "text-orange-400",
        hoverBorder: "hover:border-orange-500/40",
      };
    default:
      return {
        badgeBg: "bg-violet-500/10",
        badgeBorder: "border-violet-500/25",
        textColor: "text-violet-400",
        hoverBorder: "hover:border-violet-500/40",
      };
  }
}
