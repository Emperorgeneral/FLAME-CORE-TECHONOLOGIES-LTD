import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

export const chatRoutes = Router();

// GET /api/chat/history — load the authenticated user's conversation + all messages
chatRoutes.get("/history", requireAuth, async (req, res, next) => {
  try {
    const conversation = await prisma.chatConversation.findUnique({
      where: { userId: req.user.sub },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    res.json({ status: "OK", conversation: conversation || null });
  } catch (err) {
    next(err);
  }
});
