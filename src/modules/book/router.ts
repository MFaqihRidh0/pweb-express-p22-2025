import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { created, ok, notFound, badRequest } from "../../lib/response";
import { requireAuth } from "../../middlewares/auth";
import { parsePagination, buildMeta } from "../../utils/pagination";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(1),
  writer: z.string().min(1),
  publisher: z.string().min(1),
  description: z.string().optional(),
  publication_year: z.number().int(),
  price: z.number().nonnegative(),
  stock_quantity: z.number().int().nonnegative(),
  genre_id: z.string().uuid(),
});

router.post("/", async (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");
  const data = parse.data;

  // Check genre exists and not soft-deleted
  const genre = await prisma.genre.findFirst({ where: { id: data.genre_id, deleted_at: null } });
  if (!genre) return badRequest(res, "Genre not found or deleted");

  // Prevent duplicate titles among active books
  const dup = await prisma.book.findFirst({ where: { title: data.title, deleted_at: null } });
  if (dup) return badRequest(res, "Duplicate title is not allowed");

  const book = await prisma.book.create({
    data: { ...data },
    select: { id: true, title: true, created_at: true },
  });

  return created(res, "Book added successfully", book);
});

// Get all books with filters
router.get("/", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const search = (req.query.search as string) || "";
  const orderByTitle = (req.query.orderByTitle as string) || undefined;
  const orderByPublishDate = (req.query.orderByPublishDate as string) || undefined;

  const where: any = { deleted_at: null };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { writer: { contains: search, mode: "insensitive" } },
      { publisher: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: any[] = [];
  if (orderByTitle) orderBy.push({ title: orderByTitle === "desc" ? "desc" : "asc" });
  if (orderByPublishDate) orderBy.push({ publication_year: orderByPublishDate === "desc" ? "desc" : "asc" });
  if (orderBy.length === 0) orderBy.push({ created_at: "desc" });

  const [total, items] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        title: true,
        writer: true,
        publisher: true,
        description: true,
        publication_year: true,
        price: true,
        stock_quantity: true,
        genre: { select: { name: true } },
      },
    }),
  ]);

  const mapped = items.map((b) => ({
    id: b.id,
    title: b.title,
    writer: b.writer,
    publisher: b.publisher,
    description: b.description,
    publication_year: b.publication_year,
    price: Number(b.price),
    stock_quantity: b.stock_quantity,
    genre: b.genre.name,
  }));

  return res.json({
    success: true,
    message: "Get all book successfully",
    data: mapped,
    meta: buildMeta(page, limit, total),
  });
});

// Get book by id
router.get("/:id", async (req, res) => {
  const b = await prisma.book.findFirst({
    where: { id: req.params.id, deleted_at: null },
    select: {
      id: true,
      title: true,
      writer: true,
      publisher: true,
      description: true,
      publication_year: true,
      price: true,
      stock_quantity: true,
      genre: { select: { name: true } },
    },
  });
  if (!b) return notFound(res, "Book not found");
  const data = {
    ...b,
    price: Number(b.price),
    genre: b.genre.name,
  };
  return ok(res, "Get book detail successfully", data);
});

// Get books by genre
router.get("/genre/:id", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const search = (req.query.search as string) || "";
  const orderByTitle = (req.query.orderByTitle as string) || undefined;
  const orderByPublishDate = (req.query.orderByPublishDate as string) || undefined;

  // Ensure genre exists (even if soft-deleted we still can list? we require active)
  const genre = await prisma.genre.findFirst({ where: { id: req.params.id, deleted_at: null } });
  if (!genre) return notFound(res, "Genre not found");

  const where: any = { deleted_at: null, genre_id: req.params.id };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { writer: { contains: search, mode: "insensitive" } },
      { publisher: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: any[] = [];
  if (orderByTitle) orderBy.push({ title: orderByTitle === "desc" ? "desc" : "asc" });
  if (orderByPublishDate) orderBy.push({ publication_year: orderByPublishDate === "desc" ? "desc" : "asc" });
  if (orderBy.length === 0) orderBy.push({ created_at: "desc" });

  const [total, items] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        title: true,
        writer: true,
        publisher: true,
        description: true,
        publication_year: true,
        price: true,
        stock_quantity: true,
        genre: { select: { name: true } },
      },
    }),
  ]);

  const mapped = items.map((b) => ({
    id: b.id,
    title: b.title,
    writer: b.writer,
    publisher: b.publisher,
    description: b.description,
    publication_year: b.publication_year,
    price: Number(b.price),
    stock_quantity: b.stock_quantity,
    genre: b.genre.name,
  }));

  return res.json({
    success: true,
    message: "Get all book by genre successfully",
    data: mapped,
    meta: buildMeta(page, limit, total),
  });
});

// Update book (only description, price, stock_quantity)
router.patch("/:id", async (req, res) => {
  const schema = z.object({
    description: z.string().optional(),
    price: z.number().nonnegative().optional(),
    stock_quantity: z.number().int().nonnegative().optional(),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");

  const existing = await prisma.book.findFirst({ where: { id: req.params.id, deleted_at: null } });
  if (!existing) return notFound(res, "Book not found");

  const payload: any = {};
  if (typeof parse.data.description !== "undefined") payload.description = parse.data.description;
  if (typeof parse.data.price !== "undefined") payload.price = parse.data.price;
  if (typeof parse.data.stock_quantity !== "undefined") payload.stock_quantity = parse.data.stock_quantity;

  const updated = await prisma.book.update({
    where: { id: req.params.id },
    data: payload,
    select: { id: true, title: true, updated_at: true },
  });

  return ok(res, "Book updated successfully", updated);
});

// Soft delete book
router.delete("/:id", async (req, res) => {
  const existing = await prisma.book.findFirst({ where: { id: req.params.id, deleted_at: null } });
  if (!existing) return notFound(res, "Book not found");

  await prisma.book.update({
    where: { id: req.params.id },
    data: { deleted_at: new Date() },
  });

  // order_items remain intact
  return ok(res, "Book removed successfully");
});

export default router;
