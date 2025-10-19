import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { created, ok, unauthorized, badRequest } from "../../lib/response";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { requireAuth, AuthRequest } from "../../middlewares/auth";
import { z } from "zod";

const router = Router();

const registerSchema = z.object({
  username: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(8),
});

router.post("/register", async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");

  const { username, email, password } = parse.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return badRequest(res, "Email already registered");

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, password: hashed },
    select: { id: true, email: true, created_at: true },
  });

  return created(res, "User registered successfully", user);
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");
  const { email, password } = parse.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return unauthorized(res, "Invalid credentials");

  const pass = await bcrypt.compare(password, user.password);
  if (!pass) return unauthorized(res, "Invalid credentials");

  const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || "supersecret", {
    subject: user.id,
    expiresIn: "2d",
  });

  return ok(res, "Login successfully", { access_token: token });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, username: true, email: true },
  });
  return ok(res, "Get me successfully", me);
});

export default router;
