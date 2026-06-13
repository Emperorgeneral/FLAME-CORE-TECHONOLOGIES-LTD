export type BlogPost = {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImageUrl?: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  authorName?: string;
  tags?: string[];
  isPublished?: boolean;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const phoneDisplay = '+234 707 172 6082';
export const phoneTel = 'tel:+2347071726082';
export const whatsappUrl =
  'https://wa.me/2347071726082?text=Hello%20FLAMECORE%20TECHNOLOGIES%20LTD%2C%20I%20would%20like%20to%20make%20an%20inquiry.';
export const companyEmail = 'yours@flamecoretechltd.com';

export const services = [
  {
    title: 'Web Development',
    description:
      'Executive-grade websites and web platforms designed to strengthen trust, sharpen positioning, and convert attention into measurable business results.',
    tags: ['Premium UX', 'Fast Delivery', 'Scalable Architecture'],
  },
  {
    title: 'Mobile Development',
    description:
      'High-quality mobile products for iOS and Android with refined interfaces, dependable backend integration, and launch-ready performance.',
    tags: ['iOS', 'Android', 'Product Quality'],
  },
  {
    title: 'Custom Software Solutions',
    description:
      'Tailored digital systems built around your exact workflows, reporting needs, teams, and operational goals without forcing your business into a generic template.',
    tags: ['Internal Tools', 'Automation', 'Dashboards'],
  },
  {
    title: 'AI & Automation',
    description:
      'Practical AI assistants, workflow automation, and smart process design that help teams reduce manual work and move faster with confidence.',
    tags: ['AI Workflows', 'Automation', 'Operational Efficiency'],
  },
  {
    title: 'UI/UX Design',
    description:
      'Modern visual systems and intuitive experiences that make products easier to trust, easier to use, and easier to scale.',
    tags: ['Design Systems', 'User Flows', 'Brand Polish'],
  },
  {
    title: 'Hosting & Infrastructure Guidance',
    description:
      'Secure deployment planning, environment setup, performance tuning, and managed guidance for clients that want dependable production operations.',
    tags: ['Hosting Guidance', 'SSL', 'Monitoring'],
  },
];

export const testimonials = [
  {
    name: 'Operations Lead',
    company: 'Growth-focused SME',
    quote:
      'Flame Core brought structure, polish, and real execution discipline. The final delivery felt premium from strategy through implementation.',
  },
  {
    name: 'Founder',
    company: 'Digital service startup',
    quote:
      'The team translated a rough idea into something clear, modern, and investor-ready. Communication was sharp and delivery stayed dependable.',
  },
  {
    name: 'Business Director',
    company: 'Service brand',
    quote:
      'What stood out most was the balance of technical depth and presentation quality. The outcome felt far more mature than a typical agency delivery.',
  },
];

export const defaultBlogPosts: BlogPost[] = [
  {
    title: 'How premium digital execution improves business trust',
    slug: 'premium-digital-execution-improves-business-trust',
    excerpt:
      'A stronger digital presence is not just about visuals — it shapes credibility, conversion, and how confidently customers engage your brand.',
    content:
      'Businesses are judged quickly online. A polished website, clear messaging, and dependable product experience all combine to signal trust. At Flame Core, we design systems that do more than look modern. We build digital assets that support credibility, reduce friction, and make your offer feel ready for serious clients.\n\nThat means fast performance, strong structure, clean UI, and practical technical foundations that keep the experience stable after launch.',
    coverImageUrl: '/images/flamecore-hero.jpg',
    mediaType: 'image',
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
    authorName: 'Flame Core Editorial',
    tags: ['Software', 'Operations', 'Growth'],
    isPublished: true,
  },
];
