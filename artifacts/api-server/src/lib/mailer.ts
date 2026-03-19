import nodemailer from "nodemailer";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@plunderandriffle.com";
const APP_URL = process.env.APP_URL || "https://plunderandriffle.com";

export async function sendOtpEmail(to: string, code: string): Promise<{ devCode?: string }> {
  const subject = "Your Plunder & Riffle sign-in code";
  const html = `
    <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
      <h2 style="margin:0 0 8px">Plunder &amp; Riffle</h2>
      <p style="color:#666;margin:0 0 24px">Your sign-in code:</p>
      <div style="font-size:40px;font-weight:700;letter-spacing:8px;color:#f7931a;padding:24px;background:#111;border-radius:8px;text-align:center">${code}</div>
      <p style="color:#666;margin:24px 0 0;font-size:13px">Expires in 10 minutes. If you didn't request this, ignore it.</p>
    </div>
  `;

  // Resend (production)
  if (RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error("[mailer] Resend error:", err);
    } else {
      console.log(`[mailer] OTP sent via Resend to ${to}`);
    }
    return {};
  }

  // Dev fallback: log prominently and return code for dev banner
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  OTP for ${to}: ${code}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  return { devCode: code };
}
