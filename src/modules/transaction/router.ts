import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { created, ok, notFound, badRequest } from "../../lib/response";
import { requireAuth, AuthRequest } from "../../middlewares/auth";
import { parsePagination, buildMeta } from "../../utils/pagination";
import { z } from "zod";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  items: z.array(z.object({
    book_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1)
});

router.post("/", async (req: AuthRequest, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");
  const items = parse.data.items;

  // Validate all books exist, not soft-deleted and have enough stock
  const bookIds = items.map(i => i.book_id);
  const books = await prisma.book.findMany({
    where: { id: { in: bookIds }, deleted_at: null },
    select: { id: true, price: true, stock_quantity: true }
  });
  const bookMap = new Map(books.map(b => [b.id, b]));

  for (const item of items) {
    const b = bookMap.get(item.book_id);
    if (!b) return badRequest(res, `Book ${item.book_id} not found or deleted`);
    if (b.stock_quantity < item.quantity) return badRequest(res, `Insufficient stock for book ${item.book_id}`);
  }

  const total_quantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const total_price = items.reduce((sum, i) => {
    const b = bookMap.get(i.book_id)!;
    return sum + Number(b.price) * i.quantity;
  }, 0);

  // Create order and order_items atomically + decrement stock
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { user_id: req.user!.id }
    });
    for (const it of items) {
      const b = bookMap.get(it.book_id)!;
      await tx.orderItem.create({
        data: { order_id: order.id, book_id: it.book_id, quantity: it.quantity }
      });
      await tx.book.update({
        where: { id: it.book_id },
        data: { stock_quantity: b.stock_quantity - it.quantity }
      });
    }
    return order;
  });

  return created(res, "Transaction created successfully", {
    transaction_id: result.id,
    total_quantity,
    total_price
  });
});

// Get all transactions (basic pagination + ordering)
router.get("/", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const orderById = (req.query.orderById as string) || "desc";
  const orderByAmount = (req.query.orderByAmount as string) || undefined;

  const [total, rows] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
      skip,
      take,
      orderBy: { created_at: orderById === "asc" ? "asc" : "desc" },
      include: { items: { include: { book: true } } }
    })
  ]);

  const data = rows.map((o) => {
    const total_quantity = o.items.reduce((s, it) => s + it.quantity, 0);
    const total_price = o.items.reduce((s, it) => s + Number(it.book.price) * it.quantity, 0);
    return { id: o.id, total_quantity, total_price };
  });

  if (orderByAmount) {
    data.sort((a, b) => orderByAmount === "asc" ? a.total_quantity - b.total_quantity : b.total_quantity - a.total_quantity);
  }

  return res.json({
    success: true,
    message: "Get all transaction successfully",
    data,
    meta: buildMeta(page, limit, total)
  });
});

// Get transaction detail
router.get("/:id", async (req, res) => {
  const o = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { book: true } } }
  });
  if (!o) return notFound(res, "Transaction not found");

  const items = o.items.map((it) => ({
    book_id: it.book_id,
    book_title: it.book.title,
    quantity: it.quantity,
    subtotal_price: Number(it.book.price) * it.quantity
  }));

  return ok(res, "Get transaction detail successfully", {
    id: o.id,
    items
  });
});

// Transaction statistics
router.get("/statistics", async (_req, res) => {
  const orders = await prisma.order.findMany({
    include: { items: { include: { book: { include: { genre: true } } } } }
  });

  const total_transactions = orders.length;
  const totals = orders.map(o => o.items.reduce((s, it) => s + Number(it.book.price) * it.quantity, 0));
  const average_nominal = totals.length ? totals.reduce((a,b)=>a+b,0) / totals.length : 0;

  // genre -> set of order ids (count distinct orders per genre)
  const genreOrders = new Map<string, Set<string>>();
  const genreNames = new Map<string, string>();

  for (const o of orders) {
    const seen = new Set<string>();
    for (const it of o.items) {
      const gid = it.book.genre_id;
      genreNames.set(gid, it.book.genre.name);
      if (!seen.has(gid)) {
        if (!genreOrders.has(gid)) genreOrders.set(gid, new Set());
        genreOrders.get(gid)!.add(o.id);
        seen.add(gid);
      }
    }
  }

  let most: any = null;
  let least: any = null;
  for (const [gid, set] of genreOrders.entries()) {
    const count = set.size;
    const name = genreNames.get(gid) || gid;
    if (!most || count > most.count) most = { genre_id: gid, name, count };
    if (!least || count < least.count) least = { genre_id: gid, name, count };
  }

  return ok(res, "Get transaction statistics successfully", {
    total_transactions,
    average_nominal_per_transaction: average_nominal,
    most_sold_genre: most,
    least_sold_genre: least
  });
});

export default router;
