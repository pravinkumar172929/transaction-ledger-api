const express = require("express");
const accountController = require("../controllers/account.controller");
const transactionController = require("../controllers/transaction.controller");

const router = express.Router();

router.post("/", accountController.createAccount);
router.get("/:id", accountController.getAccount);
router.get("/:id/balance", accountController.getBalance);

router.post("/:id/transactions", transactionController.addTransaction);

module.exports = router;
