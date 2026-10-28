const pool = require("../db/pool");
const { AppError } = require("../utils/errors");

const TXN_COLUMNS =
  "id, account_id, type, amount, description, reference_id, created_at";
const toCents = (value) => Math.round(value * 100);

async function transfer({
  from_account_id,
  to_account_id,
  amount,
  description,
  reference_id,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Lock both accounts in a consistent order (by id) to avoid deadlocks
    const accRes = await client.query(
      `SELECT id, balance FROM accounts
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [[from_account_id, to_account_id]]
    );
    const from = accRes.rows.find((a) => a.id === from_account_id);
    const to = accRes.rows.find((a) => a.id === to_account_id);

    // 2. Both accounts must exist
    if (!from)
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        `Source account ${from_account_id} not found`
      );
    if (!to)
      throw new AppError(
        404,
        "ACCOUNT_NOT_FOUND",
        `Destination account ${to_account_id} not found`
      );

    // 3. reference_id must be unused on both accounts
    const dupRes = await client.query(
      `SELECT account_id FROM transactions
       WHERE reference_id = $1 AND account_id = ANY($2::uuid[])`,
      [reference_id, [from_account_id, to_account_id]]
    );
    if (dupRes.rowCount > 0) {
      throw new AppError(
        409,
        "DUPLICATE_TRANSACTION",
        `reference_id "${reference_id}" has already been used`,
        { account_ids: dupRes.rows.map((r) => r.account_id) }
      );
    }

    // 4. Source must have sufficient balance
    if (toCents(from.balance) < toCents(amount)) {
      throw new AppError(
        422,
        "INSUFFICIENT_BALANCE",
        "Insufficient balance in source account",
        {
          balance: from.balance,
          requested: amount,
        }
      );
    }

    // 5. Debit source, credit destination
    const debitRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES ($1, 'debit', $2, $3, $4)
       RETURNING ${TXN_COLUMNS}`,
      [
        from_account_id,
        amount,
        description ?? `Transfer to ${to_account_id}`,
        reference_id,
      ]
    );
    const creditRes = await client.query(
      `INSERT INTO transactions (account_id, type, amount, description, reference_id)
       VALUES ($1, 'credit', $2, $3, $4)
       RETURNING ${TXN_COLUMNS}`,
      [
        to_account_id,
        amount,
        description ?? `Transfer from ${from_account_id}`,
        reference_id,
      ]
    );

    // 6. Update both balances
    const fromBal = await client.query(
      "UPDATE accounts SET balance = balance - $1 WHERE id = $2 RETURNING balance",
      [amount, from_account_id]
    );
    const toBal = await client.query(
      "UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance",
      [amount, to_account_id]
    );

    await client.query("COMMIT");

    return {
      reference_id,
      amount,
      from: {
        account_id: from_account_id,
        balance: fromBal.rows[0].balance,
        transaction: debitRes.rows[0],
      },
      to: {
        account_id: to_account_id,
        balance: toBal.rows[0].balance,
        transaction: creditRes.rows[0],
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      throw new AppError(
        409,
        "DUPLICATE_TRANSACTION",
        "reference_id has already been used"
      );
    }
    if (err.code === "23514") {
      throw new AppError(
        422,
        "INSUFFICIENT_BALANCE",
        "Insufficient balance in source account"
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { transfer };
