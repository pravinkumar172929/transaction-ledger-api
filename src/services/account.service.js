const pool = require("../db/pool");
const { AppError } = require("../utils/errors");

async function createAccount(name) {
  const { rows } = await pool.query(
    `INSERT INTO accounts (name)
     VALUES ($1)
     RETURNING id, name, balance, created_at`,
    [name]
  );
  return rows[0];
}

async function getAccountById(id, db = pool) {
  const { rows } = await db.query(
    "SELECT id, name, balance, created_at FROM accounts WHERE id = $1",
    [id]
  );
  if (rows.length === 0) {
    throw new AppError(404, "ACCOUNT_NOT_FOUND", `Account ${id} not found`);
  }
  return rows[0];
}

module.exports = { createAccount, getAccountById };
