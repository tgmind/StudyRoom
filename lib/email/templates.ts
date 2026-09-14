export type AlertType = "A" | "I" | "D";

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
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }
  return "https://studyroom.app";
}

/**
 * Generate polished, spam-proof transactional emails for StudyRoom.
 * Supports:
 *  - Type A: Achiever's Title 🏆
 *  - Type I: Account Activity Notice ⚠️ (3 consecutive days inactive)
 *  - Type D: Account Deletion Alert 🚨 (5 consecutive days inactive)
 */
export function generateAlertEmail(
  type: AlertType,
  rawName: string,
  consecutiveDays: number = 0
): EmailTemplatePayload {
  const name = escapeHtml(rawName || "Student");
  const year = new Date().getFullYear();
  const appUrl = getAppUrl();
  const loginUrl = `${appUrl}/login`;
  const roomUrl = `${appUrl}/room`;

  // Shared responsive email wrapper styling
  const wrapperStyle =
    "margin:0;padding:32px 16px;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;line-height:1.6;";
  const cardStyle =
    "max-width:560px;margin:0 auto;background-color:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);";
  const headerStyle =
    "padding:28px 32px;text-align:center;border-bottom:1px solid #334155;";
  const bodyStyle = "padding:32px 32px 24px 32px;";
  const footerStyle =
    "padding:20px 32px 28px 32px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #334155;line-height:1.5;";
  const btnBase =
    "display:inline-block;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;text-align:center;";

  /* =========================================================
     TYPE A: ACHIEVER'S TITLE
     ========================================================= */
  if (type === "A") {
    const subject = `StudyRoom | Achiever's Title Awarded: ${rawName}`;

    const text = `Congratulations, ${rawName}!\n\n` +
      `You have earned the Achiever's Title for your outstanding performance, dedication, and discipline in StudyRoom.\n\n` +
      `Your consistency sets the standard for the community. Keep up the momentum and defend your title in this week's study sessions.\n\n` +
      `Jump back into the room: ${roomUrl}\n\n` +
      `— The StudyRoom Team\n` +
      `© ${year} StudyRoom. All rights reserved.`;

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
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(16,185,129,0.15) 0%, rgba(30,41,59,0) 100%);">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">🏆</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#064e3b;color:#34d399;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #059669;">
        StudyRoom Milestone
      </span>
      <h1 style="margin:16px 0 0 0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Congratulations, ${name}!
      </h1>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:16px;color:#cbd5e1;margin-top:0;">
        You have earned the prestigious <strong style="color:#34d399;">Achiever's Title</strong> for your study dedication and consistency this week.
      </p>

      <div style="background-color:#0f172a;border-left:4px solid #10b981;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:15px;color:#e2e8f0;font-weight:500;">
          “Dedication, discipline, and daily consistency separate the dreamers from the achievers.”
        </p>
        <p style="margin:8px 0 0 0;font-size:13px;color:#94a3b8;">
          Your focus rank is showcased to motivate your study group.
        </p>
      </div>

      <p style="font-size:15px;color:#94a3b8;margin-bottom:28px;">
        Keep working toward your academic targets and maintain your streak to retain your Achiever's Title next week!
      </p>

      <div style="text-align:center;margin:32px 0 16px 0;">
        <a href="${roomUrl}" style="${btnBase}background-color:#10b981;color:#ffffff;box-shadow:0 4px 14px rgba(16,185,129,0.4);">
          Continue Studying in Room &rarr;
        </a>
      </div>
    </div>

    <div style="${footerStyle}">
      <p style="margin:0 0 6px 0;">You received this achievement recognition because you are an active member of StudyRoom.</p>
      <p style="margin:0;">&copy; ${year} StudyRoom &bull; Empowering Focused Minds</p>
    </div>
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
    const subject = `StudyRoom | Account Activity Notice: ${days} Days Inactive`;

    const text = `Hi ${rawName},\n\n` +
      `We noticed that you have been inactive on StudyRoom for ${days} consecutive days.\n\n` +
      `Regular participation is essential to maintaining your study habits and keeping your desk reserved in the room.\n\n` +
      `Under the StudyRoom Community Policy, accounts with extended inactivity are reviewed for dormant status. Please log in today and log a session to keep your account active:\n\n` +
      `${loginUrl}\n\n` +
      `— The StudyRoom Team\n` +
      `© ${year} StudyRoom. All rights reserved.`;

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
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(245,158,11,0.15) 0%, rgba(30,41,59,0) 100%);">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">⚠️</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#78350f;color:#fcd34d;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #d97706;">
        Account Notice &bull; ${days} Days Inactive
      </span>
      <h1 style="margin:16px 0 0 0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Study Activity Notice
      </h1>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:16px;color:#cbd5e1;margin-top:0;">
        Hi <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:15px;color:#cbd5e1;line-height:1.6;">
        Our system noticed that your StudyRoom account has recorded <strong>0 study activity for ${days} consecutive days</strong>.
      </p>

      <div style="background-color:#0f172a;border-left:4px solid #f59e0b;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#fef3c7;font-weight:600;">
          Notice: Inactive Account Policy
        </p>
        <p style="margin:6px 0 0 0;font-size:13px;color:#94a3b8;line-height:1.5;">
          StudyRoom desks are maintained for committed participants. Prolonged inactivity beyond 5 days places accounts in line for automatic cleanup.
        </p>
      </div>

      <p style="font-size:15px;color:#94a3b8;margin-bottom:28px;">
        Getting back on track takes just one focused session. Log in today, connect with your study group, and keep your account in good standing.
      </p>

      <div style="text-align:center;margin:32px 0 16px 0;">
        <a href="${loginUrl}" style="${btnBase}background-color:#f59e0b;color:#0f172a;box-shadow:0 4px 14px rgba(245,158,11,0.3);">
          Log In &amp; Resume Study &rarr;
        </a>
      </div>
    </div>

    <div style="${footerStyle}">
      <p style="margin:0 0 6px 0;">This is an automated activity check-in per the StudyRoom account maintenance policy.</p>
      <p style="margin:0;">&copy; ${year} StudyRoom &bull; Empowering Focused Minds</p>
    </div>
  </div>
</body>
</html>`;

    return { subject, text, html };
  }

  /* =========================================================
     TYPE D: ACCOUNT DELETION ALERT (5 DAYS INACTIVE)
     ========================================================= */
  const days = consecutiveDays >= 5 ? consecutiveDays : 5;
  const subject = `StudyRoom | Urgent: Account Scheduled for Deletion (${days} Days Inactive)`;

  const text = `URGENT ACTION REQUIRED: ${rawName}\n\n` +
    `Your StudyRoom account has been inactive for ${days} consecutive days.\n\n` +
    `Per the StudyRoom Community Retention Policy, accounts inactive for 5 or more consecutive days are scheduled for immediate removal/deletion to free room capacity for active students.\n\n` +
    `If you wish to retain your account, streak history, and badges, you MUST log in and start a study session immediately:\n\n` +
    `${loginUrl}\n\n` +
    `Failure to take action will result in permanent loss of your profile data.\n\n` +
    `— The StudyRoom Administration\n` +
    `© ${year} StudyRoom. All rights reserved.`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="${wrapperStyle}">
  <div style="${cardStyle}border-color:#e11d48;">
    <div style="${headerStyle}background:linear-gradient(180deg, rgba(225,29,72,0.2) 0%, rgba(30,41,59,0) 100%);">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">🚨</div>
      <span style="display:inline-block;padding:4px 12px;background-color:#881337;color:#fecdd3;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:999px;border:1px solid #be123c;">
        Action Required &bull; ${days} Days Inactive
      </span>
      <h1 style="margin:16px 0 0 0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
        Account Deletion Alert
      </h1>
    </div>

    <div style="${bodyStyle}">
      <p style="font-size:16px;color:#cbd5e1;margin-top:0;">
        Attention <strong style="color:#ffffff;">${name}</strong>,
      </p>
      <p style="font-size:15px;color:#fecdd3;line-height:1.6;">
        Your StudyRoom account has been detected as <strong>inactive for ${days} consecutive days</strong>.
      </p>

      <div style="background-color:#4c0519;border-left:4px solid #f43f5e;border-radius:8px;padding:16px 20px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#ffe4e6;font-weight:700;">
          Scheduled for Permanent Removal
        </p>
        <p style="margin:6px 0 0 0;font-size:13px;color:#fecdd3;line-height:1.5;">
          Under the StudyRoom Member Policy, accounts inactive for 5 or more days are purged to preserve platform resources and active desk capacity.
        </p>
      </div>

      <p style="font-size:15px;color:#cbd5e1;margin-bottom:28px;">
        To stop account deletion and protect your study history, badges, and progress, you must log in immediately.
      </p>

      <div style="text-align:center;margin:32px 0 16px 0;">
        <a href="${loginUrl}" style="${btnBase}background-color:#e11d48;color:#ffffff;box-shadow:0 4px 14px rgba(225,29,72,0.4);">
          Save My Account &amp; Log In &rarr;
        </a>
      </div>
    </div>

    <div style="${footerStyle}">
      <p style="margin:0 0 6px 0;">This critical notice was issued to ${name} regarding StudyRoom account dormancy.</p>
      <p style="margin:0;">&copy; ${year} StudyRoom &bull; Administration</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
