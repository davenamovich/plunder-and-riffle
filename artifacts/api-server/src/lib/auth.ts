import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "btc-experiment-secret-dev-only";
const TOKEN_TTL_DAYS = 30;

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, payload.sub)).limit(1);
  if (!user.length) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  (req as any).user = user[0];
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (payload) {
    db.select().from(usersTable).where(eq(usersTable.id, payload.sub)).limit(1).then(([user]) => {
      if (user) (req as any).user = user;
      next();
    }).catch(() => next());
  } else {
    next();
  }
}
