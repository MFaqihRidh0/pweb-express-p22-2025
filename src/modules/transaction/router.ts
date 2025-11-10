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
  })).min(1),
});

// 🧾 Create transaction
router.post("/", async (req: AuthRequest, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) return badRequest(res, "Invalid body");
  const items = parse.data.items;

  const bookIds = items.map(i => i.book_id);
  const books = await prisma.book.findMany({
    where: { id: { in: bookIds }, deleted_at: null },
    select: { id: true, price: true, stock_quantity: true }
  });
  const bookMap = new Map(books.map(b => [b.id, b]));

  for (const item of items) {
    const b = bookMap.get(item.book_id);
    if (!b) return badRequest(res, `Book ${item.book_id} not found or deleted`);
    if (b.stock_quantity < item.quantity)
      return badRequest(res, `Insufficient stock for book ${item.book_id}`);
  }

  const total_quantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const total_price = items.reduce((sum, i) => {
    const b = bookMap.get(i.book_id)!;
    return sum + Number(b.price) * i.quantity;
  }, 0);

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { user_id: req.user!.id },
    });

    for (const it of items) {
      await tx.orderItem.create({
        data: { order_id: order.id, book_id: it.book_id, quantity: it.quantity },
      });
      await tx.book.update({
        where: { id: it.book_id },
        data: { stock_quantity: { decrement: it.quantity } },
      });
    }

    return order;
  });

  return created(res, "Transaction created successfully", {
    transaction_id: result.id,
    total_quantity,
    total_price,
  });
});

// 📊 Get all transactions
router.get("/", async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const orderById = (req.query.orderById as string) || "desc";

  const [total, orders] = await Promise.all([
    prisma.order.count(),
    prisma.order.findMany({
      skip,
      take,
      orderBy: { created_at: orderById === "asc" ? "asc" : "desc" },
      include: { items: { include: { book: true } } },
    }),
  ]);

  const data = orders.map((o) => {
    const total_quantity = o.items.reduce((sum, it) => sum + it.quantity, 0);
    const total_price = o.items.reduce((sum, it) => sum + Number(it.book.price) * it.quantity, 0);
    return {
      id: o.id,
      amount: total_quantity,
      price: total_price,
      created_at: o.created_at,
    };
  });

  return ok(res, "Get all transactions successfully", {
    data,
    meta: buildMeta(page, limit, total),
  });
});

// 🧾 Get transaction detail
router.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { book: true } } },
  });

  if (!order) return notFound(res, "Transaction not found");

  const items = order.items.map((it) => ({
    book_id: it.book_id,
    title: it.book.title,
    price: Number(it.book.price),
    quantity: it.quantity,
    subtotal: Number(it.book.price) * it.quantity,
  }));

  const total_price = items.reduce((sum, i) => sum + i.subtotal, 0);

  return ok(res, "Get transaction detail successfully", {
    id: order.id,
    items,
    total_price,
    created_at: order.created_at,
  });
});

export default router;
