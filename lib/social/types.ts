export interface SocialLink {
  id: string;
  platform: string;
  title: string;
  url: string;
  action_text: string;
  is_enabled: boolean;
  display_order: number;
  icon_key: string;
  created_at?: string;
  updated_at?: string;
}

export interface PlatformPreset {
  key: string;
  name: string;
  defaultActionText: string;
  defaultUrlPlaceholder: string;
  defaultIconKey: string;
}

/**
 * Standard platform presets for administrators.
 * Administrators can choose from these or add custom platforms.
 */
export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    key: "whatsapp",
    name: "WhatsApp",
    defaultActionText: "Join Now",
    defaultUrlPlaceholder: "https://whatsapp.com/channel/...",
    defaultIconKey: "whatsapp",
  },
  {
    key: "telegram",
    name: "Telegram",
    defaultActionText: "Join Now",
    defaultUrlPlaceholder: "https://t.me/...",
    defaultIconKey: "telegram",
  },
  {
    key: "youtube",
    name: "YouTube",
    defaultActionText: "Subscribe",
    defaultUrlPlaceholder: "https://youtube.com/@...",
    defaultIconKey: "youtube",
  },
  {
    key: "instagram",
    name: "Instagram",
    defaultActionText: "Follow",
    defaultUrlPlaceholder: "https://instagram.com/...",
    defaultIconKey: "instagram",
  },
  {
    key: "twitter",
    name: "Twitter / X",
    defaultActionText: "Follow",
    defaultUrlPlaceholder: "https://x.com/...",
    defaultIconKey: "twitter",
  },
  {
    key: "reddit",
    name: "Reddit",
    defaultActionText: "Join Now",
    defaultUrlPlaceholder: "https://reddit.com/r/...",
    defaultIconKey: "reddit",
  },
  {
    key: "custom",
    name: "Custom Channel",
    defaultActionText: "Visit Now",
    defaultUrlPlaceholder: "https://...",
    defaultIconKey: "custom",
  },
];

/**
 * Authoritative default configuration values.
 * NOTE: Used ONLY for database migration seeding and test fixtures.
 * The live application treats the Supabase social_community_links table as authoritative.
 */
export const DEFAULT_SOCIAL_LINKS: SocialLink[] = [
  {
    id: "whatsapp",
    platform: "whatsapp",
    title: "WhatsApp",
    url: "https://whatsapp.com/channel/0029VbDVgDFBvvseejxJ8L25",
    action_text: "Join Now",
    is_enabled: true,
    display_order: 1,
    icon_key: "whatsapp",
  },
  {
    id: "telegram",
    platform: "telegram",
    title: "Telegram",
    url: "https://t.me/studyalive_telegram",
    action_text: "Join Now",
    is_enabled: true,
    display_order: 2,
    icon_key: "telegram",
  },
];
