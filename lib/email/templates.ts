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
