import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inMemorySubmissions,
  deleteSubmission,
  clearSubmissions,
} from "@/lib/public-website/submissionStore";
import { isAuthorizedAdmin, verifySameOrigin } from "@/lib/public-website/authUtils";
import {
  generateEnrollmentToken,
  generateAccessToken,
  generateOtpCode,
  hashToken,
  checkRateLimit,
} from "@/lib/auth/enrollment";
import {
  sendUserPaymentVerifiedEmail,
  sendUserPaymentRejectedEmail,
} from "@/lib/email/mailer";
import { getAppUrl } from "@/lib/email/templates";

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const supabase = createAdminClient() || (await createClient());
      const { data, error } = await (supabase as any)
        .from("public_payment_submissions")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(100);

      if (!error && Array.isArray(data)) {
        const mapped = data.map((d: any) => ({
          id: d.id,
          name: d.name,
          email: d.email || (d.contact && d.contact.includes("@") ? d.contact : null),
          phone: d.phone || (!d.contact?.includes("@") ? d.contact : null),
          contact: d.contact,
          utr: d.utr,
          amount: Number(d.amount) || 20,
          submittedAt: d.submitted_at || d.submittedAt || d.created_at || new Date().toISOString(),
          status: d.status || "pending",
          emailDeliveryStatus: d.email_delivery_status || (d.status === "verified" ? "SENT" : "NOT SENT"),
          emailDeliveryError: d.email_delivery_error || null,
          verifiedAt: d.verified_at,
          verifiedBy: d.verified_by,
          notes: d.notes,
        }));
        return NextResponse.json({ submissions: mapped });
      }
    } catch {}

    // Fallback to in-memory submissions
    return NextResponse.json({ submissions: inMemorySubmissions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to fetch submissions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden: Cross-origin request rejected" }, { status: 403 });
    }

    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id, status, notes, action } = body;

    const adminClient = createAdminClient();

    // -------------------------------------------------------------
    // ACTION: RESEND ACCESS EMAIL
    // -------------------------------------------------------------
    if (action === "resend_access" || body.action === "resend_access") {
      if (!id) {
        return NextResponse.json({ error: "Submission ID is required to resend access" }, { status: 400 });
      }

      // Rate limit resend requests (1 resend per 30 seconds per submission)
      const rateLimitKey = `resend_access:${id}`;
      const rateCheck = checkRateLimit(rateLimitKey, 1, 30 * 1000);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: "Please wait 30 seconds before resending another access email." },
          { status: 429 }
        );
      }

      if (adminClient) {
        // Find existing grant by payment_submission_id
        const { data: grant } = await adminClient
          .from("enrollment_grants")
          .select("id, name, email, contact, otp_code, status, payment_submission_id")
          .eq("payment_submission_id", id)
          .maybeSingle();

        if (!grant) {
          return NextResponse.json(
            { error: "Enrollment grant not found for this payment submission." },
            { status: 404 }
          );
        }

        // Prevent resending if account has already been registered
        if (grant.status === "consumed") {
          return NextResponse.json(
            { error: "Cannot resend access link: Student account is already created and grant is consumed." },
            { status: 400 }
          );
        }

        if (grant.status === "revoked") {
          return NextResponse.json(
            { error: "Cannot resend access link: Enrollment grant is revoked." },
            { status: 400 }
          );
        }

        // Fetch submission to resolve email if not directly on grant
        let targetEmail = grant.email;
        if (!targetEmail) {
          const { data: sub } = await adminClient
            .from("public_payment_submissions")
            .select("email, contact")
            .eq("id", id)
            .maybeSingle();
          targetEmail = sub?.email || (sub?.contact?.includes("@") ? sub.contact : grant.contact);
        }

        if (!targetEmail || !targetEmail.includes("@")) {
          return NextResponse.json(
            { error: "No recipient email address on file for this submission." },
            { status: 400 }
          );
        }

        // Generate fresh single-use access token and invalidate previous token
        const freshAccessToken = generateAccessToken();
        const freshTokenHash = hashToken(freshAccessToken);

        const { error: updateErr } = await adminClient
          .from("enrollment_grants")
          .update({
            access_token_hash: freshTokenHash,
            access_token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            status: "preverified",
            updated_at: new Date().toISOString(),
          })
          .eq("id", grant.id);

        if (updateErr) {
          return NextResponse.json({ error: `Failed to update access token: ${updateErr.message}` }, { status: 500 });
        }

        const accessLink = `${getAppUrl()}/api/auth/redeem-access?token=${freshAccessToken}`;
        const sendResult = await sendUserPaymentVerifiedEmail({
          name: grant.name || "Student",
          email: targetEmail,
          accessLink,
        });

        const emailStatus = sendResult.success ? "SENT" : "FAILED";
        const emailError = sendResult.success ? null : (sendResult.error || "Email delivery failed");

        await adminClient
          .from("public_payment_submissions")
          .update({
            email_delivery_status: emailStatus,
            email_delivery_error: emailError,
          })
          .eq("id", id);

        if (!sendResult.success) {
          return NextResponse.json({
            success: false,
            error: `Failed to dispatch access email: ${sendResult.error || "Mail delivery error"}`,
            emailDeliveryStatus: "FAILED",
          }, { status: 502 });
        }

        return NextResponse.json({
          success: true,
          message: `Access email successfully resent to ${targetEmail}.`,
          emailDeliveryStatus: "SENT",
        });
      }

      return NextResponse.json({ success: true, message: "Access email simulated (in-memory mode)." });
    }

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    // -------------------------------------------------------------
    // STATUS: VERIFIED
    // -------------------------------------------------------------
    if (status === "verified") {
      let verifiedOtp = "1234";
      let recipientEmail = "";
      let studentName = "Student";
      let emailDeliveryStatus: "SENT" | "FAILED" | "NOT SENT" = "NOT SENT";
      let emailDeliveryError: string | null = null;

      if (adminClient) {
        // Fetch submission
        const { data: sub } = await adminClient
          .from("public_payment_submissions")
          .select("id, claim_secret_hash, name, email, phone, contact, utr")
          .eq("id", id)
          .maybeSingle();

        studentName = sub?.name || "Student";
        recipientEmail = sub?.email || (sub?.contact?.includes("@") ? sub.contact : "");
        const studentPhone = sub?.phone || "";

        const tokenHash = sub?.claim_secret_hash || hashToken(generateEnrollmentToken());
        const otpCode = generateOtpCode();
        verifiedOtp = otpCode;

        const accessToken = generateAccessToken();
        const accessTokenHash = hashToken(accessToken);

        // Try RPC with p_access_token_hash (supported after migration)
        let rpcRes = null;
        let rpcErr = null;

        const call1 = await adminClient.rpc("rpc_verify_payment_and_create_grant", {
          p_submission_id: id,
          p_token_hash: tokenHash,
          p_otp: otpCode,
          p_admin_identifier: "platform_admin",
          p_access_token_hash: accessTokenHash,
        });

        if (call1.error && call1.error.message?.includes("function")) {
          // Fallback to 4-parameter call if migration not yet applied
          const call2 = await adminClient.rpc("rpc_verify_payment_and_create_grant", {
            p_submission_id: id,
            p_token_hash: tokenHash,
            p_otp: otpCode,
            p_admin_identifier: "platform_admin",
          });
          rpcRes = call2.data;
          rpcErr = call2.error;
        } else {
          rpcRes = call1.data;
          rpcErr = call1.error;
        }

        if (rpcErr) {
          console.error("[Admin Submissions] Verify RPC error:", rpcErr.message);
          return NextResponse.json({ error: `Database error: ${rpcErr.message}` }, { status: 500 });
        }

        if (!rpcRes?.success) {
          return NextResponse.json({ error: rpcRes?.error || "Verification failed" }, { status: 400 });
        }

        const grantId = rpcRes.grant_id;
        if (rpcRes.otp) verifiedOtp = rpcRes.otp;

        // Ensure email, phone, and access token hash are recorded on the grant
        if (grantId) {
          await adminClient
            .from("enrollment_grants")
            .update({
              email: recipientEmail || undefined,
              phone: studentPhone || undefined,
              access_token_hash: accessTokenHash,
              access_token_expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            })
            .eq("id", grantId);
        }

        // Dispatch verified access email to student & record delivery status
        emailDeliveryStatus = "NOT SENT";
        emailDeliveryError = null;

        if (recipientEmail) {
          const accessLink = `${getAppUrl()}/api/auth/redeem-access?token=${accessToken}`;
          try {
            const sendResult = await sendUserPaymentVerifiedEmail({
              name: studentName,
              email: recipientEmail,
              accessLink,
            });
            if (sendResult.success) {
              emailDeliveryStatus = "SENT";
            } else {
              emailDeliveryStatus = "FAILED";
              emailDeliveryError = sendResult.error || "Failed to deliver access email";
            }
          } catch (mailErr: any) {
            emailDeliveryStatus = "FAILED";
            emailDeliveryError = mailErr?.message || "Failed to deliver access email";
          }
        }

        // Persist email delivery status on public_payment_submissions
        await adminClient
          .from("public_payment_submissions")
          .update({
            email_delivery_status: emailDeliveryStatus,
            email_delivery_error: emailDeliveryError,
          })
          .eq("id", id);
      }

      // Update in-memory item
      const memoryItem = inMemorySubmissions.find((s) => s.id === id);
      if (memoryItem) {
        memoryItem.status = "verified";
        if (notes) memoryItem.notes = notes;
      }

      return NextResponse.json({
        success: true,
        message: "Payment verified, enrollment grant generated, and access email dispatched.",
        otp: verifiedOtp,
        emailDeliveryStatus,
        emailDeliveryError,
      });
    }

    // -------------------------------------------------------------
    // STATUS: REJECTED OR CUSTOM
    // -------------------------------------------------------------
    if (adminClient) {
      // Fetch submission before update to get email/utr
      const { data: sub } = await adminClient
        .from("public_payment_submissions")
        .select("name, email, contact, utr")
        .eq("id", id)
        .maybeSingle();

      const { error } = await (adminClient as any)
        .from("public_payment_submissions")
        .update({
          status,
          notes,
          verified_at: null,
        })
        .eq("id", id);

      if (error) {
        console.error("Database error updating submission status:", error);
        return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
      }

      if (status === "rejected" && sub) {
        const studentEmail = sub.email || (sub.contact?.includes("@") ? sub.contact : "");
        if (studentEmail) {
          sendUserPaymentRejectedEmail({
            name: sub.name || "Student",
            email: studentEmail,
            utr: sub.utr,
            reason: notes || "Payment reference could not be verified against bank records.",
          }).catch((mailErr) => {
            console.warn("[Admin Submissions] Failed to dispatch rejection email:", mailErr);
          });
        }
      }
    }

    const memoryItem = inMemorySubmissions.find((s) => s.id === id);
    if (memoryItem) {
      memoryItem.status = status;
      if (notes) memoryItem.notes = notes;
    }

    return NextResponse.json({ success: true, message: `Submission marked as ${status}` });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to update submission" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden: Cross-origin request rejected" }, { status: 403 });
    }

    const authorized = await isAuthorizedAdmin(request);
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { id, all, status } = body;

    if (id) {
      await deleteSubmission(id);
      return NextResponse.json({ success: true, message: "Submission deleted successfully." });
    }

    if (all === true) {
      await clearSubmissions({ all: true });
      return NextResponse.json({ success: true, message: "All submissions deleted successfully." });
    }

    if (status) {
      await clearSubmissions({ status });
      return NextResponse.json({ success: true, message: `All ${status} submissions deleted successfully.` });
    }

    return NextResponse.json({ error: "Missing delete criteria (id, all, or status required)." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to delete submission" }, { status: 500 });
  }
}
