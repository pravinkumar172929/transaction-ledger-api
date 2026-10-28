const asyncHandler = require("../utils/asyncHandler");
const { createTransferSchema } = require("../validators/transfer.validator");
const transferService = require("../services/transfer.service");

const createTransfer = asyncHandler(async (req, res) => {
  const data = createTransferSchema.parse(req.body ?? {});
  const result = await transferService.transfer(data);
  res.status(201).json(result);
});

module.exports = { createTransfer };
