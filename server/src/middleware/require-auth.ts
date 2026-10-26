import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.trackflow_token;

  if (typeof token !== "string") {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
