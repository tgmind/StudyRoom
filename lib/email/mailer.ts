import nodemailer, { type Transporter } from "nodemailer";
import { generateAlertEmail, AlertType, getAppUrl } from "./templates";

export interface SendAlertParams {
  to: string;
  name: string;
  type: AlertType;
  consecutiveDays?: number;
  weeklyHours?: number;
  isTest?: boolean;
}

export interface SendAlertResult {
  success: boolean;
  messageId?: string;
  provider?: "resend" | "gmail";
  error?: string;
}

export interface MailerConfigStatus {
  configured: boolean;
  provider?: "resend" | "gmail";
  user?: string;
  hasResend?: boolean;
  hasGmail?: boolean;
  dailyResendCount?: number;
  reason?: string;
}

// Resend Free Tier Safeguards: 100 emails/day, 3,000/month
// We cap daily Resend dispatches at 90 to ensure 100% zero-cost forever.
const MAX_DAILY_RESEND_FREE_TIER = 90;
let dailyResendCount = 0;
let currentDayTracker = new Date().toISOString().slice(0, 10);

export function getDailyResendUsage(): { count: number; canSend: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDayTracker) {
    currentDayTracker = today;
    dailyResendCount = 0;
  }
  return {
    count: dailyResendCount,
    canSend: dailyResendCount < MAX_DAILY_RESEND_FREE_TIER,
  };
}

function incrementDailyResendUsage(): void {
  dailyResendCount += 1;
}

/**
 * Returns whether email dispatch credentials (Resend API or Gmail SMTP) are configured.
 */
export function isMailerConfigured(): MailerConfigStatus {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const gmailUser = process.env.ALERT_GMAIL_USER?.trim();
  const gmailPass = process.env.ALERT_GMAIL_APP_PASSWORD?.trim();

  const hasResend = Boolean(resendKey);
  const hasGmail = Boolean(gmailUser && gmailPass && gmailUser.includes("@"));

  if (!hasResend && !hasGmail) {
    return {
      configured: false,
      reason: "Missing RESEND_API_KEY and Gmail SMTP credentials in environment variables.",
    };
  }

  const { count } = getDailyResendUsage();

  if (hasResend) {
    const fromEmail = process.env.ALERT_FROM_EMAIL?.trim() || "StudyRoom <onboarding@resend.dev>";
    return {
      configured: true,
      provider: "resend",
      user: fromEmail,
      hasResend: true,
      hasGmail,
      dailyResendCount: count,
    };
  }

  return {
    configured: true,
    provider: "gmail",
    user: gmailUser,
    hasResend: false,
    hasGmail: true,
    dailyResendCount: 0,
  };
}

/**
 * Returns a cached or new Nodemailer SMTP Transporter using authenticated Google SMTP.
 */
let transporterCache: Transporter | null = null;

function getTransporter(): Transporter {
  const { configured, reason, hasGmail } = isMailerConfigured();
  if (!configured || !hasGmail) {
    throw new Error(reason || "Gmail SMTP fallback is not configured.");
  }

  if (transporterCache) {
    return transporterCache;
  }

  const user = process.env.ALERT_GMAIL_USER!.trim();
  const pass = process.env.ALERT_GMAIL_APP_PASSWORD!.trim().replace(/\s+/g, "");

  transporterCache = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user,
      pass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateLimit: 5, // max 5 emails per second to avoid any throttling
  });

  return transporterCache;
}

/**
 * Dispatches a spam-proof alert email to the recipient.
 * Defaults to Resend API, with seamless automatic fallback to hardened Gmail SMTP.
 */
export async function sendAlertEmail({
  to,
  name,
  type,
  consecutiveDays = 0,
  weeklyHours = 0,
  isTest = false,
}: SendAlertParams): Promise<SendAlertResult> {
  try {
    const config = isMailerConfigured();
    if (!config.configured) {
      return {
        success: false,
        error: config.reason || "Email transport is not configured.",
      };
    }

    const appUrl = getAppUrl();
    const cleanTo = to.trim();
    const template = generateAlertEmail(type, name, consecutiveDays, weeklyHours, cleanTo);
    const subject = isTest ? `[TEST] ${template.subject}` : template.subject;

    // -------------------------------------------------------------
    // PRIMARY: Resend Transactional Engine (Default method when configured)
    // -------------------------------------------------------------
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      const { count, canSend } = getDailyResendUsage();
      if (!canSend) {
        console.warn(
          `[Mailer] Resend free tier daily safety limit reached (${count}/${MAX_DAILY_RESEND_FREE_TIER}). Automatically routing via Gmail SMTP for zero-cost lifelong delivery.`
        );
      } else {
        try {
          const from = process.env.ALERT_FROM_EMAIL?.trim() || "StudyRoom <onboarding@resend.dev>";
          const replyTo = process.env.ALERT_GMAIL_USER?.trim() || "studyaliveapp@gmail.com";

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [cleanTo],
              reply_to: replyTo,
              subject,
              text: template.text,
              html: template.html,
              headers: {
                "List-Unsubscribe": `<mailto:${replyTo}?subject=Unsubscribe%20${encodeURIComponent(cleanTo)}>, <${appUrl}/settings>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                "Auto-Submitted": "auto-generated",
                "X-Entity-Ref-ID": `${type}-${Date.now()}`,
              },
            }),
          });

          const resData = await res.json();
          if (res.ok && resData?.id) {
            incrementDailyResendUsage();
            return {
              success: true,
              messageId: resData.id,
              provider: "resend",
            };
          }

          // If Resend rejected (e.g. 403 unverified custom domain for external recipient, or 429 quota)
          console.warn(
            `[Mailer] Resend dispatch returned (${res.status}: ${resData?.message || "error"}). Falling back seamlessly to hardened Gmail SMTP.`
          );
        } catch (resendErr) {
          console.warn(
            "[Mailer] Resend network dispatch failed. Falling back seamlessly to Gmail SMTP:",
            resendErr
          );
        }
      }
    }

    // -------------------------------------------------------------
    // FALLBACK / SECONDARY: Hardened, Spam-Proof Google Gmail SMTP
    // -------------------------------------------------------------

    const user = process.env.ALERT_GMAIL_USER!.trim();
    const fromName = process.env.ALERT_FROM_NAME?.trim() || "StudyRoom";
    const transporter = getTransporter();

    // Generate unique compliant message ID
    const randomHex = Math.random().toString(36).substring(2, 10);
    const customMessageId = `<studyroom.${type.toLowerCase()}.${Date.now()}.${randomHex}@studyaliveapp.gmail.com>`;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: cleanTo,
      replyTo: user,
      subject,
      text: template.text,
      html: template.html,
      messageId: customMessageId,
      headers: {
        "X-StudyRoom-Alert-Type": type,
        "X-StudyRoom-Test": isTest ? "true" : "false",
        "X-Entity-Ref-ID": `${type}-${Date.now()}`,
        // RFC 8058 One-Click Unsubscribe (Mandatory for Gmail/Yahoo 2024+ deliverability)
        "List-Unsubscribe": `<mailto:${user}?subject=Unsubscribe%20${encodeURIComponent(cleanTo)}>, <${appUrl}/settings>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        // Prevent auto-replies & out-of-office loops
        "Auto-Submitted": "auto-generated",
        "Precedence": "bulk",
        "X-Auto-Response-Suppress": "OOF, AutoReply",
        "Feedback-ID": `${type}:StudyRoom:Alerts`,
      },
    });

    return {
      success: true,
      messageId: info.messageId || customMessageId,
      provider: "gmail",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error sending alert email";
    return {
      success: false,
      error: errorMsg,
    };
  }
}
