import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { registerChatSockets } from "./modules/admin/chat.js";

const httpServer = createServer(app);

const io = new SocketIO(httpServer, {
  cors: { origin: env.frontendUrls, credentials: true }
});

registerChatSockets(io, env.adminSecretKeys);
httpServer.listen(env.port, () => {
  console.log(`Backend running on http://localhost:${env.port}`);
});
