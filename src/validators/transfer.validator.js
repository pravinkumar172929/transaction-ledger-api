const { z } = require("zod");
const { amountSchema } = require("./transaction.validator");

const createTransferSchema = z
  .object({
    from_account_id: z
      .string()
      .uuid("from_account_id must be a valid account ID"),
    to_account_id: z.string().uuid("to_account_id must be a valid account ID"),
    amount: amountSchema,
    description: z
      .string()
      .trim()
      .max(255, "Description is too long")
      .optional(),
    reference_id: z.string().trim().min(1, "reference_id is required").max(100),
  })
  .strict()
  .refine((d) => d.from_account_id !== d.to_account_id, {
    message: "Cannot transfer to the same account",
    path: ["to_account_id"],
  });

module.exports = { createTransferSchema };
