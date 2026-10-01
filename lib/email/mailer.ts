import nodemailer, { type Transporter } from "nodemailer";
import {
  generateAlertEmail,
  generateAdminPaymentNotificationEmail,
  generateUserPaymentPendingEmail,
  generateUserPaymentVerifiedEmail,
  generateUserPaymentRejectedEmail,
  AlertType,
  getAppUrl,
} from "./templates";

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

export interface DispatchEmailPayloadParams {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  entityRefId?: string;
  extraHeaders?: Record<string, string>;
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
 * Universal email dispatcher: Resend API with seamless, robust fallback to Gmail SMTP.
 */
export async function dispatchEmailPayload({
  to,
  subject,
  text,
  html,
  replyTo,
  entityRefId = `sr-${Date.now()}`,
  extraHeaders = {},
}: DispatchEmailPayloadParams): Promise<SendAlertResult> {
  try {
    const config = isMailerConfigured();
    if (!config.configured) {
      return {
        success: false,
        error: config.reason || "Email transport is not configured.",
      };
    }

    // In automated testing environments, avoid making live network requests unless explicitly enabled
    if (process.env.NODE_ENV === "test" && !process.env.ENABLE_TEST_NETWORK_MAIL) {
      return { success: true, messageId: "test-mock-msg-id", provider: "resend" };
    }

    const appUrl = getAppUrl();
    const recipients = Array.isArray(to) ? to.map((t) => t.trim()).filter(Boolean) : [to.trim()];

    if (recipients.length === 0) {
      return { success: false, error: "No recipient email addresses provided." };
    }

    const defaultReplyTo = replyTo || process.env.ALERT_GMAIL_USER?.trim() || "studyaliveapp@gmail.com";

    // -------------------------------------------------------------
    // PRIMARY: Resend Transactional Engine
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

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: recipients,
              reply_to: defaultReplyTo,
              subject,
              text,
              html,
              headers: {
                "List-Unsubscribe": `<mailto:${defaultReplyTo}?subject=Unsubscribe>, <${appUrl}/settings>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                "Auto-Submitted": "auto-generated",
                "X-Entity-Ref-ID": entityRefId,
                ...extraHeaders,
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
    // FALLBACK / SECONDARY: Hardened Gmail SMTP
    // -------------------------------------------------------------
    const user = process.env.ALERT_GMAIL_USER!.trim();
    const fromName = process.env.ALERT_FROM_NAME?.trim() || "StudyRoom";
    const transporter = getTransporter();

    const randomHex = Math.random().toString(36).substring(2, 10);
    const customMessageId = `<studyroom.${Date.now()}.${randomHex}@studyaliveapp.gmail.com>`;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: recipients.join(", "),
      replyTo: defaultReplyTo,
      subject,
      text,
      html,
      messageId: customMessageId,
      headers: {
        "X-Entity-Ref-ID": entityRefId,
        "List-Unsubscribe": `<mailto:${user}?subject=Unsubscribe>, <${appUrl}/settings>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Auto-Submitted": "auto-generated",
        "Precedence": "bulk",
        "X-Auto-Response-Suppress": "OOF, AutoReply",
        ...extraHeaders,
      },
    });

    return {
      success: true,
      messageId: info.messageId || customMessageId,
      provider: "gmail",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error sending email";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Dispatches a spam-proof alert email to the recipient.
 */
export async function sendAlertEmail({
  to,
  name,
  type,
  consecutiveDays = 0,
  weeklyHours = 0,
  isTest = false,
}: SendAlertParams): Promise<SendAlertResult> {
  const cleanTo = to.trim();
  const template = generateAlertEmail(type, name, consecutiveDays, weeklyHours, cleanTo);
  const subject = isTest ? `[TEST] ${template.subject}` : template.subject;

  return dispatchEmailPayload({
    to: cleanTo,
    subject,
    text: template.text,
    html: template.html,
    entityRefId: `${type}-${Date.now()}`,
    extraHeaders: {
      "X-StudyRoom-Alert-Type": type,
      "X-StudyRoom-Test": isTest ? "true" : "false",
      "Feedback-ID": `${type}:StudyRoom:Alerts`,
    },
  });
}

/**
 * Dispatches immediate payment notification email to platform administrators.
 */
export async function sendAdminPaymentNotification(params: {
  name: string;
  email: string;
  phone: string;
  utr: string;
  amount?: number;
  submittedAt?: string;
}): Promise<SendAlertResult> {
  try {
    const template = generateAdminPaymentNotificationEmail(params);
    const adminRecipients = ["studyaliveapp@gmail.com", "thoughtfulmindg@gmail.com"];

    return await dispatchEmailPayload({
      to: adminRecipients,
      subject: template.subject,
      text: template.text,
      html: template.html,
      entityRefId: `admin-pay-${params.utr}`,
      extraHeaders: {
        "X-StudyRoom-Admin-Alert": "payment_submission",
      },
    });
  } catch (err: any) {
    console.error("[Mailer] Failed to send admin payment alert:", err);
    return { success: false, error: err?.message || "Failed to send admin payment alert" };
  }
}

/**
 * Dispatches payment acknowledgement email to student (verification pending).
 */
export async function sendUserPaymentPendingEmail(params: {
  name: string;
  email: string;
  phone?: string;
  utr: string;
}): Promise<SendAlertResult> {
  try {
    const template = generateUserPaymentPendingEmail(params);

    return await dispatchEmailPayload({
      to: params.email.trim(),
      subject: template.subject,
      text: template.text,
      html: template.html,
      entityRefId: `user-pay-pending-${params.utr}`,
      extraHeaders: {
        "X-StudyRoom-User-Notice": "payment_pending",
      },
    });
  } catch (err: any) {
    console.error("[Mailer] Failed to send user pending email:", err);
    return { success: false, error: err?.message || "Failed to send user pending email" };
  }
}

/**
 * Dispatches verification approval email to student with single-use access link.
 */
export async function sendUserPaymentVerifiedEmail(params: {
  name: string;
  email: string;
  accessLink: string;
  otpCode?: string;
}): Promise<SendAlertResult> {
  try {
    const template = generateUserPaymentVerifiedEmail(params);

    return await dispatchEmailPayload({
      to: params.email.trim(),
      subject: template.subject,
      text: template.text,
      html: template.html,
      entityRefId: `user-pay-verified-${Date.now()}`,
      extraHeaders: {
        "X-StudyRoom-User-Notice": "payment_verified",
      },
    });
  } catch (err: any) {
    console.error("[Mailer] Failed to send user verified email:", err);
    return { success: false, error: err?.message || "Failed to send user verified email" };
  }
}

/**
 * Dispatches verification declined email to student.
 */
export async function sendUserPaymentRejectedEmail(params: {
  name: string;
  email: string;
  utr: string;
  reason?: string;
}): Promise<SendAlertResult> {
  try {
    const template = generateUserPaymentRejectedEmail(params);

    return await dispatchEmailPayload({
      to: params.email.trim(),
      subject: template.subject,
      text: template.text,
      html: template.html,
      entityRefId: `user-pay-rejected-${params.utr}`,
      extraHeaders: {
        "X-StudyRoom-User-Notice": "payment_rejected",
      },
    });
  } catch (err: any) {
    console.error("[Mailer] Failed to send user rejected email:", err);
    return { success: false, error: err?.message || "Failed to send user rejected email" };
  }
}
