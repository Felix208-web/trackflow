import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

export interface AuthPayload {
  userId: string;
}

export function createAccessToken(userId: string): string {
  return jwt.sign({ userId }, secret!, {
    expiresIn: "15m",
    issuer: "trackflow",
    audience: "trackflow-api",
  });
}

export function verifyAccessToken(token: string): AuthPayload {
  const payload = jwt.verify(token, secret!, {
    issuer: "trackflow",
    audience: "trackflow-api",
  });

  if (
    typeof payload === "string" ||
    typeof payload.userId !== "string"
  ) {
    throw new Error("Invalid authentication token");
  }

  return { userId: payload.userId };
}
