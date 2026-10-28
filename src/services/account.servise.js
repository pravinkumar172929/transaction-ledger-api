const pool = require("../db/pool");

async function createAccount(name) {
  // balance (0), id and created_at are set by the database, never by the client
  const { rows } = await pool.query(
    `INSERT INTO accounts (name)
     VALUES ($1)
     RETURNING id, name, balance, created_at`,
    [name]
  );
  return rows[0];
}

module.exports = { createAccount };
