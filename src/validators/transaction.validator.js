const { z } = require("zod");
const { AppError } = require("../utils/errors");

const hasMaxTwoDecimals = (v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-9;

const createTransactionSchema = z
  .object({
    type: z.enum(["credit", "debit"]),
    amount: z
      .number()
      .positive("Amount must be greater than 0")
      .max(1000000000000, "Amount is too large")
      .refine(hasMaxTwoDecimals, "Amount can have at most 2 decimal places"),
    description: z
      .string()
      .trim()
      .max(255, "Description is too long")
      .optional(),
    reference_id: z.string().trim().min(1, "reference_id is required").max(100),
  })
  .strict();

const listTransactionsQuerySchema = z.object({
  type: z.enum(["credit", "debit"]).optional(),
  page: z.coerce
    .number()
    .int("page must be an integer")
    .min(1, "page must be at least 1")
    .default(1),
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(100, "limit cannot exceed 100")
    .default(10),
});

function parseListQuery(query) {
  const result = listTransactionsQuerySchema.safeParse(query ?? {});
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_QUERY_PARAMS",
      "Invalid query parameters",
      result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }))
    );
  }
  return result.data;
}

module.exports = { createTransactionSchema, parseListQuery };
