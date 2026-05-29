import { createTransport, Transporter } from 'nodemailer';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Centralized email service.
 *
 * - SMTP config is runtime-configurable from admin dashboard via platform_settings
 * - Emails are queued in email_outbox, processed by a worker loop
 * - Templates rendered server-side
 * - Retries on failure (max 3 attempts)
 * - Delivery logs stored for audit
 *
 * Supported templates:
 *   welcome, verify_email, password_reset, deploy_success, deploy_failed,
 *   billing_receipt, invoice_issued, team_invite, domain_verified, ssl_activated
 */

let cachedTransport: Transporter | null = null;
let cachedConfigHash = '';

async function getSmtpConfig(): Promise<Record<string, string>> {
  const res = await query(
    `SELECT key, value FROM platform_settings WHERE key LIKE 'smtp.%'`
  );
  const cfg: Record<string, string> = {};
  for (const row of res.rows) {
    cfg[row.key.replace('smtp.', '')] = row.value;
  }
  return cfg;
}

async function getTransport(): Promise<Transporter | null> {
  const cfg = await getSmtpConfig();
  if (!cfg.host) {
    // Fall back to env vars
    const envHost = process.env.SMTP_HOST;
    if (!envHost) return null;
    cfg.host = envHost;
    cfg.port = process.env.SMTP_PORT ?? '587';
    cfg.user = process.env.SMTP_USER ?? '';
    cfg.pass = process.env.SMTP_PASS ?? '';
    cfg.from_email = process.env.SMTP_FROM ?? 'noreply@flame.app';
    cfg.from_name = process.env.SMTP_FROM_NAME ?? 'Flame Core';
    cfg.tls = process.env.SMTP_TLS ?? 'true';
  }

  const hash = JSON.stringify(cfg);
  if (cachedTransport && hash === cachedConfigHash) return cachedTransport;

  cachedTransport = createTransport({
    host: cfg.host,
    port: parseInt(cfg.port ?? '587'),
    secure: cfg.tls === 'true' && parseInt(cfg.port ?? '587') === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: cfg.tls !== 'false' },
  });
  cachedConfigHash = hash;
  return cachedTransport;
}

const TEMPLATES: Record<string, { subject: string; text: (d: any) => string; html: (d: any) => string }> = {
  welcome: {
    subject: 'Welcome to Flame Core 🔥',
    text: (d) => `Hi ${d.name},\n\nWelcome to Flame Core! Your account is ready.\n\nDeploy your first app: ${d.dashboard_url}\n\n— Flame Core Team`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e"><h2 style="color:#FF4D1F">Welcome to Flame Core 🔥</h2><p>Hi ${d.name},</p><p>Your account is ready. Deploy your first app in 42 seconds.</p><a href="${d.dashboard_url}" style="display:inline-block;background:#FF4D1F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open Dashboard →</a><p style="color:#666;margin-top:24px;font-size:13px">Flame Core Technology LTD · Built in Lagos · Deployed worldwide</p></div>`,
  },
  verify_email: {
    subject: 'Verify your email address',
    text: (d) => `Hi ${d.name},\n\nVerify your email: ${d.verify_url}\n\nThis link expires in 24 hours.`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#FF4D1F">Verify your email</h2><p>Hi ${d.name},</p><p>Click below to verify your email address:</p><a href="${d.verify_url}" style="display:inline-block;background:#FF4D1F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a><p style="color:#666;font-size:13px;margin-top:16px">This link expires in 24 hours.</p></div>`,
  },
  password_reset: {
    subject: 'Reset your password',
    text: (d) => `Hi ${d.name},\n\nReset your password: ${d.reset_url}\n\nExpires in 1 hour. Ignore this email if you didn't request it.`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#FF4D1F">Reset your password</h2><p>Hi ${d.name},</p><a href="${d.reset_url}" style="display:inline-block;background:#FF4D1F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a><p style="color:#666;font-size:13px;margin-top:16px">Expires in 1 hour. Ignore if you didn't request this.</p></div>`,
  },
  deploy_success: {
    subject: '✅ Deployment successful — ${d.project}',
    text: (d) => `Deployment ${d.deployment_id} is live at ${d.url}\n\nProject: ${d.project}\nCommit: ${d.commit}\nRegion: ${d.region}\nDuration: ${d.duration}`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#27D17F">✅ Deployed successfully</h2><p><strong>${d.project}</strong> is live.</p><table style="width:100%;font-size:14px;border-collapse:collapse"><tr><td style="padding:6px 0;color:#666">URL</td><td style="padding:6px 0"><a href="https://${d.url}">${d.url}</a></td></tr><tr><td style="padding:6px 0;color:#666">Commit</td><td style="padding:6px 0;font-family:monospace">${d.commit}</td></tr><tr><td style="padding:6px 0;color:#666">Region</td><td style="padding:6px 0">${d.region}</td></tr><tr><td style="padding:6px 0;color:#666">Duration</td><td style="padding:6px 0">${d.duration}</td></tr></table></div>`,
  },
  deploy_failed: {
    subject: '❌ Deployment failed — ${d.project}',
    text: (d) => `Deployment ${d.deployment_id} failed.\n\nProject: ${d.project}\nError: ${d.error}\n\nView logs: ${d.logs_url}`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#FF5F56">❌ Deployment failed</h2><p><strong>${d.project}</strong> failed to deploy.</p><p style="background:#2a1a1a;color:#ff8888;padding:12px;border-radius:8px;font-family:monospace;font-size:13px">${d.error}</p><a href="${d.logs_url}" style="display:inline-block;background:#FF4D1F;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px">View Build Logs</a></div>`,
  },
  billing_receipt: {
    subject: 'Payment received — ${d.invoice_number}',
    text: (d) => `Payment of ${d.amount} received for ${d.plan_name}.\n\nInvoice: ${d.invoice_number}\nPeriod: ${d.period}`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#FF4D1F">Payment received</h2><p>Thank you! Your payment of <strong>${d.amount}</strong> for the ${d.plan_name} plan has been processed.</p><table style="width:100%;font-size:14px;border-collapse:collapse"><tr><td style="padding:6px 0;color:#666">Invoice</td><td style="padding:6px 0">${d.invoice_number}</td></tr><tr><td style="padding:6px 0;color:#666">Period</td><td style="padding:6px 0">${d.period}</td></tr></table></div>`,
  },
  invoice_issued: {
    subject: 'Invoice ${d.invoice_number} — ${d.amount} due',
    text: (d) => `Invoice ${d.invoice_number} for ${d.amount} is due on ${d.due_date}.\n\nPay now: ${d.pay_url}`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#FF4D1F">Invoice ${d.invoice_number}</h2><p>Amount due: <strong>${d.amount}</strong></p><p>Due date: ${d.due_date}</p><a href="${d.pay_url}" style="display:inline-block;background:#FF4D1F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Pay Now</a></div>`,
  },
  team_invite: {
    subject: "You've been invited to ${d.team_name} on Flame Core",
    text: (d) => `${d.inviter} invited you to join ${d.team_name} on Flame Core.\n\nAccept: ${d.invite_url}`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#FF4D1F">Team invitation</h2><p><strong>${d.inviter}</strong> invited you to join <strong>${d.team_name}</strong>.</p><a href="${d.invite_url}" style="display:inline-block;background:#FF4D1F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Accept Invite</a></div>`,
  },
  domain_verified: {
    subject: '✅ Domain verified — ${d.domain}',
    text: (d) => `Your domain ${d.domain} has been verified and is now active.`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#27D17F">✅ Domain verified</h2><p><strong>${d.domain}</strong> is now active and serving your deployment.</p></div>`,
  },
  ssl_activated: {
    subject: '🔒 SSL certificate active — ${d.domain}',
    text: (d) => `SSL certificate for ${d.domain} is now active. Your site is served over HTTPS.`,
    html: (d) => `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#27D17F">🔒 SSL Active</h2><p>HTTPS is now enabled for <strong>${d.domain}</strong>.</p></div>`,
  },
};

export const emailService = {
  /** Queue an email for delivery. Processed asynchronously by the email worker. */
  async queue(to: string, template: string, data: Record<string, any>, toName?: string): Promise<string> {
    const tpl = TEMPLATES[template];
    if (!tpl) throw new Error(`Unknown email template: ${template}`);

    const id = uuidv4();
    const subject = tpl.subject.replace(/\$\{d\.(\w+)\}/g, (_, k) => data[k] ?? '');
    const html = tpl.html(data);
    const text = tpl.text(data);

    await query(
      `INSERT INTO email_outbox (id, to_email, to_name, subject, template, template_data, html_body, text_body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, to, toName, subject, template, JSON.stringify(data), html, text]
    );

    logger.info('email queued', { id, to, template });
    return id;
  },

  /** Process pending emails. Called by a worker interval. */
  async processQueue(batchSize = 10): Promise<number> {
    const transport = await getTransport();
    if (!transport) {
      logger.debug('email: no transport configured, skipping');
      return 0;
    }

    const cfg = await getSmtpConfig();
    const fromEmail = cfg.from_email || process.env.SMTP_FROM || 'noreply@flame.app';
    const fromName = cfg.from_name || process.env.SMTP_FROM_NAME || 'Flame Core';

    const pending = await query(
      `UPDATE email_outbox SET status = 'sending', attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM email_outbox
           WHERE status IN ('pending','failed') AND attempts < max_attempts
           ORDER BY created_at ASC LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
       RETURNING *`,
      [batchSize]
    );

    let sent = 0;
    for (const email of pending.rows) {
      try {
        await transport.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: email.to_name ? `"${email.to_name}" <${email.to_email}>` : email.to_email,
          subject: email.subject,
          html: email.html_body,
          text: email.text_body,
        });

        await query(
          `UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = $1`,
          [email.id]
        );
        sent++;
      } catch (err: any) {
        logger.error('email send failed', { id: email.id, error: err.message });
        await query(
          `UPDATE email_outbox SET status = 'failed', error_message = $2 WHERE id = $1`,
          [email.id, err.message]
        );
      }
    }

    if (sent > 0) logger.info(`email: sent ${sent}/${pending.rowCount} emails`);
    return sent;
  },

  /** Update SMTP settings from admin panel. */
  async updateSmtpSettings(settings: Record<string, string>, adminUserId: string): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO platform_settings (key, value, encrypted, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $4, updated_at = now()`,
        [`smtp.${key}`, value, key === 'pass', adminUserId]
      );
    }
    cachedTransport = null; // Force reconnection
    cachedConfigHash = '';
    logger.info('smtp settings updated by admin', { admin: adminUserId });
  },

  /** Get current SMTP settings (password masked). */
  async getSmtpSettings(): Promise<Record<string, string>> {
    const cfg = await getSmtpConfig();
    if (cfg.pass) cfg.pass = '••••••••';
    return cfg;
  },

  /** Test SMTP connection. */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const transport = await getTransport();
      if (!transport) return { ok: false, error: 'No SMTP configured' };
      await transport.verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
};
