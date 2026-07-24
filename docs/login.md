# Login — dev seed accounts

The quick reference for logging into the running app. These accounts are seeded
by `packages/db/src/seed.ts` when the dev environment is stood up (run
`pnpm --filter @infora/db seed`; the password is printed at the end of the run).

## Password

**All seeded users share one password:** `wrenfield-dev`

## How to log in

- **Web app:** open the app, enter one of the emails below + the password on the
  sign-in screen.
- **API directly:** `POST /auth/session` with `{ "email": "…", "password": "wrenfield-dev" }`
  — it sets an httpOnly session cookie.

## Accounts

Project: **Wrenfield–Ashcombe 400kV Connection** (owner: Trentmoor Energy).

| Email | Password | Organisation | Role on the project |
|---|---|---|---|
| `rachel.bowen@trentmoor.example` | `wrenfield-dev` | Trentmoor Energy | **Owner** · org admin · elevated (super-user) |
| `eleanor.price@calderhale.example` | `wrenfield-dev` | Calder & Hale | **Consultant** (member) · org admin · lead author · elevated |
| `marcus.webb@calderhale.example` | `wrenfield-dev` | Calder & Hale | Authenticates but has **no Participant** — a wall-test subject (T-022), not a working account |
| `priya.nair@halvern.example` | `wrenfield-dev` | Halvern Associates | Authenticates but the org has **no Membership** — a wall-test subject (T-022) |

**Which to use:**
- **`rachel.bowen@trentmoor.example`** — the owner view (MIDP, sharing, review confirmation).
- **`eleanor.price@calderhale.example`** — the consultant/producing-side view (TIDP, sandbox, drafting, promotion).
- Marcus and Priya are deliberately unentitled — they exist to prove access-control
  boundaries, not to work in.

> **Elevated (super-user):** Rachel and Eleanor hold the elevated capability
> (T-174), which gates destructive lifecycle actions such as *Close as rejected*.
> Ordinary participants do not see those actions.

Also recorded in [reference/dev-logins.md](reference/dev-logins.md) and the
[README](../README.md).
