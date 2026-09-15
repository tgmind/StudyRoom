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
  reason?: string;
}

/**
 * Returns whether email dispatch credentials (Resend API or Gmail SMTP) are configured.
 */
export function isMailerConfigured(): MailerConfigStatus {
  // 1. Check if dedicated transactional Resend API key is configured
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const fromEmail = process.env.ALERT_FROM_EMAIL?.trim() || "StudyRoom <onboarding@resend.dev>";
    return {
      configured: true,
      provider: "resend",
      user: fromEmail,
    };
  }

  // 2. Check authenticated Gmail SMTP credentials
  const user = process.env.ALERT_GMAIL_USER?.trim();
  const pass = process.env.ALERT_GMAIL_APP_PASSWORD?.trim();

  if (!user || !pass) {
    return {
      configured: false,
      reason: "Missing ALERT_GMAIL_USER or ALERT_GMAIL_APP_PASSWORD (or RESEND_API_KEY) in environment variables (.env.local).",
    };
  }

  if (!user.includes("@")) {
    return {
      configured: false,
      reason: "ALERT_GMAIL_USER does not appear to be a valid email address.",
    };
  }

  return {
    configured: true,
    provider: "gmail",
    user,
  };
}

/**
 * Returns a cached or new Nodemailer SMTP Transporter using authenticated Google SMTP.
 */
let transporterCache: Transporter | null = null;

function getTransporter(): Transporter {
  const { configured, reason } = isMailerConfigured();
  if (!configured) {
    throw new Error(reason || "Email transport is not configured.");
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
 * Dispatches a spam-proof alert email to the recipient via Resend or authenticated Gmail SMTP.
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
    // OPTION A: Resend Transactional Engine (If RESEND_API_KEY is present)
    // -------------------------------------------------------------
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
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
      if (!res.ok) {
        throw new Error(resData?.message || "Resend email delivery failed");
      }

      return {
        success: true,
        messageId: resData?.id,
        provider: "resend",
      };
    }

    // -------------------------------------------------------------
    // OPTION B: Hardened, Spam-Proof Google Gmail SMTP
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
