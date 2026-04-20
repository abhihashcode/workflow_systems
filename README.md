# Workflow & Approval System

A multi-tenant system for managing configurable workflows, approvals, delegation, and audit logging. Built with Node.js, TypeScript, PostgreSQL, and React.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Database Design](#database-design)
4. [Key Engineering Decisions](#key-engineering-decisions)
5. [API Reference](#api-reference)
6. [Seed Data & Demo Accounts](#seed-data--demo-accounts)

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Backend Setup

```bash
cd server
cp .env.example .env
# Edit .env: set DATABASE_URL to your PostgreSQL instance

npm install

# Run migrations
npm run migrate

# Seed demo data
npm run seed

# Start dev server
npm run dev
```

Backend runs at `http://localhost:3000`.

### 2. Frontend Setup

```bash
cd client
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`, proxying `/api` to the backend.

### 3. Full Reset

```bash
cd server && npm run db:reset
```

This drops all tables, re-runs all migrations, and seeds demo data.

---

## Architecture Overview

```
workflow-system/
├── server/
│   └── src/
│       ├── config/          # Environment config
│       ├── db/              # Pool, query helpers, migrations, seeds
│       │   └── migrations/  # Numbered SQL migration files
│       ├── middleware/       # Auth, error handling
│       ├── modules/
│       │   ├── auth/        # Registration, login, JWT
│       │   ├── tenants/     # Tenant CRUD + membership management
│       │   ├── workflows/   # Workflow definitions (states + transitions)
│       │   ├── items/       # Item lifecycle + transition execution
│       │   ├── approvals/   # Approval requests, voting, delegation
│       │   └── audit/       # Immutable audit log
│       ├── types/           # Shared TypeScript interfaces
│       └── utils/           # Errors, pagination, logger
└── client/
    └── src/
        ├── api/             # Typed API client
        ├── components/      # Shared UI (AppShell, TenantSelector)
        ├── hooks/           # Auth context/hook
        ├── pages/           # Route-level page components
        └── types/           # Frontend TypeScript types
```

### Request Lifecycle

```
Request → Express Router
  → authenticate() middleware [JWT verification]
  → requireTenantAccess() middleware [membership lookup + role check]
  → Route handler
    → Service layer [business logic + DB queries]
      → withTransaction() for multi-step operations
      → createAuditLog() for immutable event recording
    → JSON response
  → errorHandler() middleware [normalized error responses]
```

---

## Database Design

### Multi-Tenancy Strategy: **Shared Schema with Tenant ID Column**

Every table (except `users`) includes a `tenant_id` column with a foreign key to `tenants`. All queries are scoped by `tenant_id`, which is populated from the authenticated user's validated membership.

**Why this approach?**
- Simpler operational model vs. per-tenant schemas or databases
- Easier cross-tenant analytics for platform admins
- PostgreSQL Row-Level Security (RLS) can be layered on top if needed
- Index-friendly: each tenant's data is physically co-located via B-tree indices on `tenant_id`

The trade-off (noisy neighbor risk) is acceptable at this scale and can be mitigated later with connection pooling per tenant or RLS policies.

### Schema Summary

```
users                  — Global user accounts (email/password)
tenants                — Tenant organizations (name, slug)
tenant_memberships     — User ↔ Tenant with role (admin/approver/member/viewer)

workflows              — Workflow definitions (tenant-scoped, versioned)
workflow_states        — Named states per workflow (initial/terminal flags)
workflow_transitions   — Directed edges between states with approval config

items                  — Work items attached to a workflow + current state
approval_requests      — Pending/resolved approval gates for transitions
approval_votes         — Individual votes on approval requests
approval_delegations   — Temporary authority delegation between users

audit_logs             — Append-only event log (trigger-protected)
```

### Key Constraints

- `workflow_states`: `UNIQUE (workflow_id, name)` — no duplicate state names per workflow
- `workflow_transitions`: `UNIQUE (workflow_id, from_state_id, to_state_id)` — no duplicate edges; `CHECK (from_state_id != to_state_id)` prevents self-loops
- `workflow_transitions`: DB-level CHECK enforces consistency between `requires_approval` and `approval_strategy`
- `approval_votes`: `UNIQUE (approval_request_id, voter_id)` — one vote per approver per request
- `audit_logs`: Postgres triggers on `BEFORE UPDATE` and `BEFORE DELETE` raise exceptions, making the table physically immutable

---

## Key Engineering Decisions

### 1. Concurrency Control: Optimistic Locking + SELECT FOR UPDATE

Items use a **version column** for optimistic locking. Every transition request must supply the current `version`. If a concurrent update changed the version before the commit, the operation fails with a 409.

Additionally, the item row is locked with `SELECT ... FOR UPDATE` inside the transaction to prevent lost updates at the database level. This combination handles both of these scenarios:

- Two users submitting transitions simultaneously (pessimistic lock wins)
- Stale reads where a client cached an outdated version (optimistic lock catches it)

```sql
SELECT * FROM items WHERE id = $1 AND tenant_id = $2 FOR UPDATE
-- then check: if (item.version !== requestedVersion) → OptimisticLockError
-- then update: SET version = version + 1
```

### 2. Idempotency Keys

Transition requests accept an optional `idempotency_key`. If the same key is submitted twice (e.g. network retry), the second request returns the existing approval request without creating a duplicate. The key is stored with a `UNIQUE (tenant_id, idempotency_key)` constraint, making the idempotency check atomic.

### 3. Approval Strategies

Three strategies are supported:

| Strategy | Resolution |
|----------|-----------|
| `single` | First approval vote resolves as approved; first rejection resolves as rejected |
| `all` | Approved when all eligible approvers (admin + approver role) vote yes; rejected on first rejection |
| `quorum` | Resolved when `quorum_count` votes of same type are received |

Resolution is checked automatically after each vote within the same transaction. If approved, `performTransition()` is called atomically — the item state change and approval resolution happen in one commit.

### 4. Approval Delegation

When a user casts a vote, the system checks for an **active delegation** where they are the delegate. If found, the vote is recorded with `delegated_from_id` set to the original approver's ID. This prevents double-voting: if either the delegator or delegate has voted, the other cannot.

Delegations have optional `valid_until` timestamps and can be revoked by the delegator or an admin.

### 5. Audit Immutability

The `audit_logs` table is protected at the database level with PostgreSQL triggers that throw exceptions on any `UPDATE` or `DELETE` attempt. This is in addition to application-level controls (no delete endpoint exists).

Audit logs record:
- Actor (user ID)
- Action type (typed enum)
- Entity type + entity ID
- Before/after state snapshots (JSONB)
- Timestamp and IP address

### 6. Workflow Validation

At creation time, workflow definitions are validated for:
- Exactly one initial state
- At least one terminal state
- No self-loops
- All transition states reference valid state names in the definition
- Approval strategy consistency (requires_approval=true ↔ strategy != 'none')

These checks run in the service layer before any DB writes, providing friendly error messages.

### 7. Error Handling

A class hierarchy of typed errors (`AppError`, `NotFoundError`, `ForbiddenError`, `OptimisticLockError`, etc.) propagates through the service layer. A single Express error middleware normalizes all errors to consistent JSON:

```json
{ "error": "NOT_FOUND", "message": "Item '...' not found" }
```

PostgreSQL unique violations (code `23505`) are also caught and normalized to 409 Conflict.

### 8. N+1 Prevention

All list queries use JOINs to fetch related data (user names, state names, workflow names) in a single query. Count queries run in parallel with data queries using `Promise.all([countQuery, dataQuery])`.

### 9. Transaction Safety

Multi-step writes (create workflow + states + transitions, add member + audit, vote + resolve approval + transition item) all run inside `withTransaction()`, which wraps operations in `BEGIN/COMMIT/ROLLBACK`. The `PoolClient` is passed through to ensure all steps execute on the same connection.

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except auth endpoints.
Tenant-scoped endpoints also require `X-Tenant-Id: <tenantId>` header OR `:tenantId` in the URL path.

### Auth
```
POST /api/auth/register   { email, password, full_name }
POST /api/auth/login      { email, password }
GET  /api/auth/me
```

### Tenants
```
POST   /api/tenants                                { name, slug }
GET    /api/tenants                                ?page&limit
GET    /api/tenants/:tenantId
GET    /api/tenants/:tenantId/members             ?page
POST   /api/tenants/:tenantId/members             { email, role }
PATCH  /api/tenants/:tenantId/members/:userId     { role }
```

### Workflows (admin only for write)
```
POST /api/tenants/:tenantId/workflows             { name, description, states[], transitions[] }
GET  /api/tenants/:tenantId/workflows             ?page
GET  /api/tenants/:tenantId/workflows/:id
POST /api/tenants/:tenantId/workflows/:id/states  { name, is_initial, is_terminal, ... }
POST /api/tenants/:tenantId/workflows/:id/transitions { from_state_id, to_state_id, requires_approval, ... }
```

### Items
```
POST /api/tenants/:tenantId/items                 { workflow_id, title, description }
GET  /api/tenants/:tenantId/items                 ?page&workflow_id&state_id&search
GET  /api/tenants/:tenantId/items/:id
POST /api/tenants/:tenantId/items/:id/transitions { transition_id, version, idempotency_key? }
```

### Approvals
```
GET  /api/tenants/:tenantId/approvals             ?page&item_id&status
GET  /api/tenants/:tenantId/approvals/:id
POST /api/tenants/:tenantId/approvals/:id/votes   { decision: approved|rejected, comment? }

GET  /api/tenants/:tenantId/approvals/delegations/me
POST /api/tenants/:tenantId/approvals/delegations { delegate_email, valid_until?, reason? }
DEL  /api/tenants/:tenantId/approvals/delegations/:id
```

### Audit
```
GET /api/tenants/:tenantId/audit  ?page&action&entity_type&entity_id&actor_id&from&to
```

---

## Seed Data & Demo Accounts

The seed creates:

**Tenant:** ABC Properties (slug: `abc-properties`)

| Email | Password | Role |
|-------|----------|------|
| user1@admin.com | test1234 | admin |
| user2@approver.com | test1234 | approver |
| user3@member.com | test1234 | member |
| user4@viewer.com | test1234 | viewer |

**Workflow:** Document Review
- States: Draft → In Review → Approved/Rejected (with Revise back to Draft)
- Transitions requiring approval: Approve, Reject (single strategy)

**Sample Items:** 3 items in Draft state

### Suggested Demo Flow

1. Login as **user1** (admin) → create more items or workflows
2. Login as **user3** (member) → submit an item for review (Draft → In Review transition)
3. The transition to In Review has no approval required
4. From In Review → Approved requires approval. user3 requests it.
5. Login as **user2** (approver) → navigate to Approvals → approve or reject
6. Watch the item state update automatically upon approval
7. Check Audit Log to see the full immutable trail
8. Try delegation: user2 delegates to user3, then user3 can vote

---

## Running in Production

1. Set `NODE_ENV=production` 
2. Set a strong `JWT_SECRET`
3. Configure `DATABASE_URL` with SSL
4. Build: `npm run build` then `node dist/index.js`
5. Consider adding rate limiting, HTTPS termination, and connection pooling (PgBouncer) in front
