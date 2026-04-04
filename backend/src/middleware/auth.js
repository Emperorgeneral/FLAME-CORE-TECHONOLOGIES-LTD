import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken = req.cookies?.access_token;
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ status: "UNAUTHORIZED", message: "Authentication required" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ status: "UNAUTHORIZED", message: "Invalid token" });
  }
}
