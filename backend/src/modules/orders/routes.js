import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const orderRoutes = Router();

const createOrderSchema = z.object({
  templateId: z.string().min(1),
  quantity: z.number().int().positive().max(10).default(1)
});

orderRoutes.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createOrderSchema.parse(req.body);
    const template = await prisma.websiteTemplate.findUnique({ where: { id: input.templateId } });

    if (!template || !template.isActive) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Template not found" });
    }

    const totalCents = template.priceCents * input.quantity;

    const order = await prisma.order.create({
      data: {
        userId: req.user.sub,
        totalCents,
        items: {
          create: {
            templateId: template.id,
            quantity: input.quantity,
            unitCents: template.priceCents
          }
        }
      },
      include: {
        items: {
          include: { template: true }
        }
      }
    });

    await prisma.userProject.create({
      data: {
        userId: req.user.sub,
        templateId: template.id,
        orderId: order.id,
        title: `${template.name} Project`
      }
    });

    res.status(201).json({ status: "OK", order });
  } catch (err) {
    next(err);
  }
});

orderRoutes.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: { template: true }
        },
        payment: true
      }
    });

    res.json({ status: "OK", orders });
  } catch (err) {
    next(err);
  }
});
