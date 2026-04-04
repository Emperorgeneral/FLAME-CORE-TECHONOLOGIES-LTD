import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const templates = [
    {
      slug: "saas-pro",
      name: "SaaS Pro Landing",
      description: "High-conversion SaaS template with pricing and onboarding flow.",
      priceCents: 14900,
      category: "SaaS"
    },
    {
      slug: "portfolio-x",
      name: "Portfolio X",
      description: "Personal and agency portfolio layout with case studies.",
      priceCents: 9900,
      category: "Portfolio"
    },
    {
      slug: "ecom-boost",
      name: "Ecom Boost",
      description: "Product-first commerce template optimized for checkout.",
      priceCents: 19900,
      category: "Ecommerce"
    }
  ];

  for (const t of templates) {
    await prisma.websiteTemplate.upsert({
      where: { slug: t.slug },
      create: t,
      update: t
    });
  }

  console.log("Seed complete.");
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
