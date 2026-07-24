/**
 * SMTP diagnostics — confirms credentials and connectivity before a real
 * order depends on them.
 *
 *   npm run email:verify                    # connect + authenticate only
 *   npm run email:verify -- you@example.com # also send a real test message
 */
import {
  emailConfigured,
  sendEmail,
  verifyEmailTransport,
} from "../src/lib/email/send";
import { welcomeEmail } from "../src/lib/email/templates";

async function main() {
  if (!emailConfigured()) {
    console.error(
      "❌ SMTP is not configured.\n" +
        "   Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD in .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Connecting to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}…`,
  );

  const result = await verifyEmailTransport();
  if (!result.ok) {
    console.error(`❌ SMTP verification failed: ${result.error}`);
    console.error(
      "\nCommon causes:\n" +
        "  • Gmail/Workspace needs an App Password, not your account password\n" +
        "  • Port 587 requires STARTTLS; port 465 requires implicit TLS\n" +
        "  • The sending host may be blocked by your network or firewall",
    );
    process.exitCode = 1;
    return;
  }
  console.log("✅ SMTP connection and credentials are valid.");

  const recipient = process.argv[2];
  if (!recipient) {
    console.log("\nPass an address to send a real test message:");
    console.log("  npm run email:verify -- you@example.com");
    return;
  }

  console.log(`\nSending a test message to ${recipient}…`);
  const sent = await sendEmail({
    to: recipient,
    ...welcomeEmail({ name: "there" }),
  });

  if (sent) {
    console.log("✅ Sent. Check the inbox (and the spam folder).");
    console.log(
      "\nIf it landed in spam, add SPF, DKIM and DMARC records for your " +
        "EMAIL_FROM domain at your DNS provider.",
    );
  } else {
    console.error("❌ Send failed — see the logged error above.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
