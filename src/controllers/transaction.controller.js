const asyncHandler = require("../utils/asyncHandler");
const { validateAccountId } = require("../validators/common.validator");
const {
  createTransactionSchema,
} = require("../validators/transaction.validator");
const transactionService = require("../services/transaction.service");

const addTransaction = asyncHandler(async (req, res) => {
  const accountId = validateAccountId(req.params.id);
  const data = createTransactionSchema.parse(req.body ?? {});
  const result = await transactionService.addTransaction(accountId, data);
  res.status(201).json(result);
});

module.exports = { addTransaction };
