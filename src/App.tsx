import { useEffect, useMemo, useState } from 'react';
import AdminPortal from './AdminPortal';
import { fetchPublishedPosts, submitContact } from './api';
import type { BlogPost } from './siteContent';
import {
  companyEmail,
  defaultBlogPosts,
  phoneDisplay,
  phoneTel,
  services,
  testimonials,
  whatsappUrl,
} from './siteContent';

const reasons = [
  {
    title: 'Executive-level presentation',
    description: 'We shape products that feel credible, refined, and ready for serious commercial conversations.',
  },
  {
    title: 'Delivery with structure',
    description: 'Clear execution, thoughtful planning, and dependable implementation across design and engineering.',
  },
  {
    title: 'Built for growth',
    description: 'Our systems are designed to support scale, iteration, and cleaner long-term operations.',
  },
];

const processSteps = [
  ['01', 'Discovery', 'We define goals, audience, positioning, and technical direction before build starts.'],
  ['02', 'Design', 'We shape a premium user experience, visual system, and delivery plan.'],
  ['03', 'Build', 'We implement clean frontend and backend foundations with production intent.'],
  ['04', 'Launch', 'We deploy carefully, validate behavior, and refine the final experience.'],
];

function formatDate(value?: string | null) {
  if (!value) return 'Draft';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isVideo(url?: string) {
  if (!url) return false;
  return /\.(mp4|webm|ogg)$/i.test(url);
}

export default function App() {
  const [pathname, setPathname] = useState(() => (typeof window === 'undefined' ? '/' : window.location.pathname));
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(defaultBlogPosts);
  const [contactState, setContactState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [contactNotice, setContactNotice] = useState('Tell us what you want to build and we will respond through our company email.');

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    fetchPublishedPosts().then(setBlogPosts).catch(() => null);
  }, []);

  const navLinks = useMemo(
    () => [
      { label: 'Services', href: '#services' },
      { label: 'Work', href: '#work' },
      { label: 'Reviews', href: '#reviews' },
      { label: 'Blog', href: '#blog' },
      { label: 'Contact', href: '#contact' },
      { label: 'Admin', href: '/admin' },
    ],
    [],
  );

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminPortal />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#04050A] text-white selection:bg-[#FF5A1F]/40 selection:text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
        * { font-family: 'Instrument Sans', system-ui, sans-serif; }
        h1, h2, h3, .display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.03em; }
        html { scroll-behavior: smooth; }
        body { background: #04050A; }
      `}</style>

      <div className="fixed inset-0 -z-20 bg-[radial-gradient(circle_at_top_right,rgba(255,90,31,0.14),transparent_38%),radial-gradient(circle_at_left_bottom,rgba(124,58,237,0.12),transparent_36%),#04050A]" />

      <header className="sticky top-0 z-50 border-b border-white/8 bg-[#04050A]/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <img src="/images/flamecore-brandmark-512.png" alt="Flame Core Technologies LTD" className="h-11 w-11 rounded-2xl object-contain" />
            <div className="min-w-0">
              <div className="display truncate text-sm font-bold sm:text-base">FLAMECORE TECHNOLOGIES LTD</div>
              <div className="truncate text-[10px] uppercase tracking-[0.24em] text-[#FFB08F]">Software · AI · Automation · Digital Solutions</div>
            </div>
          </a>

          <nav className="hidden items-center gap-2 lg:flex">
            {navLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/6 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 sm:inline-flex"
            >
              WhatsApp
            </a>
            <a href="#contact" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#06070C] transition hover:bg-white/90">
              Get Started
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden">
          <img
            src="/images/flamecore-hero.jpg"
            alt="Cinematic premium digital product background"
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(4,5,10,0.92)_0%,rgba(4,5,10,0.76)_42%,rgba(4,5,10,0.58)_100%)]" />
          <div className="mx-auto grid min-h-[calc(100vh-84px)] max-w-7xl items-end gap-12 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-20 lg:pt-16">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-white/80">
                <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                Premium delivery for ambitious brands
              </div>
              <h1 className="display mt-6 max-w-4xl text-[clamp(3.2rem,7vw,6.5rem)] font-bold leading-[0.92]">
                Premium digital products engineered for growth
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/76 sm:text-xl">
                Flame Core Technologies LTD designs, builds, and supports polished digital experiences for businesses that want credible presentation,
                modern execution, and production-ready systems.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#contact"
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#FF5A1F] px-7 text-base font-bold text-white shadow-[0_24px_60px_-20px_rgba(255,90,31,0.75)] transition hover:bg-[#FF6D3A]"
                >
                  Start Your Project
                </a>
                <a
                  href="#blog"
                  className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/12 bg-black/25 px-7 text-base font-semibold text-white/85 transition hover:bg-white/8"
                >
                  Explore Our Blog
                </a>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ['Premium websites', 'Brand-led and conversion-ready'],
                  ['Custom platforms', 'Fit to your workflows'],
                  ['Company support', 'Hosting guidance on request'],
                ].map(([title, note]) => (
                  <div key={title} className="rounded-[24px] border border-white/10 bg-black/20 p-5 backdrop-blur-xl">
                    <div className="text-sm font-bold text-white">{title}</div>
                    <div className="mt-2 text-sm leading-6 text-white/62">{note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:justify-self-end">
              <div className="rounded-[32px] border border-white/10 bg-[#0A0D14]/76 p-6 shadow-[0_40px_120px_-28px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#FFB08F]">Why clients choose us</div>
                    <div className="mt-2 text-2xl font-semibold">A sharper standard of delivery</div>
                  </div>
                  <div className="rounded-2xl border border-[#22C55E]/25 bg-[#22C55E]/10 px-3 py-2 text-xs font-bold text-[#A7F3D0]">Live</div>
                </div>
                <div className="mt-6 grid gap-4">
                  {reasons.map((item) => (
                    <div key={item.title} className="rounded-[22px] border border-white/8 bg-white/4 p-5">
                      <div className="text-base font-semibold">{item.title}</div>
                      <div className="mt-2 text-sm leading-7 text-white/64">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="border-t border-white/8 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#FFB08F]">Services</div>
              <h2 className="display mt-4 text-4xl font-bold leading-tight sm:text-5xl">Premium delivery across design, software, and automation</h2>
              <p className="mt-5 text-lg leading-8 text-white/70">
                We help businesses move from rough ideas to launch-ready systems with clean execution, thoughtful product decisions, and modern engineering.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service) => (
                <article key={service.title} className="rounded-[28px] border border-white/10 bg-[#090C13] p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
                  <div className="text-xl font-semibold">{service.title}</div>
                  <p className="mt-3 text-sm leading-7 text-white/64">{service.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {service.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/8 bg-white/5 px-3 py-1 text-xs font-semibold text-white/75">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="work" className="border-t border-white/8 bg-[#070910] py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#FFB08F]">Our Process</div>
              <h2 className="display mt-4 text-4xl font-bold sm:text-5xl">How we move from concept to production</h2>
              <p className="mt-5 text-lg leading-8 text-white/68">
                Every project is handled with a delivery rhythm built for quality — from discovery and design through launch and long-term support.
              </p>
            </div>
            <div className="grid gap-4">
              {processSteps.map(([step, title, copy]) => (
                <div key={step} className="rounded-[24px] border border-white/10 bg-white/4 p-6">
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#FFB08F]">{step}</div>
                  <div className="mt-2 text-xl font-semibold">{title}</div>
                  <p className="mt-2 text-sm leading-7 text-white/64">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="reviews" className="border-t border-white/8 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#FFB08F]">Reviews & Testimonials</div>
              <h2 className="display mt-4 text-4xl font-bold sm:text-5xl">What premium collaboration should feel like</h2>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {testimonials.map((item) => (
                <article key={item.name + item.company} className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                  <div className="text-3xl leading-none text-[#FF7A45]">“</div>
                  <p className="mt-3 text-base leading-8 text-white/76">{item.quote}</p>
                  <div className="mt-6">
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-sm text-white/55">{item.company}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="blog" className="border-t border-white/8 bg-[#070910] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-3xl">
                <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#FFB08F]">Blog</div>
                <h2 className="display mt-4 text-4xl font-bold sm:text-5xl">A premium editorial space for insights, pictures, and video-led stories</h2>
                <p className="mt-5 text-lg leading-8 text-white/68">
                  The blog is now connected to the admin workflow so your team can create, edit, and publish content from one control panel.
                </p>
              </div>
              <a href="/admin" className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/10">
                Open Admin Dashboard
              </a>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {blogPosts.map((post) => (
                <article key={post.slug} className="overflow-hidden rounded-[30px] border border-white/10 bg-[#090C13]">
                  <div className="relative aspect-[16/9] overflow-hidden bg-black/30">
                    {post.mediaType === 'video' && isVideo(post.mediaUrl) ? (
                      <video controls className="h-full w-full object-cover" src={post.mediaUrl} poster={post.coverImageUrl} />
                    ) : (
                      <img
                        src={post.coverImageUrl || '/images/flamecore-hero.jpg'}
                        alt={post.title}
                        className="h-full w-full object-cover transition duration-700 hover:scale-105"
                      />
                    )}
                    <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                      {post.mediaType === 'video' ? 'Video story' : 'Editorial feature'}
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
                      <span>{post.authorName || 'Flame Core Editorial'}</span>
                      <span>•</span>
                      <span>{formatDate(post.publishedAt || post.createdAt)}</span>
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight">{post.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-white/66">{post.excerpt}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {(post.tags || []).map((tag) => (
                        <span key={tag} className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="border-t border-white/8 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-[#FFB08F]">Contact</div>
              <h2 className="display mt-4 text-4xl font-bold sm:text-5xl">Let’s build your next digital product with clarity and confidence</h2>
              <p className="mt-5 text-lg leading-8 text-white/68">
                Need a website, mobile product, internal platform, or custom software solution? Reach out and we will guide the next step.
              </p>
              <div className="mt-8 space-y-4">
                <a href={`mailto:${companyEmail}`} className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/4 px-5 py-4 transition hover:bg-white/8">
                  <span className="rounded-2xl bg-white/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white/75">Email</span>
                  <span className="font-semibold">{companyEmail}</span>
                </a>
                <a href={phoneTel} className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-white/4 px-5 py-4 transition hover:bg-white/8">
                  <span className="rounded-2xl bg-white/8 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-white/75">Call</span>
                  <span className="font-semibold">{phoneDisplay}</span>
                </a>
                <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-[22px] border border-[#22C55E]/30 bg-[#22C55E]/10 px-5 py-4 transition hover:bg-[#22C55E]/15">
                  <span className="rounded-2xl bg-[#22C55E]/18 px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#A7F3D0]">Chat</span>
                  <span className="font-semibold text-[#D9FFE8]">Message us on WhatsApp</span>
                </a>
              </div>
              <p className="mt-6 text-sm leading-7 text-white/52">
                Hosting services are handled through direct consultation so we can recommend the right production environment for each client.
              </p>
            </div>

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);

                setContactState('sending');
                try {
                  await submitContact({
                    name: String(data.get('name') || ''),
                    email: String(data.get('email') || ''),
                    company: String(data.get('company') || ''),
                    message: String(data.get('message') || ''),
                  });
                  form.reset();
                  setContactState('sent');
                  setContactNotice('Message received successfully. We will reply from our company email.');
                } catch (error) {
                  setContactState('error');
                  setContactNotice(error instanceof Error ? error.message : 'We could not submit your message right now.');
                }
              }}
              className="rounded-[32px] border border-white/10 bg-[#090C13] p-6 shadow-[0_28px_80px_-30px_rgba(0,0,0,0.8)] sm:p-8"
            >
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/48">Project inquiry form</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/55">Your Name</span>
                  <input name="name" required className="h-13 w-full rounded-2xl border border-white/10 bg-[#04050A] px-4 text-white outline-none transition focus:border-[#FF7A45]/60" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/55">Email</span>
                  <input type="email" name="email" required className="h-13 w-full rounded-2xl border border-white/10 bg-[#04050A] px-4 text-white outline-none transition focus:border-[#FF7A45]/60" />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/55">Company / Brand</span>
                <input name="company" className="h-13 w-full rounded-2xl border border-white/10 bg-[#04050A] px-4 text-white outline-none transition focus:border-[#FF7A45]/60" />
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/55">What do you need?</span>
                <textarea name="message" required rows={6} className="w-full rounded-[22px] border border-white/10 bg-[#04050A] px-4 py-4 text-white outline-none transition focus:border-[#FF7A45]/60" />
              </label>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={contactState === 'sending'}
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#FF5A1F] px-6 text-base font-bold text-white transition hover:bg-[#FF6D3A] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {contactState === 'sending' ? 'Sending...' : 'Send Inquiry'}
                </button>
                <a href={`mailto:${companyEmail}`} className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/12 bg-white/5 px-6 text-base font-semibold text-white/80 transition hover:bg-white/10">
                  Email us directly
                </a>
              </div>
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${
                contactState === 'error'
                  ? 'border-red-500/30 bg-red-500/8 text-red-200'
                  : 'border-white/8 bg-white/4 text-white/70'
              }`}>
                {contactNotice}
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 bg-[#070910]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-white/55 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>© {new Date().getFullYear()} FLAMECORE TECHNOLOGIES LTD. All rights reserved.</p>
          <div className="flex flex-wrap gap-4">
            <a href="/privacy-policy.html" className="transition hover:text-white">Privacy Policy</a>
            <a href="/terms-of-service.html" className="transition hover:text-white">Terms of Service</a>
            <a href="/admin" className="transition hover:text-white">Admin</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
