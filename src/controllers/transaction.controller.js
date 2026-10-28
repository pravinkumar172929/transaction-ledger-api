const asyncHandler = require("../utils/asyncHandler");
const { validateAccountId } = require("../validators/common.validator");
const {
  createTransactionSchema,
  parseListQuery,
} = require("../validators/transaction.validator");
const transactionService = require("../services/transaction.service");

const addTransaction = asyncHandler(async (req, res) => {
  const accountId = validateAccountId(req.params.id);
  const data = createTransactionSchema.parse(req.body ?? {});
  const result = await transactionService.addTransaction(accountId, data);
  res.status(201).json(result);
});

const listTransactions = asyncHandler(async (req, res) => {
  const accountId = validateAccountId(req.params.id);
  const query = parseListQuery(req.query);
  const result = await transactionService.listTransactions(accountId, query);
  res.json(result);
});

module.exports = { addTransaction, listTransactions };
