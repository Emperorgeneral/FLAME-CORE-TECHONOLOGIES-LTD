import { env } from "../config/env.js";
import crypto from "crypto";

function timingSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const isValid = token && env.adminSecretKeys.some((key) => timingSafeEqual(token, key));
  if (!isValid) {
    return res.status(403).json({ status: "FORBIDDEN", message: "Admin access required" });
  }

  req.isAdmin = true;
  return next();
}
