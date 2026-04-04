import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "JWT_SECRET", "ADMIN_SECRET_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const frontendUrlList = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const isProduction = (process.env.NODE_ENV || "development") === "production";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  frontendUrl: frontendUrlList[0] || "http://localhost:8100",
  frontendUrls: frontendUrlList.length ? frontendUrlList : ["http://localhost:8100"],
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  jwtIssuer: process.env.JWT_ISSUER || "flamecore-backend",
  jwtAudience: process.env.JWT_AUDIENCE || "flamecore-clients",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  adminSecretKeys: process.env.ADMIN_SECRET_KEY
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  cookieSecure: isProduction,
  cookieSameSite: isProduction ? "none" : "lax",
  trustProxy: (process.env.TRUST_PROXY || "1") === "1"
};
