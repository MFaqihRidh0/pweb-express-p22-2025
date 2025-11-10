import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { created, ok, notFound, badRequest } from "../../lib/response";
import { requireAuth } from "../../middlewares/auth";
import { parsePagination, buildMeta } from "../../utils/pagination";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

// ✅ Validasi input saat membuat buku baru
const createSchema = z.object({
  title: z.string().min(1),
  writer: z.string().min(1),
  publisher: z.string().min(1),
  description: z.string().optional(),
  publication_year: z.number().int(),
  price: z.number().nonnegative(),
  stock_quantity: z.number().int().nonnegative(),
  genre_id: z.string().uuid(),
  image_url: z.string().url().optional(), // ✅ tambahan
});

// 📘 CREATE BOOK
router.post("/", async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");
  const data = parse.data;

  // Pastikan genre valid
  const genre = await prisma.genre.findFirst({
    where: { id: data.genre_id, deleted_at: null },
  });
  if (!genre) return badRequest(res, "Genre not found or deleted");

  // Cegah duplikasi judul (soft-delete aware)
  const dup = await prisma.book.findFirst({
    where: { title: data.title, deleted_at: null },
  });
  if (dup) return badRequest(res, "Duplicate title is not allowed");

  const book = await prisma.book.create({
    data,
    select: {
      id: true,
      title: true,
      created_at: true,
    },
  });

  return created(res, "Book added successfully", book);
});

// 📗 GET ALL BOOKS
router.get("/", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const search = (req.query.search as string) || "";
  const orderByTitle = (req.query.orderByTitle as string) || undefined;
  const orderByYear = (req.query.orderByPublishDate as string) || undefined;

  const where: any = { deleted_at: null };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { writer: { contains: search, mode: "insensitive" } },
      { publisher: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: any[] = [];
  if (orderByTitle) orderBy.push({ title: orderByTitle });
  if (orderByYear) orderBy.push({ publication_year: orderByYear });
  if (orderBy.length === 0) orderBy.push({ created_at: "desc" });

  const [total, items] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        genre: { select: { id: true, name: true } },
      },
    }),
  ]);

  const mapped = items.map((b) => ({
    ...b,
    price: Number(b.price),
    genre: b.genre ? b.genre.name : "-",
  }));

  return res.json({
    success: true,
    message: "Get all books successfully",
    data: mapped,
    meta: buildMeta(page, limit, total),
  });
});

// 📙 GET BOOK DETAIL
router.get("/:id", async (req, res) => {
  const book = await prisma.book.findFirst({
    where: { id: req.params.id, deleted_at: null },
    include: {
      genre: { select: { id: true, name: true } },
    },
  });
  if (!book) return notFound(res, "Book not found");

  const data = {
    id: book.id,
    title: book.title,
    writer: book.writer,
    publisher: book.publisher,
    description: book.description,
    publication_year: book.publication_year,
    price: Number(book.price),
    stock_quantity: book.stock_quantity,
    genre: book.genre ? book.genre.name : "-",
    created_at: book.created_at,
  };

  return ok(res, "Get book detail successfully", data);
});

// 📕 GET BOOKS BY GENRE
router.get("/genre/:id", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const genre = await prisma.genre.findFirst({
    where: { id: req.params.id, deleted_at: null },
  });
  if (!genre) return notFound(res, "Genre not found");

  const [total, items] = await Promise.all([
    prisma.book.count({
      where: { genre_id: req.params.id, deleted_at: null },
    }),
    prisma.book.findMany({
      where: { genre_id: req.params.id, deleted_at: null },
      skip,
      take,
      orderBy: { created_at: "desc" },
      include: {
        genre: { select: { id: true, name: true } },
      },
    }),
  ]);

  const mapped = items.map((b) => ({
    ...b,
    price: Number(b.price),
    genre: b.genre ? b.genre.name : "-",
  }));

  return res.json({
    success: true,
    message: "Get all books by genre successfully",
    data: mapped,
    meta: buildMeta(page, limit, total),
  });
});

// ✏️ UPDATE BOOK (edit buku)
router.patch("/:id", async (req, res) => {
  const schema = z.object({
    title: z.string().optional(),
    writer: z.string().optional(),
    publisher: z.string().optional(),
    description: z.string().optional(),
    price: z.number().nonnegative().optional(),
    stock_quantity: z.number().int().nonnegative().optional(),
    publication_year: z.number().int().optional(),
    genre_id: z.string().uuid().optional(),
    image_url: z.string().url().optional(),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");

  const existing = await prisma.book.findFirst({
    where: { id: req.params.id, deleted_at: null },
  });
  if (!existing) return notFound(res, "Book not found");

  // Pastikan genre valid jika diganti
  if (parse.data.genre_id) {
    const genre = await prisma.genre.findFirst({
      where: { id: parse.data.genre_id, deleted_at: null },
    });
    if (!genre) return badRequest(res, "Genre not found or deleted");
  }

  const updated = await prisma.book.update({
    where: { id: req.params.id },
    data: parse.data,
    select: {
      id: true,
      title: true,
      updated_at: true,
    },
  });

  return ok(res, "Book updated successfully", updated);
});

// 🗑️ SOFT DELETE BOOK
router.delete("/:id", async (req, res) => {
  const existing = await prisma.book.findFirst({
    where: { id: req.params.id, deleted_at: null },
  });
  if (!existing) return notFound(res, "Book not found");

  await prisma.book.update({
    where: { id: req.params.id },
    data: { deleted_at: new Date() },
  });

  return ok(res, "Book removed successfully");
});

export default router;
