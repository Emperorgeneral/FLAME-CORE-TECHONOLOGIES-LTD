import { useEffect, useState } from 'react';
import { fetchPublishedPosts } from './api';
import type { BlogPost } from './siteContent';
import { defaultBlogPosts } from './siteContent';

function formatDate(value?: string | null) {
  if (!value) return 'Editorial';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isVideo(url?: string) {
  return Boolean(url && /\.(mp4|webm|ogg)$/i.test(url));
}

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>(defaultBlogPosts);

  useEffect(() => {
    fetchPublishedPosts().then(setPosts).catch(() => null);
  }, []);

  return (
    <div className="min-h-screen bg-[#05060A] text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        * { font-family: 'Instrument Sans', system-ui, -apple-system, sans-serif; }
        h1, h2, h3, .display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.02em; }
      `}</style>

      <div className="fixed inset-0 -z-20 bg-[radial-gradient(1200px_900px_at_75%_-10%,#FF5A1F12,transparent_60%),radial-gradient(900px_900px_at_10%_100%,#7C3AED12,transparent_65%),#05060A]" />

      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#05060A]/88 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 items-center gap-3">
            <img src="/images/flamecore-brandmark-512.png" alt="FLAMECORE TECHNOLOGIES LTD" className="h-10 w-10 object-contain" />
            <div>
              <div className="display text-[15px] font-[700]">FLAMECORE TECHNOLOGIES LTD</div>
              <div className="text-[10px] font-[700] uppercase tracking-[0.18em] text-[#FF8A5B]">Insights & editorial</div>
            </div>
          </a>
          <a href="/" className="rounded-full border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-sm font-[700] text-white/85 transition hover:bg-white/[0.08]">
            Back to website
          </a>
        </div>
      </header>

      <main className="py-[76px] md:py-[96px]">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-[840px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#FF7A45]/25 bg-[#FF7A45]/10 px-3 py-1.5">
              <span className="h-[6px] w-[6px] rounded-full bg-[#FF7A45]" />
              <span className="text-[11px] font-[700] tracking-[0.16em] uppercase text-[#FF9B76]">Flame Core Blog</span>
            </div>
            <h1 className="display mt-5 text-[42px] md:text-[64px] font-[700] leading-[0.98] tracking-[-0.03em]">
              Stories, visuals, and thinking behind premium digital delivery
            </h1>
            <p className="mt-5 max-w-[720px] text-[17px] leading-[1.8] text-white/72">
              Explore selected updates, insights, and content from FLAMECORE TECHNOLOGIES LTD across software, product execution, automation, and digital growth.
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            {posts.map((post) => (
              <article key={post.slug} className="overflow-hidden rounded-[30px] border border-white/[0.10] bg-[#0B0E14]/78 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
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
                  <div className="absolute left-4 top-4 rounded-full border border-white/[0.10] bg-black/35 px-3 py-1 text-[11px] font-[700] uppercase tracking-[0.18em] text-white/80">
                    {post.mediaType === 'video' ? 'Video feature' : 'Editorial feature'}
                  </div>
                </div>
                <div className="p-6 md:p-7">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-white/52">
                    <span>{post.authorName || 'Flame Core Editorial'}</span>
                    <span>•</span>
                    <span>{formatDate(post.publishedAt || post.createdAt)}</span>
                  </div>
                  <h2 className="mt-3 text-[28px] font-[700] tracking-[-0.02em] text-white">{post.title}</h2>
                  <p className="mt-4 text-[15px] leading-[1.85] text-white/68">{post.excerpt}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(post.tags || []).map((tag) => (
                      <span key={tag} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-[700] uppercase tracking-[0.12em] text-white/68">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
