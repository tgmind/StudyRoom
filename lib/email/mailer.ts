import nodemailer, { type Transporter } from "nodemailer";
import { generateAlertEmail, AlertType } from "./templates";

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
  error?: string;
}

/**
 * Returns whether Gmail SMTP credentials are configured in environment variables.
 */
export function isMailerConfigured(): { configured: boolean; user?: string; reason?: string } {
  const user = process.env.ALERT_GMAIL_USER?.trim();
  const pass = process.env.ALERT_GMAIL_APP_PASSWORD?.trim();

  if (!user || !pass) {
    return {
      configured: false,
      reason: "Missing ALERT_GMAIL_USER or ALERT_GMAIL_APP_PASSWORD in environment variables (.env.local).",
    };
  }

  // Basic sanity check for gmail format
  if (!user.includes("@")) {
    return {
      configured: false,
      reason: "ALERT_GMAIL_USER does not appear to be a valid email address.",
    };
  }

  return { configured: true, user };
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
  // Strip any spaces users might copy from Google App Password (e.g. "abcd efgh ijkl mnop")
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
 * Dispatches an alert email to the recipient.
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
    const { configured, user, reason } = isMailerConfigured();
    if (!configured || !user) {
      return {
        success: false,
        error: reason || "Email transport is not configured.",
      };
    }

    const fromName = process.env.ALERT_FROM_NAME?.trim() || "StudyRoom";
    const template = generateAlertEmail(type, name, consecutiveDays, weeklyHours);
    const transporter = getTransporter();

    const subject = isTest ? `[TEST] ${template.subject}` : template.subject;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to,
      replyTo: user,
      subject,
      text: template.text,
      html: template.html,
      headers: {
        "X-StudyRoom-Alert-Type": type,
        "X-StudyRoom-Test": isTest ? "true" : "false",
      },
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error sending alert email";
    return {
      success: false,
      error: errorMsg,
    };
  }
}
