import { Router } from "express";
import { prisma } from "../../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { requireAuth, AuthRequest } from "../../middlewares/auth";
import { z } from "zod";
import { badRequest, unauthorized, created, ok } from "../../lib/response";

const router = Router();

// =============== REGISTER ===============
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

// =============== LOGIN ===============
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

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET || "supersecret",
    { expiresIn: "2d" }
  );

  // ✅ kirim token langsung tanpa helper "ok()"
  // biar frontend bisa ambil res.data.access_token langsung
  return res.json({ access_token: token });
});

// =============== GET CURRENT USER ===============
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, username: true, email: true },
  });

  return ok(res, "Get me successfully", me);
});

export default router;
