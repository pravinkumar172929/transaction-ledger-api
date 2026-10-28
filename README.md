# Transaction Ledger API

A backend API for a simple transaction ledger. It supports creating accounts, recording credit/debit transactions, fetching balances and paginated transaction history, and transferring money between accounts — with strong guarantees around atomicity, idempotency (duplicate protection) and balance consistency.

---

## Tech Stack

| Layer      | Choice                                  |
| ---------- | --------------------------------------- |
| Runtime    | Node.js (v18+)                          |
| Framework  | Express                                 |
| Database   | PostgreSQL 16 (via Docker)              |
| DB driver  | `pg` (plain SQL, explicit transactions) |
| Validation | Zod                                     |

---

## Getting Started

### Prerequisites

- Node.js 18 or newer
- Docker + Docker Compose (Docker Desktop must be running)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/pravinkumar172929/transaction-ledger-api.git
cd transaction-ledger-api

# 2. Install dependencies
npm install

# 3. Create the environment file
cp .env.example .env

# 4. Start PostgreSQL (schema is created automatically on first start)
docker compose up -d

# 5. Start the API
npm run dev      # development, auto-reload
# or
npm start        # plain node
```

The API runs at **http://localhost:3000**.

Verify it's working:

```bash
curl http://localhost:3000/health
# {"status":"ok","database":"connected"}
```

### Environment variables

| Variable       | Default                                          | Description                  |
| -------------- | ------------------------------------------------ | ---------------------------- |
| `PORT`         | `3000`                                           | Port the API listens on      |
| `DATABASE_URL` | `postgres://ledger:ledger@localhost:5433/ledger` | PostgreSQL connection string |

> The database is exposed on host port **5433** (not 5432) to avoid clashing with any other local PostgreSQL instance.

### Resetting the database

`src/db/schema.sql` runs only when the database volume is first created. To wipe all data and re-apply the schema:

```bash
docker compose down -v
docker compose up -d
```

---

## Project Structure

```
src/
├── app.js                     # Express app, route mounting, 404 + global error handler
├── server.js                  # Entry point
├── db/
│   ├── pool.js                # PostgreSQL connection pool
│   └── schema.sql             # Tables, constraints, indexes
├── routes/                    # URL → controller mapping
│   ├── accounts.routes.js
│   └── transfers.routes.js
├── controllers/               # Parse/validate request → call service → send response
│   ├── account.controller.js
│   ├── transaction.controller.js
│   └── transfer.controller.js
├── services/                  # Business logic and database transactions
│   ├── account.service.js
│   ├── transaction.service.js
│   └── transfer.service.js
├── validators/                # Zod schemas for request validation
│   ├── account.validator.js
│   ├── common.validator.js
│   ├── transaction.validator.js
│   └── transfer.validator.js
└── utils/
    ├── asyncHandler.js        # Forwards async errors to the error handler
    └── errors.js              # AppError class
```

---

## Database Schema

```sql
accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
  balance     NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)

transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id),
  type          TEXT NOT NULL CHECK (type IN ('credit','debit')),
  amount        NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  description   TEXT,
  reference_id  TEXT NOT NULL CHECK (length(trim(reference_id)) > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, reference_id)
)

INDEX (account_id, created_at DESC) ON transactions
```

Database constraints enforce integrity independently of application code:

- `balance >= 0` — an account can never go negative, even if application checks were bypassed.
- `amount > 0` and `type IN ('credit','debit')` — invalid transactions cannot be stored.
- `UNIQUE (account_id, reference_id)` — duplicate references for the same account are impossible.
- `REFERENCES accounts(id)` — a transaction cannot point to a non-existent account.

---

## API Documentation

Base URL: `http://localhost:3000`
All request and response bodies are JSON. Send `Content-Type: application/json` on requests with a body.

### Summary

| Method | Endpoint                     | Description                                          |
| ------ | ---------------------------- | ---------------------------------------------------- |
| GET    | `/health`                    | Health check (API + database)                        |
| POST   | `/accounts`                  | Create an account                                    |
| GET    | `/accounts/:id`              | Get account details                                  |
| GET    | `/accounts/:id/balance`      | Get account balance                                  |
| POST   | `/accounts/:id/transactions` | Add a credit or debit transaction                    |
| GET    | `/accounts/:id/transactions` | Transaction history (filter, paginate, latest first) |
| POST   | `/transfers`                 | Transfer money between two accounts (bonus)          |

---

### 1. Create Account

`POST /accounts`

**Request body**

| Field  | Type   | Required | Rules                                   |
| ------ | ------ | -------- | --------------------------------------- |
| `name` | string | yes      | Non-empty after trimming, max 100 chars |

Any other field (including `balance`) is rejected with `400 VALIDATION_ERROR` — the client cannot set the initial balance.

```bash
curl -X POST http://localhost:3000/accounts \
  -H "Content-Type: application/json" \
  -d '{"name": "Pravin"}'
```

**Response `201 Created`**

```json
{
  "id": "a4cb5576-274e-4237-a362-fc1e55eaa342",
  "name": "Pravin",
  "balance": 0,
  "created_at": "2026-10-28T14:10:02.118Z"
}
```

**Errors:** `400 VALIDATION_ERROR` (missing/empty name, unknown fields), `400 INVALID_JSON`

---

### 2. Get Account

`GET /accounts/:id`

**Response `200 OK`**

```json
{
  "id": "a4cb5576-274e-4237-a362-fc1e55eaa342",
  "name": "Pravin",
  "balance": 100,
  "created_at": "2026-10-28T14:10:02.118Z"
}
```

**Errors:** `400 INVALID_ACCOUNT_ID`, `404 ACCOUNT_NOT_FOUND`

---

### 3. Get Account Balance

`GET /accounts/:id/balance`

```bash
curl http://localhost:3000/accounts/<account_id>/balance
```

**Response `200 OK`**

```json
{
  "account_id": "a4cb5576-274e-4237-a362-fc1e55eaa342",
  "balance": 100
}
```

**Errors:** `400 INVALID_ACCOUNT_ID`, `404 ACCOUNT_NOT_FOUND`

---

### 4. Add Transaction

`POST /accounts/:id/transactions`

**Request body**

| Field          | Type   | Required | Rules                                                |
| -------------- | ------ | -------- | ---------------------------------------------------- |
| `type`         | string | yes      | `credit` or `debit`                                  |
| `amount`       | number | yes      | > 0, at most 2 decimal places, max 1,000,000,000,000 |
| `reference_id` | string | yes      | Non-empty, max 100 chars, unique per account         |
| `description`  | string | no       | Max 255 chars                                        |

```bash
curl -X POST http://localhost:3000/accounts/<account_id>/transactions \
  -H "Content-Type: application/json" \
  -d '{"type":"credit","amount":100,"description":"Salary","reference_id":"ref-1"}'
```

**Response `201 Created`**

```json
{
  "transaction": {
    "id": "620cf352-db06-494f-8138-1246016a5e3d",
    "account_id": "8e83b0bf-28e3-4e76-adec-fbaad6167bb0",
    "type": "credit",
    "amount": 100,
    "description": "Salary",
    "reference_id": "ref-1",
    "created_at": "2026-10-28T14:23:37.552Z"
  },
  "balance": 100
}
```

`balance` is the account balance after this transaction.

**Behaviour**

- **Credit** increases the balance by `amount`.
- **Debit** decreases the balance by `amount`; rejected with `422 INSUFFICIENT_BALANCE` if the balance is too low. The balance is unchanged.
- **Duplicate `reference_id`** for the same account returns `409 DUPLICATE_TRANSACTION` with the existing transaction in `details`. No new transaction is created and the balance does not change. The same `reference_id` may be used on different accounts.

**Duplicate response example `409 Conflict`**

```json
{
  "error": {
    "code": "DUPLICATE_TRANSACTION",
    "message": "Transaction with reference_id \"ref-1\" already exists for this account",
    "details": {
      "existing_transaction": {
        "id": "620cf352-db06-494f-8138-1246016a5e3d",
        "account_id": "8e83b0bf-28e3-4e76-adec-fbaad6167bb0",
        "type": "credit",
        "amount": 100,
        "description": "Salary",
        "reference_id": "ref-1",
        "created_at": "2026-10-28T14:23:37.552Z"
      }
    }
  }
}
```

**Errors:** `400 VALIDATION_ERROR`, `400 INVALID_JSON`, `400 INVALID_ACCOUNT_ID`, `404 ACCOUNT_NOT_FOUND`, `409 DUPLICATE_TRANSACTION`, `422 INSUFFICIENT_BALANCE`

---

### 5. Transaction History

`GET /accounts/:id/transactions`

**Query parameters**

| Param   | Default  | Rules               |
| ------- | -------- | ------------------- |
| `type`  | — (both) | `credit` or `debit` |
| `page`  | `1`      | Integer ≥ 1         |
| `limit` | `10`     | Integer 1–100       |

Results are sorted **latest first** by `created_at` (ties broken by `id` for stable ordering).

```bash
curl "http://localhost:3000/accounts/<account_id>/transactions?type=debit&page=1&limit=2"
```

**Response `200 OK`**

```json
{
  "data": [
    {
      "id": "ce37cf13-b787-40b3-ab54-8644cac7c702",
      "account_id": "8e83b0bf-28e3-4e76-adec-fbaad6167bb0",
      "type": "debit",
      "amount": 20,
      "description": "Coffee",
      "reference_id": "ref-4",
      "created_at": "2026-10-28T14:23:37.586Z"
    },
    {
      "id": "48ba2f4d-30ba-4161-8a30-7c7b4d57804a",
      "account_id": "8e83b0bf-28e3-4e76-adec-fbaad6167bb0",
      "type": "debit",
      "amount": 30,
      "description": "Groceries",
      "reference_id": "ref-3",
      "created_at": "2026-10-28T14:23:37.576Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 2,
    "total_records": 2,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

A page beyond the last returns an empty `data` array with correct pagination metadata.

**Errors:** `400 INVALID_QUERY_PARAMS`, `400 INVALID_ACCOUNT_ID`, `404 ACCOUNT_NOT_FOUND`

---

### 6. Transfer Money (Bonus)

`POST /transfers`

**Request body**

| Field             | Type          | Required | Rules                                                 |
| ----------------- | ------------- | -------- | ----------------------------------------------------- |
| `from_account_id` | string (UUID) | yes      | Must exist                                            |
| `to_account_id`   | string (UUID) | yes      | Must exist, must differ from `from_account_id`        |
| `amount`          | number        | yes      | Same rules as transactions                            |
| `reference_id`    | string        | yes      | Must not already be used on either account            |
| `description`     | string        | no       | Defaults to `Transfer to <id>` / `Transfer from <id>` |

```bash
curl -X POST http://localhost:3000/transfers \
  -H "Content-Type: application/json" \
  -d '{"from_account_id":"<A>","to_account_id":"<B>","amount":30,"reference_id":"tr-1","description":"Rent share"}'
```

**Response `201 Created`**

```json
{
  "reference_id": "tr-1",
  "amount": 30,
  "from": {
    "account_id": "<A>",
    "balance": 70,
    "transaction": {
      "id": "...",
      "type": "debit",
      "amount": 30,
      "reference_id": "tr-1",
      "...": "..."
    }
  },
  "to": {
    "account_id": "<B>",
    "balance": 80,
    "transaction": {
      "id": "...",
      "type": "credit",
      "amount": 30,
      "reference_id": "tr-1",
      "...": "..."
    }
  }
}
```

A transfer is recorded as two linked transactions sharing the same `reference_id`: a **debit** on the source and a **credit** on the destination. Both appear in each account's transaction history.

**Errors:** `400 VALIDATION_ERROR` (incl. same source and destination), `400 INVALID_JSON`, `404 ACCOUNT_NOT_FOUND`, `409 DUPLICATE_TRANSACTION`, `422 INSUFFICIENT_BALANCE`

---

## Error Handling

Every error response has the same shape:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human readable explanation",
    "details": "optional — field errors or extra context"
  }
}
```

Validation errors list each failing field:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      { "field": "amount", "message": "Amount must be greater than 0" }
    ]
  }
}
```

### Error codes

| HTTP | Code                    | When                                                                                                                                            |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`      | Invalid request body (missing name, invalid type, amount ≤ 0, too many decimals, missing `reference_id`, unknown fields, same-account transfer) |
| 400  | `INVALID_JSON`          | Request body is not valid JSON                                                                                                                  |
| 400  | `INVALID_ACCOUNT_ID`    | Account ID in the URL is not a valid UUID                                                                                                       |
| 400  | `INVALID_QUERY_PARAMS`  | Invalid `page`, `limit` or `type` query parameter                                                                                               |
| 404  | `ACCOUNT_NOT_FOUND`     | Account does not exist                                                                                                                          |
| 404  | `NOT_FOUND`             | Route does not exist (includes any attempt to edit/delete a transaction)                                                                        |
| 409  | `DUPLICATE_TRANSACTION` | `reference_id` already used for this account                                                                                                    |
| 422  | `INSUFFICIENT_BALANCE`  | Debit or transfer exceeds available balance                                                                                                     |
| 500  | `INTERNAL_ERROR`        | Unexpected server error (details are logged, not exposed)                                                                                       |

---

## Data Integrity Design

### Atomicity

Creating a transaction and updating the balance run inside a single PostgreSQL transaction (`BEGIN … COMMIT`). If any step fails, everything is rolled back (`ROLLBACK`) — a transaction is never stored without its balance change, and vice versa. Transfers insert both the debit and the credit and update both balances in one database transaction, so a partial transfer is impossible.

### Concurrency

Before changing a balance, the account row is locked with `SELECT … FOR UPDATE`. Concurrent requests on the same account are serialized, so two simultaneous debits cannot both spend the same funds, and duplicate checks cannot race each other.

For transfers, both accounts are locked in a **consistent order (sorted by id)** to prevent deadlocks between opposite transfers (A→B and B→A at the same time).

### Order of checks

For a transaction: account exists → duplicate `reference_id` → sufficient balance → insert + update. Checking duplicates before balance means a retried request that already succeeded is reported as a duplicate rather than as an insufficient-balance failure.

### Defence in depth

Application checks are backed by database constraints (`UNIQUE (account_id, reference_id)`, `CHECK (balance >= 0)`, `CHECK (amount > 0)`). If a constraint is ever hit, its error is mapped to the matching API error (`409` / `422`) instead of a `500`.

### Immutability

There are no update or delete endpoints for transactions. Any `PUT`, `PATCH` or `DELETE` request on a transaction returns `404 NOT_FOUND`. Once created, a transaction's type, amount, description, reference, account and timestamp cannot change through the API.

### Balance consistency

The balance is stored on the account for fast reads and is only ever changed in the same database transaction that inserts a transaction row. It therefore always equals the sum of credits minus debits for that account. Rejected transactions (validation errors, duplicates, insufficient balance) change nothing.

---

## Assumptions

1. **IDs** — Accounts and transactions use UUIDs generated by the database. A malformed ID returns `400 INVALID_ACCOUNT_ID`; a well-formed but unknown ID returns `404 ACCOUNT_NOT_FOUND`.
2. **Currency and precision** — Single currency. Amounts are stored as `NUMERIC(18,2)` and must have at most 2 decimal places. Amounts must be sent as JSON numbers (not strings).
3. **Initial balance** — Always 0. Sending `balance` (or any unknown field) when creating an account is rejected rather than silently ignored, to make the rule explicit.
4. **Duplicate transactions** — A repeated `reference_id` for the same account returns `409 Conflict` along with the original transaction, so clients can safely retry and see what was recorded. The duplicate request's other fields (amount, type) are not compared.
5. **Overdrafts** — Not allowed; balance can never go below 0.
6. **Transfers** — A transfer creates a debit on the source and a credit on the destination with the same `reference_id`. That `reference_id` must not already exist on either account. Transfers to the same account are rejected.
7. **Pagination** — `page` defaults to 1, `limit` defaults to 10 with a maximum of 100. Requesting a page beyond the last returns an empty list, not an error.
8. **Sorting** — Latest first by `created_at`, with `id` as a tie-breaker.
9. **Authentication** — Out of scope; all endpoints are public.
10. **Timestamps** — Generated by the database (`now()`) and returned in UTC ISO-8601 format.

---

## Quick End-to-End Test

Runs the example from the assignment (credit 100, credit 50, debit 30, debit 20 → balance 100):

```bash
ACC=$(curl -s -X POST "http://localhost:3000/accounts" \
  -H "Content-Type: application/json" -d '{"name": "Demo"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

curl -s -o /dev/null -X POST "http://localhost:3000/accounts/$ACC/transactions" -H "Content-Type: application/json" -d '{"type":"credit","amount":100,"reference_id":"r1"}'
curl -s -o /dev/null -X POST "http://localhost:3000/accounts/$ACC/transactions" -H "Content-Type: application/json" -d '{"type":"credit","amount":50,"reference_id":"r2"}'
curl -s -o /dev/null -X POST "http://localhost:3000/accounts/$ACC/transactions" -H "Content-Type: application/json" -d '{"type":"debit","amount":30,"reference_id":"r3"}'
curl -s -o /dev/null -X POST "http://localhost:3000/accounts/$ACC/transactions" -H "Content-Type: application/json" -d '{"type":"debit","amount":20,"reference_id":"r4"}'

curl -s -w "\n" "http://localhost:3000/accounts/$ACC/balance"
# {"account_id":"...","balance":100}
```
