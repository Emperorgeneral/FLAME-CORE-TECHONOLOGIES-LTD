import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import nodemailer from 'nodemailer';
import pg from 'pg';
import bcrypt from 'bcryptjs';

dotenv.config();

const {
  PORT = '5080',
  DATABASE_URL,
  JWT_SECRET,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_PASSWORD_HASH,
  MAIL_FROM_ADDRESS,
  MAIL_FROM_NAME = 'Flame Core Technologies LTD',
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  MAIL_NOTIFY_TO,
} = process.env;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL is required');
if (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH) throw new Error('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required');
if (!MAIL_FROM_ADDRESS) throw new Error('MAIL_FROM_ADDRESS is required');

const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
const uploadsDir = '/var/www/projects/flame-core-marketing/uploads';

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDir),
  filename: (_request, file, callback) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'media';
    callback(null, `${Date.now()}-${safeBase}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 },
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const transporter =
  SMTP_HOST
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT || 587),
        secure: SMTP_SECURE === 'true',
        ignoreTLS: SMTP_HOST === '127.0.0.1' && String(SMTP_PORT || 587) === '25',
        auth: SMTP_USER && SMTP_PASS
          ? {
              user: SMTP_USER,
              pass: SMTP_PASS,
            }
          : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: '/usr/sbin/sendmail',
      });

const seedPosts = [
  {
    title: 'How premium digital execution improves business trust',
    slug: 'premium-digital-execution-improves-business-trust',
    excerpt:
      'A stronger digital presence is not just about visuals — it shapes credibility, conversion, and how confidently customers engage your brand.',
    content:
      'Businesses are judged quickly online. A polished website, clear messaging, and dependable product experience all combine to signal trust. At Flame Core, we design systems that do more than look modern. We build digital assets that support credibility, reduce friction, and make your offer feel ready for serious clients.\n\nThat means fast performance, strong structure, clean UI, and practical technical foundations that keep the experience stable after launch.',
    coverImageUrl: '/images/flamecore-hero.jpg',
    mediaType: 'image',
    mediaUrl: null,
    authorName: 'Flame Core Editorial',
    tags: ['Brand', 'Web', 'Trust'],
    isPublished: true,
  },
  {
    title: 'What businesses should expect from custom software',
    slug: 'what-businesses-should-expect-from-custom-software',
    excerpt:
      'Custom software should fit operations, remove friction, and improve decision-making — not add complexity for your team.',
    content:
      'The best custom software is shaped around the actual business. It should reflect your workflows, simplify repetitive tasks, and give leadership better visibility. We treat software as an operational advantage: one that should save time, improve coordination, and remain flexible as the company grows.\n\nThat is why our process combines discovery, design, technical architecture, and rollout support instead of jumping straight into code.',
    coverImageUrl: '/images/flamecore-about.jpg',
    mediaType: 'image',
    mediaUrl: null,
    authorName: 'Flame Core Editorial',
    tags: ['Software', 'Operations', 'Growth'],
    isPublished: true,
  },
];

function mapPost(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    coverImageUrl: row.cover_image_url,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    authorName: row.author_name,
    tags: row.tags || [],
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      cover_image_url TEXT,
      media_type TEXT NOT NULL DEFAULT 'image',
      media_url TEXT,
      author_name TEXT NOT NULL DEFAULT 'Flame Core Editorial',
      tags TEXT[] NOT NULL DEFAULT '{}',
      is_published BOOLEAN NOT NULL DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'website',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mail_messages (
      id SERIAL PRIMARY KEY,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      recipients TEXT[] NOT NULL DEFAULT '{}',
      recipient_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const count = await pool.query(`SELECT COUNT(*)::int AS count FROM blog_posts`);
  if (count.rows[0].count === 0) {
    for (const post of seedPosts) {
      await pool.query(
        `INSERT INTO blog_posts
          (title, slug, excerpt, content, cover_image_url, media_type, media_url, author_name, tags, is_published, published_at)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10 THEN NOW() ELSE NULL END)`,
        [
          post.title,
          post.slug,
          post.excerpt,
          post.content,
          post.coverImageUrl,
          post.mediaType,
          post.mediaUrl,
          post.authorName,
          post.tags,
          post.isPublished,
        ],
      );
    }
  }
}

function getTokenPayload(request) {
  const token = request.cookies.admin_session;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAdmin(request, response, next) {
  const payload = getTokenPayload(request);
  if (!payload?.email || payload.email !== ADMIN_EMAIL) {
    return response.status(401).json({ message: 'Unauthorized' });
  }
  request.admin = payload;
  next();
}

async function passwordMatches(candidate) {
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(candidate, ADMIN_PASSWORD_HASH);
  return candidate === ADMIN_PASSWORD;
}

async function sendMail({ to, subject, text }) {
  return transporter.sendMail({
    from: `${MAIL_FROM_NAME} <${MAIL_FROM_ADDRESS}>`,
    to,
    replyTo: MAIL_FROM_ADDRESS,
    subject,
    text,
  });
}

app.get('/healthz', async (_request, response) => {
  await pool.query('SELECT 1');
  response.json({ ok: true });
});

app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body?.email || '').trim().toLowerCase();
  const password = String(request.body?.password || '');

  if (email !== ADMIN_EMAIL.toLowerCase()) {
    return response.status(401).json({ message: 'Invalid credentials' });
  }

  const valid = await passwordMatches(password);
  if (!valid) {
    return response.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ email: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: '12h' });
  response.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
  response.json({ success: true, user: { email: ADMIN_EMAIL } });
});

app.get('/api/auth/me', (request, response) => {
  const payload = getTokenPayload(request);
  if (!payload?.email) return response.status(401).json({ authenticated: false });
  response.json({ authenticated: true, user: { email: payload.email } });
});

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie('admin_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  });
  response.json({ success: true });
});

app.get('/api/posts', async (request, response) => {
  const publishedOnly = request.query.published === '1';
  const rows = await pool.query(
    `SELECT * FROM blog_posts
     ${publishedOnly ? 'WHERE is_published = true' : ''}
     ORDER BY COALESCE(published_at, created_at) DESC, id DESC`,
  );
  response.json({ posts: rows.rows.map(mapPost) });
});

app.get('/api/posts/:slug', async (request, response) => {
  const row = await pool.query('SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true LIMIT 1', [request.params.slug]);
  if (!row.rows[0]) return response.status(404).json({ message: 'Post not found' });
  response.json({ post: mapPost(row.rows[0]) });
});

app.post('/api/contact', async (request, response) => {
  const name = String(request.body?.name || '').trim();
  const email = String(request.body?.email || '').trim();
  const company = String(request.body?.company || '').trim() || null;
  const message = String(request.body?.message || '').trim();

  if (!name || !email || !message) {
    return response.status(400).json({ message: 'Please complete all required fields.' });
  }

  await pool.query(
    `INSERT INTO contact_leads (name, email, company, message) VALUES ($1,$2,$3,$4)`,
    [name, email, company, message],
  );

  if (MAIL_NOTIFY_TO) {
    await sendMail({
      to: MAIL_NOTIFY_TO,
      subject: `New website inquiry from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nCompany: ${company || '-'}\n\nMessage:\n${message}`,
    }).catch(() => null);
  }

  response.json({ success: true, message: 'Thanks — your message has been received.' });
});

app.get('/api/admin/overview', requireAdmin, async (_request, response) => {
  const [posts, published, leads, mail] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM blog_posts'),
    pool.query('SELECT COUNT(*)::int AS count FROM blog_posts WHERE is_published = true'),
    pool.query('SELECT COUNT(*)::int AS count FROM contact_leads'),
    pool.query('SELECT COUNT(*)::int AS count FROM mail_messages'),
  ]);

  response.json({
    postCount: posts.rows[0].count,
    publishedCount: published.rows[0].count,
    leadCount: leads.rows[0].count,
    mailCount: mail.rows[0].count,
  });
});

app.get('/api/admin/posts', requireAdmin, async (_request, response) => {
  const rows = await pool.query(`SELECT * FROM blog_posts ORDER BY updated_at DESC, id DESC`);
  response.json({ posts: rows.rows.map(mapPost) });
});

app.post('/api/admin/posts', requireAdmin, async (request, response) => {
  const body = request.body || {};
  const row = await pool.query(
    `INSERT INTO blog_posts
      (title, slug, excerpt, content, cover_image_url, media_type, media_url, author_name, tags, is_published, published_at, updated_at)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10 THEN COALESCE($11, NOW()) ELSE NULL END,NOW())
     RETURNING *`,
    [
      body.title,
      body.slug,
      body.excerpt,
      body.content,
      body.coverImageUrl || null,
      body.mediaType || 'image',
      body.mediaUrl || null,
      body.authorName || 'Flame Core Editorial',
      Array.isArray(body.tags) ? body.tags : [],
      Boolean(body.isPublished),
      body.publishedAt || null,
    ],
  );
  response.json({ success: true, post: mapPost(row.rows[0]) });
});

app.put('/api/admin/posts/:id', requireAdmin, async (request, response) => {
  const body = request.body || {};
  const row = await pool.query(
    `UPDATE blog_posts
        SET title = $1,
            slug = $2,
            excerpt = $3,
            content = $4,
            cover_image_url = $5,
            media_type = $6,
            media_url = $7,
            author_name = $8,
            tags = $9,
            is_published = $10,
            published_at = CASE WHEN $10 THEN COALESCE($11, published_at, NOW()) ELSE NULL END,
            updated_at = NOW()
      WHERE id = $12
      RETURNING *`,
    [
      body.title,
      body.slug,
      body.excerpt,
      body.content,
      body.coverImageUrl || null,
      body.mediaType || 'image',
      body.mediaUrl || null,
      body.authorName || 'Flame Core Editorial',
      Array.isArray(body.tags) ? body.tags : [],
      Boolean(body.isPublished),
      body.publishedAt || null,
      Number(request.params.id),
    ],
  );
  if (!row.rows[0]) return response.status(404).json({ message: 'Post not found' });
  response.json({ success: true, post: mapPost(row.rows[0]) });
});

app.delete('/api/admin/posts/:id', requireAdmin, async (request, response) => {
  await pool.query('DELETE FROM blog_posts WHERE id = $1', [Number(request.params.id)]);
  response.json({ success: true });
});

app.get('/api/admin/contacts', requireAdmin, async (_request, response) => {
  const rows = await pool.query('SELECT id, name, email, company, message, created_at FROM contact_leads ORDER BY created_at DESC');
  response.json({
    contacts: rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      company: row.company,
      message: row.message,
      createdAt: row.created_at,
    })),
  });
});

app.get('/api/admin/mail/history', requireAdmin, async (_request, response) => {
  const rows = await pool.query(
    'SELECT id, subject, sender_email, recipients, recipient_count, status, created_at FROM mail_messages ORDER BY created_at DESC LIMIT 50',
  );
  response.json({
    messages: rows.rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      senderEmail: row.sender_email,
      recipients: row.recipients,
      recipientCount: row.recipient_count,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

app.post('/api/admin/upload', requireAdmin, upload.single('file'), async (request, response) => {
  const kind = String(request.body?.kind || 'image');
  const file = request.file;

  if (!file) {
    return response.status(400).json({ message: 'No file uploaded.' });
  }

  if (kind === 'image' && !String(file.mimetype).startsWith('image/')) {
    fs.unlinkSync(file.path);
    return response.status(400).json({ message: 'Uploaded file must be an image.' });
  }

  if (kind === 'video' && !String(file.mimetype).startsWith('video/')) {
    fs.unlinkSync(file.path);
    return response.status(400).json({ message: 'Uploaded file must be a video.' });
  }

  response.json({
    success: true,
    filename: file.filename,
    url: `/uploads/${file.filename}`,
  });
});

app.post('/api/admin/mail/send', requireAdmin, async (request, response) => {
  const subject = String(request.body?.subject || '').trim();
  const body = String(request.body?.body || '').trim();
  const recipientsMode = String(request.body?.recipientsMode || 'all_contacts');
  const customRecipients = String(request.body?.customRecipients || '').trim();

  if (!subject || !body) {
    return response.status(400).json({ message: 'Subject and body are required.' });
  }

  let recipients = [];
  if (recipientsMode === 'custom') {
    recipients = customRecipients
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  } else {
    const result = await pool.query('SELECT DISTINCT email FROM contact_leads ORDER BY email ASC');
    recipients = result.rows.map((row) => row.email);
  }

  if (!recipients.length) {
    return response.status(400).json({ message: 'No recipients available.' });
  }

  const info = await sendMail({
    to: recipients.join(', '),
    subject,
    text: body,
  });

  await pool.query(
    `INSERT INTO mail_messages (subject, body, sender_email, recipients, recipient_count, status)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [subject, body, MAIL_FROM_ADDRESS, recipients, recipients.length, info?.accepted?.length ? 'sent' : 'queued'],
  );

  response.json({
    success: true,
    delivered: Array.isArray(info?.accepted) ? info.accepted.length : recipients.length,
    skipped: 0,
    message: 'Email sent successfully.',
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'Internal server error' });
});

initDb()
  .then(async () => {
    if (typeof transporter.verify === 'function') {
      try {
        await Promise.resolve(transporter.verify());
      } catch {
      }
    }
    app.listen(Number(PORT), '127.0.0.1', () => {
      console.log(`Flame Core marketing API listening on 127.0.0.1:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
