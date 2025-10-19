import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import { errorHandler } from "./middlewares/error";
import { ok } from "./lib/response";

import authRouter from "./modules/auth/router";
import genreRouter from "./modules/genre/router";
import bookRouter from "./modules/book/router";
import transactionRouter from "./modules/transaction/router";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Health check (must return current date)
app.get("/health", (_req, res) => {
  const now = new Date().toISOString();
  return ok(res, "OK", { date: now });
});

app.use("/auth", authRouter);
app.use("/genre", genreRouter);
app.use("/books", bookRouter);
app.use("/transactions", transactionRouter);

app.use(errorHandler);

export default app;
