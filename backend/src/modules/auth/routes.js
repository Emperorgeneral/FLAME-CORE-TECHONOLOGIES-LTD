import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { signToken } from "../../utils/jwt.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRoutes = Router();
const googleClient = new OAuth2Client(env.googleClientId || undefined);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  companyName: z.string().min(2).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const googleLoginSchema = z.object({
  credential: z.string().min(1)
});

function sendToken(res, user) {
  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.cookie("access_token", token, {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  return token;
}

authRoutes.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      return res.status(409).json({ status: "CONFLICT", message: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const fullName = input.firstName && input.lastName ? `${input.firstName} ${input.lastName}` : (input.firstName || input.lastName || null);
    
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        profile: {
          create: {
            fullName: fullName,
            phone: input.phone || null,
            companyName: input.companyName || null
          }
        }
      },
      include: { profile: true }
    });

    const token = sendToken(res, user);

    return res.status(201).json({
      status: "OK",
      token,
      user: {
        id: user.id,
        customerNumber: user.customerNumber,
        email: user.email,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (err) {
    return next(err);
  }
});

authRoutes.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { profile: true }
    });

    if (!user) {
      return res.status(401).json({ status: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ status: "UNAUTHORIZED", message: "Invalid credentials" });
    }

    const token = sendToken(res, user);

    return res.json({
      status: "OK",
      token,
      user: {
        id: user.id,
        customerNumber: user.customerNumber,
        email: user.email,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (err) {
    return next(err);
  }
});

authRoutes.get("/google/config", (_req, res) => {
  res.json({
    status: "OK",
    enabled: Boolean(env.googleClientId),
    clientId: env.googleClientId || null
  });
});

authRoutes.post("/google", async (req, res, next) => {
  try {
    if (!env.googleClientId) {
      return res.status(400).json({ status: "BAD_REQUEST", message: "Google login is not configured" });
    }

    const input = googleLoginSchema.parse(req.body);
    const ticket = await googleClient.verifyIdToken({
      idToken: input.credential,
      audience: env.googleClientId
    });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ status: "UNAUTHORIZED", message: "Google account email is not verified" });
    }

    const email = payload.email.toLowerCase();
    const fullName = payload.name || null;

    let user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });

    if (!user) {
      const generatedPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(generatedPassword, 12);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          profile: {
            create: {
              fullName,
              companyName: null
            }
          }
        },
        include: { profile: true }
      });
    } else if (!user.profile && fullName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          profile: {
            create: {
              fullName,
              companyName: null
            }
          }
        },
        include: { profile: true }
      });
    }

    const token = sendToken(res, user);

    return res.json({
      status: "OK",
      token,
      user: {
        id: user.id,
        customerNumber: user.customerNumber,
        email: user.email,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (err) {
    return next(err);
  }
});

authRoutes.post("/logout", (_req, res) => {
  res.clearCookie("access_token");
  res.json({ status: "OK" });
});

authRoutes.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { profile: true }
    });

    if (!user) {
      return res.status(404).json({ status: "NOT_FOUND", message: "User not found" });
    }

    return res.json({
      status: "OK",
      user: {
        id: user.id,
        customerNumber: user.customerNumber,
        email: user.email,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (err) {
    return next(err);
  }
});
