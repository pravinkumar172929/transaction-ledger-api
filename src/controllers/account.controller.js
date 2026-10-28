const asyncHandler = require("../utils/asyncHandler");
const { createAccountSchema } = require("../validators/account.validator");
const { validateAccountId } = require("../validators/common.validator");
const accountService = require("../services/account.service");

const createAccount = asyncHandler(async (req, res) => {
  const { name } = createAccountSchema.parse(req.body ?? {});
  const account = await accountService.createAccount(name);
  res.status(201).json(account);
});

const getAccount = asyncHandler(async (req, res) => {
  const id = validateAccountId(req.params.id);
  const account = await accountService.getAccountById(id);
  res.json(account);
});

const getBalance = asyncHandler(async (req, res) => {
  const id = validateAccountId(req.params.id);
  const account = await accountService.getAccountById(id);
  res.json({ account_id: account.id, balance: account.balance });
});

module.exports = { createAccount, getAccount, getBalance };
