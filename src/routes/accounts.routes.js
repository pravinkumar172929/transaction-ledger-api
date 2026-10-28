const express = require("express");
const accountController = require("../controllers/account.controller");

const router = express.Router();

router.post("/", accountController.createAccount);
router.get("/:id", accountController.getAccount);
router.get("/:id/balance", accountController.getBalance);

module.exports = router;
