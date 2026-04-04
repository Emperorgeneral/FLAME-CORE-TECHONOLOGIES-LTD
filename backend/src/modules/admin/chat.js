import { verifyToken } from "../../utils/jwt.js";
import { prisma } from "../../config/prisma.js";

/**
 * Register all Socket.io events for the /chat namespace.
 * Admin connects with  { auth: { adminKey } }  — appears as "Support Team" to users.
 * Users connect with   { auth: { token } }      — JWT access token.
 */
export function registerChatSockets(io, adminKeys) {
  const chat = io.of("/chat");

  // ── Auth middleware ─────────────────────────────────────────────────────
  chat.use((socket, next) => {
    const { adminKey: clientKey, token } = socket.handshake.auth || {};

    if (clientKey && adminKeys.includes(clientKey)) {
      socket.isAdmin = true;
      return next();
    }

    if (token) {
      try {
        const decoded = verifyToken(token);
        socket.userId = decoded.sub;
        socket.isAdmin = false;
        return next();
      } catch {
        return next(new Error("Invalid token"));
      }
    }

    return next(new Error("Authentication required"));
  });

  // ── Connection handler ──────────────────────────────────────────────────
  chat.on("connection", (socket) => {
    if (socket.isAdmin) {
      // Admin joins a shared admin room so they can receive all user messages
      socket.join("admin-room");

      // Admin explicitly joins a user's conversation room
      socket.on("admin:join-conversation", (userId) => {
        socket.join(`user-${userId}`);
      });

      // Admin sends a message to a specific user (appears as "Support Team")
      socket.on("admin:send-message", async ({ userId, content }) => {
        if (!userId || !content) return;
        try {
          const msg = await upsertAndSave(userId, content, true);
          // Deliver to user
          chat.to(`user-${userId}`).emit("message:new", {
            id: msg.id,
            content: msg.content,
            fromAdmin: true,
            from: "Support Team",
            createdAt: msg.createdAt
          });
          // Confirm to sending admin socket
          socket.emit("message:sent", { userId, message: msg });
        } catch (err) {
          socket.emit("error", { message: err.message });
        }
      });

      // Admin marks conversation read
      socket.on("admin:mark-read", async ({ userId }) => {
        try {
          const conv = await prisma.chatConversation.findUnique({ where: { userId } });
          if (conv) {
            await prisma.chatMessage.updateMany({
              where: { conversationId: conv.id, fromAdmin: false, readAt: null },
              data: { readAt: new Date() }
            });
          }
        } catch {
          // non-critical
        }
      });
    } else {
      // User joins their personal room
      socket.join(`user-${socket.userId}`);

      // Notify admin room that this user is now online
      chat.to("admin-room").emit("user:connected", { userId: socket.userId });

      // User sends a message to support
      socket.on("user:send-message", async ({ content }) => {
        if (!content) return;
        try {
          const msg = await upsertAndSave(socket.userId, content, false);
          // Deliver to all admin sockets
          chat.to("admin-room").emit("message:from-user", {
            id: msg.id,
            userId: socket.userId,
            content: msg.content,
            createdAt: msg.createdAt
          });
          // Confirm to user
          socket.emit("message:sent", msg);
        } catch (err) {
          socket.emit("error", { message: err.message });
        }
      });

      socket.on("disconnect", () => {
        chat.to("admin-room").emit("user:disconnected", { userId: socket.userId });
      });
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function upsertAndSave(userId, content, fromAdmin) {
  let conv = await prisma.chatConversation.findUnique({ where: { userId } });
  if (!conv) {
    conv = await prisma.chatConversation.create({ data: { userId } });
  } else {
    await prisma.chatConversation.update({
      where: { id: conv.id },
      data: { updatedAt: new Date() }
    });
  }
  return prisma.chatMessage.create({
    data: { conversationId: conv.id, content, fromAdmin }
  });
}
