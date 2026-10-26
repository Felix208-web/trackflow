
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createAccessToken } from "../lib/auth.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
const APP_URL =
  process.env.APP_URL || process.env.CLIENT_URL || "http://localhost:5173";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from the server environment.");
}

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const emailSchema = z.object({
  email: z.string().trim().email().max(254),
});

const verifySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  const production = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? ("none" as const) : ("lax" as const),
    path: "/",
    maxAge: 15 * 60 * 1000,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character]!;
  });
}

async function sendVerificationEmail(
  userId: string,
  email: string,
  name: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured.");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Invalidate previous verification links before issuing a new one.
  await prisma.emailVerificationToken.deleteMany({
    where: { userId },
  });

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const verificationUrl =
    `${APP_URL.replace(/\/$/, "")}/verify-email?token=${token}`;

  const safeName = escapeHtml(name);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Verify your TrackFlow email",
      html: `
        <!DOCTYPE html>
        <html lang="en">
          <body style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
            <h2>Welcome to TrackFlow, ${safeName}!</h2>
            <p>Please verify your email address to activate your account.</p>
            <p>
              <a
                href="${verificationUrl}"
                style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;"
              >
                Verify email address
              </a>
            </p>
            <p>This link expires in 24 hours and can only be used once.</p>
            <p>If you didn't create a TrackFlow account, you can ignore this email.</p>
          </body>
        </html>
      `,
    }),
  });

  if (!response.ok) {
    // Do not log the API key or the verification token.
    console.error("Resend email request failed with status:", response.status);
    throw new Error("The verification email could not be sent.");
  }
}

// POST /api/auth/register
router.post("/register", registerLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "Please provide a valid name, email, and password of at least 8 characters.",
    });
    return;
  }

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      res.status(409).json({
        error: "An account with this email already exists. Try signing in or requesting a verification email.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    try {
      await sendVerificationEmail(user.id, user.email, user.name);

      res.status(201).json({
        emailSent: true,
        message: "Account created. Check your email for a verification link before signing in.",
      });
    } catch (emailError) {
      console.error("Registration email delivery failed:", emailError);

      // Keep the account so the user can request another verification email.
      res.status(201).json({
        emailSent: false,
        message: "Your account was created, but the verification email could not be sent. Try resending it shortly.",
      });
    }
  } catch (error) {
    // Prisma unique constraint violation: another request may have registered
    // the same email at the same time.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      res.status(409).json({
        error: "An account with this email already exists.",
      });
      return;
    }

    console.error("Registration failed:", error);
    res.status(500).json({ error: "Unable to create your account right now." });
  }
});

// POST /api/auth/verify-email
router.post("/verify-email", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "This verification link is invalid or incomplete.",
    });
    return;
  }

  try {
    const tokenHash = hashToken(parsed.data.token);

    const verificationToken =
      await prisma.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
        },
      });

    if (!verificationToken || verificationToken.expiresAt <= new Date()) {
      if (verificationToken) {
        await prisma.emailVerificationToken.deleteMany({
          where: { id: verificationToken.id },
        });
      }

      res.status(400).json({
        error: "This verification link is invalid or has expired. Request a new one.",
      });
      return;
    }

    // Consume the token and verify the user in one database transaction.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerifiedAt: new Date() },
      });

      await tx.emailVerificationToken.deleteMany({
        where: { userId: verificationToken.userId },
      });
    });

    res.json({
      success: true,
      message: "Your email has been verified. You can now sign in.",
    });
  } catch (error) {
    console.error("Email verification failed:", error);
    res.status(500).json({
      error: "Unable to verify your email right now. Please try again.",
    });
  }
});

// POST /api/auth/resend-verification
router.post("/resend-verification", resendLimiter, async (req, res) => {
  const parsed = emailSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    // Return the same response regardless of whether the email exists
    // or the account has already been verified.
    if (user && !user.emailVerifiedAt) {
      try {
        await sendVerificationEmail(user.id, user.email, user.name);
      } catch (emailError) {
        console.error("Resending verification email failed:", emailError);
      }
    }

    res.json({
      message: "If an unverified account exists for that email, a verification link will be sent shortly.",
    });
  } catch (error) {
    console.error("Resend verification request failed:", error);
    res.status(500).json({
      error: "Unable to process your request right now. Please try again.",
    });
  }
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a valid email and password." });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    // All accounts, including accounts created before this feature,
    // must be verified before they can log in.
    if (!user.emailVerifiedAt) {
      res.status(403).json({
        error: "Please verify your email before signing in. You can request a new verification link.",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    const token = createAccessToken(user.id);

    res.cookie("trackflow_token", token, cookieOptions());

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Unable to sign in right now." });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  const options = cookieOptions();
  const { maxAge: _maxAge, ...clearOptions } = options;

  res.clearCookie("trackflow_token", clearOptions);
  res.json({ message: "Signed out successfully." });
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  const token = req.cookies?.trackflow_token;

  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as jwt.JwtPayload;
    const userId = payload.userId;

    if (typeof userId !== "string") {
      res.status(401).json({ error: "Invalid authentication token." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found." });
      return;
    }

    if (!user.emailVerifiedAt) {
      res.status(403).json({
        error: "Please verify your email before accessing TrackFlow.",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Your session is invalid or has expired." });
  }
});

export default router;
