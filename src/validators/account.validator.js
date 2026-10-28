const { z } = require("zod");

const createAccountSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name is too long"),
  })
  .strict();

module.exports = { createAccountSchema };
