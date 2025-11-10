import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { unauthorized } from "../lib/response";

export interface AuthRequest extends Request {
  user?: { id: string; email: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return unauthorized(res, "Missing bearer token");

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "supersecret") as any;
    req.user = { id: payload.id, email: payload.email }; // ✅ ambil id, bukan sub
    next();
  } catch (err) {
    return unauthorized(res, "Invalid or expired token");
  }
}
