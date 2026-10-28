const express = require("express");
const { ZodError } = require("zod");
const { AppError } = require("./utils/errors");
const pool = require("./db/pool");

const app = express();
app.use(express.json());

app.get("/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    next(err);
  }
});

app.use("/accounts", require("./routes/accounts.routes"));
app.use("/transfers", require("./routes/transfers.routes"));

// Unknown routes (this also covers PUT/PATCH/DELETE on transactions)
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
});

// Single error handler, so every error has the same shape
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body is not valid JSON",
      },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: err.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }
  console.error(err);
  res
    .status(500)
    .json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
});

module.exports = app;
