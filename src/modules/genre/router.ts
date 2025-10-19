import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { created, ok, notFound, badRequest } from "../../lib/response";
import { requireAuth } from "../../middlewares/auth";
import { parsePagination, buildMeta } from "../../utils/pagination";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

// Create Genre
router.post("/", async (req, res) => {
  const schema = z.object({ name: z.string().min(1) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");
  const { name } = parse.data;

  // Prevent duplicate names among active genres
  const exists = await prisma.genre.findFirst({ where: { name, deleted_at: null } });
  if (exists) return badRequest(res, "Genre name already exists");

  const genre = await prisma.genre.create({
    data: { name },
    select: { id: true, name: true, created_at: true },
  });
  return created(res, "Genre created successfully", genre);
});

// Get All Genre with pagination, search, order
router.get("/", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const search = (req.query.search as string) || "";
  const orderByName = (req.query.orderByName as string) || "asc";

  const where = {
    deleted_at: null as any,
    ...(search && { name: { contains: search, mode: "insensitive" as const } }),
  };

  const [total, items] = await Promise.all([
    prisma.genre.count({ where }),
    prisma.genre.findMany({
      where,
      skip,
      take,
      orderBy: { name: orderByName === "desc" ? "desc" : "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return res.json({
    success: true,
    message: "Get all genre successfully",
    data: items,
    meta: buildMeta(page, limit, total),
  });
});

// Get Genre Detail
router.get("/:id", async (req, res) => {
  const genre = await prisma.genre.findFirst({
    where: { id: req.params.id, deleted_at: null },
    select: { id: true, name: true },
  });
  if (!genre) return notFound(res, "Genre not found");
  return ok(res, "Get genre detail successfully", genre);
});

// Update Genre
router.patch("/:id", async (req, res) => {
  const schema = z.object({ name: z.string().min(1) });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");

  const existing = await prisma.genre.findFirst({
    where: { id: req.params.id, deleted_at: null },
  });
  if (!existing) return notFound(res, "Genre not found");

  // avoid name duplicates
  const dup = await prisma.genre.findFirst({
    where: { id: { not: req.params.id }, name: parse.data.name, deleted_at: null },
  });
  if (dup) return badRequest(res, "Genre name already exists");

  const genre = await prisma.genre.update({
    where: { id: req.params.id },
    data: { name: parse.data.name },
    select: { id: true, name: true, updated_at: true },
  });
  return ok(res, "Genre updated successfully", genre);
});

// Soft Delete Genre
router.delete("/:id", async (req, res) => {
  const existing = await prisma.genre.findFirst({
    where: { id: req.params.id, deleted_at: null },
  });
  if (!existing) return notFound(res, "Genre not found");

  await prisma.genre.update({
    where: { id: req.params.id },
    data: { deleted_at: new Date() },
  });

  // books are not deleted (as required)
  return ok(res, "Genre removed successfully");
});

export default router;
