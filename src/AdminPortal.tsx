import { useEffect, useMemo, useState } from 'react';
import {
  deleteAdminPost,
  getAdminOverview,
  getAdminPosts,
  getAdminSession,
  getContactLeads,
  getMailHistory,
  loginAdmin,
  logoutAdmin,
  saveAdminPost,
  sendAdminMail,
} from './api';
import type { BlogPost } from './siteContent';

type DashboardTab = 'overview' | 'posts' | 'mail' | 'contacts';

const initialPost: Partial<BlogPost> = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverImageUrl: '',
  mediaType: 'image',
  mediaUrl: '',
  authorName: 'Flame Core Editorial',
  tags: [],
  isPublished: true,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function AdminPortal() {
  const [email, setEmail] = useState('cmichaelfavour@gmail.com');
  const [password, setPassword] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authNotice, setAuthNotice] = useState('Sign in to manage blog publishing and outbound mail.');
  const [tab, setTab] = useState<DashboardTab>('overview');
  const [overview, setOverview] = useState({ postCount: 0, publishedCount: 0, leadCount: 0, mailCount: 0 });
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [mailHistory, setMailHistory] = useState<any[]>([]);
  const [editor, setEditor] = useState<Partial<BlogPost>>(initialPost);
  const [mailForm, setMailForm] = useState({
    subject: '',
    body: '',
    recipientsMode: 'all_contacts' as 'all_contacts' | 'custom',
    customRecipients: '',
  });
  const [actionNotice, setActionNotice] = useState('Admin system ready.');

  const canSubmitLogin = useMemo(() => email.trim().length > 3 && password.trim().length >= 8, [email, password]);

  async function loadDashboard() {
    const [overviewData, postData, contactsData, mailData] = await Promise.all([
      getAdminOverview(),
      getAdminPosts(),
      getContactLeads(),
      getMailHistory(),
    ]);
    setOverview(overviewData);
    setPosts(postData.posts);
    setContacts(contactsData.contacts);
    setMailHistory(mailData.messages);
  }

  useEffect(() => {
    getAdminSession()
      .then(async () => {
        setAuthenticated(true);
        await loadDashboard();
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthChecking(false));
  }, []);

  if (authChecking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#040509] text-white">
        <div className="rounded-[28px] border border-white/10 bg-white/4 px-6 py-5 text-sm text-white/75">Checking secure admin session...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen overflow-hidden bg-[#040509] text-white">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
          * { font-family: 'Instrument Sans', system-ui, sans-serif; }
          h1, h2, h3, .display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.03em; }
        `}</style>
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(255,90,31,0.22),transparent_34%),radial-gradient(circle_at_85%_25%,rgba(124,58,237,0.18),transparent_28%),#040509]" />
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 lg:px-8">
          <header className="mb-10 flex items-center justify-between">
            <a href="/" className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/90 backdrop-blur">
              <img src="/images/flamecore-brandmark-512.png" alt="Flame Core Technologies LTD" className="h-10 w-10 rounded-xl object-contain" />
              <span className="display text-sm font-semibold tracking-tight">FLAMECORE TECHNOLOGIES LTD</span>
            </a>
            <a href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:border-[#FF5A1F]/40 hover:text-white">
              Back to website
            </a>
          </header>

          <main className="grid flex-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="max-w-[700px]">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#FF5A1F]/20 bg-[#FF5A1F]/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FFB08F]">
                Secure Admin Dashboard
              </div>
              <h1 className="display max-w-[720px] text-[clamp(42px,6vw,84px)] font-bold leading-[0.94]">
                Publish blog content and manage company email from one control room.
              </h1>
              <p className="mt-6 max-w-[620px] text-lg leading-[1.75] text-white/70">
                This dashboard now supports authentication, blog publishing, lead visibility, and outbound email operations for the Flame Core marketing site.
              </p>
              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {[
                  ['Authenticated access', 'Session-based admin sign-in'],
                  ['Blog publishing', 'Create, edit, and publish posts'],
                  ['Email operations', 'Send updates to website contacts'],
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
              <div className="relative rounded-[32px] border border-white/10 bg-[#0B0F17]/88 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-[0.22em] text-white/45">Admin Login</div>
                    <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-white">Enter the control room</h2>
                  </div>
                  <div className="rounded-2xl border border-[#27D17F]/25 bg-[#27D17F]/10 px-3 py-2 text-xs font-semibold text-[#9EF0C2]">Protected</div>
                </div>

                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!canSubmitLogin) {
                      setAuthNotice('Enter the admin email and password to continue.');
                      return;
                    }

                    try {
                      await loginAdmin(email, password);
                      await loadDashboard();
                      setAuthenticated(true);
                      setPassword('');
                    } catch (error) {
                      setAuthNotice(error instanceof Error ? error.message : 'Login failed.');
                    }
                  }}
                  className="space-y-5"
                >
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Admin Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-14 w-full rounded-2xl border border-white/10 bg-[#06080E] px-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-[#FF5A1F]/45"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-14 w-full rounded-2xl border border-white/10 bg-[#06080E] px-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-[#FF5A1F]/45"
                    />
                  </label>
                  <button type="submit" className="h-14 w-full rounded-2xl bg-[#FF5A1F] text-base font-semibold text-[#05060A] transition hover:bg-[#FF6C38]">
                    Continue to admin
                  </button>
                </form>

                <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/70">{authNotice}</div>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#040509] text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
        * { font-family: 'Instrument Sans', system-ui, sans-serif; }
        h1, h2, h3, .display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.03em; }
      `}</style>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,90,31,0.16),transparent_30%),radial-gradient(circle_at_left_bottom,rgba(124,58,237,0.14),transparent_24%),#040509]" />

      <header className="border-b border-white/8 bg-[#040509]/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/images/flamecore-brandmark-512.png" alt="Flame Core Technologies LTD" className="h-11 w-11 rounded-2xl object-contain" />
            <div>
              <div className="display text-base font-bold">Flame Core Admin Dashboard</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">Blog · Mail · Leads</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/6">
              View site
            </a>
            <button
              type="button"
              onClick={async () => {
                await logoutAdmin();
                setAuthenticated(false);
              }}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#06070C]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-[28px] border border-white/10 bg-[#090C13] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Workspace</div>
            <div className="mt-4 grid gap-2">
              {(['overview', 'posts', 'mail', 'contacts'] as DashboardTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold capitalize transition ${
                    tab === item ? 'bg-[#FF5A1F] text-white' : 'bg-white/4 text-white/72 hover:bg-white/8'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-6 rounded-[22px] border border-white/8 bg-white/4 p-4 text-sm leading-6 text-white/62">{actionNotice}</div>
          </aside>

          <section className="space-y-6">
            {tab === 'overview' && (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Total posts', overview.postCount],
                    ['Published posts', overview.publishedCount],
                    ['Contact leads', overview.leadCount],
                    ['Emails sent', overview.mailCount],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                      <div className="text-sm font-semibold text-white/55">{label}</div>
                      <div className="mt-3 text-4xl font-bold">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                  <h2 className="display text-2xl font-bold">Control summary</h2>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-white/66">
                    This dashboard is wired for authenticated content publishing, lead management, and outbound mail to contacts gathered from the website inquiry form.
                  </p>
                </div>
              </>
            )}

            {tab === 'posts' && (
              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="display text-2xl font-bold">Blog editor</h2>
                    <button
                      type="button"
                      onClick={() => setEditor(initialPost)}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/72"
                    >
                      New post
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <input
                      value={editor.title || ''}
                      onChange={(event) =>
                        setEditor((current) => ({
                          ...current,
                          title: event.target.value,
                          slug: current.id ? current.slug : slugify(event.target.value),
                        }))
                      }
                      placeholder="Post title"
                      className="h-13 w-full rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                    />
                    <input
                      value={editor.slug || ''}
                      onChange={(event) => setEditor((current) => ({ ...current, slug: slugify(event.target.value) }))}
                      placeholder="post-slug"
                      className="h-13 w-full rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                    />
                    <textarea
                      value={editor.excerpt || ''}
                      onChange={(event) => setEditor((current) => ({ ...current, excerpt: event.target.value }))}
                      placeholder="Short excerpt"
                      rows={3}
                      className="w-full rounded-[22px] border border-white/10 bg-[#040509] px-4 py-4 text-white outline-none"
                    />
                    <textarea
                      value={editor.content || ''}
                      onChange={(event) => setEditor((current) => ({ ...current, content: event.target.value }))}
                      placeholder="Full post content"
                      rows={8}
                      className="w-full rounded-[22px] border border-white/10 bg-[#040509] px-4 py-4 text-white outline-none"
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        value={editor.coverImageUrl || ''}
                        onChange={(event) => setEditor((current) => ({ ...current, coverImageUrl: event.target.value }))}
                        placeholder="Cover image URL"
                        className="h-13 w-full rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                      />
                      <input
                        value={editor.mediaUrl || ''}
                        onChange={(event) => setEditor((current) => ({ ...current, mediaUrl: event.target.value }))}
                        placeholder="Video URL (optional)"
                        className="h-13 w-full rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <select
                        value={editor.mediaType || 'image'}
                        onChange={(event) => setEditor((current) => ({ ...current, mediaType: event.target.value as 'image' | 'video' }))}
                        className="h-13 rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                      >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>
                      <input
                        value={editor.authorName || ''}
                        onChange={(event) => setEditor((current) => ({ ...current, authorName: event.target.value }))}
                        placeholder="Author name"
                        className="h-13 rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                      />
                      <input
                        value={(editor.tags || []).join(', ')}
                        onChange={(event) =>
                          setEditor((current) => ({
                            ...current,
                            tags: event.target.value
                              .split(',')
                              .map((tag) => tag.trim())
                              .filter(Boolean),
                          }))
                        }
                        placeholder="Tags, comma separated"
                        className="h-13 rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                      />
                    </div>
                    <label className="inline-flex items-center gap-3 text-sm text-white/74">
                      <input
                        type="checkbox"
                        checked={Boolean(editor.isPublished)}
                        onChange={(event) => setEditor((current) => ({ ...current, isPublished: event.target.checked }))}
                      />
                      Publish immediately
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const result = await saveAdminPost(editor);
                          setActionNotice(`Saved "${result.post.title}" successfully.`);
                          setEditor(result.post);
                          await loadDashboard();
                        } catch (error) {
                          setActionNotice(error instanceof Error ? error.message : 'Could not save post.');
                        }
                      }}
                      className="h-13 w-full rounded-2xl bg-[#FF5A1F] text-base font-bold text-white"
                    >
                      {editor.id ? 'Update post' : 'Create post'}
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                  <h2 className="display text-2xl font-bold">Published and draft posts</h2>
                  <div className="mt-5 grid gap-4">
                    {posts.map((post) => (
                      <div key={post.id} className="rounded-[22px] border border-white/8 bg-white/4 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-lg font-semibold">{post.title}</div>
                            <div className="mt-1 text-sm text-white/48">{post.slug}</div>
                            <div className="mt-3 text-sm leading-7 text-white/65">{post.excerpt}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditor(post)}
                              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/80"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!post.id) return;
                                try {
                                  await deleteAdminPost(post.id);
                                  setActionNotice(`Deleted "${post.title}".`);
                                  await loadDashboard();
                                  setEditor(initialPost);
                                } catch (error) {
                                  setActionNotice(error instanceof Error ? error.message : 'Could not delete post.');
                                }
                              }}
                              className="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                          <span>{post.isPublished ? 'Published' : 'Draft'}</span>
                          <span>•</span>
                          <span>{post.mediaType || 'image'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'mail' && (
              <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                  <h2 className="display text-2xl font-bold">Send email to users</h2>
                  <div className="mt-5 space-y-4">
                    <select
                      value={mailForm.recipientsMode}
                      onChange={(event) => setMailForm((current) => ({ ...current, recipientsMode: event.target.value as 'all_contacts' | 'custom' }))}
                      className="h-13 w-full rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                    >
                      <option value="all_contacts">All contact leads</option>
                      <option value="custom">Custom recipient list</option>
                    </select>
                    {mailForm.recipientsMode === 'custom' && (
                      <textarea
                        value={mailForm.customRecipients}
                        onChange={(event) => setMailForm((current) => ({ ...current, customRecipients: event.target.value }))}
                        rows={3}
                        placeholder="person@example.com, another@example.com"
                        className="w-full rounded-[22px] border border-white/10 bg-[#040509] px-4 py-4 text-white outline-none"
                      />
                    )}
                    <input
                      value={mailForm.subject}
                      onChange={(event) => setMailForm((current) => ({ ...current, subject: event.target.value }))}
                      placeholder="Email subject"
                      className="h-13 w-full rounded-2xl border border-white/10 bg-[#040509] px-4 text-white outline-none"
                    />
                    <textarea
                      value={mailForm.body}
                      onChange={(event) => setMailForm((current) => ({ ...current, body: event.target.value }))}
                      rows={10}
                      placeholder="Write your message"
                      className="w-full rounded-[22px] border border-white/10 bg-[#040509] px-4 py-4 text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const result = await sendAdminMail(mailForm);
                          setActionNotice(result.message);
                          setMailForm({ subject: '', body: '', recipientsMode: 'all_contacts', customRecipients: '' });
                          await loadDashboard();
                        } catch (error) {
                          setActionNotice(error instanceof Error ? error.message : 'Could not send email.');
                        }
                      }}
                      className="h-13 w-full rounded-2xl bg-[#FF5A1F] text-base font-bold text-white"
                    >
                      Send email
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                  <h2 className="display text-2xl font-bold">Recent email history</h2>
                  <div className="mt-5 grid gap-4">
                    {mailHistory.length === 0 && <div className="rounded-[22px] border border-white/8 bg-white/4 p-5 text-sm text-white/60">No email history yet.</div>}
                    {mailHistory.map((message) => (
                      <div key={message.id} className="rounded-[22px] border border-white/8 bg-white/4 p-5">
                        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                          <span>{message.status}</span>
                          <span>•</span>
                          <span>{message.recipientCount} recipients</span>
                        </div>
                        <div className="mt-3 text-lg font-semibold">{message.subject}</div>
                        <div className="mt-2 text-sm text-white/58">From {message.senderEmail}</div>
                        <div className="mt-2 text-sm text-white/58">Recipients: {(message.recipients || []).join(', ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'contacts' && (
              <div className="rounded-[28px] border border-white/10 bg-[#090C13] p-6">
                <h2 className="display text-2xl font-bold">Contact leads</h2>
                <div className="mt-5 grid gap-4">
                  {contacts.length === 0 && <div className="rounded-[22px] border border-white/8 bg-white/4 p-5 text-sm text-white/60">No leads yet.</div>}
                  {contacts.map((contact) => (
                    <article key={contact.id} className="rounded-[22px] border border-white/8 bg-white/4 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-lg font-semibold">{contact.name}</div>
                          <div className="text-sm text-white/55">{contact.email}</div>
                        </div>
                        <div className="text-sm text-white/45">{new Date(contact.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="mt-3 text-sm text-white/60">{contact.company || 'No company provided'}</div>
                      <p className="mt-3 text-sm leading-7 text-white/68">{contact.message}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
