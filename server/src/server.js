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
import { initCompanyPayments, registerCompanyPaymentRoutes } from './companyPayments.js';

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
  MAIL_INBOX_DRIVER = 'none',
  MAIL_INBOX_MBOX_PATH = '',
  OPENAI_API_KEY,
  OPENAI_MODEL = 'gpt-5-mini',
  BLOG_AUTOMATION_TOKEN = '',
} = process.env;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!ADMIN_EMAIL) throw new Error('ADMIN_EMAIL is required');
if (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH) throw new Error('ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is required');
if (!MAIL_FROM_ADDRESS) throw new Error('MAIL_FROM_ADDRESS is required');

const PUBLIC_SUPPORT_EMAIL = String(process.env.PUBLIC_SUPPORT_EMAIL || process.env.SUPPORT_EMAIL || MAIL_FROM_ADDRESS || '').trim();
const MAIL_DOMAIN = String(process.env.MAIL_DOMAIN || 'flamecoretechltd.com').trim().toLowerCase();
const COMPANY_PAYMENT_INTERNAL_API_KEY = String(process.env.COMPANY_PAYMENT_INTERNAL_API_KEY || '').trim();
const LEGACY_COMPANY_MAIL_FROM_ADDRESS = String(process.env.LEGACY_COMPANY_MAIL_FROM_ADDRESS || `yours@${MAIL_DOMAIN}`).trim().toLowerCase();
const COMPANY_MAIL_FROM_ADDRESS = String(process.env.COMPANY_MAIL_FROM_ADDRESS || LEGACY_COMPANY_MAIL_FROM_ADDRESS || MAIL_FROM_ADDRESS || `support@${MAIL_DOMAIN}`).trim().toLowerCase();
const COMPANY_MAIL_FROM_NAME = String(process.env.COMPANY_MAIL_FROM_NAME || MAIL_FROM_NAME || 'Flame Core Technologies LTD').trim();
const FLAMEBOT_MAIL_FROM_ADDRESS = String(process.env.FLAMEBOT_MAIL_FROM_ADDRESS || `flamebot@${MAIL_DOMAIN}`).trim().toLowerCase();
const FLAMEBOT_MAIL_FROM_NAME = String(process.env.FLAMEBOT_MAIL_FROM_NAME || 'FlameBot').trim();
const COREPIRATE_MAIL_FROM_ADDRESS = String(process.env.COREPIRATE_MAIL_FROM_ADDRESS || `corepirate@${MAIL_DOMAIN}`).trim().toLowerCase();
const COREPIRATE_MAIL_FROM_NAME = String(process.env.COREPIRATE_MAIL_FROM_NAME || 'Core Pirate').trim();
const COMPANY_SUPPORT_ADDRESS = String(process.env.COMPANY_SUPPORT_ADDRESS || `support@${MAIL_DOMAIN}`).trim().toLowerCase();
const COMPANY_BILLING_ADDRESS = String(process.env.COMPANY_BILLING_ADDRESS || `billing@${MAIL_DOMAIN}`).trim().toLowerCase();
const COMPANY_NOREPLY_ADDRESS = String(process.env.COMPANY_NOREPLY_ADDRESS || `no-reply@${MAIL_DOMAIN}`).trim().toLowerCase();
const FLAMEBOT_SUPPORT_ADDRESS = String(process.env.FLAMEBOT_SUPPORT_ADDRESS || `flamebot-support@${MAIL_DOMAIN}`).trim().toLowerCase();
const FLAMEBOT_BILLING_ADDRESS = String(process.env.FLAMEBOT_BILLING_ADDRESS || `flamebot-billing@${MAIL_DOMAIN}`).trim().toLowerCase();
const FLAMEBOT_NOREPLY_ADDRESS = String(process.env.FLAMEBOT_NOREPLY_ADDRESS || `flamebot-noreply@${MAIL_DOMAIN}`).trim().toLowerCase();
const COREPIRATE_SUPPORT_ADDRESS = String(process.env.COREPIRATE_SUPPORT_ADDRESS || `corepirate-support@${MAIL_DOMAIN}`).trim().toLowerCase();
const COREPIRATE_BILLING_ADDRESS = String(process.env.COREPIRATE_BILLING_ADDRESS || `corepirate-billing@${MAIL_DOMAIN}`).trim().toLowerCase();
const COREPIRATE_NOREPLY_ADDRESS = String(process.env.COREPIRATE_NOREPLY_ADDRESS || `corepirate-noreply@${MAIL_DOMAIN}`).trim().toLowerCase();

const MAILBOX_KEYS = ['company', 'flamebot', 'corepirate'];

const MAILBOX_PROFILES = {
  company: {
    key: 'company',
    label: 'Company',
    fromAddress: COMPANY_MAIL_FROM_ADDRESS,
    fromName: COMPANY_MAIL_FROM_NAME,
    senders: {
      primary: { key: 'primary', address: COMPANY_MAIL_FROM_ADDRESS, name: COMPANY_MAIL_FROM_NAME },
      support: { key: 'support', address: COMPANY_SUPPORT_ADDRESS, name: 'Flame Core Support' },
      billing: { key: 'billing', address: COMPANY_BILLING_ADDRESS, name: 'Flame Core Billing' },
      noreply: { key: 'noreply', address: COMPANY_NOREPLY_ADDRESS, name: 'Flame Core Notifications' },
    },
    aliases: [
      COMPANY_MAIL_FROM_ADDRESS,
      PUBLIC_SUPPORT_EMAIL,
      LEGACY_COMPANY_MAIL_FROM_ADDRESS,
      COMPANY_SUPPORT_ADDRESS,
      COMPANY_BILLING_ADDRESS,
      `noreply@${MAIL_DOMAIN}`,
      `no-reply@${MAIL_DOMAIN}`,
    ],
  },
  flamebot: {
    key: 'flamebot',
    label: 'FlameBot',
    fromAddress: FLAMEBOT_MAIL_FROM_ADDRESS,
    fromName: FLAMEBOT_MAIL_FROM_NAME,
    senders: {
      primary: { key: 'primary', address: FLAMEBOT_MAIL_FROM_ADDRESS, name: FLAMEBOT_MAIL_FROM_NAME },
      support: { key: 'support', address: FLAMEBOT_SUPPORT_ADDRESS, name: 'FlameBot Support' },
      billing: { key: 'billing', address: FLAMEBOT_BILLING_ADDRESS, name: 'FlameBot Billing' },
      noreply: { key: 'noreply', address: FLAMEBOT_NOREPLY_ADDRESS, name: 'FlameBot Notifications' },
    },
    aliases: [
      FLAMEBOT_MAIL_FROM_ADDRESS,
      `support+flamebot@${MAIL_DOMAIN}`,
      `billing+flamebot@${MAIL_DOMAIN}`,
      `noreply+flamebot@${MAIL_DOMAIN}`,
      FLAMEBOT_SUPPORT_ADDRESS,
      FLAMEBOT_BILLING_ADDRESS,
      FLAMEBOT_NOREPLY_ADDRESS,
    ],
  },
  corepirate: {
    key: 'corepirate',
    label: 'Core Pirate',
    fromAddress: COREPIRATE_MAIL_FROM_ADDRESS,
    fromName: COREPIRATE_MAIL_FROM_NAME,
    senders: {
      primary: { key: 'primary', address: COREPIRATE_MAIL_FROM_ADDRESS, name: COREPIRATE_MAIL_FROM_NAME },
      support: { key: 'support', address: COREPIRATE_SUPPORT_ADDRESS, name: 'Core Pirate Support' },
      billing: { key: 'billing', address: COREPIRATE_BILLING_ADDRESS, name: 'Core Pirate Billing' },
      noreply: { key: 'noreply', address: COREPIRATE_NOREPLY_ADDRESS, name: 'Core Pirate Notifications' },
    },
    aliases: [
      COREPIRATE_MAIL_FROM_ADDRESS,
      `support+corepirate@${MAIL_DOMAIN}`,
      `billing+corepirate@${MAIL_DOMAIN}`,
      `noreply+corepirate@${MAIL_DOMAIN}`,
      COREPIRATE_SUPPORT_ADDRESS,
      COREPIRATE_BILLING_ADDRESS,
      COREPIRATE_NOREPLY_ADDRESS,
      `copilot@${MAIL_DOMAIN}`,
    ],
  },
};

for (const profile of Object.values(MAILBOX_PROFILES)) {
  profile.aliases = Array.from(
    new Set(
      profile.aliases
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

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

app.use(express.json({
  limit: '1mb',
  verify: (request, _response, buffer) => {
    request.rawBody = Buffer.from(buffer);
  },
}));
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
      'A stronger digital presence is not just about visuals - it shapes credibility, conversion, and how confidently customers engage your brand.',
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
      'Custom software should fit operations, remove friction, and improve decision-making - not add complexity for your team.',
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

const seedKnowledgeDocs = [
  {
    slug: 'company-overview',
    title: 'Company Overview',
    category: 'company',
    keywords: ['company', 'about', 'overview', 'who are you', 'flame core', 'business'],
    content:
      'FLAME CORE TECHNOLOGIES LTD is a digital technology company focused on premium websites, mobile apps, custom software, AI automation, and business growth systems. The company positions itself as a premium partner for serious businesses that want reliable execution, modern design, and scalable technical delivery.',
  },
  {
    slug: 'core-services',
    title: 'Core Services',
    category: 'services',
    keywords: ['services', 'website', 'web', 'mobile', 'app', 'software', 'automation', 'ai', 'hosting', 'consulting', 'ui', 'ux'],
    content:
      'Core services include website development, mobile app development, custom software solutions, AI and automation systems, UI and UX design, tech consulting, cloud and hosting solutions, and managed hosting guidance. Hosting services should be handled through direct team contact rather than self-service booking.',
  },
  {
    slug: 'project-discovery',
    title: 'Project Discovery and Qualification',
    category: 'sales',
    keywords: ['discovery', 'qualification', 'quote', 'pricing', 'budget', 'timeline', 'proposal', 'scope'],
    content:
      'When qualifying a lead, key details to collect are project type, business goal, scope, timeline, budget range, required features, and preferred follow-up channel. Exact pricing should not be invented in chat because project scope affects cost. Visitors should be encouraged to share requirements so the team can prepare a proper proposal or next-step recommendation.',
  },
  {
    slug: 'sales-guardrails',
    title: 'Sales and Support Guardrails',
    category: 'policy',
    keywords: ['training', 'tutorial', 'teach', 'diy', 'do it myself', 'step by step', 'screen share', 'consultation'],
    content:
      'Free step-by-step implementation help, DIY walkthroughs, unpaid training, and free consulting should not be offered for paid services. If a visitor wants training, setup guidance, or implementation support, the assistant should position it as a paid consultation, paid training, or a done-for-you service handled by the company.',
  },
  {
    slug: 'contact-routes',
    title: 'Contact and Follow-up Routes',
    category: 'contact',
    keywords: ['contact', 'email', 'phone', 'follow up', 'reach out', 'proposal', 'next step'],
    content:
      `Serious leads should be encouraged to submit the contact form or email the team at ${PUBLIC_SUPPORT_EMAIL}. The assistant can also ask whether the visitor prefers follow-up by email or phone. Replies should move qualified leads toward a real business conversation rather than trying to close everything inside chat.`,
  },
  {
    slug: 'website-positioning',
    title: 'Website Positioning',
    category: 'service-detail',
    keywords: ['website', 'landing page', 'business website', 'corporate site', 'ecommerce', 'store', 'drop shipping'],
    content:
      'For business websites, the emphasis should be on conversion, trust, performance, responsive design, and a polished brand experience. For ecommerce or dropshipping businesses, the right direction usually depends on catalog size, payment flow, fulfillment, automation needs, and how custom the storefront should be.',
  },
  {
    slug: 'automation-positioning',
    title: 'Automation and AI Positioning',
    category: 'service-detail',
    keywords: ['automation', 'ai', 'agent', 'crm', 'follow up', 'whatsapp', 'social media', 'workflow'],
    content:
      'AI and automation work should be framed as business systems that reduce manual workload, improve lead handling, strengthen follow-up, and support better operations across email, WhatsApp, websites, content, and internal workflows.',
  },
  {
    slug: 'brand-voice',
    title: 'Brand Voice',
    category: 'brand',
    keywords: ['tone', 'voice', 'premium', 'professional', 'warm'],
    content:
      'The brand voice should feel premium, warm, concise, professional, commercially aware, and helpful without sounding cheap or casual. The assistant should be confident, short, and business-oriented.',
  },
  {
    slug: 'milo-guardrails',
    title: 'Milo Guardrails',
    category: 'policy',
    keywords: ['guardrails', 'discount', 'delivery date', 'competitors', 'tone', 'professional', 'unsure', 'price', 'pricing'],
    content:
      'Milo must never give any discount without explicit approval from the team. Milo must never promise a fixed or guaranteed delivery date, but may give a realistic timeline if clearly presented as non-guaranteed. Milo must never sound unsure, doubtful, weak, or unprofessional. Milo must never give vague price ranges, and must never mention a price without explaining the features, scope, or work behind that amount. Milo must never talk badly about competitors. Milo must always maintain a confident, professional, premium tone.',
  },
  {
    slug: 'pricing-guidelines',
    title: 'Pricing Guidelines',
    category: 'pricing',
    keywords: ['pricing', 'custom price', 'quote', 'features', 'scope', 'requirements', 'ecommerce', 'cost', 'packages'],
    content:
      'FLAME CORE TECHNOLOGIES LTD does not use fixed packages or random public price ranges. Everything is custom. When a user wants a service such as an ecommerce website, Milo should first ask for the user requirements and features, then recommend the best approach or options for the user to choose from. After the user clarifies the selected scope, Milo may give a clear price tied to the chosen features and must explain why that amount makes sense based on the quality and quantity of work. If the user adds or removes features, the price should be recalculated accordingly. Core principle: what you order is what we deliver.',
  },
  {
    slug: 'simple-website-pricing-behavior',
    title: 'Simple Website Pricing Behavior',
    category: 'pricing',
    keywords: ['simple website', 'tight budget', 'affordable', 'basic website', 'brochure website', 'remove features', 'negative intent'],
    content:
      'Milo must not automatically add advanced features unless the user clearly asks for them. If the user says simple website, tight budget, basic website, affordable, low budget, brochure website, something simple, or explicitly says they do not need features such as AI, booking, CRM, payment, customer accounts, or automation, Milo must immediately remove those features from the estimate and acknowledge that they have been removed. Milo must never repeat an old higher price after the user removes features. For lean business websites, the default included scope should stay practical: standard design, contact form, responsive layout, essential business pages, and only the necessary basics for launch. Milo should use judgement from the project type and business context to suggest the right page structure, instead of forcing advanced extras into the quote. Do not include booking, online ordering, payment gateway, customer accounts, CRM, AI agent, email automation, dashboard, inventory, or admin panel unless the user explicitly asks for them. Tight-budget users should be guided toward a phase-one lean website first, with advanced features positioned only as optional upgrades for later.',
  },
  {
    slug: 'milo-conversation-style',
    title: 'Milo Conversation Style',
    category: 'policy',
    keywords: ['milo', 'introduction', 'intro', 'conversation style', 'repeat', 'first message'],
    content:
      'Milo may introduce himself clearly on the first meaningful reply in a conversation or when the visitor asks who he is. After that first introduction, Milo must not repeat "I am Milo" or reintroduce himself again unless the visitor specifically asks again who he is. If the visitor corrects the scope or removes features, Milo should acknowledge the correction directly, remove those features immediately, and continue without repeating the introduction.',
  },
];

const defaultPricingProfile = {
  currency: 'USD',
  audiences: {
    african: {
      minimumProjectValue: 300,
      includedPages: 5,
      extraPage: 100,
      includedProducts: 50,
      extraProduct: 6,
      extraIntegration: 200,
      premiumDesign: 350,
      copySupport: 250,
      rushMultiplier: 1.25,
      veryUrgentMultiplier: 1.45,
      veryUrgentMinimumAdd: 500,
      services: {
        'landing-page': { base: 350 },
        'business-website': { base: 800 },
        'ecommerce-website': { base: 1500 },
        'automation-ai': { base: 1000 },
        'mobile-app': { base: 3000 },
        'custom-software': { base: 3500 },
      },
      features: {
        blog: 250,
        adminPanel: 400,
        auth: 200,
        booking: 500,
        payments: 250,
        shipping: 300,
        inventory: 450,
        customerAccounts: 350,
        reviews: 180,
        coupons: 200,
        multilingual: 500,
        seoFoundation: 300,
        dashboard: 500,
        crm: 750,
        whatsapp: 350,
        email: 300,
        social: 400,
        aiAgent: 1200,
      },
    },
    global: {
      minimumProjectValue: 500,
      includedPages: 5,
      extraPage: 200,
      includedProducts: 50,
      extraProduct: 12,
      extraIntegration: 350,
      premiumDesign: 600,
      copySupport: 500,
      rushMultiplier: 1.35,
      veryUrgentMultiplier: 1.6,
      veryUrgentMinimumAdd: 800,
      services: {
        'landing-page': { base: 750 },
        'business-website': { base: 1600 },
        'ecommerce-website': { base: 3200 },
        'automation-ai': { base: 2000 },
        'mobile-app': { base: 4500 },
        'custom-software': { base: 5000 },
      },
      features: {
        blog: 450,
        adminPanel: 650,
        auth: 350,
        booking: 900,
        payments: 400,
        shipping: 500,
        inventory: 700,
        customerAccounts: 550,
        reviews: 300,
        coupons: 350,
        multilingual: 900,
        seoFoundation: 550,
        dashboard: 850,
        crm: 1200,
        whatsapp: 650,
        email: 550,
        social: 700,
        aiAgent: 2000,
      },
    },
  },
  restrictedQuoteRules: {
    maxDirectIntegrations: 5,
    restrictedServices: ['custom-software', 'mobile-app'],
    restrictedKeywords: ['sensitive data', 'financial', 'medical', 'legal', 'compliance', 'sla', 'enterprise'],
  },
  contingencyRules: {
    multiplier: 1.1,
    applyWhenScopeUnclear: true,
    applyWhenCustomWorkflow: true,
    applyWhenUnknownThirdPartySystems: true,
  },
};

const AFRICAN_COUNTRY_CODES = new Set([
  'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CD', 'CG', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ',
  'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'YT', 'MA', 'MZ', 'NA',
  'NE', 'NG', 'RE', 'RW', 'SH', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'EH', 'ZM', 'ZW',
]);

const FALLBACK_CURRENCY_BY_COUNTRY = {
  DZ: 'DZD', AO: 'AOA', BJ: 'XOF', BW: 'BWP', BF: 'XOF', BI: 'BIF', CV: 'CVE', CM: 'XAF', CF: 'XAF', TD: 'XAF',
  KM: 'KMF', CD: 'CDF', CG: 'XAF', CI: 'XOF', DJ: 'DJF', EG: 'EGP', GQ: 'XAF', ER: 'ERN', SZ: 'SZL', ET: 'ETB',
  GA: 'XAF', GM: 'GMD', GH: 'GHS', GN: 'GNF', GW: 'XOF', KE: 'KES', LS: 'LSL', LR: 'LRD', LY: 'LYD', MG: 'MGA',
  MW: 'MWK', ML: 'XOF', MR: 'MRU', MU: 'MUR', MA: 'MAD', MZ: 'MZN', NA: 'NAD', NE: 'XOF', NG: 'NGN', RW: 'RWF',
  ST: 'STN', SN: 'XOF', SC: 'SCR', SL: 'SLE', SO: 'SOS', ZA: 'ZAR', SS: 'SSP', SD: 'SDG', TZ: 'TZS', TG: 'XOF',
  TN: 'TND', UG: 'UGX', ZM: 'ZMW', ZW: 'USD',
  US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', PK: 'PKR', AE: 'AED', SA: 'SAR',
};

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

function mapKnowledgeDoc(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    keywords: row.keywords || [],
    content: row.content,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function tokenizeKnowledgeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function formatMoney(amount, currency = 'USD') {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

function roundLocalCurrencyAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 1000000) return Math.round(numeric / 10000) * 10000;
  if (numeric >= 100000) return Math.round(numeric / 10000) * 10000;
  if (numeric >= 10000) return Math.round(numeric / 1000) * 1000;
  if (numeric >= 1000) return Math.round(numeric / 100) * 100;
  if (numeric >= 100) return Math.round(numeric / 10) * 10;
  return Math.round(numeric);
}

function isPricingIntent(messages) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const latest = String(latestUserMessage?.content || '').toLowerCase();
  return /(price|pricing|cost|quote|budget|estimate|starter estimate|starting estimate|starting cost|how much|start from|start for me|what do you start from|what do you charge|what will .* charge|spend|spending|overall|total)/i.test(latest);
}

const geoLookupCache = new Map();
const fxRateCache = new Map();
const regionDisplayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

function getClientIp(request) {
  const forwardedFor = String(request.headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter(Boolean);
  const rawIp = forwardedFor[0] || request.socket?.remoteAddress || request.ip || '';
  return String(rawIp).replace(/^::ffff:/, '').trim();
}

function getHeaderGeoContext(request) {
  const countryCode = String(request.headers['cf-ipcountry'] || '').trim().toUpperCase();
  if (!countryCode || countryCode === 'XX' || countryCode === 'T1') return null;

  return {
    country: regionDisplayNames?.of(countryCode) || countryCode,
    countryCode,
    continentCode: AFRICAN_COUNTRY_CODES.has(countryCode) ? 'AF' : null,
    currencyCode: String(FALLBACK_CURRENCY_BY_COUNTRY[countryCode] || 'USD').trim().toUpperCase(),
    currencySymbol: null,
    isVpnLike: false,
  };
}

async function lookupGeoContext(ip) {
  const normalizedIp = String(ip || '').trim();
  if (!normalizedIp || normalizedIp === '127.0.0.1' || normalizedIp === '::1') return null;

  const cached = geoLookupCache.get(normalizedIp);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const response = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(normalizedIp)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('ipapi failed');
    const payload = await response.json();
    if (payload?.error) throw new Error('ipapi error');

    const value = {
      country: String(payload?.location?.country || '').trim() || null,
      countryCode: String(payload?.location?.country_code || '').trim().toUpperCase() || null,
      continentCode: String(payload?.location?.continent || '').trim().toUpperCase() || null,
      currencyCode: String(payload?.location?.currency_code || FALLBACK_CURRENCY_BY_COUNTRY[String(payload?.location?.country_code || '').trim().toUpperCase()] || 'USD').trim().toUpperCase(),
      currencySymbol: null,
      isVpnLike: Boolean(payload?.is_vpn || payload?.is_proxy || payload?.is_tor || payload?.is_datacenter),
    };

    geoLookupCache.set(normalizedIp, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return value;
  } catch {
    try {
      const fallbackResponse = await fetch(`https://ipwho.is/${encodeURIComponent(normalizedIp)}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!fallbackResponse.ok) return null;
      const payload = await fallbackResponse.json();
      if (payload?.success === false) return null;

      const countryCode = String(payload?.country_code || '').trim().toUpperCase() || null;
      const value = {
        country: String(payload?.country || '').trim() || null,
        countryCode,
        continentCode: String(payload?.continent_code || '').trim().toUpperCase() || null,
        currencyCode: String(FALLBACK_CURRENCY_BY_COUNTRY[countryCode] || 'USD').trim().toUpperCase(),
        currencySymbol: null,
        isVpnLike: Boolean(payload?.security?.vpn || payload?.security?.proxy || payload?.security?.tor || payload?.security?.hosting),
      };
      geoLookupCache.set(normalizedIp, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      return value;
    } catch {
      return null;
    }
  }
}

function getPricingAudience(geoContext) {
  if (!geoContext) return 'global';
  if (geoContext.continentCode === 'AF') return 'african';
  if (geoContext.countryCode && AFRICAN_COUNTRY_CODES.has(geoContext.countryCode)) return 'african';
  return 'global';
}

async function getUsdQuote(currencyCode) {
  const normalized = String(currencyCode || '').trim().toUpperCase();
  if (!normalized || normalized === 'USD') return { currency: 'USD', rate: 1 };

  const cached = fxRateCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/USD/${encodeURIComponent(normalized)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const rate = Number(payload?.rate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const value = { currency: normalized, rate };
    fxRateCache.set(normalized, { value, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    return value;
  } catch {
    return null;
  }
}

function shouldRunPricingLayer(messages) {
  if (isPricingIntent(messages)) return true;

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
  const latestUserContent = String(latestUserMessage?.content || '').toLowerCase();
  const latestAssistantContent = String(latestAssistantMessage?.content || '').toLowerCase();

  const looksLikeScopeReply =
    /(\d+\s+(products|skus|pages|integrations))|premium design|payment|shipping|reviews|coupons|customer accounts|dropshipping|shopify|woocommerce|start from|overall|total|estimate|what do you charge|no domain|need domain|no logo|need logo|no content|need content|from scratch|have nothing|cms|content ready|contact form only|order through|no checkout|no payment gateway|booking|whatsapp|logo|branding/i.test(latestUserContent);
  const assistantAskedForScope =
    /(confirm the key features|confirm these details|accurate price|scope|quote|requirements)/i.test(latestAssistantContent);

  return looksLikeScopeReply && assistantAskedForScope;
}

function userAskedWhoMiloIs(messages) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const text = String(latestUserMessage?.content || '').toLowerCase();
  return /(who are you|what is your name|your name|are you milo|who is milo)/.test(text);
}

function shouldIntroduceMilo(messages) {
  const assistantMessages = messages.filter((message) => message.role === 'assistant' && String(message.content || '').trim());
  return assistantMessages.length === 0 || userAskedWhoMiloIs(messages);
}

async function getActivePricingProfile() {
  const row = await pool.query(`
    SELECT *
      FROM pricing_profiles
     WHERE is_active = true
     ORDER BY updated_at DESC, id DESC
     LIMIT 1
  `);
  return row.rows[0] || null;
}

function tryParseJsonObject(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
      }
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
      }
    }
  }

  return null;
}

function takeRecentConversationItems(messages = [], limit = 4) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-Math.max(1, limit))
    .map((message) => ({
      role: String(message?.role || 'user'),
      content: String(message?.content || '').trim(),
    }))
    .filter((item) => item.content);
}

async function requestOpenAiJsonObject({ systemPrompt, userPayload, timeoutMs = 12000, maxCompletionTokens = 420, temperature = null, model = (process.env.OPENAI_JSON_MODEL || 'gpt-5-nano') }) {
  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        reasoning_effort: 'minimal',
        ...((temperature !== null && temperature !== undefined && Number.isFinite(Number(temperature))) ? { temperature: Number(temperature) } : {}),
        max_completion_tokens: maxCompletionTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: typeof userPayload === 'string' ? userPayload : JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('requestOpenAiJsonObject non-OK response', aiResponse.status, errorText.slice(0, 500));
      return {
        parsed: null,
        failureReason: 'api_failure',
        status: aiResponse.status,
        errorText: errorText.slice(0, 500),
        rawContent: '',
      };
    }

    const payload = await aiResponse.json();
    const rawContent = String(payload?.choices?.[0]?.message?.content || '').trim();
    const parsed = tryParseJsonObject(rawContent);
    if (!parsed) {
      return {
        parsed: null,
        failureReason: 'model_response_format_issue',
        status: aiResponse.status,
        errorText: '',
        rawContent: rawContent.slice(0, 1000),
      };
    }

    return {
      parsed,
      failureReason: null,
      status: aiResponse.status,
      errorText: '',
      rawContent,
    };
  } catch (error) {
    console.error('requestOpenAiJsonObject exception', String(error?.message || error));
    return {
      parsed: null,
      failureReason: 'timeout_or_api_failure',
      status: 0,
      errorText: String(error?.message || error).slice(0, 500),
      rawContent: '',
    };
  }
}

function buildAiPricingReference(profile, audience = 'global') {
  const config = profile?.config_json || {};
  const audienceKey = audience === 'african' ? 'african' : 'global';
  const audienceConfig = config.audiences?.[audienceKey] || {};
  const services = audienceConfig.services || {};
  const features = audienceConfig.features || {};

  return {
    currency: config.currency || 'USD',
    audience: audienceKey,
    minimumProjectValue: Number(audienceConfig.minimumProjectValue || 0),
    includedPages: Number(audienceConfig.includedPages || 0),
    extraPage: Number(audienceConfig.extraPage || 0),
    includedProducts: Number(audienceConfig.includedProducts || 0),
    extraProduct: Number(audienceConfig.extraProduct || 0),
    extraIntegration: Number(audienceConfig.extraIntegration || 0),
    premiumDesign: Number(audienceConfig.premiumDesign || 0),
    copySupport: Number(audienceConfig.copySupport || 0),
    rushMultiplier: Number(audienceConfig.rushMultiplier || 0),
    veryUrgentMultiplier: Number(audienceConfig.veryUrgentMultiplier || 0),
    veryUrgentMinimumAdd: Number(audienceConfig.veryUrgentMinimumAdd || 0),
    services: Object.fromEntries(
      Object.entries(services).map(([key, value]) => [key, { base: Number(value?.base || 0) }]),
    ),
    features: Object.fromEntries(
      Object.entries(features).map(([key, value]) => [key, Number(value || 0)]),
    ),
    restrictedQuoteRules: config.restrictedQuoteRules || {},
    contingencyRules: config.contingencyRules || {},
    leanStarterGuidance: {
      brochureBaseline: Number(services['business-website']?.base || 0),
      ecommerceBaseline: Number(services['ecommerce-website']?.base || 0),
      includedProducts: Number(audienceConfig.includedProducts || 0),
      conservativeAddOnRule: 'For simple brochure websites and ecommerce-lite catalogue stores, add only explicitly requested extras. Treat all other possible improvements as optional upgrades, not included costs.',
    },
  };
}

function dedupeLineItems(items = []) {
  const map = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const label = String(item?.label || '').trim();
    const amount = Number(item?.amount);
    if (!label || !Number.isFinite(amount) || amount <= 0) continue;
    const key = label.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      map.set(key, { label, amount });
    }
  }

  return Array.from(map.values()).map((item) => ({
    label: item.label,
    amount: Math.round(item.amount),
  }));
}

function extractPlatformComplexitySignals(scope = {}, decision = null) {
  const textParts = [
    scope.projectKindLabel,
    scope.scopeLabel,
    scope.summary,
    Array.isArray(scope.features) ? scope.features.join(' ') : '',
    Array.isArray(scope.includedFeatures) ? scope.includedFeatures.join(' ') : '',
    Array.isArray(scope.includedPages) ? scope.includedPages.join(' ') : '',
    Array.isArray(scope.excludedFeatures) ? scope.excludedFeatures.join(' ') : '',
    decision?.reasoning,
    Array.isArray(decision?.notes) ? decision.notes.join(' ') : '',
    Array.isArray(decision?.lineItems) ? decision.lineItems.map((item) => item?.label || '').join(' ') : '',
  ].filter(Boolean).join(' ').toLowerCase();

  const matched = new Set();
  const addIf = (pattern, label) => {
    if (pattern.test(textParts)) matched.add(label);
  };

  addIf(/\blogin\b|\bregister\b|forgot password|authentication|mfa|2fa|multi-factor/, 'auth');
  addIf(/user accounts?|customer accounts?|role-based access|rbac/, 'accounts');
  addIf(/customer dashboard|admin dashboard|ops dashboard|back-?office dashboard|\bdashboard\b/, 'dashboard');
  addIf(/\bkyc\b|onboarding flow|identity verification|document upload/, 'kyc');
  addIf(/\bpayments?\b|payment gateway|transfers?|checkout|withdrawals?|deposits?/, 'payments');
  addIf(/\bwallets?\b|\bbalances?\b|stored value|ledger/, 'wallets');
  addIf(/transaction history|transactions?|statements?|financial records?|reconciliation/, 'transactions');
  addIf(/audit logs?|audit reports?|tamper-evident|compliance workflows?/, 'audit');
  addIf(/\bapi\b|integrations?|webhooks?|banking rails?|payment rails?/, 'integrations');
  addIf(/sensitive data|encryption|monitoring|disaster recovery|penetration test|security review/, 'security');

  return Array.from(matched);
}

function scopeNeedsPlatformPricingGuardrail(scope = {}, decision = null) {
  const signals = extractPlatformComplexitySignals(scope, decision);
  const summary = [
    scope.projectKindLabel,
    scope.scopeLabel,
    scope.summary,
  ].filter(Boolean).join(' ').toLowerCase();
  const strongSignals = ['kyc', 'wallets', 'transactions', 'audit'];
  const hasStrongSignal = signals.some((item) => strongSignals.includes(item));
  const signalCount = signals.length;
  const serviceType = String(scope.serviceType || '').trim();
  const hasSystemLanguage = /\bsystem\b|\bportal\b|\bdashboard\b|\bworkflow\b|\bplatform\b/.test(summary);
  const hasRiskContext = /\bfinancial\b|\bfinance\b|\bbanking\b|\bpayments?\b|\bwallets?\b|\bloans?\b|\blending\b|\binvestment\b|\binsurance\b|\bmedical\b|\bhealth\b|\bpatient\b|\blegal\b|\bcase management\b|\bidentity\b|\bkyc\b|\bcompliance\b|\bsensitive data\b/.test(summary);
  const clearlyInformationalOnly = /\binformational only\b|\bmarketing website\b|\bpublic website\b|\bcompany website\b|\bbrochure website\b|\blanding page\b/.test(summary);

  if (hasStrongSignal) return true;
  if (signalCount >= 3) return true;
  if ((serviceType === 'business-website' || serviceType === 'landing-page') && signalCount >= 2) return true;
  if (!clearlyInformationalOnly && hasRiskContext && hasSystemLanguage) return true;
  if (!clearlyInformationalOnly && serviceType === 'business-website' && /\bbanking system\b|\bfinancial system\b|\bpayment system\b|\bcustomer portal\b|\bclient portal\b/.test(summary)) return true;
  return false;
}

function normalizeScopeForPlatformComplexity(scope = {}, decision = null) {
  if (!scopeNeedsPlatformPricingGuardrail(scope, decision)) return scope;
  return normalizePricingScope({
    ...scope,
    serviceType: 'custom-software',
    complexity: 'advanced',
    pricingMode: scope.pricingMode === 'lean' ? 'standard' : (scope.pricingMode || 'standard'),
    scopeConfirmed: true,
  });
}

function getServiceBaselineTotal(scope = {}, profile = null, options = {}) {
  const config = profile?.config_json || {};
  const audienceKey = options.audience === 'african' ? 'african' : 'global';
  const audienceConfig = config.audiences?.[audienceKey];
  const serviceType = String(scope?.serviceType || '').trim();
  const baseline = Number(audienceConfig?.services?.[serviceType]?.base || 0);
  return Number.isFinite(baseline) && baseline > 0 ? baseline : 0;
}

function normalizeAiPricingDecision(decision, scope, profile, options = {}) {
  const pricingReference = buildAiPricingReference(profile, options.audience);
  const lineItems = dedupeLineItems(decision?.lineItems);
  const fallbackTotal = Number(decision?.estimatedTotal);
  const derivedFromItems = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const rawTotal = derivedFromItems > 0 ? derivedFromItems : fallbackTotal;

  if (!Number.isFinite(rawTotal) || rawTotal <= 0) {
    return null;
  }

  const total = Math.max(Math.round(rawTotal), Number(pricingReference.minimumProjectValue || 0));
  const currency = String(decision?.currency || pricingReference.currency || 'USD').trim().toUpperCase() || 'USD';

  return {
    currency,
    total,
    breakdown: lineItems.length ? lineItems : [{ label: 'Estimated scope', amount: total }],
    summary: String(scope?.summary || '').trim(),
    serviceType: String(decision?.serviceType || scope?.serviceType || '').trim(),
    scope: {
      ...scope,
      scopeLabel: String(decision?.scopeLabel || scope?.scopeLabel || '').trim(),
      includedFeatures: Array.isArray(decision?.includedItems) && decision.includedItems.length
        ? decision.includedItems.map((item) => String(item).trim()).filter(Boolean)
        : scope?.includedFeatures || [],
      excludedFeatures: Array.isArray(decision?.excludedItems) && decision.excludedItems.length
        ? decision.excludedItems.map((item) => String(item).trim()).filter(Boolean)
        : scope?.excludedFeatures || [],
    },
    audience: pricingReference.audience,
    audienceConfig: pricingReference,
    aiDerived: decision?.aiDerived !== false,
    confidence: Math.max(0, Math.min(1, Number(decision?.confidence || 0))),
    pricingBasis: String(decision?.pricingBasis || '').trim(),
    baseReferenceService: String(decision?.baseReferenceService || '').trim(),
    reasoning: String(decision?.reasoning || '').trim(),
    notes: Array.isArray(decision?.notes) ? decision.notes.map((item) => String(item).trim()).filter(Boolean) : [],
    quoteNow: decision?.quoteNow !== false,
  };
}

function evaluateAiPricingDecision(decision, scope, profile, options = {}) {
  const pricingReference = buildAiPricingReference(profile, options.audience);
  const consistencyScope = normalizeScopeForPlatformComplexity(scope, decision);
  const lineItems = dedupeLineItems(decision?.lineItems);
  const estimatedTotal = Number(decision?.estimatedTotal);
  const derivedFromItems = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const effectiveTotal = derivedFromItems > 0 ? derivedFromItems : estimatedTotal;
  const serviceBaseline = getServiceBaselineTotal(consistencyScope, profile, options);
  const decisionServiceType = String(decision?.serviceType || '').trim();
  const scopeServiceType = String(consistencyScope?.serviceType || '').trim();
  const confidence = Number(decision?.confidence || 0);

  if (!decision) {
    return { estimate: null, failureReason: 'ai_pricing_unavailable' };
  }

  if (!decisionServiceType && !String(decision?.scopeLabel || '').trim()) {
    return { estimate: null, failureReason: 'ai_pricing_response_not_matching_schema' };
  }

  if (decisionServiceType && scopeServiceType && decisionServiceType !== scopeServiceType) {
    return {
      estimate: null,
      failureReason: 'service_type_mismatch',
      details: { decisionServiceType, scopeServiceType },
    };
  }

  if (!Number.isFinite(effectiveTotal) || effectiveTotal <= 0) {
    return { estimate: null, failureReason: 'missing_required_fields' };
  }

  if (serviceBaseline > 0 && effectiveTotal < serviceBaseline) {
    return {
      estimate: null,
      failureReason: 'total_below_service_baseline',
      details: {
        effectiveTotal: Math.round(effectiveTotal),
        serviceBaseline,
        scopeServiceType,
      },
      normalizedScope: consistencyScope,
    };
  }

  if (decision?.quoteNow === false) {
    return { estimate: null, failureReason: 'ai_requested_follow_up' };
  }

  const normalizedDecision = enforceLeanStarterPricingDiscipline(decision, consistencyScope, profile, options);
  const estimate = normalizeAiPricingDecision(normalizedDecision, consistencyScope, profile, options);
  if (!estimate) {
    return { estimate: null, failureReason: 'backend_validation_failed' };
  }

  return {
    estimate,
    failureReason: null,
    normalizedByBackend: estimate.total !== Math.round(effectiveTotal),
    minimumApplied: Number(pricingReference.minimumProjectValue || 0) > 0 && estimate.total === Number(pricingReference.minimumProjectValue || 0) && effectiveTotal < Number(pricingReference.minimumProjectValue || 0),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    normalizedScope: consistencyScope,
  };
}

function isLeanBrochureScope(scope = {}) {
  return scope.serviceType === 'business-website' && (scope.pricingMode === 'lean' || scope.complexity === 'simple');
}

function isEcommerceLiteScope(scope = {}) {
  const excluded = Array.isArray(scope.excludedFeatures) ? scope.excludedFeatures.map((item) => String(item || '').toLowerCase()) : [];
  const features = new Set(Array.isArray(scope.features) ? scope.features : []);
  return scope.serviceType === 'ecommerce-website'
    && (excluded.some((item) => /payment gateway|checkout|customer accounts/.test(item)) || !features.has('payments'));
}

function sanitizeLeanStarterScope(scope = {}) {
  const base = {
    ...scope,
    features: [],
    integrationCount: 0,
    timelineUrgency: 'standard',
  };

  if (isLeanBrochureScope(scope)) {
    base.features = ['contactForm'];
    if (scope.needsLogoSupport || scope.needsBrandSupport || scope.needsContentSupport) {
      base.features.push('copySupport');
    }
    return base;
  }

  if (isEcommerceLiteScope(scope)) {
    base.features = [];
    if (scope.needsLogoSupport || scope.needsBrandSupport || scope.needsContentSupport) {
      base.features.push('copySupport');
    }
    return base;
  }

  return scope;
}

function enforceLeanStarterPricingDiscipline(decision, scope, profile, options = {}) {
  if (!decision) return decision;
  const pricingReference = buildAiPricingReference(profile, options.audience);
  const leanScope = isLeanBrochureScope(scope) || isEcommerceLiteScope(scope);
  if (!leanScope) return decision;

  const blockedLineItemPatterns = [
    /premium design|premium styling|brand styling/i,
    /analytics/i,
    /training/i,
    /advanced seo|seo upgrade/i,
    /contingency/i,
    /integration/i,
    /payment gateway|checkout/i,
    /customer accounts?/i,
  ];

  const allowedBlockedPatterns = [];
  if (scope.designLevel === 'premium') allowedBlockedPatterns.push(/premium design|premium styling|brand styling/i);
  if (scope.timelineUrgency === 'rush' || scope.timelineUrgency === 'very-urgent') allowedBlockedPatterns.push(/contingency/i);
  if ((scope.integrationCount || 0) > 0) allowedBlockedPatterns.push(/integration/i);
  if (Array.isArray(scope.features) && scope.features.includes('payments')) allowedBlockedPatterns.push(/payment gateway|checkout/i);
  if (Array.isArray(scope.features) && scope.features.includes('customerAccounts')) allowedBlockedPatterns.push(/customer accounts?/i);

  const lineItems = dedupeLineItems(decision.lineItems).filter((item) => {
    return !blockedLineItemPatterns.some((pattern) => pattern.test(item.label) && !allowedBlockedPatterns.some((allowed) => allowed.test(item.label)));
  });

  const conservativeScope = sanitizeLeanStarterScope(scope);
  const deterministicLeanEstimate = calculateHybridPrice(conservativeScope, profile, options);
  if (!deterministicLeanEstimate) {
    return { ...decision, lineItems, estimatedTotal: lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0) };
  }

  const prunedTotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const deterministicTotal = Number(deterministicLeanEstimate.total || 0);
  const needsClamp = !Number.isFinite(prunedTotal) || prunedTotal <= 0 || prunedTotal > Math.round(deterministicTotal * 1.1);
  const finalBreakdown = needsClamp ? deterministicLeanEstimate.breakdown : lineItems;
  const finalTotal = needsClamp ? deterministicTotal : prunedTotal;

  return {
    ...decision,
    scopeLabel: inferFriendlyScopeLabel(scope),
    lineItems: finalBreakdown,
    estimatedTotal: finalTotal,
    notes: Array.isArray(decision.notes)
      ? decision.notes.filter((item) => !/premium|analytics|training|contingency|advanced seo/i.test(String(item || '')))
      : [],
  };
}

async function logPricingDecisionRun(payload = {}) {
  try {
    await pool.query(
      `INSERT INTO pricing_quote_logs
        (conversation_id, source, pricing_audience, quote_strategy, user_message, fallback_reason, scope_json, ai_scope_json, ai_quote_json, fallback_quote_json, final_quote_json, final_reply, created_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,NOW())`,
      [
        payload.conversationId || null,
        payload.source || 'website-chat',
        payload.pricingAudience || null,
        payload.quoteStrategy || null,
        payload.userMessage || null,
        payload.fallbackReason || null,
        JSON.stringify(payload.scopeJson || {}),
        JSON.stringify(payload.aiScopeJson || {}),
        JSON.stringify(payload.aiQuoteJson || {}),
        JSON.stringify(payload.fallbackQuoteJson || {}),
        JSON.stringify(payload.finalQuoteJson || {}),
        payload.finalReply || null,
      ],
    );
  } catch (error) {
    console.error('pricing_quote_logs insert failed', error?.message || error);
  }
}

function resolveFallbackReason(state = {}) {
  if (state.quoteStrategy === 'ai-first') return null;
  if (state.quoteStrategy === 'approval-handoff') return 'guardrail_rejection';
  if (state.aiScopeMeta?.failureReason) return state.aiScopeMeta.failureReason;
  if (!state.aiScopeJson) return 'ai_scope_unavailable';
  if (state.aiDecisionMeta?.failureReason) return state.aiDecisionMeta.failureReason;
  if (state.aiQuoteMeta?.failureReason) return state.aiQuoteMeta.failureReason;
  if (!state.aiQuoteJson) return 'ai_pricing_unavailable';
  if (!state.aiQuoteJson.serviceType && !state.aiQuoteJson.scopeLabel) return 'ai_pricing_response_not_matching_schema';
  if (!state.aiQuoteJson.estimatedTotal && !(Array.isArray(state.aiQuoteJson.lineItems) && state.aiQuoteJson.lineItems.length)) return 'missing_required_fields';
  if (!state.finalQuoteJson && state.fallbackQuoteJson) return 'backend_selected_fallback';
  return 'backend_fallback_only';
}

function normalizePricingScope(scope = {}) {
  const allowedArchetypes = new Set([
    '',
    'crowdfunding-platform',
  ]);
  const featureMap = {
    blog: 'blog',
    admin: 'adminPanel',
    adminpanel: 'adminPanel',
    'admin panel': 'adminPanel',
    booking: 'booking',
    'contact form': 'contactForm',
    contactform: 'contactForm',
    auth: 'auth',
    login: 'auth',
    multilingual: 'multilingual',
    seo: 'seoFoundation',
    seofoundation: 'seoFoundation',
    payments: 'payments',
    payment: 'payments',
    shipping: 'shipping',
    inventory: 'inventory',
    coupons: 'coupons',
    accounts: 'customerAccounts',
    customeraccounts: 'customerAccounts',
    'customer accounts': 'customerAccounts',
    reviews: 'reviews',
    variants: 'productVariants',
    productvariants: 'productVariants',
    import: 'productImport',
    productimport: 'productImport',
    'multi currency': 'multiCurrency',
    multicurrency: 'multiCurrency',
    checkout: 'customCheckout',
    customcheckout: 'customCheckout',
    dashboard: 'dashboard',
    crm: 'crm',
    whatsapp: 'whatsapp',
    email: 'email',
    social: 'social',
    agent: 'aiAgent',
    ai: 'aiAgent',
    aiagent: 'aiAgent',
    analytics: 'analytics',
    logo: 'copySupport',
    branding: 'copySupport',
    'brand support': 'copySupport',
    'copy support': 'copySupport',
    copysupport: 'copySupport',
  };

  const rawFeatures = Array.isArray(scope.features) ? scope.features : [];
  const features = Array.from(
    new Set(
      rawFeatures
        .map((item) => featureMap[String(item).toLowerCase().trim()] || null)
        .filter(Boolean),
    ),
  );

  return {
    serviceType: String(scope.serviceType || '').trim(),
    projectArchetype: allowedArchetypes.has(String(scope.projectArchetype || '').trim()) ? String(scope.projectArchetype || '').trim() : '',
    projectKindLabel: String(scope.projectKindLabel || '').trim().slice(0, 120),
    businessType: String(scope.businessType || '').trim().slice(0, 80),
    complexity: ['simple', 'standard', 'advanced'].includes(String(scope.complexity || '').trim()) ? String(scope.complexity).trim() : 'standard',
    pricingMode: ['lean', 'standard', 'advanced'].includes(String(scope.pricingMode || '').trim()) ? String(scope.pricingMode).trim() : 'standard',
    assetReadiness: ['none', 'partial', 'ready', 'unknown'].includes(String(scope.assetReadiness || '').trim()) ? String(scope.assetReadiness).trim() : 'unknown',
    needsBrandSupport: Boolean(scope.needsBrandSupport),
    needsLogoSupport: Boolean(scope.needsLogoSupport),
    needsContentSupport: Boolean(scope.needsContentSupport),
    needsDomainSetup: Boolean(scope.needsDomainSetup),
    needsHostingSetup: ['no', 'likely', 'yes', 'unknown'].includes(String(scope.needsHostingSetup || '').trim()) ? String(scope.needsHostingSetup).trim() : 'unknown',
    designLevel: ['standard', 'premium'].includes(String(scope.designLevel || '').trim()) ? String(scope.designLevel).trim() : 'standard',
    timelineUrgency: ['standard', 'rush', 'very-urgent'].includes(String(scope.timelineUrgency || '').trim()) ? String(scope.timelineUrgency).trim() : 'standard',
    pageCount: Number.isFinite(Number(scope.pageCount)) ? Math.max(0, Number(scope.pageCount)) : null,
    productCount: Number.isFinite(Number(scope.productCount)) ? Math.max(0, Number(scope.productCount)) : null,
    integrationCount: Number.isFinite(Number(scope.integrationCount)) ? Math.max(0, Number(scope.integrationCount)) : 0,
    features,
    includedPages: Array.isArray(scope.includedPages) ? scope.includedPages.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [],
    includedFeatures: Array.isArray(scope.includedFeatures) ? scope.includedFeatures.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [],
    excludedFeatures: Array.isArray(scope.excludedFeatures) ? scope.excludedFeatures.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [],
    removedFeatures: Array.isArray(scope.removedFeatures) ? scope.removedFeatures.map((item) => String(item).trim()).filter(Boolean).slice(0, 20) : [],
    clarificationQuestions: Array.isArray(scope.clarificationQuestions) ? scope.clarificationQuestions.map((item) => String(item).trim()).filter(Boolean).slice(0, 3) : [],
    needsClarification: Boolean(scope.needsClarification),
    scopeReplacement: Boolean(scope.scopeReplacement),
    quoteIntent: scope.quoteIntent !== false,
    lastUpdatedFromUserMessage: String(scope.lastUpdatedFromUserMessage || '').trim().slice(0, 240),
    scopeLabel: String(scope.scopeLabel || '').trim().slice(0, 120),
    summary: String(scope.summary || '').trim(),
    missingRequirements: Array.isArray(scope.missingRequirements) ? scope.missingRequirements.map((item) => String(item).trim()).filter(Boolean) : [],
    scopeConfirmed: Boolean(scope.scopeConfirmed),
  };
}

function inferProjectArchetypeFromText(text = '') {
  const source = String(text || '').toLowerCase();

  if (/(gofundme|go fund me|gofund|crowdfund|crowdfunding|fundraising platform|donation platform|raise money platform)/.test(source)) {
    return 'crowdfunding-platform';
  }

  return '';
}

function inferProjectKindLabelFromText(text = '') {
  const source = String(text || '').trim().replace(/\s+/g, ' ');
  if (!source) return '';
  const cleanCandidate = (raw) => String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^(okay|ok|so|then|well|hmm|uhm|um|please|just|kindly)\s+/i, '')
    .replace(/^(how much|what about|what of|i need|i want|need|want|build|make|create)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const forPattern = source.match(/\b(?:need|want|build|creating?|make)\s+(?:an?|the)?\s*(?:website|site|platform|app)\s+for\s+([a-z0-9][a-z0-9\s/&-]{2,80}?)(?:[.!?,]|$)/i);
  if (forPattern?.[1]) {
    const label = cleanCandidate(forPattern[1]);
    if (!/^(a|an|the|my|our|for|to|of|in)$/.test(label)) {
      return `${label} ${/\bapp\b/i.test(source) ? 'app' : /\bplatform\b/i.test(source) ? 'platform' : 'website'}`;
    }
  }

  const patterns = [
    /\b(?:need|want|build|creating?|make)\s+(?:an?|the)?\s*([a-z0-9][a-z0-9\s/&-]{2,80}?)\s+(?:website|site|platform|app)\b/i,
    /\b([a-z0-9][a-z0-9\s/&-]{2,80}?)\s+(?:website|site|platform|app)\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) {
      const label = cleanCandidate(match[1]);
      if (!/^(a|an|the|my|our|for|to|of|in)$/.test(label)) {
        return `${label} ${/\bapp\b/i.test(source) ? 'app' : /\bplatform\b/i.test(source) ? 'platform' : 'website'}`;
      }
    }
  }

  return '';
}

function looksLikePlatformOrNetworkScope(scope = {}) {
  const source = [
    scope.projectKindLabel,
    scope.summary,
    Array.isArray(scope.features) ? scope.features.join(' ') : '',
  ].filter(Boolean).join(' ').toLowerCase();

  return /(social media|social network|community platform|marketplace|job board|directory platform|listing platform|crowdfunding|fundraising platform|saas platform|member portal|client portal|learning platform|lms|booking platform)/.test(source);
}

function hasCatalogueOrCommerceIntent(text = '') {
  const source = String(text || '').toLowerCase();
  const directCommerceSignal = /(ecommerce|e-commerce|online store|storefront|product catalog|catalog|cart|checkout|payment gateway|payments|shipping|inventory|sku|skus|products|sell online|order online|shopify|woocommerce|dropship|dropshipping)/.test(source);
  const storeLikeSignal = /\bstore\b|\bshop\b|(?:^|[\s-])[a-z0-9]+store(?:[\s-]|$)|(?:^|[\s-])[a-z0-9]+shop(?:[\s-]|$)/.test(source);
  const catalogueLikeSignal = /\b(products?|catalog(?:ue)?|collections?|inventory|order|orders|selling|retail|merch(?:andise)?|sku|skus)\b/.test(source);
  const digitalBuildContext = /\b(website|web site|site|platform|app|online|digital)\b/.test(source);
  return directCommerceSignal || (storeLikeSignal && digitalBuildContext) || (catalogueLikeSignal && /\b(website|site|store|shop)\b/.test(source));
}

function hasExplicitEcommerceSignal(text = '') {
  return hasCatalogueOrCommerceIntent(text);
}

function hasPlatformCapabilitySignals(text = '') {
  const source = String(text || '').toLowerCase();
  return /login|register|sign[\s-]?up|sign[\s-]?in|user accounts?|customer accounts?|member accounts?|dashboard|admin panel|admin dashboard|portal|workflow|role-based access|rbac|kyc|identity verification|document upload|wallet|balances?|transfers?|transaction history|transactions?|statements?|audit logs?|compliance workflows?|reconciliation|secure messaging|approval flow|approvals|back-?office|case management/.test(source);
}

function hasRiskAwareDomainSignals(text = '') {
  const source = String(text || '').toLowerCase();
  return /fintech|banking|financial|payments?|wallets?|loans?|lending|investment|insurance|medical|health|patient|clinical|legal|law firm|casework|identity|compliance|sensitive data|government|public sector/.test(source);
}

function looksInformationalOnlyRequest(text = '') {
  const source = String(text || '').toLowerCase();
  return /informational only|marketing website|public website|company website|brochure website|landing page|portfolio website|profile website|just information|info website|about our services/.test(source);
}

function inferServiceTypeFromProjectHint(text = '', archetype = '') {
  const source = String(text || '').toLowerCase();
  if (archetype === 'crowdfunding-platform') return 'custom-software';
  if (hasPlatformCapabilitySignals(source)) return 'custom-software';
  if (hasRiskAwareDomainSignals(source) && !looksInformationalOnlyRequest(source)) return 'custom-software';
  if (hasExplicitEcommerceSignal(source) || /\b(sell|selling|orders?)\b/.test(source)) return 'ecommerce-website';
  if (/(social media|social network|community platform|marketplace|job board|directory platform|listing platform|member portal|client portal|learning platform|lms|booking platform|saas)/.test(source)) {
    return 'custom-software';
  }
  if (/(mobile app|android app|ios app|iphone app)/.test(source)) return 'mobile-app';
  if (/(landing page)/.test(source)) return 'landing-page';
  if (/(website|web site|site)/.test(source)) return 'business-website';
  return '';
}

function inferBusinessTypeFromLabel(label = '', archetype = '') {
  const source = String(label || '').toLowerCase();
  if (archetype === 'crowdfunding-platform') return 'crowdfunding';
  const cleaned = source
    .replace(/\b(simple|basic|lean|starter|standard|website|site|platform|app|build|online|own)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(' ').slice(0, 3).join('-');
}

function pickBusinessWebsiteFocusPage(source = '') {
  if (/(portfolio|case stud|projects?|gallery|lookbook|showcase|work samples?)/.test(source)) return 'Work / Portfolio';
  if (/(menu|pricing|price list|services|service list|packages|offerings)/.test(source)) return 'Services / Pricing';
  if (/(properties|property|listings|catalog|directory|inventory|products?)/.test(source)) return 'Listings / Catalog';
  if (/(events|programs|sermons|resources|courses)/.test(source)) return 'Programs / Resources';
  if (/(faq|questions|support)/.test(source)) return 'FAQ';
  return 'Services / Offerings';
}

function pickBusinessWebsiteOptionalPage(source = '', pages = []) {
  if (pages.includes('Work / Portfolio') && !pages.includes('Gallery')) return 'Gallery';
  if (/(testimonials|reviews|social proof)/.test(source) && !pages.includes('Testimonials')) return 'Testimonials';
  if (/(blog|news|articles|updates)/.test(source) && !pages.includes('Blog')) return 'Blog';
  if (/(faq|questions|support)/.test(source) && !pages.includes('FAQ')) return 'FAQ';
  if (/(contact|location|map|address)/.test(source) && !pages.includes('Contact / Location')) return 'Contact / Location';
  return 'Contact';
}

function inferPagesForBusinessType(scope = {}) {
  const source = [
    scope.projectKindLabel,
    scope.businessType,
    scope.summary,
    Array.isArray(scope.features) ? scope.features.join(' ') : '',
    Array.isArray(scope.includedFeatures) ? scope.includedFeatures.join(' ') : '',
  ].filter(Boolean).join(' ').toLowerCase();

  if (scope.serviceType === 'landing-page') {
    return ['Home'];
  }

  if (scope.serviceType === 'ecommerce-website') {
    const excludesCheckout = Array.isArray(scope.excludedFeatures)
      && scope.excludedFeatures.some((item) => /payment gateway|checkout|customer accounts/i.test(String(item || '')));
    if (excludesCheckout || !Array.isArray(scope.features) || !scope.features.includes('payments')) {
      return ['Home', 'Products / Catalogue', 'Product Details / Categories', 'About', 'Contact / Order Inquiry'];
    }
    return ['Home', 'Products / Catalogue', 'Cart / Checkout', 'About', 'Contact'];
  }

  if (scope.serviceType === 'custom-software' || scope.serviceType === 'automation-ai') {
    return ['Home', 'Core Features', 'Workflow / Modules', 'Admin / Dashboard', 'Contact'];
  }

  if (scope.serviceType === 'mobile-app') {
    return ['Home', 'Features', 'App Screens', 'Pricing / Plans', 'Contact'];
  }

  const focusPage = pickBusinessWebsiteFocusPage(source);
  const hasBookingIntent = /(booking|appointment|reservation|schedule|inquiry)/.test(source);
  const hasPortfolioIntent = /(portfolio|case stud|projects?|gallery|lookbook|showcase|work samples?)/.test(source);
  const pages = hasBookingIntent
    ? ['Home', 'Services', 'Booking / Inquiry', 'About', 'Contact']
    : ['Home', 'About', focusPage, hasPortfolioIntent ? 'Portfolio / Gallery / Work Samples' : 'Contact / Enquiry'];
  if (hasBookingIntent) {
    return Array.from(new Set(pages)).slice(0, 5);
  }
  const optionalPage = pickBusinessWebsiteOptionalPage(source, pages);
  pages.push(optionalPage);
  pages.push(/contact/i.test(optionalPage) ? 'FAQ' : 'Contact / Enquiry');

  return Array.from(new Set(pages)).slice(0, 5);
}

function inferIncludedFeaturesForScope(scope = {}) {
  const base = ['standard design', 'responsive layout'];
  if (scope.serviceType === 'business-website' || scope.serviceType === 'landing-page') {
    base.push('contact form');
    if (scope.pricingMode === 'lean' || scope.complexity === 'simple') {
      base.push('basic SEO setup');
    }
  }
  if (scope.needsDomainSetup) {
    base.push('domain setup assistance');
  }
  if (scope.needsHostingSetup === 'yes' || scope.needsHostingSetup === 'likely') {
    base.push('hosting setup assistance');
  }
  if (scope.needsLogoSupport || scope.needsBrandSupport) {
    base.push('basic logo or brand support');
  }
  if (scope.needsContentSupport) {
    base.push('content or copy support');
  }
  return Array.from(new Set(base));
}

function inferExcludedFeaturesForScope(scope = {}) {
  const exclusions = new Set(scope.excludedFeatures || []);
  if (scope.pricingMode === 'lean' || scope.complexity === 'simple') {
    ['AI agent', 'CRM', 'booking', 'payment gateway', 'student dashboard', 'LMS', 'quizzes', 'certificates'].forEach((item) => exclusions.add(item));
  }
  if (scope.needsDomainSetup) {
    exclusions.add('domain registration purchase fees');
  }
  if (scope.needsHostingSetup === 'yes' || scope.needsHostingSetup === 'likely') {
    exclusions.add('hosting subscription fees');
  }
  return Array.from(exclusions);
}

function applyLatestProjectOverride(scope, messages) {
  const latestRaw = String([...messages].reverse().find((message) => message.role === 'user')?.content || '').trim();
  if (!latestRaw) return scope;

  const latest = latestRaw.toLowerCase();
  const latestProjectKindLabel = inferProjectKindLabelFromText(latestRaw);
  const latestProjectArchetype = inferProjectArchetypeFromText(latestRaw);
  const latestServiceType = inferServiceTypeFromProjectHint(latestRaw, latestProjectArchetype);
  const indicatesFreshProject = /(what about|how about|what of|instead|rather|bro\b|no[, ]|not that|a[n]?\s+.+\s+(website|site|platform|app)\b)/i.test(latestRaw);

  if (!latestProjectKindLabel && !latestProjectArchetype && !latestServiceType) {
    return scope;
  }

  const currentLabel = String(scope.projectKindLabel || '').toLowerCase();
  const labelChanged = latestProjectKindLabel && latestProjectKindLabel.toLowerCase() !== currentLabel;
  const archetypeChanged = latestProjectArchetype && latestProjectArchetype !== scope.projectArchetype;
  const serviceChanged = latestServiceType && latestServiceType !== scope.serviceType;

  if (!(indicatesFreshProject || labelChanged || archetypeChanged || serviceChanged)) {
    return scope;
  }

  return {
    ...scope,
    projectKindLabel: latestProjectKindLabel || scope.projectKindLabel,
    projectArchetype: latestProjectArchetype || '',
    serviceType: latestServiceType || scope.serviceType,
    summary: latestRaw,
    scopeConfirmed: true,
  };
}

function getLatestUserContent(messages) {
  return String([...messages].reverse().find((message) => message.role === 'user')?.content || '').toLowerCase();
}

function getAllUserContent(messages) {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => String(message.content || ''))
    .join('\n')
    .toLowerCase();
}

function getUserOnlyMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((message) => message.role === 'user' && String(message.content || '').trim());
}

function userAskedForOverallTotal(messages) {
  const latest = String([...messages].reverse().find((message) => message.role === 'user')?.content || '').toLowerCase();
  return /(overall|in total|total overall|current total|how much.*total|what.*total)/.test(latest);
}

function userWantsRecommendedStarter(messages) {
  const combined = getAllUserContent(messages);
  return /(what suit best|what suits best|best recommendation|recommend.*start|recommend.*starter|i will go with you|best at start|what do you recommend|best option to start|best setup to start|what do you think is best)/i.test(combined);
}

function userAskedForPriceOrStart(messages) {
  const combined = getAllUserContent(messages);
  return /(how much|price|cost|quote|estimate|starter estimate|starting estimate|starting cost|start from|start for me|what do you start from|what will .* charge|spend|spending|overall|total)/i.test(combined);
}

function extractExplicitlyRemovedFeatures(messages) {
  const latest = getLatestUserContent(messages);
  const combined = getAllUserContent(messages);
  const source = `${combined}\n${latest}`;
  const removed = new Set();
  const removeIf = (pattern, feature) => {
    if (pattern.test(source)) removed.add(feature);
  };
  const negativeIntent = /(i do not need|i don't need|dont need|do not include|don't include|remove|without|\bno\b)/i.test(latest);

  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+(?:an?\s+)?ai(?:\s+agent)?/i, 'aiAgent');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+booking/i, 'booking');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+crm/i, 'crm');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without|\bno\b)\s+(?:payment|payments|payment gateway|checkout)/i, 'payments');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+(?:customer accounts?|accounts?|login|auth)/i, 'customerAccounts');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+(?:email|email automation)/i, 'email');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+(?:dashboard|admin panel|admin)/i, 'dashboard');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+(?:whatsapp|whatsapp automation|whatsapp api)/i, 'whatsapp');
  removeIf(/(?:i do not need|i don't need|dont need|do not include|don't include|remove|without)\s+blog/i, 'blog');

  if (negativeIntent) {
    if (/\bai\b|ai agent/.test(latest)) removed.add('aiAgent');
    if (/\bbooking\b/.test(latest)) removed.add('booking');
    if (/\bcrm\b/.test(latest)) removed.add('crm');
    if (/\bpayment\b|\bpayments\b|payment gateway|checkout/.test(latest)) removed.add('payments');
    if (/\bcustomer accounts?\b|\baccounts?\b|\blogin\b|\bauth\b/.test(latest)) removed.add('customerAccounts');
    if (/\bemail\b|email automation/.test(latest)) removed.add('email');
    if (/\bdashboard\b|admin panel|\badmin\b/.test(latest)) removed.add('dashboard');
    if (/\bwhatsapp\b/.test(latest)) removed.add('whatsapp');
    if (/\bblog\b/.test(latest)) removed.add('blog');
  }

  return removed;
}

function applyConversationScopeRules(scope, messages) {
  const latest = getLatestUserContent(messages);
  const combined = getAllUserContent(messages);
  const wantsRecommendedStarter = userWantsRecommendedStarter(messages);
  const wantsPriceNow = userAskedForPriceOrStart(messages);
  const features = new Set(Array.isArray(scope.features) ? scope.features : []);
  const removedFeatures = extractExplicitlyRemovedFeatures(messages);
  const excludedFeatures = new Set(Array.isArray(scope.excludedFeatures) ? scope.excludedFeatures : []);
  const removedFeatureLabels = new Set(Array.isArray(scope.removedFeatures) ? scope.removedFeatures : []);
  let includedPages = Array.isArray(scope.includedPages) ? [...scope.includedPages] : [];

  for (const feature of removedFeatures) features.delete(feature);

  const simpleBudgetSignals = /(simple|tight budget|low budget|affordable|budget-friendly|something simple|basic website|brochure website|small business website)/i.test(latest) || /(simple|tight budget|low budget|affordable|something simple|basic website|brochure website|small business website)/i.test(combined);
  const explicitLeanRequest = /(simple website|tight budget|basic website|affordable|low budget|brochure website|small business website)/i.test(combined);
  const explicitBookingSignal = /(booking|appointment|reservation|reserve)/i.test(combined);
  const explicitBlogSignal = /\bblog\b|\bnews\b/.test(combined);
  const explicitEcommerceSignal = hasExplicitEcommerceSignal(combined);
  const commerceRecommendationSignal = hasCatalogueOrCommerceIntent(combined);
  const explicitFullCheckoutSignal = /(cart|checkout|payment gateway|payments|shipping|customer accounts?|login|sign[\s-]?in|sign[\s-]?up)/i.test(combined);
  const explicitIntegrationSignal = /(integration|integrations|api|crm|newsletter|mailchimp|zapier|payment|payments|checkout|shipping|inventory|whatsapp api|whatsapp automation|calendar sync|booking engine|portal|dashboard|login|customer accounts?)/i.test(combined);
  const explicitAdvancedExclusionSignal = /(no|not|without|don'?t need|do not need)[^.!\n]{0,50}(portal|dashboard|login|customer accounts?|booking engine|crm|automation|payment gateway|payments)/i.test(combined);

  if (scope.serviceType === 'business-website' && (simpleBudgetSignals || explicitLeanRequest)) {
    ['booking', 'crm', 'aiAgent', 'payments', 'customerAccounts', 'dashboard', 'adminPanel', 'inventory', 'email', 'seoFoundation', 'whatsapp'].forEach((feature) => features.delete(feature));
    if (!scope.pageCount || scope.pageCount > 5) {
      scope.pageCount = 5;
    }
    features.add('contactForm');
    if (!explicitBookingSignal) {
      features.delete('booking');
      includedPages = includedPages.filter((item) => !/booking|appointment|reservation/i.test(item));
    }
    if (!explicitBlogSignal) {
      features.delete('blog');
      includedPages = includedPages.filter((item) => !/blog|news/i.test(item));
    }
    if (!explicitIntegrationSignal) {
      scope.integrationCount = 0;
    }
    if (explicitAdvancedExclusionSignal) {
      scope.integrationCount = 0;
    }
  }

  if (
    scope.serviceType === 'ecommerce-website'
    && !explicitEcommerceSignal
    && Number(scope.productCount || 0) <= 0
    && !features.has('payments')
    && !features.has('shipping')
    && !features.has('customerAccounts')
  ) {
    scope.serviceType = 'business-website';
  }

  if (
    scope.serviceType === 'business-website'
    && commerceRecommendationSignal
    && wantsPriceNow
    && !looksLikePlatformOrNetworkScope(scope)
    && !hasPlatformCapabilitySignals(combined)
    && !hasRiskAwareDomainSignals(combined)
  ) {
    scope.serviceType = 'ecommerce-website';
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = explicitFullCheckoutSignal ? (scope.clarificationQuestions || []).slice(0, 1) : [];
    scope.pricingMode = 'lean';
    scope.complexity = 'simple';
    if (!explicitFullCheckoutSignal) {
      ['payments', 'customerAccounts', 'shipping', 'customCheckout'].forEach((feature) => features.delete(feature));
      ['payment gateway', 'checkout', 'customer accounts'].forEach((item) => excludedFeatures.add(item));
      scope.integrationCount = 0;
    }
    includedPages = inferPagesForBusinessType({
      ...scope,
      serviceType: 'ecommerce-website',
      features: Array.from(features),
      excludedFeatures: Array.from(excludedFeatures),
    });
    scope.pageCount = includedPages.length;
  }

  if (looksLikePlatformOrNetworkScope(scope)) {
    scope.serviceType = 'custom-software';
  }

  if (/(remove|without|don'?t include|do not include|no)\s+(optional\s+)?gallery/i.test(latest)) {
    excludedFeatures.add('Gallery');
    removedFeatureLabels.add('Gallery');
    includedPages = includedPages.filter((item) => !/gallery/i.test(item));
  }

  if (/(remove|without|don'?t include|do not include|no)\s+faq/i.test(latest)) {
    excludedFeatures.add('FAQ');
    removedFeatureLabels.add('FAQ');
    includedPages = includedPages.filter((item) => !/faq/i.test(item));
  }

  if (/\bno extra\b|\bno extras\b/.test(latest)) {
    ['Gallery', 'FAQ'].forEach((item) => excludedFeatures.add(item));
  }

  if (/no logo|don'?t have (a )?logo|include logo|help.*logo|you guys will help.*logo/i.test(combined)) {
    features.add('copySupport');
    if (!excludedFeatures.has('Logo support')) {
      scope.includedFeatures = Array.from(new Set([...(scope.includedFeatures || []), 'basic logo or brand support']));
    }
  }

  if (/no domain|don'?t have (a )?domain|include domain|help.*domain/i.test(combined)) {
    scope.includedFeatures = Array.from(new Set([...(scope.includedFeatures || []), 'domain setup assistance']));
    scope.excludedFeatures = Array.from(new Set([...(scope.excludedFeatures || []), 'domain and hosting purchase fees']));
  }

  if (scope.needsLogoSupport || scope.needsBrandSupport || scope.needsContentSupport) {
    features.add('copySupport');
  }

  if (scope.needsDomainSetup) {
    scope.includedFeatures = Array.from(new Set([...(scope.includedFeatures || []), 'domain setup assistance']));
    scope.excludedFeatures = Array.from(new Set([...(scope.excludedFeatures || []), 'domain registration purchase fees']));
  }

  if (scope.needsHostingSetup === 'yes' || scope.needsHostingSetup === 'likely') {
    scope.includedFeatures = Array.from(new Set([...(scope.includedFeatures || []), 'hosting setup assistance']));
    scope.excludedFeatures = Array.from(new Set([...(scope.excludedFeatures || []), 'hosting subscription fees']));
  }

  if (removedFeatures.size > 0) {
    scope.scopeConfirmed = true;
  }

  if (userAskedForOverallTotal(messages)) {
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = [];
  }

  if (scope.serviceType === 'ecommerce-website' && (removedFeatures.has('payments') || /\bno\b\s+(payment|payments|payment gateway|checkout)/i.test(latest))) {
    features.delete('payments');
    excludedFeatures.add('payment gateway');
    excludedFeatures.add('checkout');
    excludedFeatures.add('customer accounts');
    features.delete('customerAccounts');
    if (!/dhl|ups|fedex|shipping carrier|courier/i.test(combined)) {
      features.delete('shipping');
      scope.integrationCount = 0;
    }
  }

  if (scope.serviceType === 'ecommerce-website' && /catalog(?:ue)? first|no checkout|view products|order through whatsapp|order through contact form|inquiry[- ]based|catalog(?:ue)? website/i.test(combined)) {
    features.delete('payments');
    features.delete('customerAccounts');
    excludedFeatures.add('payment gateway');
    excludedFeatures.add('checkout');
    excludedFeatures.add('customer accounts');
  }

  if (
    scope.serviceType === 'ecommerce-website'
    && wantsPriceNow
    && (
      /catalog(?:ue)? first|no checkout|view products|order through whatsapp|order through contact form|inquiry[- ]based|catalog(?:ue)? website/i.test(combined)
      || (
        excludedFeatures.has('payment gateway')
        && excludedFeatures.has('checkout')
      )
    )
    && (
      Number(scope.productCount || 0) <= 50
      || Number(scope.productCount || 0) === 0
      || scope.scopeConfirmed
    )
  ) {
    scope.pricingMode = 'lean';
    scope.complexity = 'simple';
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = [];
  }

  if (scope.serviceType === 'ecommerce-website' && (scope.pricingMode === 'lean' || scope.complexity === 'simple')) {
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = (scope.clarificationQuestions || []).slice(0, 1);
  }

  if (scope.serviceType === 'business-website' && wantsRecommendedStarter) {
    scope.pricingMode = 'lean';
    scope.complexity = 'simple';
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = [];
    if (!explicitIntegrationSignal) {
      scope.integrationCount = 0;
    }
    if (explicitAdvancedExclusionSignal) {
      scope.integrationCount = 0;
    }
    if (!explicitBookingSignal) {
      features.delete('booking');
      includedPages = includedPages.filter((item) => !/booking|appointment|reservation/i.test(item));
    }
    if (!explicitBlogSignal) {
      features.delete('blog');
      includedPages = includedPages.filter((item) => !/blog|news/i.test(item));
    }
    if (!Array.isArray(scope.includedPages) || !scope.includedPages.length) {
      scope.includedPages = inferPagesForBusinessType(scope);
    }
  }

  if (
    scope.serviceType === 'business-website'
    && scope.projectKindLabel
    && wantsPriceNow
    && !explicitEcommerceSignal
    && !explicitIntegrationSignal
    && !explicitAdvancedExclusionSignal
    && !features.has('booking')
    && !features.has('dashboard')
    && !features.has('customerAccounts')
    && !features.has('payments')
  ) {
    scope.pricingMode = 'lean';
    scope.complexity = 'simple';
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = [];
    scope.integrationCount = 0;
    scope.pageCount = scope.pageCount && scope.pageCount > 0 ? Math.min(scope.pageCount, 5) : 5;
    features.add('contactForm');
    if (!Array.isArray(scope.includedPages) || !scope.includedPages.length) {
      scope.includedPages = inferPagesForBusinessType(scope);
    }
  }

  if (
    scope.serviceType === 'business-website' &&
    scope.projectKindLabel &&
    wantsPriceNow &&
    (scope.pricingMode === 'lean' || scope.complexity === 'simple' || wantsRecommendedStarter)
  ) {
    scope.scopeConfirmed = true;
    scope.needsClarification = false;
    scope.clarificationQuestions = [];
    if (!Array.isArray(scope.includedPages) || !scope.includedPages.length) {
      scope.includedPages = inferPagesForBusinessType(scope);
    }
  }

  if (scope.serviceType === 'business-website' && (scope.pricingMode === 'lean' || scope.complexity === 'simple')) {
    includedPages = inferPagesForBusinessType({
      ...scope,
      businessType: scope.businessType,
      projectKindLabel: scope.projectKindLabel,
      summary: scope.summary,
    });
    scope.pageCount = includedPages.length;
    if (!explicitIntegrationSignal || explicitAdvancedExclusionSignal) {
      scope.integrationCount = 0;
    }
    scope.includedFeatures = inferIncludedFeaturesForScope({
      ...scope,
      features: Array.from(features),
      includedPages,
    });
  }

  scope = applyLatestProjectOverride(scope, messages);

  return normalizePricingScope({
    ...scope,
    features: Array.from(features),
    includedPages,
    includedFeatures: Array.isArray(scope.includedFeatures) ? scope.includedFeatures : [],
    excludedFeatures: Array.from(excludedFeatures),
    removedFeatures: Array.from(removedFeatureLabels),
  });
}

function buildHeuristicPricingScope(messages) {
  const userMessages = getUserOnlyMessages(messages);
  const sourceMessages = userMessages.length ? userMessages : messages;
  const combined = sourceMessages.map((message) => message.content).join('\n').toLowerCase();
  const projectArchetype = inferProjectArchetypeFromText(combined);
  const projectKindLabel = inferProjectKindLabelFromText(sourceMessages.map((message) => message.content).join('\n'));
  const features = [];
  const addFeature = (condition, value) => {
    if (condition && !features.includes(value)) features.push(value);
  };

  let serviceType = inferServiceTypeFromProjectHint(combined, projectArchetype);
  const platformCapabilitySignals = hasPlatformCapabilitySignals(combined);
  const riskAwareDomainSignals = hasRiskAwareDomainSignals(combined);
  const informationalOnlyRequest = looksInformationalOnlyRequest(combined);
  if (!serviceType && /(custom software|software platform|saas platform|web platform|dashboard)/i.test(combined)) {
    serviceType = 'custom-software';
  }
  if (!serviceType && /(automation|workflow|ai agent|crm|whatsapp automation)/i.test(combined)) {
    serviceType = 'automation-ai';
  }

  addFeature(/blog/.test(combined), 'blog');
  addFeature(/admin/.test(combined), 'adminPanel');
  addFeature(/booking/.test(combined), 'booking');
  addFeature(/contact form/.test(combined), 'contactForm');
  addFeature(/\blogin\b|\bauth\b|customer accounts?/.test(combined), serviceType === 'ecommerce-website' ? 'customerAccounts' : 'auth');
  addFeature(/multilingual|multi language/.test(combined), 'multilingual');
  addFeature(/\bseo\b/.test(combined), 'seoFoundation');
  addFeature(/payment|gateway|checkout/.test(combined), 'payments');
  addFeature(/shipping|fulfillment/.test(combined), 'shipping');
  addFeature(/inventory/.test(combined), 'inventory');
  addFeature(/coupon|discount code/.test(combined), 'coupons');
  addFeature(/reviews?/.test(combined), 'reviews');
  addFeature(/variant/.test(combined), 'productVariants');
  addFeature(/import|csv|supplier app/.test(combined), 'productImport');
  addFeature(/multi.currency|multi currency/.test(combined), 'multiCurrency');
  addFeature(/custom checkout/.test(combined), 'customCheckout');
  addFeature(/dashboard/.test(combined), 'dashboard');
  addFeature(/\bcrm\b/.test(combined), 'crm');
  addFeature(/whatsapp/.test(combined), 'whatsapp');
  addFeature(/\bemail\b/.test(combined), 'email');
  addFeature(/social/.test(combined), 'social');
  addFeature(/ai agent|\bai\b/.test(combined), 'aiAgent');
  addFeature(/analytics/.test(combined), 'analytics');

  const productMatch = combined.match(/(\d+)\s+(products|skus?)/i);
  const integrationMatch = combined.match(/(\d+)\s+integrations?/i);
  const pageMatch = combined.match(/(\d+)\s+pages?/i);

  return normalizePricingScope({
    serviceType,
    projectArchetype,
    projectKindLabel,
    businessType: inferBusinessTypeFromLabel(projectKindLabel, projectArchetype),
    scopeConfirmed: features.length >= 2 || Boolean(productMatch) || Boolean(pageMatch),
    complexity: /(simple|basic|tight budget|lean|just need|only need)/i.test(combined)
      ? 'simple'
      : (/(platform|portal|dashboard|advanced|custom)/i.test(combined) || platformCapabilitySignals || (riskAwareDomainSignals && !informationalOnlyRequest))
        ? 'advanced'
        : 'standard',
    pricingMode: /(simple|basic|tight budget|lean|just need|only need)/i.test(combined)
      ? 'lean'
      : (/(platform|portal|dashboard|advanced|custom)/i.test(combined) || platformCapabilitySignals || (riskAwareDomainSignals && !informationalOnlyRequest))
        ? 'advanced'
        : 'standard',
    assetReadiness: /(starting from scratch|have nothing|nothing at all|no content|no logo|no domain|nothing ready)/i.test(combined) ? 'none' : /(have content|already have content|already have logo|already have domain)/i.test(combined) ? 'partial' : 'unknown',
    needsLogoSupport: /(need logo|no logo|help.*logo|create.*logo)/i.test(combined),
    needsBrandSupport: /(need branding|brand support|starting from scratch|help.*everything|full setup)/i.test(combined),
    needsContentSupport: /(need content|no content|copywriting|write content|starting from scratch)/i.test(combined),
    needsDomainSetup: /(no domain|need domain|domain setup|help.*domain)/i.test(combined),
    needsHostingSetup: /(hosting setup|need hosting|help.*hosting|full setup|starting from scratch)/i.test(combined) ? 'likely' : 'unknown',
    designLevel: /premium/.test(combined) ? 'premium' : 'standard',
    timelineUrgency: /very urgent|extremely urgent/.test(combined) ? 'very-urgent' : /rush|urgent|asap|fast|expedite/.test(combined) ? 'rush' : 'standard',
    pageCount: pageMatch ? Number(pageMatch[1]) : null,
    productCount: productMatch ? Number(productMatch[1]) : null,
    integrationCount: integrationMatch ? Number(integrationMatch[1]) : 0,
    features,
    missingRequirements: [],
    summary: combined || sourceMessages[sourceMessages.length - 1]?.content || messages[messages.length - 1]?.content || '',
  });
}

async function analyzeLeadIntentAndScope(messages, profile, previousScope = null) {
  const heuristicScope = buildHeuristicPricingScope(messages);
  if (!OPENAI_API_KEY) {
    const fallbackScope = normalizePricingScope({
      ...heuristicScope,
      includedPages: inferPagesForBusinessType(heuristicScope),
      includedFeatures: inferIncludedFeaturesForScope(heuristicScope),
      excludedFeatures: inferExcludedFeaturesForScope(heuristicScope),
      clarificationQuestions: heuristicScope.missingRequirements.slice(0, 3),
      needsClarification: heuristicScope.missingRequirements.length > 0,
      scopeLabel: heuristicScope.projectKindLabel || inferFriendlyScopeLabel(heuristicScope),
      lastUpdatedFromUserMessage: String([...messages].reverse().find((message) => message.role === 'user')?.content || ''),
    });
    return fallbackScope;
  }

  const userMessages = getUserOnlyMessages(messages);
  const latestUserMessage = String([...userMessages].reverse()[0]?.content || '').trim();
  const supportedServices = Object.keys(profile?.config_json?.services || {});

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are the intent and scope understanding layer for FLAME CORE TECHNOLOGIES LTD.',
              'Do not write a client-facing reply.',
              'Return strict JSON only.',
              'Your job is to understand the latest user intent before pricing runs.',
              'Latest user correction always wins over older context.',
              'If the latest message replaces or corrects the earlier project type, set scopeReplacement=true and update the active scope completely.',
              'Classify by intent, not just raw keyword matching.',
              'Think like a real consultant before classifying.',
              'Use this sequence internally: read the exact request, identify the literal service requested, think about the business context behind it, identify hidden complexity or risk signals, ask whether it could be informational only or whether it could involve accounts, payments, dashboards, workflows, integrations, sensitive data, identity, compliance, or regulated operations, then choose the safest practical scope label and serviceType.',
              'Do not assume that the word website automatically means a simple brochure site.',
              'Only classify as a simple brochure or business website when the request is clearly informational only.',
              'If the request could realistically involve regulated, financial, medical, legal, identity, transaction, or sensitive-data workflows, do not blindly collapse it to the cheapest website category.',
              'When a request is vague but could hide major complexity, prefer a safer more complex classification or mark that deeper scoping is needed rather than defaulting to the cheapest option.',
              'Do not depend on a fixed list of industries or website categories. Infer the project type from the user meaning, even when the wording is informal, mixed up, or non-technical.',
              'If the user asks for the overall cost after an estimate already exists, do not restart discovery. Keep the current scope and allow pricing to answer directly.',
              'Understand the difference between a simple informational website and an advanced platform.',
              'If a user asks for a simple training website, do not automatically classify it as an LMS unless they ask for login, videos, quizzes, certificates, progress tracking, or similar platform features.',
              'If the user says simple, basic, tight budget, lean, just need, or only need, switch to simple/lean mode.',
              'If the user removes features, exclude them immediately.',
              'If the user says no payment gateway for now, remove payment gateway from the active scope immediately and keep the rest of the store quote intact.',
              'Extract setup-readiness meaning into structured fields instead of depending on exact wording. Messages like "I have nothing", "starting from scratch", "no domain no logo", "need full setup", or "you guys will help me with everything" should map to asset readiness and setup support fields.',
              'If the user asks for your best recommendation or says they will go with your recommendation, choose a sensible lean starter scope and allow pricing to proceed with clear assumptions instead of restarting discovery.',
              'Ask at most 1 to 3 clarification questions when necessary.',
              `Supported pricing serviceType values: ${supportedServices.join(', ') || 'business-website, landing-page, ecommerce-website, mobile-app, custom-software, automation-ai'}.`,
              'Use projectKindLabel for the exact plain-language thing the user wants in their own terms, not a generic bucket label.',
              'Use includedPages only when you can infer business-specific page names confidently from the conversation itself.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              previousActiveScope: previousScope,
              latestUserMessage,
              conversation: userMessages.map((message) => ({ role: message.role, content: message.content })),
              heuristicScope,
              schema: {
                quoteIntent: 'boolean',
                scopeReplacement: 'boolean',
                scopeLabel: 'string',
                projectKindLabel: 'string',
                serviceType: 'string',
                projectArchetype: 'string',
                businessType: 'string',
                complexity: 'simple|standard|advanced',
                pricingMode: 'lean|standard|advanced',
                assetReadiness: 'none|partial|ready|unknown',
                needsBrandSupport: 'boolean',
                needsLogoSupport: 'boolean',
                needsContentSupport: 'boolean',
                needsDomainSetup: 'boolean',
                needsHostingSetup: 'no|likely|yes|unknown',
                designLevel: 'standard|premium',
                requestedFeatures: ['string'],
                removedFeatures: ['string'],
                excludedFeatures: ['string'],
                includedPages: ['string'],
                includedFeatures: ['string'],
                missingRequirements: ['string'],
                clarificationQuestions: ['string'],
                needsClarification: 'boolean',
                scopeConfirmed: 'boolean',
                pageCount: 'number|null',
                productCount: 'number|null',
                integrationCount: 'number',
                timelineUrgency: 'standard|rush|very-urgent',
              },
            }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Intent scope analysis failed', errorText.slice(0, 500));
      return normalizePricingScope({
        ...heuristicScope,
        includedPages: inferPagesForBusinessType(heuristicScope),
        includedFeatures: inferIncludedFeaturesForScope(heuristicScope),
        excludedFeatures: inferExcludedFeaturesForScope(heuristicScope),
        clarificationQuestions: heuristicScope.missingRequirements.slice(0, 3),
        needsClarification: heuristicScope.missingRequirements.length > 0,
        scopeLabel: heuristicScope.projectKindLabel || inferFriendlyScopeLabel(heuristicScope),
        lastUpdatedFromUserMessage: latestUserMessage,
      });
    }

    const payload = await aiResponse.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    const parsed = JSON.parse(content);
    const merged = normalizePricingScope({
      ...heuristicScope,
      ...parsed,
      features: Array.from(new Set([...(heuristicScope.features || []), ...((parsed?.requestedFeatures) || [])])),
      projectKindLabel: parsed?.projectKindLabel || parsed?.scopeLabel || heuristicScope.projectKindLabel,
      businessType: parsed?.businessType || inferBusinessTypeFromLabel(parsed?.projectKindLabel || parsed?.scopeLabel || heuristicScope.projectKindLabel, parsed?.projectArchetype || heuristicScope.projectArchetype),
      includedPages: Array.isArray(parsed?.includedPages) && parsed.includedPages.length ? parsed.includedPages : inferPagesForBusinessType({ ...heuristicScope, ...parsed }),
      includedFeatures: Array.from(new Set([...(Array.isArray(parsed?.includedFeatures) ? parsed.includedFeatures : []), ...inferIncludedFeaturesForScope({ ...heuristicScope, ...parsed })])),
      excludedFeatures: Array.from(new Set([...(parsed?.excludedFeatures || []), ...(parsed?.removedFeatures || []), ...inferExcludedFeaturesForScope({ ...heuristicScope, ...parsed })])),
      removedFeatures: parsed?.removedFeatures || [],
      clarificationQuestions: Array.isArray(parsed?.clarificationQuestions) ? parsed.clarificationQuestions.slice(0, 3) : [],
      lastUpdatedFromUserMessage: latestUserMessage,
    });

    return merged;
  } catch (error) {
    console.error('Intent scope analysis exception', error?.message || error);
    return normalizePricingScope({
      ...heuristicScope,
      includedPages: inferPagesForBusinessType(heuristicScope),
      includedFeatures: inferIncludedFeaturesForScope(heuristicScope),
      excludedFeatures: inferExcludedFeaturesForScope(heuristicScope),
      clarificationQuestions: heuristicScope.missingRequirements.slice(0, 3),
      needsClarification: heuristicScope.missingRequirements.length > 0,
      scopeLabel: heuristicScope.projectKindLabel || inferFriendlyScopeLabel(heuristicScope),
      lastUpdatedFromUserMessage: latestUserMessage,
    });
  }
}

async function extractPricingScope(messages, profile) {
  if (!OPENAI_API_KEY) return null;
  const userMessages = getUserOnlyMessages(messages);
  const sourceMessages = userMessages.length ? userMessages : messages;

  const supportedServices = Object.keys(profile?.config_json?.services || {});
  const systemPrompt = [
    'You extract pricing scope for FLAME CORE TECHNOLOGIES LTD from a sales chat.',
    'Return strict JSON only.',
    'Do not price anything.',
    'Only summarize scope using the provided schema.',
    'First understand what kind of website, app, or platform the visitor is asking for before mapping it into a pricing service type.',
    'Set projectKindLabel to a plain-language description of the exact thing the visitor wants using the user’s own meaning, not a forced preset category.',
    'Use only the visitor or user requests as the source of truth for requested scope and features.',
    'Do not infer optional add-ons unless the user explicitly asked for them.',
    'For simple business websites, start from the leanest practical scope and keep advanced features out unless explicitly requested.',
    `Supported serviceType values: ${supportedServices.join(', ') || 'landing-page, business-website, ecommerce-website, automation-ai'}.`,
    'Use projectArchetype only when it materially changes risk or quoting logic, not as a general industry bucket.',
    'Features must be returned as plain short labels such as blog, admin, booking, payments, shipping, inventory, reviews, auth, multilingual, seo, dashboard, crm, whatsapp, email, social, ai, analytics.',
    'Set scopeConfirmed=true only when the user has clearly confirmed what they want built.',
    'If details are still missing, include them in missingRequirements.',
  ].join(' ');

  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: null,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            conversation: sourceMessages.map((message) => ({ role: message.role, content: message.content })),
            schema: {
              serviceType: 'string',
              projectArchetype: 'string',
              projectKindLabel: 'string',
              scopeConfirmed: 'boolean',
              designLevel: 'standard|premium|unknown',
              timelineUrgency: 'standard|rush|very-urgent|unknown',
              pageCount: 'number|null',
              productCount: 'number|null',
              integrationCount: 'number',
              features: ['string'],
              missingRequirements: ['string'],
              summary: 'string',
            },
          }),
        },
      ],
    }),
  });

  if (!aiResponse.ok) return null;
  const aiPayload = await aiResponse.json();
  const content = String(aiPayload?.choices?.[0]?.message?.content || '').trim();
  if (!content) return null;

  try {
    return normalizePricingScope(JSON.parse(content));
  } catch {
    return null;
  }
}

async function analyzeAiFirstPricingScope(messages, profile, previousScope = null) {
  const startedAt = Date.now();
  const heuristicScope = buildHeuristicPricingScope(messages);
  const normalizedScope = normalizePricingScope({
    ...heuristicScope,
    ...previousScope,
    includedPages: inferPagesForBusinessType({ ...heuristicScope, ...previousScope }),
    includedFeatures: inferIncludedFeaturesForScope({ ...heuristicScope, ...previousScope }),
    excludedFeatures: inferExcludedFeaturesForScope({ ...heuristicScope, ...previousScope }),
    clarificationQuestions: heuristicScope.missingRequirements.slice(0, 3),
    needsClarification: heuristicScope.missingRequirements.length > 0,
    scopeLabel: heuristicScope.projectKindLabel || inferFriendlyScopeLabel(heuristicScope),
    lastUpdatedFromUserMessage: String([...messages].reverse().find((message) => message.role === 'user')?.content || ''),
  });
  if (!OPENAI_API_KEY) {
    return {
      scope: normalizedScope,
      raw: {
        scopeLabel: normalizedScope.scopeLabel || normalizedScope.projectKindLabel || inferFriendlyScopeLabel(normalizedScope),
        serviceType: normalizedScope.serviceType,
        complexity: normalizedScope.complexity,
        pricingMode: normalizedScope.pricingMode,
        quoteReadiness: Boolean(normalizedScope.scopeConfirmed || hasEnoughPricingDetail(normalizedScope)),
        confidence: 0.55,
        reasoning: 'Heuristic fallback scope analysis used because OpenAI is unavailable.',
      },
      meta: { source: 'heuristic-fallback', failureReason: 'ai_scope_unavailable', durationMs: Date.now() - startedAt },
    };
  }

  const userMessages = getUserOnlyMessages(messages);
  const recentConversation = takeRecentConversationItems(userMessages, 4);
  const latestUserMessage = String([...userMessages].reverse()[0]?.content || '').trim();
  const supportedServices = Object.keys(profile?.config_json?.audiences?.global?.services || profile?.config_json?.audiences?.african?.services || {});

  try {
    const primaryResult = await requestOpenAiJsonObject({
      systemPrompt: [
        'You are Milo scope reasoning for FLAME CORE TECHNOLOGIES LTD.',
        'Return strict JSON only. No client-facing reply.',
        'Reason like a consultant, not a keyword matcher.',
        'Do not assume website means brochure.',
        'Only use business-website when clearly informational only.',
        'If accounts, dashboards, payments, workflows, integrations, compliance, identity, or sensitive data are likely, choose the safer higher-complexity classification.',
        'Platform or system capabilities must not be classified as a simple business website.',
        `Supported serviceType values: ${supportedServices.join(', ') || 'business-website, landing-page, ecommerce-website, mobile-app, custom-software, automation-ai'}.`,
      ].join(' '),
      userPayload: {
        latestUserMessage,
        conversation: recentConversation,
        currentStructuredScope: normalizedScope,
        schema: {
          scopeLabel: 'string',
          projectKindLabel: 'string',
          serviceType: 'string',
          complexity: 'simple|standard|advanced',
          pricingMode: 'lean|standard|advanced',
          includedFeatures: ['string'],
          excludedFeatures: ['string'],
          includedPages: ['string'],
          quoteReadiness: 'boolean',
          confidence: 'number 0..1',
          reasoning: 'string',
          clarificationQuestions: ['string'],
        },
      },
      timeoutMs: 9000,
      maxCompletionTokens: 900,
      temperature: null,
    });

    const rescueResult = primaryResult.parsed ? null : await requestOpenAiJsonObject({
      systemPrompt: [
        'Classify the project scope for Milo.',
        'Return strict JSON only.',
        'If informational only: business-website or landing-page.',
        'If accounts, dashboard, payments, KYC, compliance, identity, or sensitive workflows are likely: custom-software.',
      ].join(' '),
      userPayload: {
        latestUserMessage,
        currentStructuredScope: {
          projectKindLabel: normalizedScope.projectKindLabel,
          serviceType: normalizedScope.serviceType,
          complexity: normalizedScope.complexity,
          pricingMode: normalizedScope.pricingMode,
        },
        schema: {
          scopeLabel: 'string',
          projectKindLabel: 'string',
          serviceType: 'string',
          complexity: 'simple|standard|advanced',
          pricingMode: 'lean|standard|advanced',
          quoteReadiness: 'boolean',
          confidence: 'number 0..1',
          reasoning: 'string',
        },
      },
      timeoutMs: 7000,
      maxCompletionTokens: 500,
      temperature: null,
    });

    const parsed = primaryResult.parsed || rescueResult?.parsed;
    if (!parsed) {
      return {
        scope: normalizedScope,
        raw: {
          scopeLabel: normalizedScope.scopeLabel || normalizedScope.projectKindLabel || inferFriendlyScopeLabel(normalizedScope),
          serviceType: normalizedScope.serviceType,
          complexity: normalizedScope.complexity,
          pricingMode: normalizedScope.pricingMode,
          quoteReadiness: Boolean(normalizedScope.scopeConfirmed || hasEnoughPricingDetail(normalizedScope)),
          confidence: 0.55,
          reasoning: 'Fallback scope analysis used because both AI scope attempts failed.',
        },
        meta: { source: 'heuristic-fallback', failureReason: rescueResult?.failureReason || primaryResult.failureReason || 'timeout_or_api_failure', durationMs: Date.now() - startedAt },
      };
    }

    const mergedScope = normalizePricingScope({
      ...normalizedScope,
      ...parsed,
      scopeLabel: parsed.scopeLabel || normalizedScope.scopeLabel || normalizedScope.projectKindLabel,
      projectKindLabel: parsed.projectKindLabel || normalizedScope.projectKindLabel,
      serviceType: parsed.serviceType || normalizedScope.serviceType,
      complexity: parsed.complexity || normalizedScope.complexity,
      pricingMode: parsed.pricingMode || normalizedScope.pricingMode,
      includedPages: Array.isArray(parsed.includedPages) && parsed.includedPages.length ? parsed.includedPages : normalizedScope.includedPages,
      includedFeatures: Array.isArray(parsed.includedFeatures) && parsed.includedFeatures.length ? parsed.includedFeatures : normalizedScope.includedFeatures,
      excludedFeatures: Array.isArray(parsed.excludedFeatures) && parsed.excludedFeatures.length ? parsed.excludedFeatures : normalizedScope.excludedFeatures,
      clarificationQuestions: Array.isArray(parsed.clarificationQuestions) ? parsed.clarificationQuestions.slice(0, 3) : normalizedScope.clarificationQuestions,
      scopeConfirmed: parsed.quoteReadiness === true ? true : normalizedScope.scopeConfirmed,
    });

    return {
      scope: mergedScope,
      raw: {
        ...parsed,
        scopeLabel: parsed.scopeLabel || mergedScope.scopeLabel || inferFriendlyScopeLabel(mergedScope),
        serviceType: parsed.serviceType || mergedScope.serviceType,
        complexity: parsed.complexity || mergedScope.complexity,
        pricingMode: parsed.pricingMode || mergedScope.pricingMode,
        quoteReadiness: parsed.quoteReadiness === true ? true : Boolean(mergedScope.scopeConfirmed || hasEnoughPricingDetail(mergedScope)),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.6))),
        reasoning: String(parsed.reasoning || '').trim(),
      },
      meta: { source: primaryResult.parsed ? 'ai-first' : 'ai-first-rescue', failureReason: null, durationMs: Date.now() - startedAt },
    };
  } catch (error) {
    console.error('AI-first scope reasoning exception', error?.message || error);
    return {
      scope: normalizedScope,
      raw: {
        scopeLabel: normalizedScope.scopeLabel || normalizedScope.projectKindLabel || inferFriendlyScopeLabel(normalizedScope),
        serviceType: normalizedScope.serviceType,
        complexity: normalizedScope.complexity,
        pricingMode: normalizedScope.pricingMode,
        quoteReadiness: Boolean(normalizedScope.scopeConfirmed || hasEnoughPricingDetail(normalizedScope)),
        confidence: 0.55,
        reasoning: 'Fallback scope analysis used because AI scope reasoning failed.',
      },
      meta: { source: 'heuristic-fallback', failureReason: 'timeout_or_api_failure', errorText: String(error?.message || error), durationMs: Date.now() - startedAt },
    };
  }
}

async function deriveAiFirstPricingDecision(scope, profile, options = {}) {
  const startedAt = Date.now();
  if (!OPENAI_API_KEY || !scope?.serviceType) {
    return { decision: null, failureReason: 'ai_pricing_unavailable', durationMs: Date.now() - startedAt };
  }

  const pricingReference = buildAiPricingReference(profile, options.audience);
  const fallbackEstimate = options.fallbackEstimate || null;
  const conversation = takeRecentConversationItems(getUserOnlyMessages(options.messages || []), 4);

  try {
    const primaryResult = await requestOpenAiJsonObject({
      systemPrompt: [
        'You are Milo pricing reasoning for FLAME CORE TECHNOLOGIES LTD.',
        'Return strict JSON only. No client-facing reply.',
        'Keep the output compact and practical.',
        'Use the provided service baselines and only add explicit extras.',
        'Do not default to brochure pricing just because the customer used the word website.',
        'If the request implies accounts, dashboards, payments, workflows, integrations, compliance, identity, or sensitive data, choose the safer higher-complexity price path.',
        'Platform or system scope must not use the business-website baseline.',
        'Prefer a single realistic starting estimate over vague ranges.',
      ].join(' '),
      userPayload: {
        latestUserRequest: conversation[conversation.length - 1]?.content || '',
        normalizedScope: {
          scopeLabel: scope.scopeLabel,
          projectKindLabel: scope.projectKindLabel,
          serviceType: scope.serviceType,
          complexity: scope.complexity,
          pricingMode: scope.pricingMode,
          features: scope.features,
          excludedFeatures: scope.excludedFeatures,
          productCount: scope.productCount,
          pageCount: scope.pageCount,
          integrationCount: scope.integrationCount,
        },
        serviceBaselines: pricingReference.services,
        addOnRates: {
          extraPage: pricingReference.extraPage,
          extraProduct: pricingReference.extraProduct,
          extraIntegration: pricingReference.extraIntegration,
          premiumDesign: pricingReference.premiumDesign,
          copySupport: pricingReference.copySupport,
          minimumProjectValue: pricingReference.minimumProjectValue,
        },
        fallbackEstimate: fallbackEstimate
          ? {
              serviceType: fallbackEstimate.serviceType,
              total: fallbackEstimate.total,
              breakdown: fallbackEstimate.breakdown,
            }
          : null,
        schema: {
          quoteNow: 'boolean',
          scopeLabel: 'string',
          serviceType: 'string',
          pricingBasis: 'string',
          baseReferenceService: 'string',
          lineItems: [{ label: 'string', amount: 'number' }],
          includedItems: ['string'],
          excludedItems: ['string'],
          estimatedTotal: 'number',
          aiDerived: 'boolean',
          confidence: 'number 0..1',
          reasoning: 'string',
          notes: ['string'],
          followUpQuestions: ['string'],
        },
      },
      timeoutMs: 12000,
      maxCompletionTokens: 520,
      temperature: null,
    });

    const rescueResult = primaryResult.parsed ? null : await requestOpenAiJsonObject({
      systemPrompt: [
        'Produce a pricing JSON for Milo.',
        'Return strict JSON only.',
        'Use a single realistic starting estimate.',
        'Do not use business-website pricing for platform or system scope.',
      ].join(' '),
      userPayload: {
        normalizedScope: {
          scopeLabel: scope.scopeLabel,
          projectKindLabel: scope.projectKindLabel,
          serviceType: scope.serviceType,
          complexity: scope.complexity,
          pricingMode: scope.pricingMode,
          features: scope.features,
          excludedFeatures: scope.excludedFeatures,
          productCount: scope.productCount,
          pageCount: scope.pageCount,
          integrationCount: scope.integrationCount,
        },
        serviceBaselines: pricingReference.services,
        minimumProjectValue: pricingReference.minimumProjectValue,
        schema: {
          quoteNow: 'boolean',
          scopeLabel: 'string',
          serviceType: 'string',
          pricingBasis: 'string',
          baseReferenceService: 'string',
          lineItems: [{ label: 'string', amount: 'number' }],
          includedItems: ['string'],
          excludedItems: ['string'],
          estimatedTotal: 'number',
          aiDerived: 'boolean',
          confidence: 'number 0..1',
          reasoning: 'string',
          notes: ['string'],
          followUpQuestions: ['string'],
        },
      },
      timeoutMs: 9000,
      maxCompletionTokens: 360,
      temperature: null,
    });

    const parsed = primaryResult.parsed || rescueResult?.parsed;
    if (!parsed) {
      return {
        decision: null,
        failureReason: rescueResult?.failureReason || primaryResult.failureReason || 'timeout_or_api_failure',
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      decision: parsed,
      failureReason: null,
      durationMs: Date.now() - startedAt,
      source: primaryResult.parsed ? 'ai-first' : 'ai-first-rescue',
    };
  } catch (error) {
    console.error('AI-first pricing decision exception', error?.message || error);
    return { decision: null, failureReason: 'timeout_or_api_failure', errorText: String(error?.message || error), durationMs: Date.now() - startedAt };
  }
}

function calculateHybridPrice(scope, profile, options = {}) {
  const config = profile?.config_json || {};
  const audienceKey = options.audience === 'african' ? 'african' : 'global';
  const audienceConfig = config.audiences?.[audienceKey];
  const serviceConfig = audienceConfig?.services?.[scope.serviceType];
  if (!serviceConfig) return null;

  const breakdown = [];
  let total = 0;
  const add = (label, amount) => {
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return;
    total += Number(amount);
    breakdown.push({ label, amount: Number(amount) });
  };

  const ecommerceLiteMode =
    scope.serviceType === 'ecommerce-website'
    && (!Array.isArray(scope.features) || !scope.features.includes('payments'))
    && (!Array.isArray(scope.features) || !scope.features.includes('customerAccounts'))
    && Array.isArray(scope.excludedFeatures)
    && scope.excludedFeatures.some((item) => /payment gateway|checkout|customer accounts/i.test(String(item || '')));

  if (ecommerceLiteMode) {
    const liteBase = Number(serviceConfig.base || 0);
    add('Base lean catalog website build', liteBase);
  } else {
    add('Base build', serviceConfig.base);
  }

  if (scope.serviceType === 'landing-page' || scope.serviceType === 'business-website') {
    const includedPages = Number(audienceConfig?.includedPages || 0);
    if (scope.pageCount && scope.pageCount > includedPages) {
      add(`Additional pages (${scope.pageCount - includedPages})`, (scope.pageCount - includedPages) * Number(audienceConfig?.extraPage || 0));
    }
  }

  if (scope.serviceType === 'ecommerce-website') {
    const includedProducts = Number(audienceConfig?.includedProducts || 0);
    if (scope.productCount && scope.productCount > includedProducts) {
      add(`Additional products (${scope.productCount - includedProducts})`, (scope.productCount - includedProducts) * Number(audienceConfig?.extraProduct || 0));
    }
  }

  if (scope.designLevel === 'premium') {
    add('Premium design', Number(audienceConfig?.premiumDesign || 0));
  }

  for (const feature of scope.features) {
    if (feature === 'integrations') continue;
    if (feature === 'copySupport') {
      add('Basic logo or brand support', Number(audienceConfig?.copySupport || 0));
      continue;
    }
    add(feature.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()), Number(audienceConfig?.features?.[feature] || 0));
  }

  if (scope.integrationCount > 0 && Number(audienceConfig?.extraIntegration || 0) > 0) {
    add(`Integrations (${scope.integrationCount})`, scope.integrationCount * Number(audienceConfig?.extraIntegration || 0));
  }

  if (scope.timelineUrgency === 'rush' && Number(audienceConfig?.rushMultiplier || 0) > 1) {
    const rushAmount = Math.round(total * (Number(audienceConfig.rushMultiplier) - 1));
    add('Rush scheduling uplift', rushAmount);
  }

  if (scope.timelineUrgency === 'very-urgent' && Number(audienceConfig?.veryUrgentMultiplier || 0) > 1) {
    const upliftFromMultiplier = Math.round(total * (Number(audienceConfig.veryUrgentMultiplier) - 1));
    const rushAmount = Math.max(upliftFromMultiplier, Number(audienceConfig?.veryUrgentMinimumAdd || 0));
    add('Very urgent scheduling uplift', rushAmount);
  }

  const shouldAddContingency =
    config?.contingencyRules?.applyWhenScopeUnclear &&
    !(scope.scopeConfirmed && (scope.pricingMode === 'lean' || scope.complexity === 'simple') && scope.integrationCount <= 1) &&
    !(scope.serviceType === 'business-website' && (scope.pricingMode === 'lean' || scope.complexity === 'simple') && scope.integrationCount === 0) &&
    !(ecommerceLiteMode && (scope.pricingMode === 'lean' || scope.complexity === 'simple') && scope.integrationCount === 0) &&
    (scope.missingRequirements.length > 0 || scope.integrationCount > 2 || /custom|unknown|third-party/i.test(scope.summary || ''));

  if (shouldAddContingency && Number(config?.contingencyRules?.multiplier || 0) > 1) {
    const contingencyAmount = Math.round(total * (Number(config.contingencyRules.multiplier) - 1));
    add('Scope contingency buffer', contingencyAmount);
  }

  const currency = config.currency || 'USD';
  total = Math.max(total, Number(audienceConfig?.minimumProjectValue || 0));
  return {
    currency,
    total,
    breakdown,
    summary: scope.summary,
    serviceType: scope.serviceType,
    scope,
    audience: audienceKey,
    audienceConfig,
  };
}

function inferBusinessWebsitePageSet(scope = {}) {
  if (Array.isArray(scope.includedPages) && scope.includedPages.length) {
    return scope.includedPages;
  }
  return ['Home', 'About', 'Services / Overview', 'Contact'];
}

function inferFriendlyScopeLabel(scope = {}) {
  const features = new Set(Array.isArray(scope.features) ? scope.features : []);
  const excluded = Array.isArray(scope.excludedFeatures) ? scope.excludedFeatures.map((item) => String(item || '').toLowerCase()) : [];
  const hasCatalogueIntent = /catalog|product|inventory|shop|store|collections?/.test(String(scope.summary || '').toLowerCase()) || Number(scope.productCount || 0) > 0;
  const excludesCheckout = excluded.some((item) => /payment gateway|checkout|customer accounts/.test(item)) || !features.has('payments');
  const normalizedProjectKindLabel = String(scope.projectKindLabel || '')
    .replace(/\b(simple|basic|starter|lean|standard)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (scope.serviceType === 'business-website') {
    if (features.has('booking')) return 'Service booking website';
    if (hasCatalogueIntent) return 'Product catalogue website';
    if (normalizedProjectKindLabel && /website|site/i.test(normalizedProjectKindLabel)) {
      return scope.pricingMode === 'lean' || scope.complexity === 'simple'
        ? `Starter ${normalizedProjectKindLabel}`
        : normalizedProjectKindLabel;
    }
    return scope.pricingMode === 'lean' || scope.complexity === 'simple' ? 'Starter brochure website' : 'Simple business website';
  }
  if (scope.serviceType === 'landing-page') return 'Landing page';
  if (scope.serviceType === 'ecommerce-website') {
    return hasCatalogueIntent && excludesCheckout ? 'Ecommerce-lite catalogue store' : 'Ecommerce store';
  }
  if (scope.serviceType === 'mobile-app') return 'Mobile app project';
  if (scope.serviceType === 'custom-software') return 'Custom portal / dashboard';
  if (scope.serviceType === 'automation-ai') return 'AI automation workflow';

  return 'Website project';
}

function buildBreakdownNotes(estimate) {
  const notes = [];
  const pageSet = inferBusinessWebsitePageSet(estimate.scope);
  const includedFeatures = Array.isArray(estimate.scope?.includedFeatures) ? estimate.scope.includedFeatures.filter(Boolean) : [];
  const excludedFeatures = Array.isArray(estimate.scope?.excludedFeatures) ? estimate.scope.excludedFeatures.filter(Boolean) : [];

  for (const item of estimate.breakdown) {
    if (item.label === 'Base build') {
      if (estimate.serviceType === 'business-website') {
        notes.push(`- Base build includes standard design, responsive layout, and the core pages: ${pageSet.join(', ')}.`);
        if (includedFeatures.length) {
          notes.push(`- Included: ${includedFeatures.join(', ')}.`);
        }
        if (excludedFeatures.length) {
          notes.push(`- Not included in this scope: ${excludedFeatures.join(', ')}.`);
        }
      } else if (estimate.serviceType === 'landing-page') {
        notes.push(`- Base build includes a focused landing page, responsive design, conversion sections, and contact capture.`);
      } else if (estimate.serviceType === 'ecommerce-website') {
        notes.push(`- Base build includes the essential store structure for launch.`);
        if (includedFeatures.length) {
          notes.push(`- Included: ${includedFeatures.join(', ')}.`);
        }
        if (excludedFeatures.length) {
          notes.push(`- Not included in this scope: ${excludedFeatures.join(', ')}.`);
        }
      } else {
        notes.push(`- Base build covers the core planning, design, and delivery foundation for this scope.`);
      }
      continue;
    }

    if (item.label === 'Base lean catalog website build') {
      notes.push(`- This is a catalogue or inquiry-based store, not a full checkout store.`);
      notes.push(`- Included pages are designed for product viewing and order enquiries, without payment gateway or customer-account setup unless requested later.`);
      if (includedFeatures.length) {
        notes.push(`- Included: ${includedFeatures.join(', ')}.`);
      }
      if (excludedFeatures.length) {
        notes.push(`- Not included in this scope: ${excludedFeatures.join(', ')}.`);
      }
      continue;
    }

    if (item.label === 'Contact Form') {
      notes.push(`- Contact form includes a direct inquiry channel so visitors can reach the team or business easily.`);
      continue;
    }

    if (item.label === 'Seo Foundation') {
      notes.push(`- SEO foundation covers the basic technical and on-page setup needed for a cleaner search presence.`);
      continue;
    }

    if (item.label === 'WhatsApp') {
      notes.push(`- WhatsApp here means a simple contact entry point unless deeper automation is requested separately.`);
      continue;
    }
  }

  return notes;
}

function buildPricingFollowUp(scope) {
  const questions = scope.missingRequirements.length
    ? scope.missingRequirements
    : ['required features', 'timeline', 'design level', 'integrations'];

  return [
    `I can price this properly once the scope is confirmed.`,
    `To keep the quote accurate, please confirm these details:`,
    ...questions.slice(0, 6).map((item) => `- ${item}`),
    `Once you confirm the scope, I'll give a structured price tied to the exact work involved.`,
  ].join('\n');
}

async function generateConversationalPricingFollowUp(scope, messages = [], options = {}) {
  const fallbackReply = buildPricingFollowUp(scope);
  if (!OPENAI_API_KEY) return fallbackReply;

  const questions = ((Array.isArray(scope.clarificationQuestions) && scope.clarificationQuestions.length)
    ? scope.clarificationQuestions
    : scope.missingRequirements.length
    ? scope.missingRequirements
    : ['required features', 'timeline', 'design level', 'integrations']).slice(0, 3);
  const conversation = getUserOnlyMessages(messages).map((message) => ({
    role: message.role,
    content: String(message.content || '').trim(),
  })).filter((item) => item.content);

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              'You are Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.',
              'Write a short, natural website-chat reply that asks for the missing details needed before pricing.',
              'Sound like a real human assistant: warm, confident, conversational, and professional.',
              'Do not sound robotic, legalistic, stiff, or templated.',
              'Do not give any price yet.',
              'Do not ask every possible question if only a few are needed.',
              'If includeIntro is false, do not reintroduce yourself.',
              'Use the actual project idea from the conversation, not a generic website bucket.',
              'Keep the message compact and easy to reply to.',
              'Return plain text only.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              includeIntro: Boolean(options.includeIntro),
              conversation,
              projectHint: scope.projectKindLabel || scope.summary || '',
              serviceType: scope.serviceType,
              missingDetails: questions,
              desiredOutcome: 'Get the remaining details needed to price the work properly.',
            }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Conversational pricing follow-up failed', errorText.slice(0, 500));
      return fallbackReply;
    }
    const payload = await aiResponse.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      console.error('Conversational pricing follow-up returned empty content');
      return fallbackReply;
    }
    return content;
  } catch (error) {
    console.error('Conversational pricing follow-up exception', error?.message || error);
    return fallbackReply;
  }
}

function hasEnoughPricingDetail(scope) {
  const nonCriticalMissing = new Set([
    'budget range',
    'preferred follow-up channel',
    'preferred follow-up',
    'business goal',
    'target launch date',
    'launch date',
    'expected traffic',
  ]);

  const essentialMissing = scope.missingRequirements.filter(
    (item) => !nonCriticalMissing.has(String(item || '').toLowerCase()),
  );

  if (!scope.serviceType) return false;

  if (scope.serviceType === 'ecommerce-website') {
    return Boolean(
      (scope.productCount !== null || scope.scopeConfirmed) &&
      scope.designLevel &&
      (scope.features.length >= 1 || scope.integrationCount > 0 || scope.pricingMode === 'lean' || scope.complexity === 'simple') &&
      essentialMissing.length <= 2,
    );
  }

  if (scope.serviceType === 'business-website') {
    return Boolean(
      (
        scope.pageCount !== null ||
        (Array.isArray(scope.includedPages) && scope.includedPages.length >= 3) ||
        (scope.projectKindLabel && (scope.pricingMode === 'lean' || scope.complexity === 'simple'))
      ) &&
      scope.designLevel &&
      essentialMissing.length <= 2,
    );
  }

  if (scope.serviceType === 'landing-page') {
    return Boolean(scope.designLevel && essentialMissing.length <= 2);
  }

  if (scope.serviceType === 'automation-ai') {
    return Boolean(scope.features.length >= 2 && essentialMissing.length <= 2);
  }

  return false;
}

function quoteRequiresTeamApproval(scope, profile) {
  const rules = profile?.config_json?.restrictedQuoteRules || {};
  const restrictedKeywords = Array.isArray(rules.restrictedKeywords) ? rules.restrictedKeywords : [];
  const restrictedServices = Array.isArray(rules.restrictedServices) ? rules.restrictedServices : [];
  const summary = String(scope.summary || '').toLowerCase();

  if (restrictedServices.includes(scope.serviceType)) return true;
  if (scope.projectArchetype === 'crowdfunding-platform') return true;
  if (scope.integrationCount > Number(rules.maxDirectIntegrations || 999)) return true;
  if (restrictedKeywords.some((keyword) => summary.includes(String(keyword).toLowerCase()))) return true;
  return false;
}

async function buildLocalizedPricingView(estimate, geoContext) {
  const usdAmount = formatMoney(estimate.total, estimate.currency);
  if (!geoContext?.currencyCode || geoContext.currencyCode === 'USD') {
    return {
      usdAmount,
      localAmount: null,
      locationLabel: geoContext?.country || null,
      note: geoContext?.isVpnLike ? 'Location detection is only an estimate and may need manual confirmation.' : null,
    };
  }

  const quote = await getUsdQuote(geoContext.currencyCode);
  if (!quote?.rate) {
    return {
      usdAmount,
      localAmount: null,
      locationLabel: geoContext?.country || null,
      note: geoContext?.isVpnLike ? 'Location detection is only an estimate and may need manual confirmation.' : null,
    };
  }

  const localValue = roundLocalCurrencyAmount(estimate.total * quote.rate);
  return {
    usdAmount,
    localAmount: formatMoney(localValue, quote.currency),
    locationLabel: geoContext?.country || null,
    note: geoContext?.isVpnLike ? 'Location detection is only an estimate and may need manual confirmation.' : null,
  };
}

function buildApprovalRequiredReply(scope, geoContext, options = {}) {
  const scopeLabel = inferFriendlyScopeLabel(scope);
  const scopeLine = scopeLabel ? `Scope: ${scopeLabel}.` : null;
  const reasonLine = scope.projectArchetype === 'crowdfunding-platform'
    ? `A crowdfunding-style platform needs deeper product and workflow review before it can be quoted properly.`
    : `That is because the scope falls into a restricted quoting category such as high-complexity software, advanced automation, sensitive/compliance-heavy work, or an integration-heavy build.`;
  return [
    options.includeIntro ? `Hi - I'm Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.` : null,
    `This project needs direct team review before Milo can quote it automatically.`,
    scopeLine,
    reasonLine,
    `Please send the confirmed requirements to ${PUBLIC_SUPPORT_EMAIL} or use the contact form, and the team will prepare the correct commercial quote manually.`,
  ].filter(Boolean).join('\n');
}

function buildStructuredPricingReply(estimate, localizedView, options = {}) {
  const removedFeatures = Array.isArray(options.removedFeatures) ? options.removedFeatures.filter(Boolean) : [];
  const acknowledgeRemovals = options.acknowledgeRemovals === true;
  const scopeLabel = inferFriendlyScopeLabel(estimate.scope);
  const scopeLine = scopeLabel ? `Scope: ${scopeLabel}` : null;
  const breakdownLines = estimate.breakdown.map((item) => `- ${item.label}: ${formatMoney(item.amount, estimate.currency)}`);
  const introLine = `Thanks — your estimated starting price is ${localizedView?.usdAmount || formatMoney(estimate.total, estimate.currency)}${localizedView?.localAmount ? ` (about ${localizedView.localAmount})` : ''}.`;
  const removalLine = acknowledgeRemovals && removedFeatures.length ? `Got it - I've removed ${removedFeatures.join(', ')} from the estimate.` : null;
  const phaseLine = estimate.serviceType === 'business-website'
    ? `For a project like this, I’d usually recommend starting with the leanest practical version first, then adding upgrades later only if you want them.`
    : null;
  const breakdownNotes = buildBreakdownNotes(estimate);
  const flexibilityLine = `If you add or remove features, I’ll recalculate it straight away.`;
  const closeLine = estimate.serviceType === 'business-website'
    ? `If you want, I can also help you narrow this into the best page list and the right first version before the team follows up.`
    : `If you want, I can also help refine the scope a little more before the team follows up.`;

  return [
    options.includeIntro ? `Hi - I'm Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.` : null,
    options.includeIntro ? '' : null,
    removalLine,
    introLine,
    scopeLine,
    '',
    `Here’s what that starting price covers:`,
    ...breakdownLines,
    ...(breakdownNotes.length ? ['', `Included in that scope:`, ...breakdownNotes] : []),
    '',
    flexibilityLine,
    phaseLine,
    `Timeline will be confirmed after we review your content and final page list.`,
    `Once the scope is fully confirmed, I can turn this into a final quote for you.`,
    closeLine,
  ].filter(Boolean).join('\n');
}

function buildLeanBusinessPricingReply(estimate, localizedView, options = {}) {
  const removedFeatures = Array.isArray(options.removedFeatures) ? options.removedFeatures.filter(Boolean) : [];
  const acknowledgeRemovals = options.acknowledgeRemovals === true;
  const scopeLabel = inferFriendlyScopeLabel(estimate.scope);
  const pages = inferBusinessWebsitePageSet(estimate.scope);
  const includedFeatures = Array.isArray(estimate.scope?.includedFeatures) ? estimate.scope.includedFeatures.filter(Boolean) : [];
  const excludedFeatures = Array.isArray(estimate.scope?.excludedFeatures) ? estimate.scope.excludedFeatures.filter(Boolean) : [];
  const breakdownLines = estimate.breakdown.map((item) => `- ${item.label}: ${formatMoney(item.amount, estimate.currency)}`);
  const introLine = `${scopeLabel ? `${scopeLabel.replace(/^./, (char) => char.toUpperCase())} — ` : ''}starter build`;
  const totalLine = `The starting price for this scope is ${localizedView?.usdAmount || formatMoney(estimate.total, estimate.currency)}${localizedView?.localAmount ? ` (about ${localizedView.localAmount})` : ''}.`;
  const removalLine = removedFeatures.length ? `Got it — I’ve removed ${removedFeatures.join(', ')} from the scope.` : null;
  const includedLine = pages.length ? `Pages included: ${pages.join(', ')}.` : null;
  const featureLine = includedFeatures.length ? `Included in this scope: ${includedFeatures.join(', ')}.` : null;
  const excludedLine = excludedFeatures.length ? `Not included in this scope: ${excludedFeatures.join(', ')}.` : null;

  return [
    options.includeIntro ? `Hi - I'm Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.` : null,
    options.includeIntro ? '' : null,
    introLine,
    removalLine,
    totalLine,
    '',
    includedLine,
    featureLine,
    excludedLine,
    '',
    'Price breakdown:',
    ...breakdownLines,
    '',
    'This is the lean first version I’d recommend if you want to launch cleanly without adding unnecessary extras.',
    'Timeline will be confirmed after we review your content and final page list.',
    'If you want to add anything else, tell me the exact feature and I’ll update the price cleanly.',
  ].filter(Boolean).join('\n');
}

async function generateConversationalPricingReply(estimate, localizedView, messages = [], options = {}) {
  if (estimate?.serviceType === 'business-website' && (estimate?.scope?.pricingMode === 'lean' || estimate?.scope?.complexity === 'simple')) {
    return buildLeanBusinessPricingReply(estimate, localizedView, options);
  }
  const fallbackReply = buildStructuredPricingReply(estimate, localizedView, options);
  if (!OPENAI_API_KEY) return fallbackReply;

  const removedFeatures = Array.isArray(options.removedFeatures) ? options.removedFeatures.filter(Boolean) : [];
  const conversation = getUserOnlyMessages(messages).map((message) => ({
    role: message.role,
    content: String(message.content || '').trim(),
  })).filter((item) => item.content);
  const totalDisplay = localizedView?.usdAmount || formatMoney(estimate.total, estimate.currency);
  const localDisplay = localizedView?.localAmount || null;
  const allowedBreakdownNotes = buildBreakdownNotes(estimate).map((line) => line.replace(/^- /, '').trim()).filter(Boolean);
  const allowedPages = Array.isArray(estimate.scope?.includedPages) ? estimate.scope.includedPages.filter(Boolean) : [];
  const allowedIncludedFeatures = Array.isArray(estimate.scope?.includedFeatures) ? estimate.scope.includedFeatures.filter(Boolean) : [];
  const allowedExcludedFeatures = Array.isArray(estimate.scope?.excludedFeatures) ? estimate.scope.excludedFeatures.filter(Boolean) : [];

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              'You are Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.',
              'Write a natural, human-sounding client reply for a website chat widget.',
              'Sound warm, confident, clear, and professional - like a real human assistant, not a script or legal notice.',
              'Use the exact pricing data provided. Do not change any amounts, features, or scope.',
              'Do not add any new pages, features, integrations, setup items, or deliverables that are not explicitly present in the supplied scope data.',
              'Only mention concrete inclusions that are present in includedPages, includedFeatures, breakdown, or allowedScopeFacts.',
              'Do not improvise operational extras such as training sessions, revision rounds, post-launch support periods, CMS handover, analytics setup, search console setup, gallery, testimonials, WhatsApp CTA, package pages, listing filters, or map features unless they are explicitly present in the supplied scope data.',
              'Reason from the actual conversation first so you describe the project the way a capable consultant would, not as a generic bucket.',
              'Treat included and excluded items as hard scope rules. Do not turn setup assistance into bundled purchase costs if the excluded list says those third-party costs are not included.',
              'If domain or hosting purchase fees are excluded, explicitly say those third-party purchase costs are separate and not included in the quoted total.',
              'Do not mention user location, geography, exchange logic, internal policy, or that pricing is based on location.',
              'Do not use vague price ranges.',
              'Do not promise guaranteed delivery dates.',
              'Do not reintroduce yourself unless includeIntro is true.',
              'Give the project a clean professional label based on the conversation.',
              'Explain what is included in a natural way, based on the actual type of product the user asked for.',
              'If removedFeatures is not empty, acknowledge naturally that those items have been removed from the scope before giving the updated estimate.',
              'If the scope is lean or simple, make that feel intentional and smart, not cheap or robotic.',
              'Keep the reply compact enough for a website chat, but still warm and helpful.',
              'End by inviting the visitor to confirm any extra features they want, so pricing can be updated cleanly.',
              'Return plain text only.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              includeIntro: Boolean(options.includeIntro),
              conversation,
              removedFeatures,
              serviceType: estimate.serviceType,
              projectHint: estimate.scope?.projectKindLabel || estimate.scope?.summary || '',
              projectArchetype: estimate.scope?.projectArchetype || '',
              totalPrice: totalDisplay,
              localApproximation: localDisplay,
              includedPages: Array.isArray(estimate.scope?.includedPages) ? estimate.scope.includedPages : [],
              includedFeatures: Array.isArray(estimate.scope?.includedFeatures) ? estimate.scope.includedFeatures : [],
              excludedFeatures: Array.isArray(estimate.scope?.excludedFeatures) ? estimate.scope.excludedFeatures : [],
              allowedScopeFacts: allowedBreakdownNotes,
              breakdown: estimate.breakdown.map((item) => ({
                label: item.label,
                amount: formatMoney(item.amount, estimate.currency),
              })),
              fallbackIncludedReference: allowedBreakdownNotes,
              hardScopeGuard: {
                allowedPages,
                allowedIncludedFeatures,
                allowedExcludedFeatures,
              },
              phaseRecommendation: estimate.serviceType === 'business-website'
                ? 'Recommend starting with the leanest practical version first, then adding extra features later only if the client wants them.'
                : null,
              timelineNote: 'Timeline will be confirmed after content and final page list are reviewed.',
              desiredStyle: {
                avoid: [
                  'Current scope: raw user sentence',
                  'legal-sounding disclaimers',
                  'robotic filler',
                  'overly stiff formatting',
                ],
                prefer: [
                  'clear scope summary',
                  'natural client-facing explanation',
                  'friendly guidance',
                  'professional but human tone',
                ],
              },
            }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Conversational pricing reply failed', errorText.slice(0, 500));
      return fallbackReply;
    }
    const payload = await aiResponse.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      console.error('Conversational pricing reply returned empty content');
      return fallbackReply;
    }
    return content;
  } catch (error) {
    console.error('Conversational pricing reply exception', error?.message || error);
    return fallbackReply;
  }
}

function buildFastPricingReply(estimate, localizedView, scope, options = {}) {
  if (estimate) {
    if (estimate?.serviceType === 'business-website' && (estimate?.scope?.pricingMode === 'lean' || estimate?.scope?.complexity === 'simple')) {
      return buildLeanBusinessPricingReply(estimate, localizedView, options);
    }
    return buildStructuredPricingReply(estimate, localizedView, options);
  }

  return buildPricingFollowUp(scope);
}

function deriveServiceTypeFromLead(lead = {}) {
  const combined = [lead.project_type, lead.latest_message, lead.source].filter(Boolean).join(' ').toLowerCase();
  const inferred = inferServiceTypeFromProjectHint(combined, inferProjectArchetypeFromText(combined));
  if (inferred) return inferred;
  if (/(mobile app|android app|ios app|iphone app)/.test(combined)) return 'mobile-app';
  if (/(custom software|software platform|saas platform|web platform|dashboard)/.test(combined)) return 'custom-software';
  if (/(landing page)/.test(combined)) return 'landing-page';
  if (/(automation|workflow|ai agent|crm|whatsapp automation|ai system)/.test(combined)) return 'automation-ai';
  return '';
}

function buildPricingScopeFromLead(lead = {}) {
  const scope = buildHeuristicPricingScope([
    {
      role: 'user',
      content: [
        lead.project_type,
        lead.business_goal,
        lead.requirements_summary,
        lead.latest_message,
        lead.recommended_action,
      ].filter(Boolean).join('\n'),
    },
  ]);

  return normalizePricingScope({
    ...scope,
    serviceType: scope.serviceType || deriveServiceTypeFromLead(lead),
    summary: lead.requirements_summary || lead.latest_message || scope.summary,
  });
}

function buildFallbackProposalDraft(lead, estimate, localizedView) {
  const scope = buildPricingScopeFromLead(lead);
  const title = `${lead.project_type || 'Project'} proposal draft for ${lead.name || lead.company || lead.email || `Lead ${lead.id}`}`;
  const executiveSummary = `${lead.name || 'This lead'} is requesting ${lead.project_type || 'a digital project'} focused on ${lead.business_goal || 'business growth'}.`;
  const recommendedScope = [
    scope.serviceType ? `Primary service: ${scope.serviceType}` : null,
    scope.features.length ? `Likely features: ${scope.features.join(', ')}` : null,
    lead.timeline_expectation ? `Timeline expectation: ${lead.timeline_expectation}` : null,
    lead.preferred_follow_up_channel ? `Preferred follow-up: ${lead.preferred_follow_up_channel}` : null,
  ].filter(Boolean);

  const commercialSummary = estimate
    ? `Estimated starting price: ${localizedView?.usdAmount || formatMoney(estimate.total, estimate.currency)}${localizedView?.localAmount ? ` (about ${localizedView.localAmount})` : ''}.`
    : 'Commercial estimate requires final scope confirmation before pricing.';

  return {
    title,
    summary: executiveSummary,
    status: 'draft',
    draft: {
      executiveSummary,
      recommendedScope,
      pricingBreakdown: estimate?.breakdown?.map((item) => ({
        label: item.label,
        amount: formatMoney(item.amount, estimate.currency),
      })) || [],
      commercialSummary,
      assumptions: [
        'Pricing remains subject to final confirmed scope and integrations.',
        'Timeline should be discussed realistically after scope confirmation.',
      ],
      nextSteps: [
        `Confirm missing requirements and technical scope with ${lead.name || lead.email || 'the lead'}.`,
        `Prepare a formal proposal for ${lead.assigned_to || 'the assigned team'}.`,
      ],
    },
  };
}

async function generateProposalDraftForLead(lead, geoContext = null) {
  const pricingProfile = await getActivePricingProfile();
  const scope = buildPricingScopeFromLead(lead);
  const audience = getPricingAudience(geoContext);
  const estimate = pricingProfile && scope.serviceType ? calculateHybridPrice(scope, pricingProfile, { audience }) : null;
  const localizedView = estimate ? await buildLocalizedPricingView(estimate, geoContext) : null;
  const fallback = buildFallbackProposalDraft(lead, estimate, localizedView);

  if (!OPENAI_API_KEY) return fallback;

  try {
    const knowledgeContext = await getKnowledgeContext(
      [lead.project_type, lead.business_goal, lead.latest_message, lead.requirements_summary].filter(Boolean).join(' '),
      4,
    );
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You prepare internal commercial proposal drafts for FLAME CORE TECHNOLOGIES LTD.',
              'Return strict JSON only.',
              'This is for internal team use, not for sending directly to clients.',
              'Be commercially clear, concise, and actionable.',
              'Never promise fixed delivery dates.',
              knowledgeContext ? `Company knowledge:\n${knowledgeContext}` : '',
            ].filter(Boolean).join('\n\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              lead: {
                id: lead.id,
                name: lead.name,
                email: lead.email,
                company: lead.company,
                source: lead.source,
                assignedTo: lead.assigned_to,
                projectType: lead.project_type,
                businessGoal: lead.business_goal,
                budgetRange: lead.budget_range,
                timelineExpectation: lead.timeline_expectation,
                preferredFollowUpChannel: lead.preferred_follow_up_channel,
                requirementsSummary: lead.requirements_summary,
                latestMessage: lead.latest_message,
                recommendedAction: lead.recommended_action,
              },
              pricingScope: scope,
              estimate: estimate ? {
                currency: estimate.currency,
                total: estimate.total,
                localizedView,
                breakdown: estimate.breakdown,
              } : null,
              schema: {
                title: 'string',
                summary: 'string',
                status: 'draft',
                draft: {
                  executiveSummary: 'string',
                  recommendedScope: ['string'],
                  pricingBreakdown: [{ label: 'string', amount: 'string' }],
                  commercialSummary: 'string',
                  assumptions: ['string'],
                  nextSteps: ['string'],
                },
              },
            }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) return fallback;
    const payload = await aiResponse.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!content) return fallback;
    const parsed = JSON.parse(content);

    return {
      title: String(parsed?.title || fallback.title).trim(),
      summary: String(parsed?.summary || fallback.summary).trim(),
      status: 'draft',
      draft: {
        executiveSummary: String(parsed?.draft?.executiveSummary || fallback.draft.executiveSummary).trim(),
        recommendedScope: Array.isArray(parsed?.draft?.recommendedScope) ? parsed.draft.recommendedScope.map((item) => String(item).trim()).filter(Boolean) : fallback.draft.recommendedScope,
        pricingBreakdown: Array.isArray(parsed?.draft?.pricingBreakdown) ? parsed.draft.pricingBreakdown.map((item) => ({
          label: String(item?.label || '').trim(),
          amount: String(item?.amount || '').trim(),
        })).filter((item) => item.label && item.amount) : fallback.draft.pricingBreakdown,
        commercialSummary: String(parsed?.draft?.commercialSummary || fallback.draft.commercialSummary).trim(),
        assumptions: Array.isArray(parsed?.draft?.assumptions) ? parsed.draft.assumptions.map((item) => String(item).trim()).filter(Boolean) : fallback.draft.assumptions,
        nextSteps: Array.isArray(parsed?.draft?.nextSteps) ? parsed.draft.nextSteps.map((item) => String(item).trim()).filter(Boolean) : fallback.draft.nextSteps,
      },
    };
  } catch {
    return fallback;
  }
}

function buildCrmTaskDueDate(baseDate, offsetHours = 24) {
  const due = new Date(baseDate || Date.now());
  due.setHours(due.getHours() + offsetHours);
  return due.toISOString();
}

function buildLeadActionPlan(lead, proposal = null) {
  const tasks = [];
  const assignedTo = lead.assigned_to || determineCrmAssignment({
    projectType: lead.project_type,
    latestMessage: lead.latest_message,
    source: lead.source,
    priority: lead.priority,
  }).assignedTo;
  const anchorDate = lead.next_follow_up_at || lead.updated_at || lead.created_at || new Date().toISOString();
  const hasRequirements = Boolean(String(lead.requirements_summary || '').trim());
  const hasBudget = Boolean(String(lead.budget_range || '').trim());
  const hasTimeline = Boolean(String(lead.timeline_expectation || '').trim());
  const preferredChannel = String(lead.preferred_follow_up_channel || '').trim().toLowerCase();

  tasks.push({
    taskKey: 'lead-review',
    title: 'Review lead qualification and confirm ownership',
    details: `Confirm scope, ownership, and urgency for ${lead.name || lead.email || `lead #${lead.id}`}.`,
    status: 'open',
    taskType: 'qualification',
    assignedTo,
    dueAt: buildCrmTaskDueDate(anchorDate, 6),
  });

  if (!hasRequirements) {
    tasks.push({
      taskKey: 'collect-requirements',
      title: 'Collect missing scope requirements',
      details: 'Clarify features, integrations, and business goals before final commercial discussion.',
      status: 'open',
      taskType: 'discovery',
      assignedTo,
      dueAt: buildCrmTaskDueDate(anchorDate, 12),
    });
  }

  if (!hasBudget) {
    tasks.push({
      taskKey: 'confirm-budget',
      title: 'Confirm commercial budget expectations',
      details: 'Ask for the working budget so the team can align the scope and recommendation properly.',
      status: 'open',
      taskType: 'commercial',
      assignedTo,
      dueAt: buildCrmTaskDueDate(anchorDate, 18),
    });
  }

  if (!hasTimeline) {
    tasks.push({
      taskKey: 'confirm-timeline',
      title: 'Confirm desired launch timeline',
      details: 'Capture the preferred timeline without promising a fixed delivery date.',
      status: 'open',
      taskType: 'discovery',
      assignedTo,
      dueAt: buildCrmTaskDueDate(anchorDate, 18),
    });
  }

  tasks.push({
    taskKey: 'channel-follow-up',
    title: preferredChannel === 'phone'
      ? 'Prepare phone follow-up'
      : preferredChannel === 'whatsapp'
        ? 'Prepare WhatsApp follow-up'
        : preferredChannel === 'email'
          ? 'Prepare email follow-up'
          : 'Prepare preferred-channel follow-up',
    details: `Use ${lead.preferred_follow_up_channel || 'the preferred client channel'} for the next business touchpoint.`,
    status: 'open',
    taskType: 'follow-up',
    assignedTo,
    dueAt: lead.next_follow_up_at || buildCrmTaskDueDate(anchorDate, 24),
  });

  if (proposal) {
    tasks.push({
      taskKey: 'send-proposal',
      title: 'Review and send proposal draft',
      details: 'Turn the internal proposal draft into a client-facing commercial response after final review.',
      status: 'open',
      taskType: 'proposal',
      assignedTo,
      dueAt: buildCrmTaskDueDate(anchorDate, 30),
    });
  } else {
    tasks.push({
      taskKey: 'prepare-proposal',
      title: 'Generate internal proposal draft',
      details: 'Prepare an internal proposal draft once the essential scope details are confirmed.',
      status: 'open',
      taskType: 'proposal',
      assignedTo,
      dueAt: buildCrmTaskDueDate(anchorDate, 30),
    });
  }

  return tasks;
}

async function upsertCrmTask(leadId, task) {
  const result = await pool.query(
    `INSERT INTO crm_tasks
      (lead_id, task_key, title, details, status, task_type, assigned_to, due_at, created_at, updated_at)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (lead_id, task_key)
     DO UPDATE SET
      title = EXCLUDED.title,
      details = EXCLUDED.details,
      task_type = EXCLUDED.task_type,
      assigned_to = EXCLUDED.assigned_to,
      due_at = EXCLUDED.due_at,
      updated_at = NOW()
     RETURNING *`,
    [
      leadId,
      task.taskKey,
      task.title,
      task.details || null,
      task.status || 'open',
      task.taskType || 'follow-up',
      task.assignedTo || null,
      task.dueAt || null,
    ],
  );

  return result.rows[0];
}

async function generateCrmActionPlanForLead(lead) {
  const proposalResult = await pool.query(
    `SELECT *
       FROM proposal_drafts
      WHERE lead_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`,
    [lead.id],
  );
  const proposal = proposalResult.rows[0] || null;
  const taskRows = [];
  const plan = buildLeadActionPlan(lead, proposal);

  for (const task of plan) {
    taskRows.push(await upsertCrmTask(lead.id, task));
  }

  return taskRows.map(mapCrmTask);
}

function computeLeadScore({ email, phone, company, message, source = 'website', visitorId = null }) {
  let score = 0;
  const normalizedMessage = String(message || '').toLowerCase();

  if (email) score += 25;
  if (phone) score += 20;
  if (company) score += 15;
  if (visitorId) score += 5;
  if (source === 'chat') score += 10;
  if (String(message || '').trim().length >= 80) score += 10;

  if (/(budget|proposal|quote|pricing|price|cost|timeline|launch|need|project|hire|build)/i.test(normalizedMessage)) score += 20;
  if (/(urgent|asap|immediately|this week|ready to proceed|start now)/i.test(normalizedMessage)) score += 15;

  return Math.min(100, score);
}

function getLeadPriority(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function getLeadStatus(score) {
  if (score >= 75) return 'qualified';
  if (score >= 45) return 'nurturing';
  return 'new';
}

function getInitialFollowUpDate(score) {
  const now = new Date();
  const hours = score >= 75 ? 2 : score >= 45 ? 12 : 24;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function getNextFollowUpDate(count, score) {
  const now = Date.now();
  const hours = count <= 1 ? (score >= 75 ? 12 : 24) : count === 2 ? 72 : 168;
  return new Date(now + hours * 60 * 60 * 1000);
}

function normalizeAddressList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeAddressList(item));
  }

  return String(value)
    .split(/[,\n;]/)
    .map((item) => item.replace(/.*<([^>]+)>.*/, '$1').trim())
    .filter(Boolean);
}

function buildPreview(body, max = 160) {
  return String(body || '')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: String(message?.content || '').trim(),
    }))
    .filter((message) => message.content)
    .slice(-12);
}

function extractLeadSignals(messages) {
  const combined = messages
    .map((message) => message.content)
    .join('\n');

  const emailMatch = combined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const labeledPhoneMatch = combined.match(/(?:phone|call|whatsapp|number)\s*[:\-]?\s*(\+?\d[\d\s().-]{7,}\d)/i);
  const phoneMatch = labeledPhoneMatch || combined.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const nameMatch = combined.match(/(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z\s'-]{1,60})/i);

  return {
    email: emailMatch ? emailMatch[0].trim() : null,
    phone: phoneMatch ? String(phoneMatch[1] || phoneMatch[0]).trim() : null,
    name: nameMatch ? nameMatch[1].trim() : null,
  };
}

function buildHeuristicLeadQualification(messages) {
  const combined = messages.map((message) => String(message?.content || '')).join('\n');
  const normalized = combined.toLowerCase();
  const projectTypeMatch =
    normalized.match(/(e-?commerce|dropshipping|store|shopify|woocommerce)/i) ? 'ecommerce website'
      : normalized.match(/(mobile app|android app|ios app)/i) ? 'mobile app'
        : normalized.match(/(automation|workflow|crm|ai agent|whatsapp automation)/i) ? 'automation or AI system'
          : normalized.match(/(custom software|saas|platform|dashboard)/i) ? 'custom software platform'
            : normalized.match(/(landing page)/i) ? 'landing page'
              : normalized.match(/(website|web site|business website|corporate site)/i) ? 'business website'
                : null;

  const timelineMatch = combined.match(/(asap|urgent|as soon as possible|immediately|this week|next week|this month|in \d+\s+(days|weeks|months))/i);
  const budgetMatch = combined.match(/(\$[\d,]+(?:\s*-\s*\$?[\d,]+)?|ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦[\d,]+(?:\s*-\s*ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦?[\d,]+)?|\b[\d,]+\s*(dollars?|usd|naira)\b)/i);
  const followUpMatch = combined.match(/(email|phone|call|whatsapp)/i);

  let businessGoal = null;
  if (/lead|conversion|sales|customers/.test(normalized)) businessGoal = 'generate more leads and sales';
  else if (/automation|save time|follow-up|workflow/.test(normalized)) businessGoal = 'improve automation and follow-up';
  else if (/brand|professional|online presence/.test(normalized)) businessGoal = 'strengthen brand presence';

  const summary = buildPreview(combined, 280) || null;

  return {
    projectType: projectTypeMatch,
    businessGoal,
    budgetRange: budgetMatch ? budgetMatch[0] : null,
    timelineExpectation: timelineMatch ? timelineMatch[0] : null,
    preferredFollowUpChannel: followUpMatch ? followUpMatch[0].toLowerCase() : null,
    requirementsSummary: summary,
    recommendedAction: projectTypeMatch
      ? `Follow up with a scoped ${projectTypeMatch} discovery conversation and confirm features before proposal.`
      : 'Follow up to clarify project type, target outcome, and next steps before proposal.',
  };
}

async function extractLeadQualification(messages) {
  const fallback = buildHeuristicLeadQualification(messages);
  if (!OPENAI_API_KEY || !Array.isArray(messages) || !messages.length) return fallback;

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: [
              'You extract CRM qualification details for FLAME CORE TECHNOLOGIES LTD from a visitor conversation.',
              'Return strict JSON only.',
              'Do not invent facts that the visitor did not imply.',
              'If a field is unknown, return null.',
              'preferredFollowUpChannel must be one of email, phone, whatsapp, or null.',
              'recommendedAction should be short, commercially useful, and suitable for an internal sales team.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              conversation: messages.map((message) => ({
                role: message.role,
                content: message.content,
              })),
              schema: {
                projectType: 'string|null',
                businessGoal: 'string|null',
                budgetRange: 'string|null',
                timelineExpectation: 'string|null',
                preferredFollowUpChannel: 'email|phone|whatsapp|null',
                requirementsSummary: 'string|null',
                recommendedAction: 'string|null',
              },
            }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) return fallback;
    const payload = await aiResponse.json();
    const content = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    return {
      projectType: parsed?.projectType ? String(parsed.projectType).trim() : fallback.projectType,
      businessGoal: parsed?.businessGoal ? String(parsed.businessGoal).trim() : fallback.businessGoal,
      budgetRange: parsed?.budgetRange ? String(parsed.budgetRange).trim() : fallback.budgetRange,
      timelineExpectation: parsed?.timelineExpectation ? String(parsed.timelineExpectation).trim() : fallback.timelineExpectation,
      preferredFollowUpChannel: ['email', 'phone', 'whatsapp'].includes(String(parsed?.preferredFollowUpChannel || '').toLowerCase())
        ? String(parsed.preferredFollowUpChannel).toLowerCase()
        : fallback.preferredFollowUpChannel,
      requirementsSummary: parsed?.requirementsSummary ? String(parsed.requirementsSummary).trim() : fallback.requirementsSummary,
      recommendedAction: parsed?.recommendedAction ? String(parsed.recommendedAction).trim() : fallback.recommendedAction,
    };
  } catch {
    return fallback;
  }
}

function isTrainingOrDiyRequest(message) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  if (/(training website|course website|academy website|school website|learning website|python training website|lms|student login|quizzes|certificates)/.test(normalized)) {
    return false;
  }
  return [
    'teach me',
    'train me',
    'screen share',
    'screenshare',
    'step by step',
    'do it myself',
    'diy',
    'set it up myself',
    'how do i set it up',
    'how can i set it up',
    'walk me through',
    'guide me through',
    'show me how',
  ].some((phrase) => normalized.includes(phrase));
}

const chatRateLimits = new Map();

function rateLimitChat(sessionId) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const entry = chatRateLimits.get(sessionId) || { count: 0, startedAt: now };

  if (now - entry.startedAt > windowMs) {
    chatRateLimits.set(sessionId, { count: 1, startedAt: now });
    return true;
  }

  if (entry.count >= 20) {
    return false;
  }

  entry.count += 1;
  chatRateLimits.set(sessionId, entry);
  return true;
}

function splitHeaderBlock(source) {
  const separator = source.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const [rawHeaders = '', ...rest] = source.split(separator);
  return {
    rawHeaders,
    body: rest.join(separator).trim(),
  };
}

function parseHeaders(rawHeaders) {
  const headers = {};
  let currentKey = null;

  for (const line of rawHeaders.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s/.test(line) && currentKey) {
      headers[currentKey] = `${headers[currentKey]} ${line.trim()}`;
      continue;
    }
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    currentKey = match[1].toLowerCase();
    headers[currentKey] = match[2].trim();
  }

  return headers;
}

function decodeQuotedPrintable(value) {
  const normalized = String(value || '').replace(/=\r?\n/g, '');
  const bytes = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(char.charCodeAt(0));
  }

  return Buffer.from(bytes).toString('utf8');
}

function decodeBodyContent(body, encoding = '') {
  const normalizedEncoding = String(encoding || '').toLowerCase();
  if (normalizedEncoding.includes('quoted-printable')) {
    return decodeQuotedPrintable(body);
  }
  if (normalizedEncoding.includes('base64')) {
    try {
      return Buffer.from(String(body || '').replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return String(body || '');
    }
  }
  return String(body || '');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<blockquote/gi, '\n<blockquote')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBoundary(contentType = '') {
  const match = String(contentType).match(/boundary="?([^";]+)"?/i);
  return match?.[1] || null;
}

function splitMultipartBody(body, boundary) {
  const marker = `--${boundary}`;
  return String(body || '')
    .split(marker)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--');
}

function parseMimeSection(rawSection) {
  const { rawHeaders, body } = splitHeaderBlock(rawSection);
  const headers = parseHeaders(rawHeaders);
  const contentType = headers['content-type'] || 'text/plain';
  const transferEncoding = headers['content-transfer-encoding'] || '';
  const decodedBody = decodeBodyContent(body, transferEncoding);
  const boundary = extractBoundary(contentType);

  if (contentType.toLowerCase().includes('multipart/') && boundary) {
    const children = splitMultipartBody(decodedBody, boundary)
      .map((part) => parseMimeSection(part))
      .filter(Boolean);
    return {
      headers,
      contentType,
      children,
    };
  }

  return {
    headers,
    contentType,
    body: decodedBody,
  };
}

function collectReadableBodies(section, parts = { text: [], html: [] }) {
  if (!section) return parts;
  if (Array.isArray(section.children) && section.children.length) {
    for (const child of section.children) collectReadableBodies(child, parts);
    return parts;
  }

  const contentType = String(section.contentType || '').toLowerCase();
  const body = String(section.body || '').trim();
  if (!body) return parts;

  if (contentType.includes('text/plain')) {
    parts.text.push(body);
  } else if (contentType.includes('text/html')) {
    parts.html.push(body);
  }

  return parts;
}

function extractMailBodies(rawBody, headers) {
  const rootContentType = headers['content-type'] || 'text/plain';
  const rootEncoding = headers['content-transfer-encoding'] || '';
  const decodedRootBody = decodeBodyContent(rawBody, rootEncoding);
  const boundary = extractBoundary(rootContentType);

  if (!String(rootContentType).toLowerCase().includes('multipart/') || !boundary) {
    if (String(rootContentType).toLowerCase().includes('text/html')) {
      return {
        textBody: htmlToText(decodedRootBody),
        htmlBody: decodedRootBody.trim(),
      };
    }
    return {
      textBody: decodedRootBody.trim(),
      htmlBody: null,
    };
  }

  const sections = splitMultipartBody(decodedRootBody, boundary).map((part) => parseMimeSection(part));
  const parts = sections.reduce((accumulator, section) => collectReadableBodies(section, accumulator), { text: [], html: [] });
  const textBody = parts.text.find(Boolean);
  const htmlBody = parts.html.find(Boolean);
  if (textBody || htmlBody) {
    return {
      textBody: (textBody || htmlToText(htmlBody || '')).trim(),
      htmlBody: htmlBody ? htmlBody.trim() : null,
    };
  }
  return {
    textBody: decodedRootBody.trim(),
    htmlBody: null,
  };
}

function parseMboxMessages(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const parts = normalized.split(/\n(?=From )/g);
  const messages = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const withoutUnixFrom = trimmed.startsWith('From ') ? trimmed.split('\n').slice(1).join('\n') : trimmed;
    const { rawHeaders, body } = splitHeaderBlock(withoutUnixFrom);
    const headers = parseHeaders(rawHeaders);
    const messageId = headers['message-id']?.replace(/[<>]/g, '') || null;
    const subject = headers.subject || '(No subject)';
    const fromHeader = headers.from || '';
    const senderEmail = normalizeAddressList(fromHeader)[0] || fromHeader || 'unknown';
    const senderName = fromHeader.includes('<') ? fromHeader.replace(/\s*<[^>]+>.*/, '').replace(/"/g, '').trim() : null;
    const recipients = normalizeAddressList(headers.to);
    const ccRecipients = normalizeAddressList(headers.cc);
    const receivedAt = headers.date ? new Date(headers.date) : null;
    const mailbox = inferMailboxFromAddresses(senderEmail, recipients, ccRecipients);

    const { textBody, htmlBody } = extractMailBodies(body, headers);

    messages.push({
      subject,
      body: textBody,
      htmlBody,
      preview: buildPreview(textBody),
      senderEmail,
      senderName,
      recipients,
      ccRecipients,
      mailbox,
      receivedAt: receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : null,
      messageId,
      inReplyTo: headers['in-reply-to']?.replace(/[<>]/g, '') || null,
    });
  }

  return messages;
}

async function syncInboxFromMbox() {
  if (MAIL_INBOX_DRIVER !== 'mbox') {
    return { imported: 0, driver: MAIL_INBOX_DRIVER, message: 'Inbox sync driver is disabled.' };
  }

  if (!MAIL_INBOX_MBOX_PATH) {
    return { imported: 0, driver: MAIL_INBOX_DRIVER, message: 'Inbox sync path is not configured.' };
  }

  if (!fs.existsSync(MAIL_INBOX_MBOX_PATH)) {
    return { imported: 0, driver: MAIL_INBOX_DRIVER, message: 'Inbox mailbox file does not exist yet.' };
  }

  const source = fs.readFileSync(MAIL_INBOX_MBOX_PATH, 'utf8');
  const parsedMessages = parseMboxMessages(source);
  let imported = 0;

  for (const message of parsedMessages) {
    if (!message.messageId) continue;
    const result = await pool.query(
      `INSERT INTO mail_messages
        (folder, direction, subject, body, html_body, preview, sender_email, sender_name, recipients, cc_recipients, recipient_count, status, source, message_id, in_reply_to, is_read, received_at, created_at, mailbox)
       VALUES
        ('inbox','inbound',$1,$2,$3,$4,$5,$6,$7,$8,$9,'received','mbox',$10,$11,false,$12,COALESCE($12, NOW()),$13)
       ON CONFLICT (source, message_id) DO UPDATE
       SET body = EXCLUDED.body,
           html_body = COALESCE(EXCLUDED.html_body, mail_messages.html_body),
           preview = EXCLUDED.preview,
           sender_email = EXCLUDED.sender_email,
           sender_name = EXCLUDED.sender_name,
           recipients = EXCLUDED.recipients,
           cc_recipients = EXCLUDED.cc_recipients,
           recipient_count = EXCLUDED.recipient_count,
           in_reply_to = COALESCE(EXCLUDED.in_reply_to, mail_messages.in_reply_to),
           received_at = COALESCE(EXCLUDED.received_at, mail_messages.received_at),
           mailbox = EXCLUDED.mailbox
       RETURNING id`,
      [
        message.subject,
        message.body,
        message.htmlBody,
        message.preview,
        message.senderEmail,
        message.senderName,
        message.recipients,
        message.ccRecipients,
        message.recipients.length,
        message.messageId,
        message.inReplyTo,
        message.receivedAt,
        normalizeMailboxKey(message.mailbox),
      ],
    );
    if (result.rowCount) imported += 1;
  }

  return {
    imported,
    driver: MAIL_INBOX_DRIVER,
    message: imported ? `Imported ${imported} inbox message(s).` : 'Inbox is already up to date.',
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
      phone TEXT,
      company TEXT,
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'website',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE contact_leads ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE contact_leads ADD COLUMN IF NOT EXISTS crm_lead_id INTEGER`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mail_messages (
      id SERIAL PRIMARY KEY,
      folder TEXT NOT NULL DEFAULT 'sent',
      direction TEXT NOT NULL DEFAULT 'outbound',
      mailbox TEXT NOT NULL DEFAULT 'company',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      html_body TEXT,
      preview TEXT NOT NULL DEFAULT '',
      sender_email TEXT NOT NULL,
      sender_name TEXT,
      recipients TEXT[] NOT NULL DEFAULT '{}',
      cc_recipients TEXT[] NOT NULL DEFAULT '{}',
      recipient_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      source TEXT NOT NULL DEFAULT 'app',
      message_id TEXT,
      in_reply_to TEXT,
      is_read BOOLEAN NOT NULL DEFAULT true,
      received_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT 'sent'`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound'`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS preview TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS html_body TEXT`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS sender_name TEXT`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS cc_recipients TEXT[] NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'app'`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS message_id TEXT`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS in_reply_to TEXT`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS mailbox TEXT NOT NULL DEFAULT 'company'`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS mail_messages_source_message_id_uidx ON mail_messages (source, message_id) WHERE message_id IS NOT NULL`);
  await pool.query(`UPDATE mail_messages SET preview = LEFT(REPLACE(REPLACE(body, E'\r', ' '), E'\n', ' '), 160) WHERE COALESCE(preview, '') = ''`);
  await pool.query(`UPDATE mail_messages SET sent_at = created_at WHERE direction = 'outbound' AND sent_at IS NULL`);
  await pool.query(`
    UPDATE mail_messages
    SET mailbox = CASE
      WHEN LOWER(COALESCE(sender_email, '')) LIKE '%flamebot%' THEN 'flamebot'
      WHEN LOWER(COALESCE(sender_email, '')) LIKE '%corepirate%' OR LOWER(COALESCE(sender_email, '')) LIKE '%copilot%' THEN 'corepirate'
      WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(recipients, '{}'::text[])) AS addr WHERE LOWER(addr) LIKE '%flamebot%') THEN 'flamebot'
      WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(recipients, '{}'::text[])) AS addr WHERE LOWER(addr) LIKE '%corepirate%' OR LOWER(addr) LIKE '%copilot%') THEN 'corepirate'
      ELSE 'company'
    END
    WHERE mailbox IS NULL OR mailbox = '' OR mailbox NOT IN ('company','flamebot','corepirate')
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_mailboxes (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      product TEXT,
      sender_email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_contacts (
      id SERIAL PRIMARY KEY,
      mailbox_id INTEGER NOT NULL REFERENCES legacy_mailboxes(id) ON DELETE CASCADE,
      source_system TEXT NOT NULL DEFAULT 'flamebot-legacy',
      source_key TEXT NOT NULL UNIQUE,
      external_id TEXT,
      recipient_email TEXT,
      full_name TEXT,
      phone_number TEXT,
      status TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS legacy_contacts_mailbox_idx ON legacy_contacts (mailbox_id, id DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_messages (
      id SERIAL PRIMARY KEY,
      mailbox_id INTEGER NOT NULL REFERENCES legacy_mailboxes(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES legacy_contacts(id) ON DELETE CASCADE,
      source_system TEXT NOT NULL DEFAULT 'flamebot-legacy',
      source_key TEXT NOT NULL UNIQUE,
      external_id TEXT,
      direction TEXT NOT NULL DEFAULT 'outbound',
      message_type TEXT,
      subject TEXT,
      sender_email TEXT,
      recipient_email TEXT,
      body_text TEXT NOT NULL DEFAULT '',
      sent_at TIMESTAMPTZ,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS legacy_messages_mailbox_idx ON legacy_messages (mailbox_id, sent_at DESC, id DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS legacy_messages_contact_idx ON legacy_messages (contact_id, sent_at DESC, id DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_visit_events (
      id SERIAL PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      path TEXT NOT NULL,
      referrer TEXT,
      user_agent TEXT,
      consent_version TEXT NOT NULL DEFAULT 'v1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS site_visit_events_created_at_idx ON site_visit_events (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS site_visit_events_visitor_id_idx ON site_visit_events (visitor_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS site_visit_events_path_idx ON site_visit_events (path)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      visitor_id TEXT,
      lead_name TEXT,
      lead_email TEXT,
      lead_phone TEXT,
      source TEXT NOT NULL DEFAULT 'website',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_idx ON chat_messages (conversation_id, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_leads (
      id SERIAL PRIMARY KEY,
      lead_key TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      source TEXT NOT NULL DEFAULT 'website',
      status TEXT NOT NULL DEFAULT 'new',
      priority TEXT NOT NULL DEFAULT 'low',
      qualification TEXT NOT NULL DEFAULT 'early-stage',
      lead_score INTEGER NOT NULL DEFAULT 0,
      follow_up_count INTEGER NOT NULL DEFAULT 0,
      latest_message TEXT,
      visitor_id TEXT,
      conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE SET NULL,
      last_contacted_at TIMESTAMPTZ,
      next_follow_up_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS crm_leads_score_idx ON crm_leads (lead_score DESC, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS crm_leads_followup_idx ON crm_leads (next_follow_up_at ASC, status)`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lead_key TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS project_type TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS business_goal TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS budget_range TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS timeline_expectation TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS preferred_follow_up_channel TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS requirements_summary TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS recommended_action TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS assigned_to TEXT`);
  await pool.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS internal_notes TEXT`);
  await pool.query(`UPDATE crm_leads SET lead_key = COALESCE(NULLIF(LOWER(email), ''), NULLIF(phone, ''), CONCAT('lead-', id)) WHERE COALESCE(lead_key, '') = ''`);
  await pool.query(`ALTER TABLE crm_leads ALTER COLUMN lead_key SET NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_lead_key_uidx ON crm_leads (lead_key)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proposal_drafts (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      draft_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS proposal_drafts_lead_id_idx ON proposal_drafts (lead_id, updated_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_tasks (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      task_type TEXT NOT NULL DEFAULT 'follow-up',
      assigned_to TEXT,
      due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_lead_key_uidx ON crm_tasks (lead_id, task_key)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS crm_tasks_due_idx ON crm_tasks (status, due_at ASC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      keywords TEXT[] NOT NULL DEFAULT '{}',
      content TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS knowledge_documents_active_idx ON knowledge_documents (is_active, category, title)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_profiles (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      config_json JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pricing_profiles_active_idx ON pricing_profiles (is_active, updated_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_quote_logs (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES chat_conversations(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'website-chat',
      pricing_audience TEXT,
      quote_strategy TEXT,
      user_message TEXT,
      fallback_reason TEXT,
      scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_quote_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      fallback_quote_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      final_quote_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      final_reply TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE pricing_quote_logs ADD COLUMN IF NOT EXISTS user_message TEXT`);
  await pool.query(`ALTER TABLE pricing_quote_logs ADD COLUMN IF NOT EXISTS fallback_reason TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pricing_quote_logs_conversation_idx ON pricing_quote_logs (conversation_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pricing_quote_logs_created_idx ON pricing_quote_logs (created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_alerts (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'workflow',
      severity TEXT NOT NULL DEFAULT 'error',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      details JSONB,
      resolved BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS automation_alerts_created_at_idx ON automation_alerts (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS automation_alerts_resolved_idx ON automation_alerts (resolved, created_at DESC)`);

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

  for (const doc of seedKnowledgeDocs) {
    await pool.query(
      `INSERT INTO knowledge_documents
        (slug, title, category, keywords, content, is_active, updated_at)
       VALUES
        ($1,$2,$3,$4,$5,true,NOW())
       ON CONFLICT (slug)
       DO UPDATE SET
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        keywords = EXCLUDED.keywords,
        content = EXCLUDED.content,
        is_active = true,
        updated_at = NOW()`,
      [doc.slug, doc.title, doc.category, doc.keywords, doc.content],
    );
  }

  await pool.query(
    `INSERT INTO pricing_profiles
      (slug, title, currency, config_json, is_active, updated_at)
     VALUES
      ('default-live', 'Default Live Pricing Profile', $1, $2::jsonb, true, NOW())
     ON CONFLICT (slug)
     DO UPDATE SET
      title = EXCLUDED.title,
      currency = EXCLUDED.currency,
      config_json = EXCLUDED.config_json,
      is_active = true,
      updated_at = NOW()`,
    [defaultPricingProfile.currency, JSON.stringify(defaultPricingProfile)],
  );
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

function requireAutomation(request, response, next) {
  if (!BLOG_AUTOMATION_TOKEN) {
    return response.status(503).json({ message: 'Automation publishing is not configured.' });
  }

  const authorization = String(request.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token || token !== BLOG_AUTOMATION_TOKEN) {
    return response.status(401).json({ message: 'Unauthorized' });
  }

  next();
}

async function passwordMatches(candidate) {
  if (ADMIN_PASSWORD_HASH) return bcrypt.compare(candidate, ADMIN_PASSWORD_HASH);
  return candidate === ADMIN_PASSWORD;
}

function normalizeMailboxKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  return MAILBOX_KEYS.includes(raw) ? raw : 'company';
}

function getMailboxProfile(value) {
  return MAILBOX_PROFILES[normalizeMailboxKey(value)] || MAILBOX_PROFILES.company;
}

function normalizeSenderProfileKey(mailbox, value) {
  const profile = getMailboxProfile(mailbox);
  const raw = String(value || '').trim().toLowerCase();
  return profile?.senders?.[raw] ? raw : 'primary';
}

function getSenderProfile(mailbox, value) {
  const profile = getMailboxProfile(mailbox);
  const senderKey = normalizeSenderProfileKey(mailbox, value);
  return profile.senders[senderKey] || profile.senders.primary;
}

function getMailboxFromRequest(request) {
  return normalizeMailboxKey(request.query?.mailbox || request.body?.mailbox || 'company');
}

function inferMailboxFromAddresses(...collections) {
  const addresses = collections
    .flatMap((value) => normalizeAddressList(value))
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (addresses.some((value) => value.includes('flamebot'))) return 'flamebot';
  if (addresses.some((value) => value.includes('corepirate') || value.includes('copilot'))) return 'corepirate';

  for (const profile of Object.values(MAILBOX_PROFILES)) {
    if (addresses.some((value) => profile.aliases.includes(value))) {
      return profile.key;
    }
  }

  return 'company';
}

async function sendMail({ mailbox = 'company', senderProfile = 'primary', to, cc, subject, text, html = null, replyTo }) {
  const sender = getSenderProfile(mailbox, senderProfile);
  return transporter.sendMail({
    from: `${sender.name} <${sender.address}>`,
    to,
    cc,
    replyTo: sender.address,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(replyTo ? { inReplyTo: replyTo, references: replyTo } : {}),
  });
}

function requireCompanyInternalApi(request, response, next) {
  if (!COMPANY_PAYMENT_INTERNAL_API_KEY) {
    return response.status(503).json({ message: 'Company internal API key is not configured.' });
  }
  const provided = String(request.header('x-company-payment-key') || '').trim();
  if (!provided || provided !== COMPANY_PAYMENT_INTERNAL_API_KEY) {
    return response.status(401).json({ message: 'Invalid company internal API key.' });
  }
  next();
}

function normalizeMailChannelKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['primary', 'support', 'billing', 'automated'].includes(key)) return key;
  return 'all';
}

function detectMailboxChannel(row) {
  const mailbox = normalizeMailboxKey(row?.mailbox || 'company');
  const profile = getMailboxProfile(mailbox);
  const senderEmail = String(row?.sender_email || row?.senderEmail || '').trim().toLowerCase();
  const recipientValues = Array.isArray(row?.recipients)
    ? row.recipients
    : Array.isArray(row?.recipients || row?.cc_recipients)
      ? [...(row?.recipients || []), ...(row?.cc_recipients || [])]
      : [];
  const recipients = recipientValues.map((value) => String(value || '').trim().toLowerCase());
  const addresses = [senderEmail, ...recipients].filter(Boolean);
  const subject = String(row?.subject || '').trim().toLowerCase();
  const preview = String(row?.preview || '').trim().toLowerCase();
  const body = String(row?.body || '').trim().toLowerCase();
  const senderProfiles = profile?.senders || {};

  const matchesProfileAddress = (profileKey) => {
    const address = String(senderProfiles?.[profileKey]?.address || '').trim().toLowerCase();
    return Boolean(address) && addresses.some((value) => value === address);
  };

  const textContains = (pattern) => pattern.test(`${subject}\n${preview}\n${body}`);

  if (
    matchesProfileAddress('billing')
    || textContains(/\b(invoice|receipt|billing|renewal|subscription|trial|payment|checkout)\b/i)
  ) {
    return 'billing';
  }

  if (
    matchesProfileAddress('noreply')
    || textContains(/\b(no-reply|noreply|automated|system notice|auto(?:mated)? message)\b/i)
  ) {
    return 'automated';
  }

  if (
    matchesProfileAddress('support')
    || textContains(/\b(help|issue|problem|support|follow-up|follow up|ticket)\b/i)
  ) {
    return 'support';
  }

  return 'primary';
}

function mapMailMessage(row) {
  const channel = detectMailboxChannel(row);
  return {
    id: row.id,
    folder: row.folder,
    direction: row.direction,
    channel,
    subject: row.subject,
    body: row.body,
    htmlBody: row.html_body,
    preview: row.preview,
    senderEmail: row.sender_email,
    senderName: row.sender_name,
    recipients: row.recipients || [],
    ccRecipients: row.cc_recipients || [],
    recipientCount: row.recipient_count,
    status: row.status,
    createdAt: row.created_at,
    receivedAt: row.received_at,
    sentAt: row.sent_at,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    isRead: row.is_read,
    mailbox: normalizeMailboxKey(row.mailbox),
  };
}

function toNullableString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeLegacyImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Legacy import payload must be an object.');
  }

  return {
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {},
    contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
    messages: Array.isArray(payload.messages) ? payload.messages : [],
  };
}

function mapLegacyMailbox(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    product: row.product,
    senderEmail: row.sender_email,
    status: row.status,
    contactCount: Number(row.contact_count || 0),
    messageCount: Number(row.message_count || 0),
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          subject: row.last_message_subject,
          sentAt: row.last_message_sent_at,
          recipientEmail: row.last_message_recipient_email,
          messageType: row.last_message_type,
        }
      : null,
  };
}

function mapLegacyContact(row) {
  return {
    id: row.id,
    sourceKey: row.source_key,
    externalId: row.external_id,
    recipientEmail: row.recipient_email,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    status: row.status,
    messageCount: Number(row.message_count || 0),
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          subject: row.last_message_subject,
          sentAt: row.last_message_sent_at,
          messageType: row.last_message_type,
        }
      : null,
  };
}

function mapLegacyMessage(row) {
  return {
    id: row.id,
    sourceKey: row.source_key,
    direction: row.direction,
    messageType: row.message_type,
    subject: row.subject,
    senderEmail: row.sender_email,
    recipientEmail: row.recipient_email,
    bodyText: row.body_text,
    sentAt: row.sent_at,
    metadata: row.metadata_json || null,
  };
}

function mapAutomationAlert(row) {
  return {
    id: row.id,
    source: row.source,
    category: row.category,
    severity: row.severity,
    title: row.title,
    message: row.message,
    details: row.details || null,
    resolved: row.resolved,
    createdAt: row.created_at,
  };
}

function mapCrmTask(row) {
  return {
    id: row.id,
    leadId: row.lead_id,
    taskKey: row.task_key,
    title: row.title,
    details: row.details,
    status: row.status,
    taskType: row.task_type,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function determineCrmAssignment({
  projectType = null,
  latestMessage = '',
  source = 'website',
  priority = 'low',
}) {
  const combined = [projectType, latestMessage, source].filter(Boolean).join(' ').toLowerCase();

  if (/(automation|workflow|crm|whatsapp|ai system|ai agent)/.test(combined)) {
    return {
      assignedTo: 'Automation Team',
      assignmentReason: 'Lead is aligned with automation, AI, CRM, or WhatsApp workflow delivery.',
    };
  }

  if (/(mobile app|android|ios|iphone)/.test(combined)) {
    return {
      assignedTo: 'Mobile Team',
      assignmentReason: 'Lead is aligned with mobile app delivery.',
    };
  }

  if (/(ecommerce|e-commerce|dropshipping|store|website|landing page|web)/.test(combined)) {
    return {
      assignedTo: 'Web Team',
      assignmentReason: priority === 'high'
        ? 'High-priority web lead routed for faster website or ecommerce follow-up.'
        : 'Lead is aligned with website or ecommerce delivery.',
    };
  }

  return {
    assignedTo: 'Sales Team',
    assignmentReason: 'Lead needs general sales qualification and routing.',
  };
}

async function createAutomationAlert({
  source = 'system',
  category = 'workflow',
  severity = 'info',
  title,
  message,
  details = null,
  notify = true,
  dedupeLeadId = null,
  dedupeTitle = null,
  dedupeMinutes = 360,
}) {
  if (!title || !message) return null;

  if (dedupeLeadId && (dedupeTitle || title)) {
    const existing = await pool.query(
      `SELECT *
         FROM automation_alerts
        WHERE category = $1
          AND title = $2
          AND created_at >= NOW() - ($3::text || ' minutes')::interval
          AND COALESCE(details->>'leadId', '') = $4
        ORDER BY created_at DESC
        LIMIT 1`,
      [category, dedupeTitle || title, String(dedupeMinutes), String(dedupeLeadId)],
    );

    if (existing.rows[0]) return existing.rows[0];
  }

  const row = await pool.query(
    `INSERT INTO automation_alerts
      (source, category, severity, title, message, details, resolved, created_at)
     VALUES
      ($1, $2, $3, $4, $5, $6::jsonb, false, NOW())
     RETURNING *`,
    [source, category, severity, title, message, details ? JSON.stringify(details) : null],
  );

  if (notify && MAIL_NOTIFY_TO) {
    await sendMail({
      to: MAIL_NOTIFY_TO,
      subject: `[Automation Alert] ${title}`,
      text: `Source: ${source}\nCategory: ${category}\nSeverity: ${severity}\n\n${message}\n\nDetails:\n${details ? JSON.stringify(details, null, 2) : 'No extra details.'}`,
    }).catch(() => null);
  }

  return row.rows[0];
}

async function runCrmIntakeAutomation(lead, trigger = 'website') {
  if (!lead?.id) return lead;

  let workingLead = lead;
  const assignment = determineCrmAssignment({
    projectType: lead.project_type,
    latestMessage: lead.latest_message,
    source: lead.source,
    priority: lead.priority,
  });

  if (!lead.assigned_to) {
    const assigned = await pool.query(
      `UPDATE crm_leads
          SET assigned_to = $2,
              recommended_action = COALESCE(NULLIF(recommended_action, ''), $3),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [lead.id, assignment.assignedTo, lead.recommended_action || assignment.assignmentReason],
    );
    if (assigned.rows[0]) workingLead = assigned.rows[0];
  }

  const shouldAlert = ['high'].includes(String(workingLead.priority || '').toLowerCase())
    || ['qualified'].includes(String(workingLead.status || '').toLowerCase())
    || ['sales-ready'].includes(String(workingLead.qualification || '').toLowerCase());

  if (shouldAlert) {
    await createAutomationAlert({
      source: 'crm-agent',
      category: 'crm',
      severity: 'info',
      title: `Priority CRM lead: ${workingLead.name || workingLead.email || `Lead ${workingLead.id}`}`,
      message: `${workingLead.assigned_to || assignment.assignedTo} should review this ${workingLead.project_type || 'project'} lead and follow up through ${workingLead.preferred_follow_up_channel || 'the preferred contact route'}.`,
      details: {
        leadId: workingLead.id,
        trigger,
        assignedTo: workingLead.assigned_to || assignment.assignedTo,
        projectType: workingLead.project_type || null,
        businessGoal: workingLead.business_goal || null,
        budgetRange: workingLead.budget_range || null,
        timelineExpectation: workingLead.timeline_expectation || null,
        preferredFollowUpChannel: workingLead.preferred_follow_up_channel || null,
        qualification: workingLead.qualification || null,
        priority: workingLead.priority || null,
      },
      notify: true,
      dedupeLeadId: workingLead.id,
      dedupeTitle: `Priority CRM lead: ${workingLead.name || workingLead.email || `Lead ${workingLead.id}`}`,
      dedupeMinutes: 360,
    });
  }

  return workingLead;
}

async function insertOutboundMessage({ mailbox = 'company', senderProfile = 'primary', subject, body, htmlBody = null, recipients, ccRecipients = [], replyToMessageId = null, status = 'sent' }) {
  const profile = getMailboxProfile(mailbox);
  const sender = getSenderProfile(mailbox, senderProfile);
  const preview = buildPreview(body);
  const senderDomain = (sender.address.split('@')[1] || MAIL_DOMAIN || 'flamecoretechltd.com').trim();
  const messageId = `<${profile.key}-${Date.now()}-${Math.random().toString(36).slice(2)}@${senderDomain}>`;
  const row = await pool.query(
    `INSERT INTO mail_messages
      (folder, direction, mailbox, subject, body, html_body, preview, sender_email, sender_name, recipients, cc_recipients, recipient_count, status, source, message_id, in_reply_to, is_read, sent_at, created_at)
     VALUES
      ('sent','outbound',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'app',$12,$13,true,NOW(),NOW())
     RETURNING *`,
    [
      profile.key,
      subject,
      body,
      htmlBody,
      preview,
      sender.address,
      sender.name,
      recipients,
      ccRecipients,
      recipients.length,
      status,
      messageId,
      replyToMessageId,
    ],
  );
  return row.rows[0];
}

async function upsertCrmLead({
  name,
  email,
  phone = null,
  company = null,
  source = 'website',
  message = '',
  visitorId = null,
  conversationId = null,
  projectType = null,
  businessGoal = null,
  budgetRange = null,
  timelineExpectation = null,
  preferredFollowUpChannel = null,
  requirementsSummary = null,
  recommendedAction = null,
  assignedTo = null,
}) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const normalizedPhone = phone ? String(phone).trim() : null;
  if (!normalizedEmail && !normalizedPhone) return null;

  const score = computeLeadScore({
    email: normalizedEmail,
    phone: normalizedPhone,
    company,
    message,
    source,
    visitorId,
  });
  const priority = getLeadPriority(score);
  const status = getLeadStatus(score);
  const nextFollowUpAt = getInitialFollowUpDate(score);

  const row = await pool.query(
    `INSERT INTO crm_leads
      (lead_key, name, email, phone, company, source, latest_message, visitor_id, conversation_id, lead_score, priority, status, qualification, follow_up_count, last_contacted_at, next_follow_up_at, project_type, business_goal, budget_range, timeline_expectation, preferred_follow_up_channel, requirements_summary, recommended_action, assigned_to, created_at, updated_at)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,NOW(),$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW())
     ON CONFLICT (lead_key)
     DO UPDATE SET
      name = COALESCE(EXCLUDED.name, crm_leads.name),
      email = COALESCE(EXCLUDED.email, crm_leads.email),
      phone = COALESCE(EXCLUDED.phone, crm_leads.phone),
      company = COALESCE(EXCLUDED.company, crm_leads.company),
      source = COALESCE(EXCLUDED.source, crm_leads.source),
      latest_message = COALESCE(NULLIF(EXCLUDED.latest_message, ''), crm_leads.latest_message),
      visitor_id = COALESCE(EXCLUDED.visitor_id, crm_leads.visitor_id),
      conversation_id = COALESCE(EXCLUDED.conversation_id, crm_leads.conversation_id),
      project_type = COALESCE(NULLIF(EXCLUDED.project_type, ''), crm_leads.project_type),
      business_goal = COALESCE(NULLIF(EXCLUDED.business_goal, ''), crm_leads.business_goal),
      budget_range = COALESCE(NULLIF(EXCLUDED.budget_range, ''), crm_leads.budget_range),
      timeline_expectation = COALESCE(NULLIF(EXCLUDED.timeline_expectation, ''), crm_leads.timeline_expectation),
      preferred_follow_up_channel = COALESCE(NULLIF(EXCLUDED.preferred_follow_up_channel, ''), crm_leads.preferred_follow_up_channel),
      requirements_summary = COALESCE(NULLIF(EXCLUDED.requirements_summary, ''), crm_leads.requirements_summary),
      recommended_action = COALESCE(NULLIF(EXCLUDED.recommended_action, ''), crm_leads.recommended_action),
      assigned_to = COALESCE(NULLIF(crm_leads.assigned_to, ''), NULLIF(EXCLUDED.assigned_to, ''), crm_leads.assigned_to),
      lead_score = GREATEST(crm_leads.lead_score, EXCLUDED.lead_score),
      priority = CASE
        WHEN GREATEST(crm_leads.lead_score, EXCLUDED.lead_score) >= 75 THEN 'high'
        WHEN GREATEST(crm_leads.lead_score, EXCLUDED.lead_score) >= 45 THEN 'medium'
        ELSE 'low'
      END,
      status = CASE
        WHEN crm_leads.status IN ('won', 'lost', 'unsubscribed') THEN crm_leads.status
        WHEN GREATEST(crm_leads.lead_score, EXCLUDED.lead_score) >= 75 THEN 'qualified'
        WHEN GREATEST(crm_leads.lead_score, EXCLUDED.lead_score) >= 45 THEN 'nurturing'
        ELSE 'new'
      END,
      qualification = CASE
        WHEN GREATEST(crm_leads.lead_score, EXCLUDED.lead_score) >= 75 THEN 'sales-ready'
        WHEN GREATEST(crm_leads.lead_score, EXCLUDED.lead_score) >= 45 THEN 'warm'
        ELSE 'early-stage'
      END,
      next_follow_up_at = COALESCE(crm_leads.next_follow_up_at, EXCLUDED.next_follow_up_at),
      updated_at = NOW()
     RETURNING *`,
    [
      normalizedEmail || normalizedPhone,
      name || null,
      normalizedEmail,
      normalizedPhone,
      company || null,
      source,
      message || '',
      visitorId,
      conversationId,
      score,
      priority,
      status,
      score >= 75 ? 'sales-ready' : score >= 45 ? 'warm' : 'early-stage',
      nextFollowUpAt,
      projectType,
      businessGoal,
      budgetRange,
      timelineExpectation,
      preferredFollowUpChannel,
      requirementsSummary,
      recommendedAction,
      assignedTo,
    ],
  );

  return row.rows[0];
}

function mapCrmLead(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    source: row.source,
    status: row.status,
    priority: row.priority,
    qualification: row.qualification,
    leadScore: row.lead_score,
    followUpCount: row.follow_up_count,
    latestMessage: row.latest_message,
    visitorId: row.visitor_id,
    conversationId: row.conversation_id,
    projectType: row.project_type,
    businessGoal: row.business_goal,
    budgetRange: row.budget_range,
    timelineExpectation: row.timeline_expectation,
    preferredFollowUpChannel: row.preferred_follow_up_channel,
    requirementsSummary: row.requirements_summary,
    recommendedAction: row.recommended_action,
    assignedTo: row.assigned_to,
    internalNotes: row.internal_notes,
    lastContactedAt: row.last_contacted_at,
    nextFollowUpAt: row.next_follow_up_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getKnowledgeContext(query, limit = 4) {
  const rows = await pool.query(`
    SELECT *
      FROM knowledge_documents
     WHERE is_active = true
     ORDER BY category ASC, title ASC
  `);

  const terms = Array.from(new Set(tokenizeKnowledgeText(query)));
  const ranked = rows.rows
    .map((row) => {
      const title = String(row.title || '').toLowerCase();
      const content = String(row.content || '').toLowerCase();
      const category = String(row.category || '').toLowerCase();
      const keywords = Array.isArray(row.keywords) ? row.keywords.map((item) => String(item).toLowerCase()) : [];
      let score = 0;

      for (const term of terms) {
        if (keywords.some((keyword) => keyword.includes(term) || term.includes(keyword))) score += 6;
        if (title.includes(term)) score += 4;
        if (category.includes(term)) score += 3;
        if (content.includes(term)) score += 1;
      }

      return { row, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.row.title || '').localeCompare(String(right.row.title || ''));
    });

  const selected = ranked.filter((item) => item.score > 0).slice(0, limit);
  const fallback = selected.length ? selected : ranked.slice(0, Math.min(limit, ranked.length));

  return fallback.map(({ row }) => `${row.title}: ${String(row.content || '').trim()}`).join('\n');
}

async function buildCrmFollowUp(lead) {
  const fallback = {
    subject: `Following up on your inquiry with FLAME CORE TECHNOLOGIES LTD`,
    body: `Hi ${lead.name || 'there'},\n\nThanks again for reaching out to FLAME CORE TECHNOLOGIES LTD. IÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢m following up in case youÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ 'ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢d like us to help with your project, timeline, or next steps.\n\nIf you're still exploring options, reply with your goal, timeframe, and preferred follow-up channel, and our team will guide you from there.\n\nBest regards,\nFLAME CORE TECHNOLOGIES LTD`,
  };

  if (!OPENAI_API_KEY) return fallback;

  try {
    const knowledgeContext = await getKnowledgeContext(
      [lead.source, lead.latest_message, lead.company, lead.name].filter(Boolean).join(' '),
      3,
    );
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: [
              'You write short premium business follow-up emails for FLAME CORE TECHNOLOGIES LTD.',
              'Use the provided company knowledge as the source of truth for tone, services, and positioning.',
              'Return strict JSON with keys subject and body.',
              'Keep it concise, warm, professional, and sales-oriented.',
              'No markdown.',
              knowledgeContext ? `Company knowledge:\n${knowledgeContext}` : '',
            ].filter(Boolean).join('\n\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              lead: {
                name: lead.name,
                company: lead.company,
                source: lead.source,
                qualification: lead.qualification,
                leadScore: lead.lead_score,
                latestMessage: lead.latest_message,
                followUpCount: lead.follow_up_count,
              },
            }),
          },
        ],
      }),
    });

    if (!aiResponse.ok) return fallback;
    const aiPayload = await aiResponse.json();
    const content = String(aiPayload?.choices?.[0]?.message?.content || '').trim();
    const parsed = JSON.parse(content);
    if (!parsed?.subject || !parsed?.body) return fallback;
    return {
      subject: String(parsed.subject).trim(),
      body: String(parsed.body).trim(),
    };
  } catch {
    return fallback;
  }
}

async function processCrmLeadFollowUp(lead) {
  const followUp = await buildCrmFollowUp(lead);
  await sendMail({
    to: lead.email,
    subject: followUp.subject,
    text: followUp.body,
  });

  await insertOutboundMessage({
    subject: followUp.subject,
    body: followUp.body,
    recipients: [lead.email],
    status: 'sent',
  });

  const followUpCount = Number(lead.follow_up_count || 0) + 1;
  const nextFollowUpAt = getNextFollowUpDate(followUpCount, lead.lead_score);

  const updated = await pool.query(
    `UPDATE crm_leads
        SET follow_up_count = $2,
            status = CASE WHEN status = 'new' THEN 'nurturing' ELSE status END,
            last_contacted_at = NOW(),
            next_follow_up_at = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [lead.id, followUpCount, nextFollowUpAt],
  );

  return {
    id: lead.id,
    email: lead.email,
    status: updated.rows[0]?.status || lead.status,
    nextFollowUpAt,
    subject: followUp.subject,
  };
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
  const phone = String(request.body?.phone || '').trim() || null;
  const company = String(request.body?.company || '').trim() || null;
  const message = String(request.body?.message || '').trim();

  if (!name || !email || !message) {
    return response.status(400).json({ message: 'Please complete all required fields.' });
  }

  const contactResult = await pool.query(
    `INSERT INTO contact_leads (name, email, phone, company, message) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, email, phone, company, message],
  );

  const leadQualification = await extractLeadQualification([
    {
      role: 'user',
      content: [name, email, phone, company, message].filter(Boolean).join('\n'),
    },
  ]);

  let crmLead = await upsertCrmLead({
    name,
    email,
    phone,
    company,
    source: 'website',
    message,
    projectType: leadQualification.projectType,
    businessGoal: leadQualification.businessGoal,
    budgetRange: leadQualification.budgetRange,
    timelineExpectation: leadQualification.timelineExpectation,
    preferredFollowUpChannel: leadQualification.preferredFollowUpChannel,
    requirementsSummary: leadQualification.requirementsSummary,
    recommendedAction: leadQualification.recommendedAction,
  });

  if (crmLead) {
    crmLead = await runCrmIntakeAutomation(crmLead, 'contact-form');
    await pool.query(`UPDATE contact_leads SET crm_lead_id = $1 WHERE id = $2`, [crmLead.id, contactResult.rows[0].id]).catch(() => null);
  }

  if (MAIL_NOTIFY_TO) {
    await sendMail({
      to: MAIL_NOTIFY_TO,
      subject: `New website inquiry from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '-'}\nCompany: ${company || '-'}\n\nMessage:\n${message}`,
    }).catch(() => null);
  }

  response.json({ success: true, message: 'Thanks - your message has been received.' });
});

app.post('/api/analytics/track', async (request, response) => {
  const visitorId = String(request.body?.visitorId || '').trim();
  const path = String(request.body?.path || '/').trim() || '/';
  const referrer = String(request.body?.referrer || '').trim() || null;

  if (!visitorId) {
    return response.status(400).json({ message: 'visitorId is required.' });
  }

  const duplicate = await pool.query(
    `SELECT id
       FROM site_visit_events
      WHERE visitor_id = $1
        AND path = $2
        AND created_at >= NOW() - INTERVAL '30 minutes'
      LIMIT 1`,
    [visitorId, path],
  );

  if (!duplicate.rows[0]) {
    await pool.query(
      `INSERT INTO site_visit_events (visitor_id, path, referrer, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [visitorId, path, referrer, String(request.headers['user-agent'] || '').slice(0, 500) || null],
    );
  }

  response.json({ success: true });
});

app.post('/api/chat', async (request, response) => {
  const requestStartedAt = Date.now();
  const pricingTiming = {
    route: '/api/chat',
    pricingPath: false,
    conversationId: null,
    sessionId: null,
    scopeReasoningDurationMs: null,
    pricingReasoningDurationMs: null,
    backendGuardrailDurationMs: null,
    finalReplyGenerationDurationMs: null,
    totalRequestDurationMs: null,
    quoteStrategy: null,
    fallbackReason: null,
    responseReturnedSuccessfully: false,
    hitTimeoutOrDisconnect: false,
  };
  let responseFinished = false;

  const emitPricingTiming = (event) => {
    if (!pricingTiming.pricingPath) return;
    const payload = {
      ...pricingTiming,
      event,
      totalRequestDurationMs: Date.now() - requestStartedAt,
      statusCode: response.statusCode || null,
      likelyProxyTimeoutRisk: (Date.now() - requestStartedAt) >= 55000,
    };
    console.info('pricing_request_timing', JSON.stringify(payload));
  };

  response.on('finish', () => {
    responseFinished = true;
    pricingTiming.responseReturnedSuccessfully = true;
    emitPricingTiming('finish');
  });

  response.on('close', () => {
    if (responseFinished) return;
    pricingTiming.hitTimeoutOrDisconnect = true;
    emitPricingTiming('close');
  });

  if (!OPENAI_API_KEY) {
    return response.status(503).json({ message: 'Website chat is not configured yet.' });
  }

  const sessionId = String(request.body?.sessionId || '').trim();
  const visitorId = String(request.body?.visitorId || '').trim() || null;
  const messages = normalizeChatMessages(request.body?.messages);

  if (!sessionId || !messages.length) {
    return response.status(400).json({ message: 'A valid chat session and message history are required.' });
  }

  if (!rateLimitChat(sessionId)) {
    return response.status(429).json({ message: 'Too many chat requests right now. Please wait a moment and try again.' });
  }

  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUserMessage) {
    return response.status(400).json({ message: 'A user message is required.' });
  }

  const conversationResult = await pool.query(
    `INSERT INTO chat_conversations (session_id, visitor_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (session_id)
     DO UPDATE SET
       visitor_id = COALESCE(EXCLUDED.visitor_id, chat_conversations.visitor_id),
       updated_at = NOW()
     RETURNING id`,
    [sessionId, visitorId],
  );
  const conversationId = conversationResult.rows[0].id;
  pricingTiming.conversationId = conversationId;
  pricingTiming.sessionId = sessionId;

  await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content)
     VALUES ($1, $2, $3)`,
    [conversationId, latestUserMessage.role, latestUserMessage.content],
  );

  const leadSignals = extractLeadSignals(messages);
  const leadQualification = await extractLeadQualification(messages);
  await pool.query(
    `UPDATE chat_conversations
        SET lead_name = COALESCE($2, lead_name),
            lead_email = COALESCE($3, lead_email),
            lead_phone = COALESCE($4, lead_phone),
            updated_at = NOW()
      WHERE id = $1`,
    [conversationId, leadSignals.name, leadSignals.email, leadSignals.phone],
  );

  const crmLead = await upsertCrmLead({
    name: leadSignals.name,
    email: leadSignals.email,
    phone: leadSignals.phone,
    source: 'chat',
    message: latestUserMessage.content,
    visitorId,
    conversationId,
    projectType: leadQualification.projectType,
    businessGoal: leadQualification.businessGoal,
    budgetRange: leadQualification.budgetRange,
    timelineExpectation: leadQualification.timelineExpectation,
    preferredFollowUpChannel: leadQualification.preferredFollowUpChannel,
    requirementsSummary: leadQualification.requirementsSummary,
    recommendedAction: leadQualification.recommendedAction,
  });
  await runCrmIntakeAutomation(crmLead, 'website-chat');

  if (isTrainingOrDiyRequest(latestUserMessage.content)) {
    const guardedReply =
      `We do not provide free step-by-step training or DIY implementation guidance for this service. We can handle the setup for you as a paid service, or arrange a paid consultation or training session with the team. If you want to move forward, please share your project goal and preferred follow-up by email or phone, or contact us at ${PUBLIC_SUPPORT_EMAIL}.`;

    await pool.query(
      `INSERT INTO chat_messages (conversation_id, role, content)
       VALUES ($1, 'assistant', $2)`,
      [conversationId, guardedReply],
    );

    return response.json({
      success: true,
      reply: guardedReply,
    });
  }

  const systemPrompt = [
    'You are Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.',
    'Your role is to help visitors understand services, qualify project leads, and move serious inquiries toward contact.',
    'Use the supplied company knowledge as the source of truth whenever it is available.',
    'Reply in a premium, warm, concise, professional tone.',
    'Only on the first meaningful reply in a conversation, or when a visitor explicitly asks who you are, identify yourself as Milo, the AI solutions assistant for FLAME CORE TECHNOLOGIES LTD.',
    'After the first introduction, do not repeat "I am Milo" or reintroduce yourself again unless the visitor asks again who you are.',
    'When helpful, ask only 1 to 3 important questions, not a long interrogation.',
    'If the visitor only names a website or app type, first give a short practical recommendation before asking follow-up questions.',
    'If the visitor asks for a training website, distinguish between a simple course information website and a full LMS. Do not assume an LMS unless they clearly ask for platform features like student login, lessons, quizzes, certificates, dashboards, or progress tracking.',
    'When helpful, ask about project type, business goal, timeline, budget range, and whether they want a follow-up by email or phone.',
    'Reason from the user request first. Start with the basics the project genuinely needs before mentioning optional upgrades.',
    'Do not force company-side systems such as CRM, AI agents, automation, WhatsApp workflows, dashboards, or blogs into a website scope unless the user actually asks for them or the project clearly requires them.',
    'Do not invent pricing. If asked for pricing, gather requirements first, recommend the right approach, and only give a price when it is clearly tied to the selected scope and features.',
    'Never give vague price ranges, random estimates, unauthorized discounts, or guaranteed delivery dates.',
    'If the user removes features or says they do not need something, acknowledge it directly, remove those features from the scope immediately, and recalculate the price.',
    'Do not provide free training, tutorials, DIY checklists, implementation walkthroughs, step-by-step setup instructions, or unpaid consulting for paid company services.',
    'If a visitor asks to learn how to do it themselves, asks for training, or asks for step-by-step help, politely explain that this is handled as a paid consultation, training, or done-for-you service.',
    'Do not offer free screen-share sessions, free walkthroughs, or free implementation help.',
    'Never talk badly about competitors, and never sound unsure or unprofessional.',
    `If the user is clearly ready to proceed, encourage them to use the contact form or email the team at ${PUBLIC_SUPPORT_EMAIL}.`,
    'Keep replies short enough for a website chat widget.',
  ].join(' ');

  const knowledgeContext = await getKnowledgeContext(
    messages.map((message) => message.content).join('\n'),
    4,
  );

  if (shouldRunPricingLayer(messages)) {
    pricingTiming.pricingPath = true;
    const pricingProfile = await getActivePricingProfile();
    if (pricingProfile) {
      const clientIp = getClientIp(request);
      const geoContext = getHeaderGeoContext(request) || await lookupGeoContext(clientIp);
      const pricingAudience = getPricingAudience(geoContext);
      const scopeStartedAt = Date.now();
      const aiScopeResult = await analyzeAiFirstPricingScope(messages, pricingProfile, null);
      pricingTiming.scopeReasoningDurationMs = aiScopeResult?.meta?.durationMs ?? (Date.now() - scopeStartedAt);
      if (aiScopeResult?.scope) {
        const mergedScope = applyConversationScopeRules(aiScopeResult.scope, messages);
        const removedFeatures = Array.from(extractExplicitlyRemovedFeatures(messages)).map((feature) => ({ aiAgent: 'AI agent', booking: 'booking', crm: 'CRM', payments: 'payment', customerAccounts: 'customer accounts', email: 'email automation', dashboard: 'dashboard', whatsapp: 'WhatsApp automation' }[feature] || feature.replace(/([A-Z])/g, ' ').replace(/^./, (char) => char.toUpperCase())));
        const includeIntro = shouldIntroduceMilo(messages);
        const guardrailStartedAt = Date.now();
        const deterministicEstimate =
          (mergedScope.scopeConfirmed || hasEnoughPricingDetail(mergedScope))
            ? calculateHybridPrice(mergedScope, pricingProfile, { audience: pricingAudience })
            : null;
        pricingTiming.backendGuardrailDurationMs = Date.now() - guardrailStartedAt;

        const pricingStartedAt = Date.now();
        const aiQuoteOutcome = await deriveAiFirstPricingDecision(mergedScope, pricingProfile, {
          audience: pricingAudience,
          messages,
          scopeDecision: aiScopeResult.raw,
          fallbackEstimate: deterministicEstimate,
        });
        pricingTiming.pricingReasoningDurationMs = aiQuoteOutcome?.durationMs ?? (Date.now() - pricingStartedAt);

        const aiDecisionMeta = evaluateAiPricingDecision(aiQuoteOutcome?.decision, mergedScope, pricingProfile, {
          audience: pricingAudience,
        });
        const consistentScope = aiDecisionMeta?.normalizedScope || mergedScope;
        const aiEstimate = aiDecisionMeta.estimate;

        const consistentDeterministicEstimate =
          (consistentScope.scopeConfirmed || hasEnoughPricingDetail(consistentScope))
            ? calculateHybridPrice(consistentScope, pricingProfile, { audience: pricingAudience })
            : deterministicEstimate;

        const activeEstimate = aiEstimate || consistentDeterministicEstimate;

        if (!activeEstimate && quoteRequiresTeamApproval(consistentScope, pricingProfile)) {
          const approvalReply = buildApprovalRequiredReply(consistentScope, geoContext, { includeIntro });
          pricingTiming.quoteStrategy = 'approval-handoff';
          pricingTiming.fallbackReason = 'guardrail_rejection';
          pricingTiming.finalReplyGenerationDurationMs = 0;
          await logPricingDecisionRun({
            conversationId,
            source: 'website-chat',
            pricingAudience,
            quoteStrategy: 'approval-handoff',
            userMessage: latestUserMessage.content,
            fallbackReason: 'guardrail_rejection',
            scopeJson: consistentScope,
            aiScopeJson: aiScopeResult.raw,
            aiQuoteJson: aiQuoteOutcome?.decision,
            fallbackQuoteJson: consistentDeterministicEstimate,
            finalQuoteJson: null,
            finalReply: approvalReply,
          });
          await pool.query(
            `INSERT INTO chat_messages (conversation_id, role, content)
             VALUES ($1, 'assistant', $2)`,
            [conversationId, approvalReply],
          );
          return response.json({ success: true, reply: approvalReply });
        }

        const localizedView = activeEstimate
          ? await buildLocalizedPricingView(activeEstimate, geoContext)
          : null;

        const quoteStrategy = activeEstimate === aiEstimate ? 'ai-first' : activeEstimate === consistentDeterministicEstimate ? 'backend-fallback' : 'follow-up';
        const fallbackReason = resolveFallbackReason({
          quoteStrategy,
          aiScopeMeta: aiScopeResult.meta,
          aiDecisionMeta,
          aiScopeJson: aiScopeResult.raw,
          aiQuoteJson: aiQuoteOutcome?.decision,
          aiQuoteMeta: aiQuoteOutcome,
          fallbackQuoteJson: consistentDeterministicEstimate,
          finalQuoteJson: activeEstimate,
        });
        pricingTiming.quoteStrategy = quoteStrategy;
        pricingTiming.fallbackReason = fallbackReason;

        const replyStartedAt = Date.now();
        const pricingReply = buildFastPricingReply(activeEstimate, localizedView, consistentScope, {
          includeIntro,
          removedFeatures,
          acknowledgeRemovals: messages.some((message) => message.role === 'assistant'),
        });
        pricingTiming.finalReplyGenerationDurationMs = Date.now() - replyStartedAt;

        await logPricingDecisionRun({
          conversationId,
          source: 'website-chat',
          pricingAudience,
          quoteStrategy,
          userMessage: latestUserMessage.content,
          fallbackReason,
          scopeJson: consistentScope,
          aiScopeJson: aiScopeResult.raw,
          aiQuoteJson: aiQuoteOutcome?.decision,
          fallbackQuoteJson: consistentDeterministicEstimate,
          finalQuoteJson: activeEstimate,
          finalReply: pricingReply,
        });

        await pool.query(
          `INSERT INTO chat_messages (conversation_id, role, content)
           VALUES ($1, 'assistant', $2)`,
          [conversationId, pricingReply],
        );

        return response.json({ success: true, reply: pricingReply });
      }
    }
  }

  const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(knowledgeContext ? [{ role: 'system', content: `Company knowledge:\n${knowledgeContext}` }] : []),
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ],
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('OpenAI chat request failed', errorText.slice(0, 500));
    return response.status(502).json({
      message: 'The website assistant could not respond right now. Please try again or contact us directly by email.',
    });
  }

  const aiPayload = await aiResponse.json();
  const reply = String(aiPayload?.choices?.[0]?.message?.content || '').trim();

  if (!reply) {
    return response.status(502).json({
      message: 'The website assistant returned an empty response. Please try again.',
    });
  }

  await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content)
     VALUES ($1, 'assistant', $2)`,
    [conversationId, reply],
  );

  response.json({ success: true, reply });
});

app.get('/api/admin/overview', requireAdmin, async (_request, response) => {
  const [posts, published, leads, mail, visitors, alerts, crm, dueFollowUps] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM blog_posts'),
    pool.query('SELECT COUNT(*)::int AS count FROM blog_posts WHERE is_published = true'),
    pool.query('SELECT COUNT(*)::int AS count FROM contact_leads'),
    pool.query(`SELECT COUNT(*)::int AS count FROM mail_messages WHERE folder IN ('sent', 'inbox')`),
    pool.query(`SELECT COUNT(DISTINCT visitor_id)::int AS count FROM site_visit_events WHERE created_at >= NOW() - INTERVAL '30 days'`),
    pool.query(`SELECT COUNT(*)::int AS count FROM automation_alerts WHERE resolved = false`),
    pool.query(`SELECT COUNT(*)::int AS count FROM crm_leads`),
    pool.query(`SELECT COUNT(*)::int AS count FROM crm_leads WHERE next_follow_up_at IS NOT NULL AND next_follow_up_at <= NOW() AND status NOT IN ('won','lost','unsubscribed')`),
  ]);

  response.json({
    postCount: posts.rows[0].count,
    publishedCount: published.rows[0].count,
    leadCount: leads.rows[0].count,
    mailCount: mail.rows[0].count,
    visitorCount: visitors.rows[0].count,
    alertCount: alerts.rows[0].count,
    crmLeadCount: crm.rows[0].count,
    dueFollowUpCount: dueFollowUps.rows[0].count,
  });
});

app.get('/api/admin/automation/alerts', requireAdmin, async (_request, response) => {
  const rows = await pool.query(
    `SELECT *
       FROM automation_alerts
      ORDER BY resolved ASC, created_at DESC, id DESC
      LIMIT 50`,
  );
  response.json({ alerts: rows.rows.map(mapAutomationAlert) });
});

app.post('/api/internal/automation/alerts', requireAutomation, async (request, response) => {
  const body = request.body || {};
  const source = String(body.source || 'n8n').trim() || 'n8n';
  const category = String(body.category || 'workflow').trim() || 'workflow';
  const severity = String(body.severity || 'error').trim() || 'error';
  const title = String(body.title || '').trim();
  const message = String(body.message || '').trim();
  const details = body.details && typeof body.details === 'object' ? body.details : null;

  if (!title || !message) {
    return response.status(400).json({ message: 'title and message are required.' });
  }

  const row = await createAutomationAlert({
    source,
    category,
    severity,
    title,
    message,
    details,
    notify: true,
  });

  response.json({ success: true, alert: mapAutomationAlert(row) });
});

app.get('/api/admin/analytics', requireAdmin, async (_request, response) => {
  const [summary, topPages, dailyVisitors] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS unique_visitors_30d,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS unique_visitors_7d,
        COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= date_trunc('day', NOW()))::int AS visitors_today,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS page_views_30d
      FROM site_visit_events
    `),
    pool.query(`
      SELECT
        path,
        COUNT(*)::int AS visits,
        COUNT(DISTINCT visitor_id)::int AS unique_visitors
      FROM site_visit_events
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY path
      ORDER BY visits DESC, unique_visitors DESC, path ASC
      LIMIT 5
    `),
    pool.query(`
      SELECT
        TO_CHAR(day_bucket, 'YYYY-MM-DD') AS day,
        visitors,
        page_views
      FROM (
        SELECT
          date_trunc('day', created_at) AS day_bucket,
          COUNT(DISTINCT visitor_id)::int AS visitors,
          COUNT(*)::int AS page_views
        FROM site_visit_events
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1
      ) series
      ORDER BY day_bucket DESC
    `),
  ]);

  response.json({
    uniqueVisitors30d: summary.rows[0].unique_visitors_30d,
    uniqueVisitors7d: summary.rows[0].unique_visitors_7d,
    visitorsToday: summary.rows[0].visitors_today,
    pageViews30d: summary.rows[0].page_views_30d,
    topPages: topPages.rows.map((row) => ({
      path: row.path,
      visits: row.visits,
      uniqueVisitors: row.unique_visitors,
    })),
    dailyVisitors: dailyVisitors.rows.map((row) => ({
      day: row.day,
      visitors: row.visitors,
      pageViews: row.page_views,
    })),
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

app.post('/api/internal/automation/blog-posts', requireAutomation, async (request, response) => {
  const body = request.body || {};
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const excerpt = String(body.excerpt || '').trim();
  const requestedSlug = String(body.slug || '').trim();
  const authorName = String(body.authorName || 'Milo for FLAME CORE TECHNOLOGIES LTD').trim();
  const coverImageUrl = String(body.coverImageUrl || '').trim() || null;
  const mediaType = String(body.mediaType || 'image').trim() || 'image';
  const mediaUrl = String(body.mediaUrl || '').trim() || null;
  const tags = Array.isArray(body.tags)
    ? body.tags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const publishNow = body.isPublished !== false;

  if (!title || !content || !excerpt) {
    return response.status(400).json({ message: 'title, excerpt, and content are required.' });
  }

  const baseSlug = slugify(requestedSlug || title);
  if (!baseSlug) {
    return response.status(400).json({ message: 'A valid slug or title is required.' });
  }

  let slug = baseSlug;
  let suffix = 1;
  for (;;) {
    const existing = await pool.query('SELECT id FROM blog_posts WHERE slug = $1 LIMIT 1', [slug]);
    if (!existing.rows[0]) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const row = await pool.query(
    `INSERT INTO blog_posts
      (title, slug, excerpt, content, cover_image_url, media_type, media_url, author_name, tags, is_published, published_at, updated_at)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10 THEN NOW() ELSE NULL END,NOW())
     RETURNING *`,
    [
      title,
      slug,
      excerpt,
      content,
      coverImageUrl,
      mediaType,
      mediaUrl,
      authorName,
      tags,
      publishNow,
    ],
  );

  response.json({
    success: true,
    post: mapPost(row.rows[0]),
    publicUrl: `/blog/${row.rows[0].slug}`,
  });
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
  const rows = await pool.query(`
    SELECT DISTINCT ON (LOWER(email))
      id,
      name,
      email,
      phone,
      company,
      message,
      created_at,
      COUNT(*) OVER (PARTITION BY LOWER(email))::int AS inquiry_count
    FROM contact_leads
    ORDER BY LOWER(email), created_at DESC, id DESC
  `);
  response.json({
    contacts: rows.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      message: row.message,
      createdAt: row.created_at,
      inquiryCount: row.inquiry_count,
    })),
  });
});

app.get('/api/admin/crm/leads', requireAdmin, async (_request, response) => {
  const rows = await pool.query(`
    SELECT *
      FROM crm_leads
     ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      lead_score DESC,
      COALESCE(next_follow_up_at, updated_at) ASC,
      id DESC
     LIMIT 100
  `);
  response.json({ leads: rows.rows.map(mapCrmLead) });
});

app.put('/api/admin/crm/leads/:id', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'A valid CRM lead id is required.' });
  }

  const body = request.body || {};
  const nextFollowUpAt = body.nextFollowUpAt ? new Date(String(body.nextFollowUpAt)) : null;
  if (body.nextFollowUpAt && Number.isNaN(nextFollowUpAt?.getTime?.())) {
    return response.status(400).json({ message: 'nextFollowUpAt must be a valid date.' });
  }

  const row = await pool.query(
    `UPDATE crm_leads
        SET status = COALESCE($2, status),
            priority = COALESCE($3, priority),
            qualification = COALESCE($4, qualification),
            project_type = COALESCE($5, project_type),
            business_goal = COALESCE($6, business_goal),
            budget_range = COALESCE($7, budget_range),
            timeline_expectation = COALESCE($8, timeline_expectation),
            preferred_follow_up_channel = COALESCE($9, preferred_follow_up_channel),
            requirements_summary = COALESCE($10, requirements_summary),
            recommended_action = COALESCE($11, recommended_action),
            assigned_to = COALESCE($12, assigned_to),
            internal_notes = COALESCE($13, internal_notes),
            next_follow_up_at = COALESCE($14, next_follow_up_at),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      body.status ? String(body.status).trim() : null,
      body.priority ? String(body.priority).trim() : null,
      body.qualification ? String(body.qualification).trim() : null,
      body.projectType ? String(body.projectType).trim() : null,
      body.businessGoal ? String(body.businessGoal).trim() : null,
      body.budgetRange ? String(body.budgetRange).trim() : null,
      body.timelineExpectation ? String(body.timelineExpectation).trim() : null,
      body.preferredFollowUpChannel ? String(body.preferredFollowUpChannel).trim().toLowerCase() : null,
      body.requirementsSummary ? String(body.requirementsSummary).trim() : null,
      body.recommendedAction ? String(body.recommendedAction).trim() : null,
      body.assignedTo ? String(body.assignedTo).trim() : null,
      body.internalNotes ? String(body.internalNotes).trim() : null,
      nextFollowUpAt ? nextFollowUpAt.toISOString() : null,
    ],
  );

  if (!row.rows[0]) {
    return response.status(404).json({ message: 'CRM lead not found.' });
  }

  await generateCrmActionPlanForLead(row.rows[0]).catch(() => null);
  response.json({ success: true, lead: mapCrmLead(row.rows[0]) });
});

app.post('/api/admin/crm/leads/:id/follow-up', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'A valid CRM lead id is required.' });
  }

  const leadResult = await pool.query('SELECT * FROM crm_leads WHERE id = $1 LIMIT 1', [id]);
  const lead = leadResult.rows[0];
  if (!lead) {
    return response.status(404).json({ message: 'CRM lead not found.' });
  }
  if (!lead.email) {
    return response.status(400).json({ message: 'This lead does not have an email address for follow-up.' });
  }

  const processed = await processCrmLeadFollowUp(lead);
  response.json({ success: true, processed });
});

app.get('/api/admin/crm/leads/:id/proposal-draft', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'A valid CRM lead id is required.' });
  }

  const row = await pool.query(
    `SELECT *
       FROM proposal_drafts
      WHERE lead_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`,
    [id],
  );

  response.json({ proposal: row.rows[0] || null });
});

app.get('/api/admin/crm/leads/:id/tasks', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'A valid CRM lead id is required.' });
  }

  const rows = await pool.query(
    `SELECT *
       FROM crm_tasks
      WHERE lead_id = $1
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
        COALESCE(due_at, updated_at) ASC,
        id ASC`,
    [id],
  );

  response.json({ tasks: rows.rows.map(mapCrmTask) });
});

app.post('/api/admin/crm/leads/:id/action-plan', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'A valid CRM lead id is required.' });
  }

  const leadResult = await pool.query('SELECT * FROM crm_leads WHERE id = $1 LIMIT 1', [id]);
  const lead = leadResult.rows[0];
  if (!lead) {
    return response.status(404).json({ message: 'CRM lead not found.' });
  }

  const tasks = await generateCrmActionPlanForLead(lead);
  response.json({ success: true, tasks });
});

app.post('/api/admin/crm/leads/:id/proposal-draft', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'A valid CRM lead id is required.' });
  }

  const leadResult = await pool.query('SELECT * FROM crm_leads WHERE id = $1 LIMIT 1', [id]);
  const lead = leadResult.rows[0];
  if (!lead) {
    return response.status(404).json({ message: 'CRM lead not found.' });
  }

  const draftPayload = await generateProposalDraftForLead(lead, null);
  const upserted = await pool.query(
    `INSERT INTO proposal_drafts
      (lead_id, title, summary, status, draft_json, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
     RETURNING *`,
    [id, draftPayload.title, draftPayload.summary, draftPayload.status || 'draft', JSON.stringify(draftPayload.draft)],
  );

  await generateCrmActionPlanForLead(lead).catch(() => null);

  response.json({ success: true, proposal: upserted.rows[0] || null });
});

app.put('/api/admin/crm/tasks/:taskId', requireAdmin, async (request, response) => {
  const taskId = Number.parseInt(String(request.params.taskId || '0'), 10);
  if (!taskId) {
    return response.status(400).json({ message: 'A valid CRM task id is required.' });
  }

  const body = request.body || {};
  const dueAt = body.dueAt ? new Date(String(body.dueAt)) : null;
  if (body.dueAt && Number.isNaN(dueAt?.getTime?.())) {
    return response.status(400).json({ message: 'dueAt must be a valid date.' });
  }

  const row = await pool.query(
    `UPDATE crm_tasks
        SET status = COALESCE($2, status),
            assigned_to = COALESCE($3, assigned_to),
            details = COALESCE($4, details),
            due_at = COALESCE($5, due_at),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      taskId,
      body.status ? String(body.status).trim() : null,
      body.assignedTo ? String(body.assignedTo).trim() : null,
      body.details ? String(body.details).trim() : null,
      dueAt ? dueAt.toISOString() : null,
    ],
  );

  if (!row.rows[0]) {
    return response.status(404).json({ message: 'CRM task not found.' });
  }

  response.json({ success: true, task: mapCrmTask(row.rows[0]) });
});

app.get('/api/admin/knowledge', requireAdmin, async (_request, response) => {
  const rows = await pool.query(`
    SELECT *
      FROM knowledge_documents
     ORDER BY category ASC, title ASC, id ASC
  `);
  response.json({ documents: rows.rows.map(mapKnowledgeDoc) });
});

app.post('/api/admin/knowledge', requireAdmin, async (request, response) => {
  const slug = slugify(String(request.body?.slug || request.body?.title || 'knowledge-doc'));
  const title = String(request.body?.title || '').trim();
  const category = String(request.body?.category || 'general').trim() || 'general';
  const content = String(request.body?.content || '').trim();
  const isActive = request.body?.isActive !== false;
  const keywords = Array.isArray(request.body?.keywords)
    ? request.body.keywords.map((item) => String(item).trim()).filter(Boolean)
    : String(request.body?.keywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  if (!title || !content) {
    return response.status(400).json({ message: 'title and content are required.' });
  }

  try {
    const row = await pool.query(
      `INSERT INTO knowledge_documents
        (slug, title, category, keywords, content, is_active, updated_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING *`,
      [slug, title, category, keywords, content, isActive],
    );

    response.json({ success: true, document: mapKnowledgeDoc(row.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return response.status(409).json({ message: 'A knowledge document with this slug already exists.' });
    }

    throw error;
  }
});

app.put('/api/admin/knowledge/:id', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  const slug = slugify(String(request.body?.slug || request.body?.title || 'knowledge-doc'));
  const title = String(request.body?.title || '').trim();
  const category = String(request.body?.category || 'general').trim() || 'general';
  const content = String(request.body?.content || '').trim();
  const isActive = request.body?.isActive !== false;
  const keywords = Array.isArray(request.body?.keywords)
    ? request.body.keywords.map((item) => String(item).trim()).filter(Boolean)
    : String(request.body?.keywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  if (!id || !title || !content) {
    return response.status(400).json({ message: 'valid id, title, and content are required.' });
  }

  try {
    const row = await pool.query(
      `UPDATE knowledge_documents
          SET slug = $1,
              title = $2,
              category = $3,
              keywords = $4,
              content = $5,
              is_active = $6,
              updated_at = NOW()
        WHERE id = $7
        RETURNING *`,
      [slug, title, category, keywords, content, isActive, id],
    );

    if (!row.rows[0]) {
      return response.status(404).json({ message: 'Knowledge document not found.' });
    }

    response.json({ success: true, document: mapKnowledgeDoc(row.rows[0]) });
  } catch (error) {
    if (error?.code === '23505') {
      return response.status(409).json({ message: 'A knowledge document with this slug already exists.' });
    }

    throw error;
  }
});

app.delete('/api/admin/knowledge/:id', requireAdmin, async (request, response) => {
  const id = Number.parseInt(String(request.params.id || '0'), 10);
  if (!id) {
    return response.status(400).json({ message: 'Valid document id is required.' });
  }

  await pool.query('DELETE FROM knowledge_documents WHERE id = $1', [id]);
  response.json({ success: true });
});

app.get('/api/admin/pricing-profile', requireAdmin, async (_request, response) => {
  const row = await getActivePricingProfile();
  response.json({ profile: row || null });
});

app.put('/api/admin/pricing-profile', requireAdmin, async (request, response) => {
  const title = String(request.body?.title || 'Default Live Pricing Profile').trim() || 'Default Live Pricing Profile';
  const currency = String(request.body?.currency || 'USD').trim().toUpperCase() || 'USD';
  const config = request.body?.config;

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return response.status(400).json({ message: 'config must be an object.' });
  }

  const row = await pool.query(
    `UPDATE pricing_profiles
        SET title = $1,
            currency = $2,
            config_json = $3::jsonb,
            updated_at = NOW()
      WHERE slug = 'default-live'
      RETURNING *`,
    [title, currency, JSON.stringify(config)],
  );

  response.json({ success: true, profile: row.rows[0] || null });
});

app.post('/api/internal/automation/crm/run', requireAutomation, async (_request, response) => {
  const dueLeads = await pool.query(`
    SELECT *
      FROM crm_leads
     WHERE email IS NOT NULL
       AND next_follow_up_at IS NOT NULL
       AND next_follow_up_at <= NOW()
       AND status NOT IN ('won', 'lost', 'unsubscribed')
     ORDER BY
       CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       next_follow_up_at ASC,
       id ASC
     LIMIT 5
  `);

  const processed = [];

  for (const lead of dueLeads.rows) {
    processed.push(await processCrmLeadFollowUp(lead));
  }

  response.json({
    success: true,
    processedCount: processed.length,
    processed,
  });
});

app.get('/api/admin/mail/history', requireAdmin, async (_request, response) => {
  const mailbox = getMailboxFromRequest(_request);
  const rows = await pool.query(
    `SELECT * FROM mail_messages
     WHERE folder = 'sent' AND mailbox = $1
     ORDER BY COALESCE(sent_at, created_at) DESC
     LIMIT 50`,
    [mailbox],
  );
  response.json({ messages: rows.rows.map(mapMailMessage) });
});

app.get('/api/admin/mail/folders', requireAdmin, async (request, response) => {
  const mailbox = getMailboxFromRequest(request);
  const rows = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE folder = 'inbox')::int AS inbox,
      COUNT(*) FILTER (WHERE folder = 'sent')::int AS sent,
      COUNT(*) FILTER (WHERE folder = 'inbox' AND is_read = false)::int AS unread_inbox
    FROM mail_messages
    WHERE mailbox = $1
  `, [mailbox]);
  const channelRows = await pool.query(
    `SELECT *
       FROM mail_messages
      WHERE mailbox = $1`,
    [mailbox],
  );
  const channels = { primary: 0, support: 0, billing: 0, automated: 0 };
  for (const row of channelRows.rows) {
    const channel = detectMailboxChannel(row);
    if (channels[channel] !== undefined) channels[channel] += 1;
  }

  response.json({
    mailbox,
    inbox: rows.rows[0].inbox,
    sent: rows.rows[0].sent,
    unreadInbox: rows.rows[0].unread_inbox,
    channels,
  });
});

app.get('/api/admin/mail/messages', requireAdmin, async (request, response) => {
  const mailbox = getMailboxFromRequest(request);
  const folder = ['inbox', 'sent'].includes(String(request.query.folder || '')) ? String(request.query.folder) : 'inbox';
  const channel = normalizeMailChannelKey(request.query.channel);
  const page = Math.max(1, Number.parseInt(String(request.query.page || '1'), 10) || 1);
  const pageSize = Math.min(25, Math.max(5, Number.parseInt(String(request.query.pageSize || '10'), 10) || 10));
  if (folder === 'inbox') {
    await syncInboxFromMbox().catch(() => null);
  }

  const sourceRows = await pool.query(
    `SELECT * FROM mail_messages
     WHERE folder = $1 AND mailbox = $2
     ORDER BY COALESCE(received_at, sent_at, created_at) DESC, id DESC`,
    [folder, mailbox],
  );
  const filteredRows = channel === 'all'
    ? sourceRows.rows
    : sourceRows.rows.filter((row) => detectMailboxChannel(row) === channel);
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pagedRows = filteredRows.slice(offset, offset + pageSize);

  response.json({
    mailbox,
    channel,
    messages: pagedRows.map(mapMailMessage),
    page: safePage,
    pageSize,
    total,
    totalPages,
  });
});

app.get('/api/admin/mail/messages/:id', requireAdmin, async (request, response) => {
  const mailbox = getMailboxFromRequest(request);
  const messageId = Number.parseInt(String(request.params.id), 10);
  if (!messageId) {
    return response.status(400).json({ message: 'Valid message ID is required.' });
  }

  const result = await pool.query('SELECT * FROM mail_messages WHERE id = $1 AND mailbox = $2 LIMIT 1', [messageId, mailbox]);
  const row = result.rows[0];
  if (!row) {
    return response.status(404).json({ message: 'Message not found.' });
  }

  if (row.folder === 'inbox' && row.is_read === false) {
    await pool.query('UPDATE mail_messages SET is_read = true WHERE id = $1', [messageId]);
    row.is_read = true;
  }

  response.json({ message: mapMailMessage(row) });
});

app.post('/api/admin/mail/sync', requireAdmin, async (_request, response) => {
  const result = await syncInboxFromMbox();
  response.json({ success: true, mailbox: getMailboxFromRequest(_request), ...result });
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
  const mailbox = getMailboxFromRequest(request);
  const senderProfile = normalizeSenderProfileKey(mailbox, request.body?.senderProfile);
  const subject = String(request.body?.subject || '').trim();
  const body = String(request.body?.body || '').trim();
  const recipientsMode = String(request.body?.recipientsMode || 'all_contacts');
  const customRecipients = String(request.body?.customRecipients || '').trim();

  if (!subject || !body) {
    return response.status(400).json({ message: 'Subject and body are required.' });
  }

  let recipients = [];
  if (recipientsMode === 'custom') {
    recipients = normalizeAddressList(customRecipients);
  } else {
    const result = await pool.query('SELECT DISTINCT email FROM contact_leads ORDER BY email ASC');
    recipients = result.rows.map((row) => row.email);
  }

  if (!recipients.length) {
    return response.status(400).json({ message: 'No recipients available.' });
  }

  const info = await sendMail({
    mailbox,
    senderProfile,
    to: recipients.join(', '),
    subject,
    text: body,
  });

  await insertOutboundMessage({
    mailbox,
    senderProfile,
    subject,
    body,
    recipients,
    status: Array.isArray(info?.accepted) && info.accepted.length ? 'sent' : 'queued',
  });

  response.json({
    success: true,
    delivered: Array.isArray(info?.accepted) ? info.accepted.length : recipients.length,
    skipped: 0,
    message: 'Email sent successfully.',
  });
});

app.post('/api/internal/project-mail/send', requireCompanyInternalApi, async (request, response) => {
  const mailbox = normalizeMailboxKey(request.body?.projectKey || request.body?.mailbox || 'company');
  const senderProfile = normalizeSenderProfileKey(mailbox, request.body?.senderProfile || 'noreply');
  const recipients = normalizeAddressList(request.body?.to);
  const ccRecipients = normalizeAddressList(request.body?.cc);
  const subject = String(request.body?.subject || '').trim();
  const body = String(request.body?.text || request.body?.body || '').trim();
  const htmlBody = String(request.body?.html || request.body?.htmlBody || '').trim();
  const replyTo = String(request.body?.replyTo || '').trim() || null;

  if (!recipients.length || !subject || (!body && !htmlBody)) {
    return response.status(400).json({ message: 'Recipients, subject, and message content are required.' });
  }

  const plainTextBody = body || buildPreview(htmlBody);

  try {
    const info = await sendMail({
      mailbox,
      senderProfile,
      to: recipients,
      cc: ccRecipients,
      subject,
      text: plainTextBody,
      html: htmlBody || null,
      replyTo,
    });

    const row = await insertOutboundMessage({
      mailbox,
      senderProfile,
      subject,
      body: plainTextBody,
      htmlBody: htmlBody || null,
      recipients,
      ccRecipients,
      replyToMessageId: replyTo,
      status: Array.isArray(info?.accepted) && info.accepted.length ? 'sent' : 'queued',
    });

    response.json({
      success: true,
      mailbox,
      senderProfile,
      delivered: Array.isArray(info?.accepted) ? info.accepted.length : recipients.length,
      messageId: row?.message_id || null,
    });
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to send project mail.' });
  }
});

app.post('/api/admin/mail/reply', requireAdmin, async (request, response) => {
  const mailbox = getMailboxFromRequest(request);
  const senderProfile = normalizeSenderProfileKey(mailbox, request.body?.senderProfile);
  const messageId = Number(request.body?.messageId);
  const body = String(request.body?.body || '').trim();

  if (!messageId || !body) {
    return response.status(400).json({ message: 'Message and reply body are required.' });
  }

  const result = await pool.query('SELECT * FROM mail_messages WHERE id = $1 AND mailbox = $2 LIMIT 1', [messageId, mailbox]);
  const original = result.rows[0];
  if (!original) {
    return response.status(404).json({ message: 'Original message not found.' });
  }

  const recipients = [original.sender_email].filter(Boolean);
  if (!recipients.length) {
    return response.status(400).json({ message: 'Original sender address is unavailable.' });
  }

  const subject = original.subject?.toLowerCase().startsWith('re:') ? original.subject : `Re: ${original.subject}`;
  const quotedBody = `\n\n--- Original message ---\n${original.body}`;
  const fullBody = `${body}${quotedBody}`;

  const info = await sendMail({
    mailbox,
    senderProfile,
    to: recipients.join(', '),
    subject,
    text: fullBody,
    replyTo: original.message_id,
  });

  await insertOutboundMessage({
    mailbox,
    senderProfile,
    subject,
    body: fullBody,
    recipients,
    replyToMessageId: original.message_id,
    status: Array.isArray(info?.accepted) && info.accepted.length ? 'sent' : 'queued',
  });

  response.json({
    success: true,
    delivered: Array.isArray(info?.accepted) ? info.accepted.length : recipients.length,
    skipped: 0,
    message: 'Reply sent successfully.',
  });
});

app.post('/api/admin/mail/forward', requireAdmin, async (request, response) => {
  const mailbox = getMailboxFromRequest(request);
  const senderProfile = normalizeSenderProfileKey(mailbox, request.body?.senderProfile);
  const messageId = Number(request.body?.messageId);
  const recipients = normalizeAddressList(request.body?.recipients);
  const intro = String(request.body?.body || '').trim();

  if (!messageId || !recipients.length) {
    return response.status(400).json({ message: 'Message and forward recipients are required.' });
  }

  const result = await pool.query('SELECT * FROM mail_messages WHERE id = $1 AND mailbox = $2 LIMIT 1', [messageId, mailbox]);
  const original = result.rows[0];
  if (!original) {
    return response.status(404).json({ message: 'Original message not found.' });
  }

  const subject = original.subject?.toLowerCase().startsWith('fwd:') ? original.subject : `Fwd: ${original.subject}`;
  const forwardedBody = `${intro ? `${intro}\n\n` : ''}--- Forwarded message ---\nFrom: ${original.sender_name || original.sender_email}\nSubject: ${original.subject}\n\n${original.body}`;
  const info = await sendMail({
    mailbox,
    senderProfile,
    to: recipients.join(', '),
    subject,
    text: forwardedBody,
  });

  await insertOutboundMessage({
    mailbox,
    senderProfile,
    subject,
    body: forwardedBody,
    recipients,
    status: Array.isArray(info?.accepted) && info.accepted.length ? 'sent' : 'queued',
  });

  response.json({
    success: true,
    delivered: Array.isArray(info?.accepted) ? info.accepted.length : recipients.length,
    skipped: 0,
    message: 'Forwarded email sent successfully.',
  });
});

app.post('/api/admin/legacy/flamebot/import', requireAdmin, async (request, response) => {
  const payload = normalizeLegacyImportPayload(request.body);
  const mailboxMeta = payload.metadata?.mailbox && typeof payload.metadata.mailbox === 'object' ? payload.metadata.mailbox : {};
  const slug = toNullableString(mailboxMeta.slug) || 'flamebot-legacy';

  const mailboxResult = await pool.query(
    `INSERT INTO legacy_mailboxes (slug, name, product, sender_email, status, updated_at)
     VALUES ($1, $2, $3, $4, 'active', NOW())
     ON CONFLICT (slug)
     DO UPDATE SET
       name = EXCLUDED.name,
       product = EXCLUDED.product,
       sender_email = EXCLUDED.sender_email,
       status = 'active',
       updated_at = NOW()
     RETURNING *`,
    [
      slug,
      toNullableString(mailboxMeta.name) || 'FlameBot Legacy Mail',
      toNullableString(mailboxMeta.product) || 'FlameBot',
      toNullableString(mailboxMeta.senderEmail) || 'flamecoretechnology@flamebotapp.com',
    ],
  );
  const mailbox = mailboxResult.rows[0];

  const contactsBySourceKey = new Map();
  let contactsCreated = 0;
  let contactsUpdated = 0;

  for (const rawContact of payload.contacts) {
    const sourceKey = toNullableString(rawContact?.sourceKey || rawContact?.recipientEmail || rawContact?.email || rawContact?.telegramId || rawContact?.id);
    if (!sourceKey) continue;

    const result = await pool.query(
      `INSERT INTO legacy_contacts (
         mailbox_id, source_system, source_key, external_id, recipient_email, full_name, phone_number, status, metadata_json, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
       ON CONFLICT (source_key)
       DO UPDATE SET
         mailbox_id = EXCLUDED.mailbox_id,
         source_system = EXCLUDED.source_system,
         external_id = EXCLUDED.external_id,
         recipient_email = EXCLUDED.recipient_email,
         full_name = EXCLUDED.full_name,
         phone_number = EXCLUDED.phone_number,
         status = EXCLUDED.status,
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [
        mailbox.id,
        toNullableString(rawContact?.sourceSystem) || 'flamebot-legacy',
        sourceKey,
        toNullableString(rawContact?.externalId || rawContact?.telegramId),
        toNullableString(rawContact?.recipientEmail || rawContact?.email),
        toNullableString(rawContact?.fullName || rawContact?.name),
        toNullableString(rawContact?.phoneNumber),
        toNullableString(rawContact?.status),
        JSON.stringify(rawContact?.metadata && typeof rawContact.metadata === 'object' ? rawContact.metadata : {}),
      ],
    );

    const contact = result.rows[0];
    contactsBySourceKey.set(sourceKey, contact);
    if (contact?.inserted) contactsCreated += 1;
    else contactsUpdated += 1;
  }

  let messagesCreated = 0;
  let messagesUpdated = 0;

  for (const rawMessage of payload.messages) {
    const sourceKey = toNullableString(rawMessage?.sourceKey || rawMessage?.id || rawMessage?.messageId);
    const contactSourceKey = toNullableString(rawMessage?.contactSourceKey || rawMessage?.contactKey || rawMessage?.recipientEmail || rawMessage?.email);
    if (!sourceKey || !contactSourceKey) continue;

    let contact = contactsBySourceKey.get(contactSourceKey);
    if (!contact) {
      const existingContact = await pool.query('SELECT * FROM legacy_contacts WHERE source_key = $1 LIMIT 1', [contactSourceKey]);
      contact = existingContact.rows[0];
    }
    if (!contact) continue;

    const result = await pool.query(
      `INSERT INTO legacy_messages (
         mailbox_id, contact_id, source_system, source_key, external_id, direction, message_type, subject, sender_email, recipient_email, body_text, sent_at, metadata_json, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
       ON CONFLICT (source_key)
       DO UPDATE SET
         mailbox_id = EXCLUDED.mailbox_id,
         contact_id = EXCLUDED.contact_id,
         source_system = EXCLUDED.source_system,
         external_id = EXCLUDED.external_id,
         direction = EXCLUDED.direction,
         message_type = EXCLUDED.message_type,
         subject = EXCLUDED.subject,
         sender_email = EXCLUDED.sender_email,
         recipient_email = EXCLUDED.recipient_email,
         body_text = EXCLUDED.body_text,
         sent_at = EXCLUDED.sent_at,
         metadata_json = EXCLUDED.metadata_json,
         updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [
        mailbox.id,
        contact.id,
        toNullableString(rawMessage?.sourceSystem) || 'flamebot-legacy',
        sourceKey,
        toNullableString(rawMessage?.externalId),
        toNullableString(rawMessage?.direction) || 'outbound',
        toNullableString(rawMessage?.messageType),
        toNullableString(rawMessage?.subject),
        toNullableString(rawMessage?.senderEmail) || mailbox.sender_email,
        toNullableString(rawMessage?.recipientEmail || contact.recipient_email),
        String(rawMessage?.bodyText || '').slice(0, 50000),
        toDateOrNull(rawMessage?.sentAt),
        JSON.stringify(rawMessage?.metadata && typeof rawMessage.metadata === 'object' ? rawMessage.metadata : {}),
      ],
    );

    if (result.rows[0]?.inserted) messagesCreated += 1;
    else messagesUpdated += 1;
  }

  const mailboxStats = await pool.query(
    `SELECT
       lm.*,
       COALESCE(contact_stats.contact_count, 0) AS contact_count,
       COALESCE(message_stats.message_count, 0) AS message_count,
       message_stats.last_message_id,
       message_stats.last_message_subject,
       message_stats.last_message_sent_at,
       message_stats.last_message_recipient_email,
       message_stats.last_message_type
     FROM legacy_mailboxes lm
     LEFT JOIN (
       SELECT mailbox_id, COUNT(*)::int AS contact_count
       FROM legacy_contacts
       GROUP BY mailbox_id
     ) contact_stats ON contact_stats.mailbox_id = lm.id
     LEFT JOIN (
       SELECT DISTINCT ON (mailbox_id)
         mailbox_id,
         COUNT(*) OVER (PARTITION BY mailbox_id)::int AS message_count,
         id AS last_message_id,
         subject AS last_message_subject,
         sent_at AS last_message_sent_at,
         recipient_email AS last_message_recipient_email,
         message_type AS last_message_type
       FROM legacy_messages
       ORDER BY mailbox_id, sent_at DESC NULLS LAST, id DESC
     ) message_stats ON message_stats.mailbox_id = lm.id
     WHERE lm.id = $1
     LIMIT 1`,
    [mailbox.id],
  );

  response.json({
    success: true,
    mailbox: mapLegacyMailbox(mailboxStats.rows[0]),
    imported: { contactsCreated, contactsUpdated, messagesCreated, messagesUpdated },
  });
});

app.get('/api/admin/legacy/mailboxes', requireAdmin, async (_request, response) => {
  const result = await pool.query(
    `SELECT
       lm.*,
       COALESCE(contact_stats.contact_count, 0) AS contact_count,
       COALESCE(message_stats.message_count, 0) AS message_count,
       message_stats.last_message_id,
       message_stats.last_message_subject,
       message_stats.last_message_sent_at,
       message_stats.last_message_recipient_email,
       message_stats.last_message_type
     FROM legacy_mailboxes lm
     LEFT JOIN (
       SELECT mailbox_id, COUNT(*)::int AS contact_count
       FROM legacy_contacts
       GROUP BY mailbox_id
     ) contact_stats ON contact_stats.mailbox_id = lm.id
     LEFT JOIN (
       SELECT DISTINCT ON (mailbox_id)
         mailbox_id,
         COUNT(*) OVER (PARTITION BY mailbox_id)::int AS message_count,
         id AS last_message_id,
         subject AS last_message_subject,
         sent_at AS last_message_sent_at,
         recipient_email AS last_message_recipient_email,
         message_type AS last_message_type
       FROM legacy_messages
       ORDER BY mailbox_id, sent_at DESC NULLS LAST, id DESC
     ) message_stats ON message_stats.mailbox_id = lm.id
     ORDER BY lm.updated_at DESC, lm.id DESC`,
  );
  response.json({ mailboxes: result.rows.map(mapLegacyMailbox) });
});

app.get('/api/admin/legacy/mailboxes/:slug/contacts', requireAdmin, async (request, response) => {
  const mailboxResult = await pool.query('SELECT * FROM legacy_mailboxes WHERE slug = $1 LIMIT 1', [request.params.slug]);
  const mailbox = mailboxResult.rows[0];
  if (!mailbox) {
    return response.status(404).json({ message: 'Legacy mailbox not found.' });
  }

  const contactsResult = await pool.query(
    `SELECT
       lc.*,
       COALESCE(message_stats.message_count, 0) AS message_count,
       message_stats.last_message_id,
       message_stats.last_message_subject,
       message_stats.last_message_sent_at,
       message_stats.last_message_type
     FROM legacy_contacts lc
     LEFT JOIN (
       SELECT DISTINCT ON (contact_id)
         contact_id,
         COUNT(*) OVER (PARTITION BY contact_id)::int AS message_count,
         id AS last_message_id,
         subject AS last_message_subject,
         sent_at AS last_message_sent_at,
         message_type AS last_message_type
       FROM legacy_messages
       ORDER BY contact_id, sent_at DESC NULLS LAST, id DESC
     ) message_stats ON message_stats.contact_id = lc.id
     WHERE lc.mailbox_id = $1
     ORDER BY COALESCE(message_stats.last_message_sent_at, lc.updated_at, lc.created_at) DESC NULLS LAST, lc.id DESC`,
    [mailbox.id],
  );

  response.json({
    mailbox: mapLegacyMailbox({ ...mailbox, contact_count: 0, message_count: 0 }),
    contacts: contactsResult.rows.map(mapLegacyContact),
  });
});

app.get('/api/admin/legacy/mailboxes/:slug/contacts/:contactId/messages', requireAdmin, async (request, response) => {
  const mailboxResult = await pool.query('SELECT * FROM legacy_mailboxes WHERE slug = $1 LIMIT 1', [request.params.slug]);
  const mailbox = mailboxResult.rows[0];
  if (!mailbox) {
    return response.status(404).json({ message: 'Legacy mailbox not found.' });
  }

  const contactId = Number.parseInt(String(request.params.contactId), 10);
  if (!contactId) {
    return response.status(400).json({ message: 'Valid legacy contact ID is required.' });
  }

  const contactResult = await pool.query('SELECT * FROM legacy_contacts WHERE id = $1 AND mailbox_id = $2 LIMIT 1', [contactId, mailbox.id]);
  const contact = contactResult.rows[0];
  if (!contact) {
    return response.status(404).json({ message: 'Legacy contact not found.' });
  }

  const messagesResult = await pool.query(
    `SELECT *
       FROM legacy_messages
      WHERE mailbox_id = $1
        AND contact_id = $2
      ORDER BY sent_at DESC NULLS LAST, id DESC`,
    [mailbox.id, contactId],
  );

  response.json({
    mailbox: mapLegacyMailbox({ ...mailbox, contact_count: 0, message_count: 0 }),
    contact: mapLegacyContact({ ...contact, message_count: messagesResult.rows.length }),
    messages: messagesResult.rows.map(mapLegacyMessage),
  });
});

registerCompanyPaymentRoutes({
  app,
  pool,
  requireAdmin,
  notifications: {
    async sendProjectMail({ projectKey, senderProfile = 'primary', to, cc = [], subject, text, html = null, replyTo = null }) {
      const mailbox = normalizeMailboxKey(projectKey || 'company');
      const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
      const ccRecipients = Array.isArray(cc) ? cc.filter(Boolean) : [cc].filter(Boolean);
      const plainText = String(text || '').trim();
      const htmlBody = String(html || '').trim();
      if (!recipients.length || !String(subject || '').trim() || (!plainText && !htmlBody)) return null;

      const info = await sendMail({
        mailbox,
        senderProfile,
        to: recipients,
        cc: ccRecipients,
        subject,
        text: plainText || buildPreview(htmlBody),
        html: htmlBody || null,
        replyTo,
      });

      await insertOutboundMessage({
        mailbox,
        senderProfile,
        subject,
        body: plainText || buildPreview(htmlBody),
        htmlBody: htmlBody || null,
        recipients,
        ccRecipients,
        status: Array.isArray(info?.accepted) && info.accepted.length ? 'sent' : 'queued',
      });

      return info;
    },
  },
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'Internal server error' });
});

initDb()
  .then(async () => {
    await initCompanyPayments(pool);

    if (typeof transporter.verify === 'function') {
      try {
        await Promise.resolve(transporter.verify());
      } catch {
      }
    }

    if (MAIL_INBOX_DRIVER === 'mbox') {
      await syncInboxFromMbox().catch(() => null);
    }

    app.listen(Number(PORT), '127.0.0.1', () => {
      console.log(`Flame Core marketing API listening on 127.0.0.1:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
