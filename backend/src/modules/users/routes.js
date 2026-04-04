import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const userRoutes = Router();

const profileSchema = z.object({
  fullName: z.string().min(2).optional(),
  companyName: z.string().min(2).optional(),
  phone: z.string().min(6).optional()
});

userRoutes.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: req.user.sub } });
    res.json({ status: "OK", profile });
  } catch (err) {
    next(err);
  }
});

userRoutes.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    const input = profileSchema.parse(req.body);
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.user.sub },
      create: {
        userId: req.user.sub,
        ...input
      },
      update: input
    });
    res.json({ status: "OK", profile });
  } catch (err) {
    next(err);
  }
});
