export type AlertType = "A" | "I" | "D" | "W";

export interface EmailTemplatePayload {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (process.env.URL) {
    return process.env.URL.replace(/\/+$/, "");
  }
  return "https://studyalive.netlify.app";
}

/**
 * Generate polished, 100% spam-proof transactional emails for StudyRoom.
 * Complies with Google & Yahoo 2024+ sender requirements:
 *  - Zero high-risk phishing/spam trigger words (No "URGENT", "DELETION", "PERMANENT LOSS")
 *  - Clean, professional subject lines without siren emojis
 *  - CAN-SPAM and GDPR compliant footers with explicit sender identity & unsubscribe instructions
 *  - Balanced HTML & Plain Text ratios for high deliverability
 *
 * Supports:
 *  - Type A: Achiever's Title 🏆
 *  - Type W: Weekly Performance & Momentum Review 📊 (Weekly hours / focus check-in)
 *  - Type I: Account Activity Notice ⏱️ (3 consecutive days inactive)
 *  - Type D: Inactivity Notice & Desk Retention 📋 (5 consecutive days inactive)
 */
export function generateAlertEmail(
  type: AlertType,
  rawName: string,
  consecutiveDays: number = 0,
  weeklyHours: number = 0,
  recipientEmail: string = ""
): EmailTemplatePayload {
  const name = escapeHtml(rawName || "Student");
  const year = new Date().getFullYear();
  const appUrl = getAppUrl();
  const loginUrl = `${appUrl}/login`;
  const roomUrl = `${appUrl}/room`;
  const settingsUrl = `${appUrl}/settings`;
  const emailDisplay = recipientEmail ? escapeHtml(recipientEmail) : "your registered address";

  // Responsive styling variables
  const wrapperStyle =
    "margin:0;padding:32px 16px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;";
  const cardStyle =
    "max-width:560px;margin:0 auto;background-color:#151d30;border:1px solid #27354f;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.4);";
  const headerStyle =
    "padding:32px 32px 24px 32px;text-align:center;border-bottom:1px solid #27354f;";
  const bodyStyle = "padding:28px 32px 24px 32px;";
  const footerStyle =
    "padding:20px 32px 28px 32px;text-align:center;font-size:12px;color:#8192a8;border-top:1px solid #27354f;line-height:1.6;";
  const btnBase =
    "display:inline-block;padding:14px 28px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;text-align:center;letter-spacing:0.2px;";

  const complianceFooterHtml = `
    <div style="${footerStyle}">
      <p style="margin:0 0 8px 0;color:#94a3b8;">
        This notification was sent to <strong style="color:#cbd5e1;">${emailDisplay}</strong> because you are a registered member of <a href="${appUrl}" style="color:#818cf8;text-decoration:none;">StudyRoom</a>.
      </p>
      <p style="margin:0 0 8px 0;color:#64748b;font-size:11px;">
        StudyRoom Virtual Focus Space &bull; Empowering Focused Minds &bull; studyaliveapp@gmail.com
      </p>
      <p style="margin:0;color:#64748b;font-size:11px;">
        To manage notification preferences or opt out, update your <a href="${settingsUrl}" style="color:#818cf8;text-decoration:underline;">account settings</a> or reply to this email with "Unsubscribe".
      </p>
    </div>`;

  const complianceFooterText = `\n\n---\n` +
    `This notification was sent to ${recipientEmail || "your registered email"} because you are a registered member of StudyRoom (${appUrl}).\n` +
    `StudyRoom Virtual Focus Space • studyaliveapp@gmail.com\n` +
    `To manage notification preferences or opt out, visit ${settingsUrl} or reply to this email with "Unsubscribe".\n` +
    `© ${year} StudyRoom. All rights reserved.`;

  /* =========================================================
     TYPE A: ACHIEVER'S TITLE
     ========================================================= */
  if (type === "A") {
    const subject = `StudyRoom: Congratulations ${rawName} — Achiever's Title awarded!`;

    const text = `Congratulations, ${rawName}!\n\n` +
      `You have earned the Achiever's Title for your outstanding dedication and consistent study performance in StudyRoom this week.\n\n` +
      `Your consistency sets an inspiring example for your study group. Keep your momentum going and defend your title in this week's study sessions.\n\n` +
      `Continue your study session in the room: ${roomUrl}\n` +
      complianceFooterText;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="${wrapperStyle}">
  <div style="${cardStyle}">
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(21,29,48,0) 100%);">
      <div style="font-size:42px;line-height:1;margin-bottom:12px;">🏆</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#064e3b;color:#34d399;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #059669;">
        StudyRoom Milestone
      </span>
      <h1 style="margin:16px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Congratulations, ${name}!
      </h1>
      <p style="margin:6px 0 0 0;font-size:14px;color:#a7f3d0;font-weight:600;">
        Achiever&#039;s Title Awarded
      </p>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        You have earned the prestigious <strong style="color:#34d399;">Achiever's Title</strong> for your study dedication and consistency this week.
      </p>

      <div style="background-color:#0b0f19;border-left:4px solid #10b981;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#e2e8f0;font-weight:500;">
          “Dedication, discipline, and daily consistency separate the dreamers from the achievers.”
        </p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#94a3b8;">
          Your focus rank is showcased to inspire your study group.
        </p>
      </div>

      <p style="font-size:14px;color:#94a3b8;margin-bottom:28px;">
        Keep working toward your academic targets and maintain your streak to retain your Achiever's Title next week!
      </p>

      <div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${roomUrl}" style="${btnBase}background-color:#10b981;color:#ffffff;box-shadow:0 4px 14px rgba(16,185,129,0.35);">
          Continue Studying in Room &rarr;
        </a>
      </div>
    </div>

    ${complianceFooterHtml}
  </div>
</body>
</html>`;

    return { subject, text, html };
  }

  /* =========================================================
     TYPE W: WEEKLY PERFORMANCE & STUDY CHECK-IN (PAST WEEK)
     ========================================================= */
  if (type === "W") {
    const subject = `StudyRoom: Weekly Performance & Momentum Check-in (${rawName})`;
    const hoursText = weeklyHours > 0 ? `Your recorded study time over the past week: ${weeklyHours} hours.\n\n` : "";
    const hoursHtml = weeklyHours > 0 ? `
      <div style="text-align:center;margin:16px 0 20px 0;">
        <span style="display:inline-block;padding:6px 16px;background-color:#1e1b4b;color:#c7d2fe;font-size:13px;font-weight:600;border-radius:8px;border:1px solid #3730a3;">
          ⏱️ Past 7 Days Logged: <strong style="color:#ffffff;">${weeklyHours} hrs</strong>
        </span>
      </div>` : "";

    const text = `Hi ${rawName},\n\n` +
      `Here is your weekly study progress summary and momentum check-in from StudyRoom.\n\n` +
      hoursText +
      `Every week is a brand new opportunity to build focus and surge ahead. If you faced a brief study slump or logged lower hours recently, remember that even a single 25-minute Pomodoro session today can restart your study rhythm.\n\n` +
      `Jump back into the room today, set your daily goals, and rebuild your study momentum:\n\n` +
      `${roomUrl}\n` +
      complianceFooterText;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="${wrapperStyle}">
  <div style="${cardStyle}">
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(99,102,241,0.12) 0%, rgba(21,29,48,0) 100%);">
      <div style="font-size:42px;line-height:1;margin-bottom:12px;">📊</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#312e81;color:#a5b4fc;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #4f46e5;">
        Weekly Performance Review
      </span>
      <h1 style="margin:16px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Past Week Study Check-in
      </h1>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">
        We took a look at your study output over the past week. Whether you made steady progress or hit a brief slump, consistency is built session by session.
      </p>
      ${hoursHtml}

      <div style="background-color:#0b0f19;border-left:4px solid #6366f1;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#e0e7ff;font-weight:600;">
          Restart Your Study Momentum
        </p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
          “A slump is just a brief detour before a bigger comeback.” Even a single 25-minute Pomodoro session today can restart your study rhythm.
        </p>
      </div>

      <p style="font-size:14px;color:#94a3b8;margin-bottom:28px;">
        Log in today, set your daily tasks, and study alongside your peers in the live room.
      </p>

      <div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${roomUrl}" style="${btnBase}background-color:#6366f1;color:#ffffff;box-shadow:0 4px 14px rgba(99,102,241,0.35);">
          Open Room &amp; Reset Targets &rarr;
        </a>
      </div>
    </div>

    ${complianceFooterHtml}
  </div>
</body>
</html>`;

    return { subject, text, html };
  }

  /* =========================================================
     TYPE I: ACCOUNT ACTIVITY NOTICE (3 DAYS INACTIVE)
     ========================================================= */
  if (type === "I") {
    const days = consecutiveDays >= 3 ? consecutiveDays : 3;
    const subject = `StudyRoom: Quick check-in for ${rawName} — ${days} Days Inactive`;

    const text = `Hi ${rawName},\n\n` +
      `We noticed that you have been inactive on StudyRoom for ${days} consecutive days.\n\n` +
      `Regular study habits are built day by day. Starting even a quick 20-minute focus session today will help you protect your study streak and keep your momentum going.\n\n` +
      `Under the StudyRoom Community Policy, desks are reserved for active students. Please log in today to maintain your streak and keep your profile in good standing:\n\n` +
      `${roomUrl}\n` +
      complianceFooterText;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="${wrapperStyle}">
  <div style="${cardStyle}">
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(245,158,11,0.12) 0%, rgba(21,29,48,0) 100%);">
      <div style="font-size:42px;line-height:1;margin-bottom:12px;">⏱️</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#78350f;color:#fcd34d;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #d97706;">
        Study Check-in &bull; ${days} Days Inactive
      </span>
      <h1 style="margin:16px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Keep Your Momentum Going
      </h1>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">
        Our records show that your StudyRoom account has recorded <strong>0 study activity for ${days} consecutive days</strong>.
      </p>

      <div style="background-color:#0b0f19;border-left:4px solid #f59e0b;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#fef3c7;font-weight:600;">
          Study Desk Policy Reminder
        </p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
          StudyRoom desks are maintained for committed participants. Brief check-ins prevent accounts from being flagged as dormant.
        </p>
      </div>

      <p style="font-size:14px;color:#94a3b8;margin-bottom:28px;">
        Getting back on track takes just one focused session. Log in today, connect with your study group, and keep your account in good standing.
      </p>

      <div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${roomUrl}" style="${btnBase}background-color:#f59e0b;color:#0b0f19;box-shadow:0 4px 14px rgba(245,158,11,0.3);">
          Continue Studying in Room &rarr;
        </a>
      </div>
    </div>

    ${complianceFooterHtml}
  </div>
</body>
</html>`;

    return { subject, text, html };
  }

  /* =========================================================
     TYPE D: INACTIVITY NOTICE & DESK RETENTION (5 DAYS INACTIVE)
     ========================================================= */
  const days = consecutiveDays >= 5 ? consecutiveDays : 5;
  const subject = `StudyRoom: Inactivity notice for ${rawName} — ${days} Days Inactive`;

  const text = `Hi ${rawName},\n\n` +
    `Your StudyRoom account has been inactive for ${days} consecutive days.\n\n` +
    `Under the StudyRoom Community Retention Policy, accounts inactive for 5 or more consecutive days are marked for dormancy and seat reallocation to preserve active study capacity for members.\n\n` +
    `To retain your reserved desk, study streak, and badges, simply log in and start a brief study session today:\n\n` +
    `${roomUrl}\n\n` +
    `Taking even a 15-minute focus session will keep your account in good standing and restart your study momentum.\n` +
    complianceFooterText;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="${wrapperStyle}">
  <div style="${cardStyle}border-color:#4338ca;">
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(99,102,241,0.15) 0%, rgba(21,29,48,0) 100%);">
      <div style="font-size:42px;line-height:1;margin-bottom:12px;">📋</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#312e81;color:#c7d2fe;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #4f46e5;">
        Account Reminder &bull; ${days} Days Inactive
      </span>
      <h1 style="margin:16px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Preserve Your Study Streak
      </h1>
      <p style="margin:6px 0 0 0;font-size:13px;color:#a5b4fc;">
        StudyRoom Desk Retention Notice
      </p>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">
        We noticed that your StudyRoom account has been <strong>inactive for ${days} consecutive days</strong>.
      </p>

      <div style="background-color:#0b0f19;border-left:4px solid #6366f1;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#e0e7ff;font-weight:600;">
          Desk &amp; Account Retention Policy
        </p>
        <p style="margin:6px 0 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
          Under the StudyRoom Community Retention Policy, accounts inactive for 5 or more consecutive days are marked for dormancy and seat reallocation to preserve active study capacity for members.
        </p>
      </div>

      <p style="font-size:14px;color:#cbd5e1;margin-bottom:28px;">
        To retain your reserved desk, badges, and study progress, simply start a brief study session today.
      </p>

      <div style="text-align:center;margin:28px 0 12px 0;">
        <a href="${roomUrl}" style="${btnBase}background-color:#4f46e5;color:#ffffff;box-shadow:0 4px 14px rgba(79,70,229,0.35);">
          Continue Studying in Room &rarr;
        </a>
      </div>
    </div>

    ${complianceFooterHtml}
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/* =========================================================
   PAYMENT WORKFLOW: ADMIN NOTIFICATION
   ========================================================= */
export function generateAdminPaymentNotificationEmail({
  name: rawName,
  email: rawEmail,
  phone: rawPhone,
  utr: rawUtr,
  amount = 20,
  submittedAt = new Date().toISOString(),
}: {
  name: string;
  email: string;
  phone: string;
  utr: string;
  amount?: number;
  submittedAt?: string;
}): EmailTemplatePayload {
  const name = escapeHtml(rawName || "Student");
  const email = escapeHtml(rawEmail || "");
  const phone = escapeHtml(rawPhone || "");
  const utr = escapeHtml(rawUtr || "");
  const appUrl = getAppUrl();
  const adminUrl = `${appUrl}/public/admin`;

  const subject = `New ₹${amount} Payment Submission: ${rawName} (${rawUtr})`;

  const text = `New ₹${amount} Payment Submission Received\n\n` +
    `Student Details:\n` +
    `- Name: ${rawName}\n` +
    `- Email: ${rawEmail}\n` +
    `- Phone: ${rawPhone}\n` +
    `- UTR / Ref: ${rawUtr}\n` +
    `- Amount: ₹${amount}\n` +
    `- Submitted At: ${submittedAt}\n\n` +
    `Open Admin Verification Portal:\n` +
    `${adminUrl}\n\n` +
    `StudyRoom Administrative System`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background-color:#151d30;border:1px solid #27354f;border-radius:16px;overflow:hidden;">
    <div style="padding:24px 32px;background:linear-gradient(180deg, rgba(59,130,246,0.15) 0%, rgba(21,29,48,0) 100%);border-bottom:1px solid #27354f;">
      <span style="display:inline-block;padding:4px 12px;background-color:#1e3a8a;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">
        Payment Alert
      </span>
      <h1 style="margin:12px 0 0 0;font-size:20px;font-weight:800;color:#ffffff;">
        New ₹${amount} Payment Pending Review
      </h1>
    </div>

    <div style="padding:24px 32px;">
      <p style="font-size:14px;color:#94a3b8;margin-top:0;">
        A student has submitted a new ₹${amount} payment for manual verification against bank records.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;background-color:#0b0f19;border-radius:8px;border:1px solid #27354f;">
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;width:120px;">Name:</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#ffffff;font-size:13px;font-weight:bold;">${name}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">Email:</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#60a5fa;font-size:13px;font-family:monospace;">${email}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">Phone:</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#34d399;font-size:13px;font-family:monospace;font-weight:bold;">${phone}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">UTR / Ref:</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#facc15;font-size:14px;font-family:monospace;font-weight:bold;letter-spacing:1px;">${utr}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">Amount:</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;color:#ffffff;font-size:13px;font-weight:bold;">₹${amount}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#94a3b8;font-size:13px;">Submitted:</td>
          <td style="padding:10px 14px;color:#cbd5e1;font-size:12px;">${escapeHtml(submittedAt)}</td>
        </tr>
      </table>

      <div style="text-align:center;margin:24px 0 8px 0;">
        <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;border-radius:8px;font-weight:bold;font-size:14px;text-decoration:none;">
          Open Admin Portal to Verify &rarr;
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/* =========================================================
   PAYMENT WORKFLOW: USER ACKNOWLEDGEMENT (PENDING)
   ========================================================= */
export function generateUserPaymentPendingEmail({
  name: rawName,
  email: rawEmail,
  phone: rawPhone,
  utr: rawUtr,
}: {
  name: string;
  email: string;
  phone?: string;
  utr: string;
}): EmailTemplatePayload {
  const name = escapeHtml(rawName || "Student");
  const utr = escapeHtml(rawUtr || "");
  const phone = rawPhone ? escapeHtml(rawPhone) : "";
  const appUrl = getAppUrl();
  const year = new Date().getFullYear();

  const subject = "StudyRoom Payment Received — Verification Pending";

  const text = `Hi ${rawName},\n\n` +
    `Thank you for submitting your ₹20 enrollment fee for StudyRoom.\n\n` +
    `Transaction Reference (UTR): ${rawUtr}\n\n` +
    `What happens next?\n` +
    `- Our administration team verifies each payment against our official banking records.\n` +
    `- Verification is typically completed within 15 to 30 minutes (up to 24 hours during off-peak times or weekends).\n` +
    `- You do NOT need to keep the website or browser window open.\n` +
    `- As soon as your payment is verified, you will receive an email with your secure, single-use access link to complete your signup.\n\n` +
    (rawPhone ? `If our team has any questions regarding your transaction, we may contact you at ${rawPhone}.\n\n` : "") +
    `Need help or entered incorrect details? Reply directly to this email.\n\n` +
    `StudyRoom Virtual Focus Space\n` +
    `© ${year} StudyRoom. All rights reserved.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background-color:#151d30;border:1px solid #27354f;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;background:linear-gradient(180deg, rgba(59,130,246,0.12) 0%, rgba(21,29,48,0) 100%);text-align:center;border-bottom:1px solid #27354f;">
      <div style="font-size:36px;margin-bottom:8px;">⏳</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#1e3a8a;color:#93c5fd;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">
        Payment Received
      </span>
      <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;">
        Verification in Progress
      </h1>
    </div>

    <div style="padding:24px 32px;">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">
        We have safely received your ₹20 enrollment payment submission for StudyRoom.
      </p>

      <div style="background-color:#0b0f19;border-left:4px solid #3b82f6;border-radius:8px;padding:14px 18px;margin:20px 0;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Recorded Transaction UTR:</div>
        <div style="font-size:16px;font-family:monospace;font-weight:bold;color:#60a5fa;letter-spacing:1px;">${utr}</div>
      </div>

      <div style="background-color:#1e293b;border-radius:10px;padding:16px 20px;margin:20px 0;">
        <h4 style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#f8fafc;text-transform:uppercase;letter-spacing:0.5px;">What to expect next:</h4>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#cbd5e1;line-height:1.7;">
          <li>Our team manually verifies each submission against live bank records.</li>
          <li>Verification typically takes <strong>15 to 30 minutes</strong> (up to 24 hours during off-peak times).</li>
          <li><strong>You do not need to keep the website open.</strong></li>
          <li>Once approved, you will receive an email with your secure signup link.</li>
        </ul>
      </div>

      ${phone ? `
      <p style="font-size:13px;color:#94a3b8;margin:16px 0;">
        If needed, our administration team may contact you at <strong style="color:#cbd5e1;">${phone}</strong> regarding your transaction.
      </p>` : ""}

      <p style="font-size:12px;color:#64748b;margin-top:24px;border-top:1px solid #27354f;padding-top:16px;text-align:center;">
        Questions or made a mistake? Reply directly to this email or visit <a href="${appUrl}" style="color:#60a5fa;text-decoration:none;">StudyRoom</a>.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/* =========================================================
   PAYMENT WORKFLOW: USER ACCESS LINK (VERIFIED)
   ========================================================= */
export function generateUserPaymentVerifiedEmail({
  name: rawName,
  email: rawEmail,
  accessLink,
}: {
  name: string;
  email: string;
  accessLink: string;
  otpCode?: string;
}): EmailTemplatePayload {
  const name = escapeHtml(rawName || "Student");
  const link = escapeHtml(accessLink || "");
  const year = new Date().getFullYear();

  const subject = "StudyRoom Payment Verified — Complete Your Signup";

  const text = `Hi ${rawName}!\n\n` +
    `Great news: your ₹20 enrollment fee for StudyRoom has been verified by the administrator.\n\n` +
    `Your enrollment authorization is now ready. Click the link below to complete your registration:\n\n` +
    `${accessLink}\n\n` +
    `IMPORTANT SECURITY NOTE:\n` +
    `- This secure signup link is valid for 24 hours and can be used once.\n` +
    `- Clicking the link will authenticate your pre-verified status and unlock registration.\n` +
    `- Simply enter your password and choose your display name to start studying immediately.\n\n` +
    `Welcome to the StudyRoom family!\n` +
    `© ${year} StudyRoom. All rights reserved.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background-color:#151d30;border:1px solid #27354f;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;background:linear-gradient(180deg, rgba(16,185,129,0.15) 0%, rgba(21,29,48,0) 100%);text-align:center;border-bottom:1px solid #27354f;">
      <div style="font-size:38px;margin-bottom:8px;">🎉</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#064e3b;color:#34d399;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">
        Payment Confirmed
      </span>
      <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;">
        Your Access is Verified!
      </h1>
    </div>

    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">
        Your ₹20 enrollment fee has been confirmed by our administrators. Your StudyRoom access has been officially unlocked.
      </p>

      <!-- Prominent CTA Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${link}" style="display:inline-block;padding:16px 36px;background-color:#10b981;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;box-shadow:0 4px 15px rgba(16,185,129,0.4);letter-spacing:0.3px;">
          Complete Your Signup Now &rarr;
        </a>
      </div>

      <div style="background-color:#1e293b;border-radius:10px;padding:14px 18px;margin:20px 0;font-size:12px;color:#94a3b8;line-height:1.6;">
        <strong style="color:#f1f5f9;">Notice:</strong> This secure single-use access link expires in <strong>24 hours</strong>. If the button above does not open, copy and paste this link into your browser:<br />
        <a href="${link}" style="color:#60a5fa;word-break:break-all;text-decoration:none;font-size:11px;margin-top:6px;display:inline-block;">${link}</a>
      </div>

      <p style="font-size:12px;color:#64748b;margin-top:24px;border-top:1px solid #27354f;padding-top:16px;text-align:center;">
        Welcome to StudyRoom. We look forward to studying with you!
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}


/* =========================================================
   PAYMENT WORKFLOW: USER NOTICE (REJECTED)
   ========================================================= */
export function generateUserPaymentRejectedEmail({
  name: rawName,
  email: rawEmail,
  utr: rawUtr,
  reason: rawReason,
}: {
  name: string;
  email: string;
  utr: string;
  reason?: string;
}): EmailTemplatePayload {
  const name = escapeHtml(rawName || "Student");
  const utr = escapeHtml(rawUtr || "");
  const reason = escapeHtml(rawReason || "Transaction could not be matched with bank statements.");
  const appUrl = getAppUrl();
  const year = new Date().getFullYear();

  const subject = "StudyRoom Payment Verification Update";

  const text = `Hi ${rawName},\n\n` +
    `We reviewed your ₹20 payment submission for StudyRoom with transaction reference (UTR): ${rawUtr}.\n\n` +
    `Unfortunately, we were unable to verify this transaction against our bank records.\n\n` +
    `Reason: ${rawReason || "Transaction could not be matched with bank statements."}\n\n` +
    `Next steps:\n` +
    `1. Please check your payment app (Google Pay, PhonePe, Paytm) to ensure the ₹20 transfer was successful and not reversed.\n` +
    `2. Double-check your 12-digit UPI reference (UTR) number.\n` +
    `3. You can submit your correct UTR again at ${appUrl}.\n\n` +
    `If you believe this is an error or if money was debited from your account, please reply directly to this email with a screenshot of your transaction.\n\n` +
    `StudyRoom Team\n` +
    `© ${year} StudyRoom. All rights reserved.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background-color:#151d30;border:1px solid #27354f;border-radius:16px;overflow:hidden;">
    <div style="padding:28px 32px;background:linear-gradient(180deg, rgba(239,68,68,0.12) 0%, rgba(21,29,48,0) 100%);text-align:center;border-bottom:1px solid #27354f;">
      <div style="font-size:36px;margin-bottom:8px;">⚠️</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#7f1d1d;color:#fca5a5;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;">
        Verification Notice
      </span>
      <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:800;color:#ffffff;">
        Unable to Confirm Payment
      </h1>
    </div>

    <div style="padding:24px 32px;">
      <p style="font-size:15px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;line-height:1.6;">
        We reviewed your ₹20 enrollment submission for StudyRoom with transaction reference:
      </p>

      <div style="background-color:#0b0f19;border-left:4px solid #ef4444;border-radius:8px;padding:12px 18px;margin:16px 0;">
        <div style="font-size:12px;color:#94a3b8;">Submitted UTR:</div>
        <div style="font-size:15px;font-family:monospace;font-weight:bold;color:#f87171;">${utr}</div>
      </div>

      <div style="background-color:#1e293b;border-radius:10px;padding:14px 18px;margin:20px 0;font-size:13px;color:#cbd5e1;">
        <strong style="color:#fca5a5;">Note from administration:</strong><br />
        ${reason}
      </div>

      <p style="font-size:13px;color:#94a3b8;line-height:1.6;">
        <strong>What you can do:</strong><br />
        • Check your payment app (GPay, PhonePe, Paytm) to verify if the payment was debited or refunded.<br />
        • Verify that you entered the correct 12-digit UTR number.<br />
        • If money was debited, reply directly to this email with your transaction receipt, and our team will resolve it manually.
      </p>

      <div style="text-align:center;margin:24px 0 8px 0;">
        <a href="${appUrl}" style="display:inline-block;padding:12px 24px;background-color:#374151;color:#ffffff;border-radius:8px;font-weight:bold;font-size:13px;text-decoration:none;">
          Visit StudyRoom Website &rarr;
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
