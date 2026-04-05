import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { adminLimiter, apiLimiter, authLimiter } from "./middleware/rateLimit.js";
import { authRoutes } from "./modules/auth/routes.js";
import { userRoutes } from "./modules/users/routes.js";
import { productRoutes } from "./modules/products/routes.js";
import { orderRoutes } from "./modules/orders/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { paymentRoutes } from "./modules/payments/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { chatRoutes } from "./modules/chat/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const frontendRootCandidates = [
  path.join(__dirname, "../.."),
  path.join(__dirname, "../../.."),
  process.cwd(),
  path.join(process.cwd(), "..")
];

const frontendRoot =
  frontendRootCandidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ??
  path.join(__dirname, "../..");

const frontendIndexPath = path.join(frontendRoot, "index.html");

export const app = express();

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (env.frontendUrls.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin blocked"));
    },
    credentials: true
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use("/assets", express.static(path.join(frontendRoot, "assets")));
app.use("/admin", express.static(path.join(frontendRoot, "admin")));
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

// Serve frontend static files (HTML, CSS, JS) from the repo root
app.use(express.static(frontendRoot));

app.use("/api", apiLimiter);

app.get("/", (_req, res) => {
  res.sendFile(frontendIndexPath);
});

app.get("/:page", (req, res, next) => {
  if (req.params.page.startsWith("api")) {
    return next();
  }

  const allowedPages = new Set([
    "about",
    "contact",
    "dashboard",
    "index",
    "login",
    "products",
    "services",
    "signup",
    "start-project"
  ]);

  if (!allowedPages.has(req.params.page)) {
    return next();
  }

  return res.sendFile(path.join(frontendRoot, `${req.params.page}.html`));
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", service: "flamecore-backend" });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminLimiter, adminRoutes);
app.use("/api/chat", chatRoutes);

// SPA catch-all: serve index.html for any non-API route to support client-side routing
app.get(/^(?!\/api).*$/, (_req, res) => {
  res.sendFile(frontendIndexPath);
});

app.use(notFoundHandler);
app.use(errorHandler);
