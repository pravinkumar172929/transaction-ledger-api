const { z } = require("zod");
const { AppError } = require("../utils/errors");

const uuidSchema = z.string().uuid();

function validateAccountId(id) {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    throw new AppError(
      400,
      "INVALID_ACCOUNT_ID",
      `"${id}" is not a valid account ID`
    );
  }
  return result.data;
}

module.exports = { validateAccountId };
