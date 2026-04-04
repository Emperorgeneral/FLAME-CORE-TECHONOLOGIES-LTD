import { Router } from "express";
import multer from "multer";
import path from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { prisma } from "../../config/prisma.js";
import { requireAdmin } from "../../middleware/adminAuth.js";
import { env } from "../../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../../../uploads");
mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `template-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

export const adminRoutes = Router();

// ─── Login (public) ──────────────────────────────────────────────────────────
adminRoutes.post("/login", (req, res) => {
  const { key } = req.body;
  if (!key || !env.adminSecretKeys.includes(key)) {
    return res.status(403).json({ status: "FORBIDDEN", message: "Invalid admin key" });
  }
  return res.json({ status: "OK", token: key });
});

// All routes below are admin-only
adminRoutes.use(requireAdmin);

// ─── Stats overview ──────────────────────────────────────────────────────────
adminRoutes.get("/stats", async (_req, res, next) => {
  try {
    const [users, orders, templates, recentOrders, revenue] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.websiteTemplate.count({ where: { isActive: true } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { email: true, customerNumber: true } },
          items: { include: { template: { select: { name: true } } } }
        }
      }),
      prisma.payment.aggregate({
        where: { status: "SUCCEEDED" },
        _sum: { amountCents: true }
      })
    ]);
    res.json({
      status: "OK",
      stats: {
        users,
        orders,
        templates,
        revenueCents: revenue._sum.amountCents || 0
      },
      recentOrders
    });
  } catch (err) {
    next(err);
  }
});

// ─── Templates ───────────────────────────────────────────────────────────────
adminRoutes.get("/templates", async (_req, res, next) => {
  try {
    const templates = await prisma.websiteTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orderItems: true, projects: true } } }
    });
    res.json({ status: "OK", templates });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post("/templates", upload.single("image"), async (req, res, next) => {
  try {
    const { name, slug, description, priceCents, category, previewUrl, isActive } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : (previewUrl || null);
    const template = await prisma.websiteTemplate.create({
      data: {
        name,
        slug,
        description,
        priceCents: Number(priceCents),
        category,
        previewUrl: imageUrl,
        isActive: isActive !== "false"
      }
    });
    res.status(201).json({ status: "OK", template });
  } catch (err) {
    next(err);
  }
});

adminRoutes.put("/templates/:id", upload.single("image"), async (req, res, next) => {
  try {
    const { name, slug, description, priceCents, category, previewUrl, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (slug !== undefined) data.slug = slug;
    if (description !== undefined) data.description = description;
    if (priceCents !== undefined) data.priceCents = Number(priceCents);
    if (category !== undefined) data.category = category;
    if (isActive !== undefined) data.isActive = isActive !== "false";
    if (req.file) data.previewUrl = `/uploads/${req.file.filename}`;
    else if (previewUrl !== undefined) data.previewUrl = previewUrl;

    const template = await prisma.websiteTemplate.update({
      where: { id: req.params.id },
      data
    });
    res.json({ status: "OK", template });
  } catch (err) {
    next(err);
  }
});

adminRoutes.delete("/templates/:id", async (req, res, next) => {
  try {
    await prisma.websiteTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ status: "OK", message: "Template deactivated" });
  } catch (err) {
    next(err);
  }
});

// ─── Orders ──────────────────────────────────────────────────────────────────
adminRoutes.get("/orders", async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const orders = await prisma.order.findMany({
      where,
      include: {
        user: { select: { id: true, customerNumber: true, email: true, profile: { select: { fullName: true } } } },
        items: { include: { template: { select: { id: true, name: true } } } },
        payment: { select: { status: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ status: "OK", orders });
  } catch (err) {
    next(err);
  }
});

adminRoutes.put("/orders/:id", async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json({ status: "OK", order });
  } catch (err) {
    next(err);
  }
});

// Assign a template to the user who placed an order
adminRoutes.post("/orders/:id/assign", async (req, res, next) => {
  try {
    const { templateId } = req.body;
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true }
    });
    if (!order) return res.status(404).json({ status: "NOT_FOUND", message: "Order not found" });

    const tplId = templateId || order.items[0]?.templateId;
    if (!tplId) return res.status(400).json({ status: "BAD_REQUEST", message: "templateId required" });

    const template = await prisma.websiteTemplate.findUnique({ where: { id: tplId } });
    if (!template) return res.status(404).json({ status: "NOT_FOUND", message: "Template not found" });

    const project = await prisma.userProject.create({
      data: {
        userId: order.userId,
        templateId: tplId,
        orderId: order.id,
        status: "IN_PROGRESS",
        title: `${template.name} — assigned by admin`
      }
    });

    res.json({ status: "OK", project });
  } catch (err) {
    next(err);
  }
});

// ─── Projects ────────────────────────────────────────────────────────────────
adminRoutes.get("/projects", async (_req, res, next) => {
  try {
    const projects = await prisma.userProject.findMany({
      include: {
        user: { select: { id: true, email: true } },
        template: { select: { name: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ status: "OK", projects });
  } catch (err) {
    next(err);
  }
});

adminRoutes.put("/projects/:id", async (req, res, next) => {
  try {
    const { status } = req.body;
    const project = await prisma.userProject.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json({ status: "OK", project });
  } catch (err) {
    next(err);
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────
adminRoutes.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        customerNumber: true,
        email: true,
        role: true,
        createdAt: true,
        profile: true,
        _count: { select: { orders: true, projects: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ status: "OK", users });
  } catch (err) {
    next(err);
  }
});

// ─── Chat (REST) ─────────────────────────────────────────────────────────────
adminRoutes.get("/chats", async (_req, res, next) => {
  try {
    const conversations = await prisma.chatConversation.findMany({
      include: {
        user: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 }
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ status: "OK", conversations });
  } catch (err) {
    next(err);
  }
});

adminRoutes.get("/chats/:userId", async (req, res, next) => {
  try {
    const conversation = await prisma.chatConversation.findUnique({
      where: { userId: req.params.userId },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    res.json({ status: "OK", conversation: conversation || null });
  } catch (err) {
    next(err);
  }
});
