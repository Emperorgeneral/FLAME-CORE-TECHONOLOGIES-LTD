import { useMemo, useState } from 'react';

const COMPANY_EMAIL = 'admin@flamecoretechltd.com';

export default function AdminPortal() {
  const [email, setEmail] = useState(COMPANY_EMAIL);
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('Use your company admin email to continue.');

  const canSubmit = useMemo(() => email.trim().length > 3 && password.trim().length >= 8, [email, password]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setNotice('Enter your company email and at least 8 characters for the password.');
      return;
    }

    setNotice('Admin backend login will be connected here next. This page is now ready on /admin.');
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#040509] text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif; }
        h1, h2, h3, .display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
      `}</style>

      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(900px_600px_at_20%_10%,rgba(255,90,31,0.22),transparent_60%),radial-gradient(700px_500px_at_80%_20%,rgba(124,58,237,0.15),transparent_60%),linear-gradient(180deg,#040509_0%,#060811_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:40px_40px]" />

      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-5 py-6 lg:px-8">
        <header className="mb-10 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/90 backdrop-blur">
            <img src="/images/flamecore-logo-v2.png" alt="Flame Core Technologies LTD" className="h-10 w-10 rounded-xl object-cover" />
            <span className="display text-sm font-semibold tracking-tight">FLAMECORE TECHNOLOGIES LTD</span>
          </a>
          <a href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-[#FF5A1F]/40 hover:text-white">
            Back to website
          </a>
        </header>

        <main className="grid flex-1 items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="max-w-[700px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#FF5A1F]/20 bg-[#FF5A1F]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FFB08F]">
              Secure Admin Access
            </div>
            <h1 className="display max-w-[680px] text-[clamp(40px,6vw,78px)] font-bold leading-[0.95] text-white">
              Premium control surface for Flame Core operations.
            </h1>
            <p className="mt-6 max-w-[620px] text-lg leading-[1.75] text-white/70">
              This `/admin` entry point is now reserved on the main domain for company-only access. It is designed for internal publishing,
              campaign control, and future secure workflows without bringing the hosting platform back into the marketing site.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Company-only access', 'Uses your official Flame Core email identity'],
                ['Publishing ready', 'Prepared for blog and content operations'],
                ['Email operations', 'Designed for secure outbound communication'],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur">
                  <div className="mb-3 h-10 w-10 rounded-2xl bg-[#FF5A1F]/12 text-[#FF8D63] grid place-items-center">•</div>
                  <h2 className="text-base font-semibold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-white/60">{copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-px rounded-[32px] bg-gradient-to-br from-[#FF5A1F]/40 via-white/0 to-[#7C3AED]/25 blur-sm" />
            <div className="relative rounded-[32px] border border-white/10 bg-[#0B0F17]/85 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium uppercase tracking-[0.22em] text-white/45">Admin Login</div>
                  <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-white">Enter the control room</h2>
                </div>
                <div className="rounded-2xl border border-[#27D17F]/25 bg-[#27D17F]/10 px-3 py-2 text-xs font-semibold text-[#9EF0C2]">
                  Domain ready
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Company Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={COMPANY_EMAIL}
                    className="h-14 w-full rounded-2xl border border-white/10 bg-[#06080E] px-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-[#FF5A1F]/45"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your admin password"
                    className="h-14 w-full rounded-2xl border border-white/10 bg-[#06080E] px-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-[#FF5A1F]/45"
                  />
                </label>

                <button
                  type="submit"
                  className="h-14 w-full rounded-2xl bg-[#FF5A1F] text-base font-semibold text-[#05060A] transition hover:bg-[#FF6C38]"
                >
                  Continue to admin
                </button>
              </form>

              <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/70">
                {notice}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-white/45">
                <span>Need access approval?</span>
                <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#FFB08F] transition hover:text-white">
                  {COMPANY_EMAIL}
                </a>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
