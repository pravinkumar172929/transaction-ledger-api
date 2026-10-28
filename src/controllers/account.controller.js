const asyncHandler = require("../utils/asyncHandler");
const { createAccountSchema } = require("../validators/account.validator");
const accountService = require("../services/account.service");

const createAccount = asyncHandler(async (req, res) => {
  const { name } = createAccountSchema.parse(req.body ?? {});
  const account = await accountService.createAccount(name);
  res.status(201).json(account);
});

module.exports = { createAccount };
