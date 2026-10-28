const { z } = require("zod");

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

module.exports = { createTransactionSchema };
