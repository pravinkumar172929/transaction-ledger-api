const pool = require("../db/pool");
const { AppError } = require("../utils/errors");
const { getAccountById } = require("./account.service");

const TXN_COLUMNS =
  "id, account_id, type, amount, description, reference_id, created_at";

const toCents = (value) => Math.round(value * 100);

async function addTransaction(
  accountId,
  { type, amount, description, reference_id }
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const accRes = await client.query(
      "SELECT id, balance FROM accounts WHERE id = $1 FOR UPDATE",
      [accountId]
    );
    if (accRes.rowCount === 0) {
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        `Account ${accountId} not found`
      );
    }
    const account = accRes.rows[0];

    const dupRes = await client.query(
      `SELECT ${TXN_COLUMNS} FROM transactions
       WHERE account_id = $1 AND reference_id = $2`,
      [accountId, reference_id]
    );
    if (dupRes.rowCount > 0) {
      throw new AppError(
        409,
        "DUPLICATE_TRANSACTION",
        `Transaction with reference_id "${reference_id}" already exists for this account`,
        { existing_transaction: dupRes.rows[0] }
      );
    }

    if (type === "debit" && toCents(account.balance) < toCents(amount)) {
      throw new AppError(
        422,
        "INSUFFICIENT_BALANCE",
        "Insufficient balance for this debit",
        {
          balance: account.balance,
          requested: amount,
        }
      );
    }

    const txnRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${TXN_COLUMNS}`,
      [accountId, type, amount, description ?? null, reference_id]
    );

    const delta = type === "credit" ? amount : -amount;
    const balRes = await client.query(
      "UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance",
      [delta, accountId]
    );

    await client.query("COMMIT");
    return { transaction: txnRes.rows[0], balance: balRes.rows[0].balance };
  } catch (err) {
    await client.query("ROLLBACK");

    if (err.code === "23505") {
      throw new AppError(
        409,
        "DUPLICATE_TRANSACTION",
        "Transaction with this reference_id already exists"
      );
    }
    if (err.code === "23514") {
      throw new AppError(
        422,
        "INSUFFICIENT_BALANCE",
        "Insufficient balance for this debit"
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listTransactions(accountId, { type, page, limit }) {
  // 404 if the account doesn't exist
  await getAccountById(accountId);

  const params = [accountId];
  let where = "WHERE account_id = $1";
  if (type) {
    params.push(type);
    where += ` AND type = $${params.length}`;
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM transactions ${where}`,
    params
  );
  const total = countRes.rows[0].total;

  const offset = (page - 1) * limit;
  const dataRes = await pool.query(
    `SELECT ${TXN_COLUMNS} FROM transactions
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: dataRes.rows,
    pagination: {
      page,
      limit,
      total_records: total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}

module.exports = { addTransaction, listTransactions };
