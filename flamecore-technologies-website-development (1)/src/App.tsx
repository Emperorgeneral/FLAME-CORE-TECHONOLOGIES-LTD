import { useEffect, useState } from 'react';
import { getHostingConsoleUrl } from '../../../src/utils/env-config';

export default function App() {
  const services = [
    {
      title: 'Website Development',
      desc: 'Modern company websites, landing pages, e-commerce stores, and web applications built for speed, conversion, and long-term growth.',
      tags: ['Responsive', 'SEO-ready', 'Fast'],
    },
    {
      title: 'Mobile App Development',
      desc: 'Cross-platform mobile applications with polished interfaces, smooth performance, and scalable architecture for Android and iOS.',
      tags: ['iOS', 'Android', 'Scalable'],
    },
    {
      title: 'Custom Software Solutions',
      desc: 'Tailored internal tools, dashboards, platforms, and workflows designed around your business processes and operational needs.',
      tags: ['Business Tools', 'Dashboards', 'APIs'],
    },
    {
      title: 'AI & Automation',
      desc: 'Smart systems, assistants, and automations that reduce repetitive work, improve efficiency, and help teams move faster.',
      tags: ['AI Tools', 'Automation', 'Workflows'],
    },
    {
      title: 'UI/UX Design',
      desc: 'Clean, user-focused digital experiences with modern visual systems, intuitive interactions, and consistent design language.',
      tags: ['User Experience', 'Interfaces', 'Design Systems'],
    },
    {
      title: 'Tech Consulting',
      desc: 'Technical strategy, architecture guidance, product planning, and execution support for startups, SMEs, and growing businesses.',
      tags: ['Strategy', 'Architecture', 'Planning'],
    },
    {
      title: 'Cloud & Hosting Solutions',
      desc: 'Reliable deployment, hosting, maintenance, and infrastructure support to keep your digital products secure and available.',
      tags: ['Cloud', 'Hosting', 'Support'],
    },
    {
      title: 'Web Hosting',
      desc: 'Fast, secure, and affordable web hosting for websites and applications. Includes domain setup, SSL, daily backups, and technical support.',
      tags: ['Domain', 'SSL', 'Backups'],
    },
  ];

  const reasons = [
    {
      title: 'Fast Delivery',
      desc: 'We move quickly with clear planning, practical execution, and efficient workflows that reduce time-to-launch.',
      metric: 'Fast',
    },
    {
      title: 'Modern Technologies',
      desc: 'We use reliable, up-to-date tools and frameworks that make your solution easier to scale and maintain.',
      metric: 'Modern',
    },
    {
      title: 'Reliable Support',
      desc: 'We stay available after launch to help with updates, fixes, improvements, and technical guidance.',
      metric: 'Support',
    },
    {
      title: 'Scalable Solutions',
      desc: 'Our systems are designed to grow with your business, whether you are serving tens or thousands of users.',
      metric: 'Scale',
    },
    {
      title: 'Clean UI/UX',
      desc: 'We build polished interfaces that are easy to understand, pleasant to use, and optimized for engagement.',
      metric: 'Clean',
    },
    {
      title: 'Affordable Pricing',
      desc: 'Premium digital solutions delivered with practical pricing models that create strong value for businesses.',
      metric: 'Value',
    },
  ];

  const navLinks = [
    { label: 'Services', href: '#services' },
    { label: 'About', href: '#about' },
    { label: 'Why Us', href: '#why-us' },
    { label: 'Contact', href: '#contact' },
  ];

  const mobilePages = [
    { id: 'home', label: 'Home' },
    { id: 'about', label: 'About' },
    { id: 'services', label: 'Services' },
    { id: 'hosting', label: 'Hosting' },
    { id: 'why', label: 'Why Us' },
    { id: 'contact', label: 'Contact' },
  ] as const;

  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024;
  });

  const [mobilePage, setMobilePage] = useState<'home' | 'about' | 'services' | 'hosting' | 'why' | 'contact'>(() => {
    if (typeof window === 'undefined') return 'home';
    const hash = window.location.hash.replace('#m-', '');
    return ['home', 'about', 'services', 'hosting', 'why', 'contact'].includes(hash)
      ? (hash as 'home' | 'about' | 'services' | 'hosting' | 'why' | 'contact')
      : 'home';
  });

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(media.matches);
    onChange();

    if (media.addEventListener) {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#m-', '');
      if (['home', 'about', 'services', 'why', 'contact'].includes(hash)) {
        setMobilePage(hash as 'home' | 'about' | 'services' | 'why' | 'contact');
      }
    };

    window.addEventListener('hashchange', onHashChange);
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const goToMobilePage = (page: 'home' | 'about' | 'services' | 'hosting' | 'why' | 'contact') => {
    if (!isDesktop && typeof window !== 'undefined') {
      setMobilePage(page);
      setMenuOpen(false);
      window.location.hash = `m-${page}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#05060A] text-white selection:bg-[#FF5A1F]/35 selection:text-white antialiased overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif; }
        h1, h2, h3, .display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
        html { scroll-behavior: smooth; }
        body { background: #05060A; }
        @keyframes float { 0%,100% { transform: translate3d(0,0,0) rotateX(0deg) rotateY(0deg);} 50% { transform: translate3d(0,-12px,0) rotateX(4deg) rotateY(-4deg);} }
        @keyframes drift { 0%,100% { transform: translate3d(0,0,0);} 50% { transform: translate3d(18px,-18px,0);} }
        @keyframes pulseGlow { 0%,100% { opacity: .45; } 50% { opacity: .95; } }
        @keyframes gridMove { from { background-position: 0 0; } to { background-position: 120px 120px; } }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .preserve-3d { transform-style: preserve-3d; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* Background */}
      <div className="fixed inset-0 -z-50 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_900px_at_75%_-10%,#FF5A1F12,transparent_60%),radial-gradient(900px_900px_at_10%_100%,#7C3AED12,transparent_65%),#05060A]" />
        <div
          className="absolute inset-0 opacity-[0.085] [background-image:linear-gradient(#ffffff_1px,transparent_1px),linear-gradient(90deg,#ffffff_1px,transparent_1px)] [background-size:64px_64px]"
          style={{ animation: 'gridMove 30s linear infinite' }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8 pt-4">
          <div className="flex items-center justify-between rounded-[22px] border border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_60px_-20px_rgba(0,0,0,0.8)] px-3 sm:px-4 h-[74px]">
            <a href="#" className="flex items-center gap-3 min-w-0">
              <img
                src="/images/logo.png"
                alt="FLAMECORE TECHNOLOGIES LTD"
                className="h-10 w-10 shrink-0 object-contain"
              />
              <div className="min-w-0 leading-[1.05]">
                <div className="display text-[16px] sm:text-[17px] font-[700] truncate">FLAMECORE TECHNOLOGIES LTD</div>
                <div className="text-[10px] font-[700] tracking-[0.18em] uppercase text-[#FF8A5B] truncate">Software • AI • Automation • Digital Solutions</div>
              </div>
            </a>

            <nav className="hidden lg:flex items-center gap-1 p-1 rounded-[16px] border border-white/[0.07] bg-white/[0.02]">
              {navLinks.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="px-[18px] h-[40px] inline-flex items-center rounded-[12px] text-[14px] font-[600] text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <a
                href="https://wa.me/2347071726082"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:grid h-[42px] w-[42px] place-items-center rounded-[14px] border border-white/[0.09] bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                aria-label="WhatsApp"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/85">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 2.03.55 3.93 1.51 5.58L2 22l4.52-1.48A9.9 9.9 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" opacity="0.18"/>
                  <path d="M17.1 14.1c-.2.56-1.15 1.08-1.61 1.16-.44.07-1 .11-1.62-.11-.37-.13-.85-.27-1.47-.53-2.61-1.13-4.31-3.77-4.44-3.95-.13-.18-1.05-1.4-1.05-2.67 0-1.27.67-1.89.91-2.15.24-.26.52-.32.69-.32.17 0 .34 0 .49.01.16 0 .37-.06.58.45.21.51.73 1.78.79 1.91.07.13.1.28.02.45-.08.17-.13.27-.26.42-.13.15-.27.34-.38.45-.13.13-.27.27-.11.54.16.27.72 1.19 1.54 1.93 1.06.95 1.95 1.24 2.22 1.38.27.13.44.11.61-.06.16-.18.71-.83.9-1.12.19-.29.37-.24.63-.14.26.09 1.6.75 1.87.89.27.14.45.21.51.32.06.11.06.64-.12 1.26z" fill="currentColor"/>
                </svg>
              </a>
              <a
                href="#contact"
                onClick={(e) => {
                  if (!isDesktop) {
                    e.preventDefault();
                    goToMobilePage('contact');
                  }
                }}
                className="hidden sm:inline-flex h-[42px] px-[18px] items-center rounded-[14px] bg-white text-[#090B0F] font-[700] text-[14px] hover:bg-white/90 transition-all active:scale-[0.98]"
              >
                Get Started
              </a>

              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                className="lg:hidden h-[42px] w-[42px] grid place-items-center rounded-[14px] border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
              >
                <div className="relative h-[14px] w-[18px]">
                  <span className={`absolute left-0 right-0 h-[2px] rounded-full bg-white transition-all duration-300 ${menuOpen ? 'top-[6px] rotate-45' : 'top-0'}`} />
                  <span className={`absolute left-0 right-0 top-[6px] h-[2px] rounded-full bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
                  <span className={`absolute left-0 right-0 h-[2px] rounded-full bg-white transition-all duration-300 ${menuOpen ? 'top-[6px] -rotate-45' : 'top-[12px]'}`} />
                </div>
              </button>
            </div>
          </div>

          {/* Mobile / tablet dropdown menu */}
          <div
            className={`lg:hidden overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${
              menuOpen ? 'max-h-[520px] opacity-100 translate-y-0 mt-3' : 'max-h-0 opacity-0 -translate-y-2 mt-0'
            }`}
          >
            <div className="rounded-[22px] border border-white/[0.08] bg-[#0B0E14]/92 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_30px_80px_-20px_rgba(0,0,0,0.85)] p-3">
              <div className="grid gap-1.5">
                {mobilePages.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToMobilePage(item.id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 h-[52px] rounded-[14px] border text-[14px] font-[700] tracking-[-0.005em] transition-colors ${
                      mobilePage === item.id
                        ? 'border-[#FF7A45]/40 bg-[#FF5A1F] text-white'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/85 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className={mobilePage === item.id ? 'text-white' : 'text-white/55'}>→</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => goToMobilePage('contact')}
                className="w-full flex items-center justify-between gap-3 px-4 h-[52px] rounded-[14px] border border-[#FF7A45]/40 bg-[#FF5A1F] text-[14px] font-[700] tracking-[-0.005em] text-white"
              >
                <span>Get Started</span>
                <span className="text-white">→</span>
              </button>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href="tel:+2347071726082"
                  className="h-[48px] inline-flex items-center justify-center gap-2 rounded-[14px] border border-white/[0.10] bg-white/[0.04] text-[13px] font-[700] text-white/85"
                >
                  Call us
                </a>
                <a
                  href="https://wa.me/2347071726082"
                  target="_blank"
                  rel="noreferrer"
                  className="h-[48px] inline-flex items-center justify-center gap-2 rounded-[14px] bg-[#22C55E] text-[#04230F] text-[13px] font-[800]"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className={`${isDesktop || mobilePage === 'home' ? 'block' : 'hidden'} relative pt-[76px] md:pt-[96px] pb-[92px] md:pb-[120px] overflow-hidden`}>
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 backdrop-blur-xl">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-[#22C55E]" style={{ animation: 'pulseGlow 1.8s ease-in-out infinite' }} />
                  <span className="relative h-2 w-2 rounded-full bg-[#22C55E]" />
                </span>
                <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-white/80">Available for new projects</span>
              </div>

              <h1 className="display mt-6 text-[50px] md:text-[72px] lg:text-[84px] leading-[0.96] font-[700] tracking-[-0.04em] text-white">
                Build modern software
                <span className="block bg-[linear-gradient(92deg,#FFFFFF_0%,#E7E7EA_45%,#C9CBD2_100%)] bg-clip-text text-transparent">
                  without compromise
                </span>
              </h1>

              <p className="mt-7 max-w-[620px] text-[18px] leading-[1.75] text-white/72">
                FLAMECORE TECHNOLOGIES LTD delivers innovation-driven software solutions for modern businesses. We build websites, mobile apps, custom software, AI tools, automation systems, and digital platforms that are fast, scalable, and professional.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#contact"
                  onClick={(e) => {
                    if (!isDesktop) {
                      e.preventDefault();
                      goToMobilePage('contact');
                    }
                  }}
                  className="group h-[52px] px-[24px] inline-flex items-center gap-2 rounded-[16px] bg-[#FF5A1F] text-white font-[700] shadow-[0_16px_50px_-8px_rgba(255,90,31,0.55)] hover:bg-[#FF6F3A] transition-all"
                >
                  Get Started
                  <span className="text-white/90 transition-transform group-hover:translate-x-[2px]">→</span>
                </a>
                <a
                  href="#contact"
                  onClick={(e) => {
                    if (!isDesktop) {
                      e.preventDefault();
                      goToMobilePage('contact');
                    }
                  }}
                  className="h-[52px] px-[24px] inline-flex items-center rounded-[16px] border border-white/[0.11] bg-white/[0.05] text-[15px] font-[600] text-white/90 hover:bg-white/[0.08] transition-all"
                >
                  Contact Us
                </a>
                <a
                  href="#services"
                  onClick={(e) => {
                    if (!isDesktop) {
                      e.preventDefault();
                      goToMobilePage('services');
                    }
                  }}
                  className="h-[52px] px-[24px] inline-flex items-center rounded-[16px] text-[15px] font-[600] text-white/75 hover:text-white transition-colors"
                >
                  View Services
                </a>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-5 max-w-[520px] border-t border-white/[0.07] pt-7">
                {[
                  { value: '80+', label: 'Projects delivered' },
                  { value: '99.8%', label: 'Uptime focus' },
                  { value: '24/7', label: 'Support mindset' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="display text-[28px] font-[700] leading-none">{item.value}</div>
                    <div className="mt-1 text-[11px] font-[700] tracking-[0.14em] uppercase text-white/55">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3D visual side */}
            <div className="relative">
              <div className="absolute inset-0 -z-10">
                <div className="absolute top-[10%] right-[5%] h-[180px] w-[180px] rounded-full bg-[#FF5A1F]/20 blur-[70px]" />
                <div className="absolute bottom-[0%] left-[0%] h-[220px] w-[220px] rounded-full bg-[#7C3AED]/15 blur-[90px]" />
              </div>

              <div className="relative mx-auto max-w-[540px] preserve-3d" style={{ perspective: '1400px' }}>
                <div className="absolute inset-x-0 top-[18%] mx-auto h-[440px] w-[440px] rounded-full border border-white/[0.05] bg-white/[0.02] blur-[1px]" />

                <div className="relative rounded-[28px] border border-white/[0.10] bg-[#0C1018]/85 p-[14px] backdrop-blur-2xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.05)] hover:translate-y-[-2px] transition-transform">
                  <div className="relative aspect-[16/10] rounded-[20px] overflow-hidden border border-white/[0.08] bg-[#090C12]">
                    <img
                      src="/images/flamecore-hero.jpg"
                      alt="FLAMECORE TECHNOLOGIES LTD team collaborating in a modern tech office"
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="eager"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,0.18),rgba(5,6,10,0.38)_35%,rgba(5,6,10,0.82)_100%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_10%_10%,rgba(255,90,31,0.22),transparent_60%),radial-gradient(700px_400px_at_90%_90%,rgba(124,58,237,0.18),transparent_65%)]" />

                    <div className="absolute inset-x-0 top-0 h-11 border-b border-white/[0.08] bg-[#0A0D12]/55 backdrop-blur flex items-center px-3 gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] border border-black/30" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] border border-black/30" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] border border-black/30" />
                      <span className="ml-2 text-[11px] font-[600] tracking-wide text-white/70">inside flamecore</span>
                    </div>

                    <div className="absolute left-4 top-16 rounded-full border border-white/[0.12] bg-black/30 backdrop-blur-xl px-3 h-8 inline-flex items-center text-[11px] font-[700] tracking-[0.12em] uppercase text-white/85">
                      Real team atmosphere
                    </div>

                    <div className="absolute left-5 right-5 bottom-5">
                      <div className="rounded-[22px] border border-white/[0.10] bg-black/30 backdrop-blur-2xl p-4 sm:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                        <div className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FFB295]">Built with strategy, design, and engineering</div>
                        <h3 className="display mt-2 text-[24px] sm:text-[28px] font-[700] leading-[1.05] tracking-[-0.025em] text-white">
                          A real company feel
                          <span className="block text-white/70">for a real technology brand</span>
                        </h3>
                        <div className="mt-4 flex flex-wrap gap-2.5">
                          {['Web', 'Mobile', 'AI', 'Automation'].map((item) => (
                            <span key={item} className="h-[28px] px-3 inline-flex items-center rounded-full border border-white/[0.10] bg-white/[0.08] text-[11px] font-[700] tracking-[0.08em] uppercase text-white/85">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-[14px] h-[10px] rounded-[12px] bg-[#0A0D12] border border-white/[0.08]" />
                </div>

                <div className="absolute left-[-4%] bottom-[-20px] w-[42%] rotate-[-11deg] preserve-3d" style={{ animation: 'drift 10s ease-in-out infinite' }}>
                  <div className="rounded-[30px] border border-white/[0.10] bg-[#0C1018]/85 p-[10px] backdrop-blur-2xl shadow-[0_28px_80px_-20px_rgba(0,0,0,0.9)]">
                    <div className="relative aspect-[9/18] rounded-[24px] border border-white/[0.08] bg-[#090C12] overflow-hidden">
                      <img
                        src="/images/flamecore-about.jpg"
                        alt="Modern workspace and software dashboard preview"
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,0.1),rgba(5,6,10,0.55)_70%,rgba(5,6,10,0.8))]" />
                      <div className="absolute left-3 right-3 top-3 h-3 rounded-full bg-black/30 backdrop-blur" />
                      <div className="absolute left-3 right-3 bottom-3 rounded-[16px] border border-white/[0.10] bg-black/35 backdrop-blur-xl p-3">
                        <div className="text-[10px] font-[700] tracking-[0.12em] uppercase text-white/75">Product preview</div>
                        <div className="mt-1 text-[12px] font-[600] leading-[1.35] text-white/90">Clean UI and premium software presentation</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute right-[6%] top-[-16px] h-[88px] w-[88px]" style={{ animation: 'float 8s ease-in-out infinite' }}>
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#FFA27A,#FF3C0A_60%,#FF3C0A_100%)] shadow-[0_18px_60px_-10px_rgba(255,90,31,0.8)]" />
                  <div className="absolute inset-[7px] rounded-full bg-[#0A0D12]/70 border border-white/[0.18] backdrop-blur" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Motion ticker */}
      <section className={`${isDesktop || mobilePage === 'home' ? 'block' : 'hidden'} py-6`}>
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#0B0E14]/70">
            <div className="flex min-w-max items-center gap-10 py-[14px] whitespace-nowrap" style={{ animation: 'marquee 22s linear infinite' }}>
              {[...Array(2)].flatMap((_, outerIndex) =>
                ['Innovation', 'Software Solutions', 'Web Development', 'Automation', 'AI Tools', 'Digital Solutions', 'Modern Technology Services'].map((item, index) => (
                  <span key={`${outerIndex}-${index}`} className="text-[13px] font-[700] tracking-[0.16em] uppercase text-white/70">
                    {item}
                  </span>
                )),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className={`${isDesktop || mobilePage === 'about' ? 'block' : 'hidden'} py-[90px] md:py-[120px] border-t border-white/[0.06]`}>
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8 grid lg:grid-cols-[1.02fr_0.98fr] gap-16 items-center">
          <div className="order-2 lg:order-1">
            <div className="relative rounded-[28px] border border-white/[0.08] bg-[#0B0E14]/80 p-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_30px_120px_-20px_rgba(0,0,0,0.85)]">
              <div className="relative aspect-[16/11] rounded-[20px] overflow-hidden border border-white/[0.08] bg-[#090C12]">
                <img
                  src="/images/flamecore-about.jpg"
                  alt="Premium workspace with software dashboard and modern digital tools"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,0.18),rgba(5,6,10,0.36)_35%,rgba(5,6,10,0.82)_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(500px_260px_at_18%_10%,#FF5A1F2A,transparent_60%),radial-gradient(700px_360px_at_90%_90%,#7C3AED22,transparent_60%)]" />

                <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-4 rounded-[16px] border border-white/[0.10] bg-black/28 backdrop-blur-xl px-4 h-12">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
                  </div>
                  <span className="text-[11px] font-[700] tracking-[0.12em] uppercase text-white/70">Real product workspace</span>
                </div>

                <div className="absolute left-5 right-5 bottom-5 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
                  <div className="rounded-[20px] border border-white/[0.10] bg-black/32 backdrop-blur-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FFB295]">Inside the build process</div>
                    <h3 className="display mt-2 text-[24px] font-[700] leading-[1.08] tracking-[-0.025em] text-white">
                      Strategy, design, and software working together
                    </h3>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
                      {['Innovation', 'Software', 'Automation', 'AI Tools'].map((item) => (
                        <span key={item} className="h-[28px] px-3 inline-flex items-center rounded-full border border-white/[0.10] bg-white/[0.08] text-[11px] font-[700] tracking-[0.08em] uppercase text-white/84">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-white/[0.10] bg-black/34 backdrop-blur-xl p-4 min-w-[150px]">
                    <div className="text-[11px] font-[700] tracking-[0.12em] uppercase text-white/60">Realistic feel</div>
                    <div className="display mt-1 text-[28px] font-[700] leading-none text-white">Premium</div>
                    <div className="mt-1 text-[12px] leading-[1.5] text-white/68">Visuals that help the company feel established and trustworthy.</div>
                  </div>
                </div>

                <div className="absolute right-[-30px] bottom-[-30px] h-[160px] w-[160px] rounded-full bg-[#FF5A1F]/25 blur-[70px]" />
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#7C3AED]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-white/80">About Section</span>
            </div>
            <h2 className="display mt-4 text-[40px] md:text-[52px] leading-[1.02] font-[700] tracking-[-0.03em]">
              A modern tech company focused on
              <span className="block text-white/65">innovation and dependable execution</span>
            </h2>
            <p className="mt-5 text-[17px] leading-[1.78] text-white/74 max-w-[620px]">
              FLAMECORE TECHNOLOGIES LTD helps businesses grow through innovation, software solutions, web development, automation, AI tools, digital solutions, and modern technology services. We combine strategy, design, and engineering to create experiences that look premium, work smoothly, and scale with confidence.
            </p>

            <div className="mt-8 space-y-5">
              {[
                {
                  title: 'Innovation with practical impact',
                  desc: 'We focus on technology that solves real business problems and improves efficiency, visibility, and growth.',
                },
                {
                  title: 'Software built for the real world',
                  desc: 'From websites to custom systems, we create tools that are dependable, maintainable, and ready for production.',
                },
                {
                  title: 'Design and engineering together',
                  desc: 'Our process combines clean UI/UX, responsive design, and strong development standards from the start.',
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-4">
                  <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[#FF5A1F] ring-4 ring-[#FF5A1F]/20" />
                  <div>
                    <h3 className="text-[16px] font-[700] tracking-[-0.01em] text-white">{item.title}</h3>
                    <p className="mt-1 text-[14.8px] leading-[1.7] text-white/66">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className={`${isDesktop || mobilePage === 'services' ? 'block' : 'hidden'} py-[90px] md:py-[120px] border-t border-white/[0.06] bg-[#07090F]/60`}>
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[760px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FF7A45]/25 bg-[#FF7A45]/10 px-3 py-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF7A45]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FF9B76]">Services Section</span>
            </div>
            <h2 className="display mt-4 text-[40px] md:text-[52px] font-[700] leading-[1.02] tracking-[-0.03em]">
              Professional services designed for
              <span className="block text-white/65">modern businesses</span>
            </h2>
            <p className="mt-5 text-[17px] leading-[1.75] text-white/72 max-w-[620px]">
              We provide complete digital services that help brands launch faster, operate better, and present themselves professionally online.
            </p>
          </div>

          <div className="mt-12 grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
            {services.map((service, index) => (
              <div
                key={service.title}
                className="group relative rounded-[24px] border border-white/[0.08] bg-[#0B0E14]/72 p-6 hover:bg-[#0D1119] hover:border-white/[0.14] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                style={{ transform: `translateZ(${index % 3 === 0 ? 10 : index % 3 === 1 ? 20 : 0}px)` }}
              >
                <div className="absolute inset-0 rounded-[24px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-[radial-gradient(320px_120px_at_80%_-10%,rgba(255,90,31,0.12),transparent_70%)]" />
                <div className="flex items-start justify-between gap-4">
                  <h3 className="display text-[20px] font-[700] leading-[1.2] tracking-[-0.015em]">{service.title}</h3>
                  <div className="h-10 w-10 shrink-0 grid place-items-center rounded-[14px] border border-white/[0.10] bg-white/[0.05] text-white/75 group-hover:text-white group-hover:bg-white/[0.08] transition-all">
                    ↗
                  </div>
                </div>
                <p className="mt-3 text-[15px] leading-[1.7] text-white/68">{service.desc}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-[11px] h-[27px] inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[11px] font-[700] tracking-[0.02em] text-white/75"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Hosting */}
      <section id="hosting" className={`${isDesktop || mobilePage === 'hosting' ? 'block' : 'hidden'} py-[90px] md:py-[120px] border-t border-white/[0.06] bg-[#07090F]/60`}>
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[760px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FF7A45]/25 bg-[#FF7A45]/10 px-3 py-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF7A45]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FF9B76]">Hosting Options</span>
            </div>
            <h2 className="display mt-4 text-[40px] md:text-[52px] font-[700] leading-[1.02] tracking-[-0.03em]">
              Fast, secure, and reliable
              <span className="block text-white/65">hosting for your digital products</span>
            </h2>
            <p className="mt-5 text-[17px] leading-[1.75] text-white/72 max-w-[620px]">
              We provide complete hosting solutions including domain registration, SSL certificates, daily backups, performance optimization, and 24/7 technical support.
            </p>
          </div>

          <div className="mt-10 grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: 'Standard Hosting', desc: 'Perfect for small websites and landing pages. Includes SSL, email, and daily backups.', price: '₦5,000/mo' },
              { title: 'Business Hosting', desc: 'Optimized for growing businesses. Faster servers, staging environments, and priority support.', price: '₦15,000/mo' },
              { title: 'VPS Hosting', desc: 'Dedicated resources for high-traffic applications. Full root access and custom configurations.', price: '₦35,000/mo' },
              { title: 'Enterprise Hosting', desc: 'High-availability clusters with load balancing, auto-scaling, and SLA guarantees.', price: 'Custom' },
            ].map((plan) => (
              <div key={plan.title} className="group relative rounded-[24px] border border-white/[0.08] bg-[#0B0E14]/72 p-6 hover:bg-[#0D1119] hover:border-white/[0.14] transition-all">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="display text-[20px] font-[700] leading-[1.2] tracking-[-0.015em]">{plan.title}</h3>
                </div>
                <p className="mt-3 text-[15px] leading-[1.7] text-white/68">{plan.desc}</p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="rounded-[12px] border border-[#FF7A45]/30 bg-[#FF7A45]/10 px-3 py-1.5 text-[13px] font-[700] tracking-[0.05em] text-[#FF9B76]">{plan.price}</span>
                  <a href={getHostingConsoleUrl()} target="_blank" rel="noopener noreferrer" className="h-[38px] px-4 inline-flex items-center rounded-[12px] border border-white/[0.10] bg-white/[0.05] text-[13px] font-[700] hover:bg-white/[0.08] transition-colors">
                    Get Started
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* CTA to Flame Core Hosting Platform */}
          <div className="mt-16 rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-[#FF5A1F]/10 to-[#7C3AED]/5 p-8 md:p-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FF7A45]/25 bg-[#FF7A45]/10 px-3 py-1.5 mb-4">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF7A45]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FF9B76]">Flame Core Hosting Platform</span>
            </div>
            <h3 className="display text-[36px] md:text-[44px] font-[700] leading-[1.1] tracking-[-0.03em] mt-3">
              Launch your apps with one click
            </h3>
            <p className="mt-4 text-[16px] leading-[1.7] text-white/72 max-w-[640px] mx-auto">
              Flame Core provides a modern, GitHub-connected hosting platform. Deploy from git, scale instantly, and manage everything from one intuitive dashboard.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href={getHostingConsoleUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="group h-[52px] px-[28px] inline-flex items-center gap-2 rounded-[16px] bg-[#FF5A1F] text-white font-[700] shadow-[0_16px_50px_-8px_rgba(255,90,31,0.55)] hover:bg-[#FF6F3A] transition-all"
              >
                Access Hosting Platform
                <span className="text-white/90 transition-transform group-hover:translate-x-[2px]">→</span>
              </a>
              <a
                href="#contact"
                onClick={(e) => {
                  if (!isDesktop) {
                    e.preventDefault();
                    goToMobilePage('contact');
                  }
                }}
                className="h-[52px] px-[28px] inline-flex items-center rounded-[16px] border border-white/[0.11] bg-white/[0.05] text-[15px] font-[600] text-white/90 hover:bg-white/[0.08] transition-all"
              >
                Contact Sales
              </a>
            </div>
            <p className="mt-6 text-[13px] leading-[1.6] text-white/60">
              ✓ Free tier available &nbsp; • &nbsp; ✓ GitHub + GitLab support &nbsp; • &nbsp; ✓ Custom domains &nbsp; • &nbsp; ✓ 24/7 Support
            </p>
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section id="why-us" className={`${isDesktop || mobilePage === 'why' ? 'block' : 'hidden'} py-[90px] md:py-[120px] border-t border-white/[0.06] relative overflow-hidden`}>
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(900px_500px_at_85%_-10%,#7C3AED14,transparent_60%)]" />
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8">
          <div className="max-w-[760px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#22C55E]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-white/80">Why Choose Us</span>
            </div>
            <h2 className="display mt-4 text-[40px] md:text-[52px] font-[700] leading-[1.02] tracking-[-0.03em]">
              Trusted by businesses that want
              <span className="block text-white/65">quality, speed, and clarity</span>
            </h2>
            <p className="mt-5 text-[17px] leading-[1.75] text-white/72 max-w-[620px]">
              We focus on delivering business value with clean execution, reliable support, and technology decisions that make sense for growth.
            </p>
          </div>

          <div className="mt-12 grid gap-[16px] md:grid-cols-2 xl:grid-cols-3">
            {reasons.map((reason, index) => (
              <div
                key={reason.title}
                className="relative rounded-[22px] border border-white/[0.08] bg-[#0B0E14]/72 p-6 hover:bg-[#0D1119] hover:border-white/[0.14] transition-all"
                style={{ transform: `translateY(${index % 2 === 0 ? '0px' : '10px'})` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="display text-[19px] font-[700] tracking-[-0.015em] leading-[1.25]">{reason.title}</h3>
                  <div className="rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11px] font-[700] tracking-[0.12em] uppercase text-white/70">
                    {reason.metric}
                  </div>
                </div>
                <p className="mt-3 text-[14.8px] leading-[1.7] text-white/66">{reason.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className={`${isDesktop || mobilePage === 'contact' ? 'block' : 'hidden'} py-[96px] md:py-[128px] border-t border-white/[0.06] relative overflow-hidden`}>
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(900px_600px_at_80%_-20%,#FF5A1F20,transparent_60%),radial-gradient(800px_600px_at_-10%_120%,#7C3AED16,transparent_60%)]" />
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8 grid lg:grid-cols-[1.03fr_0.97fr] gap-16 items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FF7A45]/25 bg-[#FF7A45]/10 px-3 py-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF7A45]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FF9B76]">Contact Section</span>
            </div>
            <h2 className="display mt-4 text-[42px] md:text-[56px] font-[700] leading-[1.02] tracking-[-0.03em]">
              Let’s discuss your next
              <span className="block text-white/65">digital project</span>
            </h2>
            <p className="mt-5 max-w-[560px] text-[17px] leading-[1.75] text-white/74">
              Whether you need a website, mobile app, custom software platform, AI solution, or automation workflow, we’re ready to help you move from idea to execution.
            </p>

            <div className="mt-8 overflow-hidden rounded-[24px] border border-white/[0.10] bg-[#0B0E14]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="relative aspect-[16/9]">
                <img
                  src="/images/flamecore-contact.jpg"
                  alt="Professional project consultation meeting at FLAMECORE TECHNOLOGIES LTD"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,0.08),rgba(5,6,10,0.28)_45%,rgba(5,6,10,0.82)_100%)]" />
                <div className="absolute left-4 top-4 rounded-full border border-white/[0.10] bg-black/30 backdrop-blur-xl px-3 h-8 inline-flex items-center text-[11px] font-[700] tracking-[0.12em] uppercase text-white/80">
                  Real consultation feel
                </div>
                <div className="absolute left-4 right-4 bottom-4 rounded-[18px] border border-white/[0.10] bg-black/32 backdrop-blur-2xl p-4">
                  <div className="text-[11px] font-[700] tracking-[0.14em] uppercase text-[#FFB295]">Project discovery</div>
                  <div className="mt-1 text-[15px] font-[700] tracking-[-0.01em] text-white">Professional conversations that turn ideas into working solutions.</div>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <a href="mailto:flamecoretechnologies@gmail.com" className="flex items-center gap-4 rounded-[18px] border border-white/[0.10] bg-white/[0.04] px-[18px] h-[62px] hover:bg-white/[0.06] transition-colors">
                <span className="h-[38px] w-[38px] grid place-items-center rounded-[14px] bg-white/[0.06] border border-white/[0.10]">✉️</span>
                <div>
                  <div className="text-[12px] font-[700] tracking-[0.12em] uppercase text-white/60">Email</div>
                  <div className="text-[15px] font-[600] tracking-[-0.01em]">flamecoretechnologies@gmail.com</div>
                </div>
              </a>
              <a href="tel:+2347071726082" className="flex items-center gap-4 rounded-[18px] border border-white/[0.10] bg-white/[0.04] px-[18px] h-[62px] hover:bg-white/[0.06] transition-colors">
                <span className="h-[38px] w-[38px] grid place-items-center rounded-[14px] bg-white/[0.06] border border-white/[0.10]">☎️</span>
                <div>
                  <div className="text-[12px] font-[700] tracking-[0.12em] uppercase text-white/60">Phone</div>
                  <div className="text-[15px] font-[600] tracking-[-0.01em]">07071726082</div>
                </div>
              </a>
              <a href="https://wa.me/2347071726082?text=Hello%20FLAMECORE%20TECHNOLOGIES%20LTD%2C%20I%20would%20like%20to%20make%20an%20inquiry." target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-[18px] border border-[#22C55E]/40 bg-[#22C55E]/10 px-[18px] h-[62px] hover:bg-[#22C55E]/15 transition-colors">
                <span className="h-[38px] w-[38px] grid place-items-center rounded-[14px] bg-[#22C55E]/20 border border-[#22C55E]/35 text-[#A7F3D0]">💬</span>
                <div>
                  <div className="text-[12px] font-[700] tracking-[0.12em] uppercase text-[#A7F3D0]/85">WhatsApp</div>
                  <div className="text-[15px] font-[700] tracking-[-0.01em]">Chat with us on WhatsApp →</div>
                </div>
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-[1px] rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] blur-[1px] opacity-80" />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const data = new FormData(form);
                const name = (data.get('name') as string) || '';
                const email = (data.get('email') as string) || '';
                const company = (data.get('company') as string) || '';
                const message = (data.get('message') as string) || '';
                const subject = encodeURIComponent(`New inquiry from ${name}${company ? ` — ${company}` : ''}`);
                const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nCompany: ${company}\n\nMessage:\n${message}\n\n— Sent from FLAMECORE TECHNOLOGIES LTD website`);
                window.location.href = `mailto:flamecoretechnologies@gmail.com?subject=${subject}&body=${body}`;
              }}
              className="relative rounded-[26px] border border-white/[0.10] bg-[#0B0E14]/90 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_35px_120px_-20px_rgba(0,0,0,0.85)] p-[26px] sm:p-[30px]"
            >
              <div className="flex items-center gap-3 mb-6">
                <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E] shadow-[0_0_0_5px_rgba(34,197,94,0.18)]" />
                <span className="text-[12px] font-[700] tracking-[0.16em] uppercase text-white/80">Contact Form</span>
              </div>

              <div className="grid gap-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-[700] tracking-[0.1em] uppercase text-white/60 mb-2">Your Name</label>
                    <input name="name" required placeholder="Jane Doe" className="w-full h-[48px] px-[14px] rounded-[14px] bg-[#0A0D12] border border-white/[0.10] text-[15px] outline-none placeholder:text-white/35 focus:border-[#FF7A45]/70 focus:ring-[3px] focus:ring-[#FF7A45]/20 transition" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-[700] tracking-[0.1em] uppercase text-white/60 mb-2">Email Address</label>
                    <input type="email" name="email" required placeholder="jane@company.com" className="w-full h-[48px] px-[14px] rounded-[14px] bg-[#0A0D12] border border-white/[0.10] text-[15px] outline-none placeholder:text-white/35 focus:border-[#FF7A45]/70 focus:ring-[3px] focus:ring-[#FF7A45]/20 transition" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-[700] tracking-[0.1em] uppercase text-white/60 mb-2">Company / Project</label>
                  <input name="company" placeholder="Your company or project name" className="w-full h-[48px] px-[14px] rounded-[14px] bg-[#0A0D12] border border-white/[0.10] text-[15px] outline-none placeholder:text-white/35 focus:border-[#FF7A45]/70 focus:ring-[3px] focus:ring-[#FF7A45]/20 transition" />
                </div>

                <div>
                  <label className="block text-[11px] font-[700] tracking-[0.1em] uppercase text-white/60 mb-2">Message</label>
                  <textarea name="message" required rows={5} placeholder="Tell us about your project, goals, and timeline..." className="w-full px-[14px] py-[12px] rounded-[14px] bg-[#0A0D12] border border-white/[0.10] text-[15px] outline-none placeholder:text-white/35 focus:border-[#FF7A45]/70 focus:ring-[3px] focus:ring-[#FF7A45]/20 transition resize-none leading-[1.6]" />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button type="submit" className="flex-1 h-[52px] inline-flex items-center justify-center rounded-[16px] bg-[#FF5A1F] text-white font-[700] text-[15px] hover:bg-[#FF6E3A] transition-all shadow-[0_16px_50px_-8px_rgba(255,90,31,0.6)]">
                    Send Inquiry
                  </button>
                  <a href="https://wa.me/2347071726082?text=Hello%20FLAMECORE%20TECHNOLOGIES%20LTD%2C%20I%20would%20like%20to%20make%20an%20inquiry." target="_blank" rel="noreferrer" className="h-[52px] px-[18px] inline-flex items-center justify-center rounded-[16px] bg-white/[0.06] border border-white/[0.12] font-[700] hover:bg-white/[0.08] transition-all">
                    WhatsApp Button
                  </a>
                </div>

                <p className="text-[12px] leading-[1.6] text-white/55">
                  Lightweight email-based contact handling. Your inquiry will be sent directly to flamecoretechnologies@gmail.com.
                </p>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#080B11]">
        <div className="mx-auto max-w-[1280px] px-6 sm:px-8 py-[56px]">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="relative h-10 w-10 shrink-0">
                  <div className="absolute inset-0 rounded-[14px] bg-[conic-gradient(from_220deg,#FF5A1F,#FF8A5B,#FF5A1F)] blur-[10px] opacity-75" />
                  <img
                    src="/images/logo.png"
                    alt="FLAMECORE TECHNOLOGIES LTD"
                    className="relative h-full w-full object-contain"
                  />
                </div>
                <div>
                  <div className="display text-[17px] font-[700] tracking-[-0.02em]">FLAMECORE TECHNOLOGIES LTD</div>
                  <div className="text-[10px] font-[700] tracking-[0.18em] uppercase text-white/50">Professional digital solutions</div>
                </div>
              </div>
              <p className="mt-4 max-w-[340px] text-[14px] leading-[1.7] text-white/68">
                Modern software solutions, web development, mobile apps, automation, AI tools, and digital services for ambitious businesses.
              </p>
            </div>

            <div>
              <h4 className="text-[11px] font-[700] tracking-[0.16em] uppercase text-white/60 mb-3">Company</h4>
              <ul className="space-y-2 text-[14px] text-white/75">
                <li><a href="#about" onClick={(e) => { if (!isDesktop) { e.preventDefault(); goToMobilePage('about'); } }} className="hover:text-white transition-colors">About</a></li>
                <li><a href="#services" onClick={(e) => { if (!isDesktop) { e.preventDefault(); goToMobilePage('services'); } }} className="hover:text-white transition-colors">Services</a></li>
                <li><a href="#hosting" onClick={(e) => { if (!isDesktop) { e.preventDefault(); goToMobilePage('hosting'); } }} className="hover:text-white transition-colors">Hosting</a></li>
                <li><a href="#why-us" onClick={(e) => { if (!isDesktop) { e.preventDefault(); goToMobilePage('why'); } }} className="hover:text-white transition-colors">Why Choose Us</a></li>
                <li><a href="#contact" onClick={(e) => { if (!isDesktop) { e.preventDefault(); goToMobilePage('contact'); } }} className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-[700] tracking-[0.16em] uppercase text-white/60 mb-3">Services</h4>
              <ul className="space-y-2 text-[14px] text-white/75">
                <li>Website Development</li>
                <li>Mobile App Development</li>
                <li>Custom Software Solutions</li>
                <li>AI & Automation</li>
                <li>Web Hosting</li>
                <li>Cloud & Hosting Solutions</li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-[700] tracking-[0.16em] uppercase text-white/60 mb-3">Socials</h4>
              <ul className="space-y-2 text-[14px] text-white/75">
                <li><a href="#" className="hover:text-white transition-colors">LinkedIn</a></li>
                <li><a href="#" className="hover:text-white transition-colors">X / Twitter</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Facebook</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-white/[0.07] flex flex-col md:flex-row items-center justify-between gap-3 text-[13px] text-white/58">
            <p>© {new Date().getFullYear()} FLAMECORE TECHNOLOGIES LTD. All rights reserved.</p>
            <p>Crafted for a modern international tech company feel.</p>
          </div>
        </div>
      </footer>

      {/* Mobile quick bar */}

    </div>
  );
}
