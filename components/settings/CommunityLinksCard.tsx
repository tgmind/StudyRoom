"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, ExternalLink } from "lucide-react";
import { SocialLink } from "@/lib/social/types";
import { SocialPlatformIcon, getPlatformBadgeStyle } from "@/components/social/SocialPlatformIcons";

export function CommunityLinksCard() {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchLinks() {
      try {
        const res = await fetch("/api/social-links", {
          cache: "no-store",
          headers: {
            Pragma: "no-cache",
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (Array.isArray(data?.links)) {
              setLinks(data.links);
            } else {
              setLinks([]);
            }
          }
        } else {
          if (isMounted) setLinks([]);
        }
      } catch {
        // Authoritative: On network/API failure, do NOT resurrect defaults
        if (isMounted) setLinks([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchLinks();

    return () => {
      isMounted = false;
    };
  }, []);

  // When loading, render a subtle compact skeleton matching card dimensions
  if (loading) {
    return (
      <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3 sm:p-4 shadow-xl space-y-2.5 backdrop-blur-md animate-pulse">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="h-3.5 w-32 bg-zinc-800/70 rounded" />
          <div className="h-3 w-16 bg-zinc-800/50 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          <div className="h-11 bg-zinc-950/70 rounded-xl border border-zinc-800/60" />
          <div className="h-11 bg-zinc-950/70 rounded-xl border border-zinc-800/60" />
        </div>
      </div>
    );
  }

  // If no active links configured by administrator, cleanly hide the section
  if (links.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="community-links-card"
      className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-3.5 sm:p-4 shadow-xl space-y-2.5 backdrop-blur-md"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center space-x-2 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
          <h2 className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-zinc-200 truncate">
            Community Channels
          </h2>
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 bg-zinc-800/70 px-2 py-0.5 rounded-full border border-zinc-700/50 shrink-0">
          Official Groups
        </span>
      </div>

      {/* Social Buttons Grid: Resilient Side-by-Side on Mobile Portrait and Desktop */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {links.map((link) => {
          const badgeStyle = getPlatformBadgeStyle(link.platform);
          const actionText = link.action_text || "Join Now";

          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.title} - ${actionText}`}
              className={`flex items-center space-x-2 sm:space-x-2.5 p-2 sm:p-2.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-800/80 border border-zinc-800/90 ${badgeStyle.hoverBorder} transition-all duration-150 group touch-manipulation min-w-0 active:scale-[0.98] shadow-sm`}
            >
              {/* Recognizable Platform Icon Container */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg ${badgeStyle.badgeBg} border ${badgeStyle.badgeBorder} ${badgeStyle.textColor} flex items-center justify-center shrink-0 transition-transform group-hover:scale-105`}
              >
                <SocialPlatformIcon platform={link.icon_key || link.platform} size={15} />
              </div>

              {/* Title & Compact Action Text */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="text-[11px] sm:text-xs font-bold text-zinc-100 group-hover:text-white truncate leading-tight">
                  {link.title}
                </div>
                <div
                  className={`text-[9.5px] sm:text-[10.5px] font-semibold ${badgeStyle.textColor} truncate leading-tight mt-0.5 flex items-center space-x-0.5`}
                >
                  <span className="truncate">{actionText}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 shrink-0" />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
