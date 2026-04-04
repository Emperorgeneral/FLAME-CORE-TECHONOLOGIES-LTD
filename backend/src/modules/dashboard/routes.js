import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const [ordersCount, projectsCount, latestOrder] = await Promise.all([
      prisma.order.count({ where: { userId: req.user.sub } }),
      prisma.userProject.count({ where: { userId: req.user.sub } }),
      prisma.order.findFirst({
        where: { userId: req.user.sub },
        orderBy: { createdAt: "desc" }
      })
    ]);

    res.json({
      status: "OK",
      summary: {
        ordersCount,
        projectsCount,
        latestOrder
      }
    });
  } catch (err) {
    next(err);
  }
});

dashboardRoutes.get("/projects", requireAuth, async (req, res, next) => {
  try {
    const projects = await prisma.userProject.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: "desc" },
      include: {
        template: true,
        customizations: true
      }
    });

    res.json({ status: "OK", projects });
  } catch (err) {
    next(err);
  }
});
