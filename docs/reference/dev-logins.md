# Dev seed logins

Seeded by `packages/db/src/seed.ts` when the dev environment is stood up. All
four users share one password.

| Email | Password | Org | Role |
|---|---|---|---|
| `rachel.bowen@trentmoor.example` | `wrenfield-dev` | Trentmoor Energy | Owner (org admin, project participant) |
| `eleanor.price@calderhale.example` | `wrenfield-dev` | Calder & Hale | Consultant (org admin, project participant) |
| `marcus.webb@calderhale.example` | `wrenfield-dev` | Calder & Hale | Unentitled — no Participant on the project (wall-test subject, T-022) |
| `priya.nair@halvern.example` | `wrenfield-dev` | Halvern Associates | Unentitled — org has no Membership on the project at all (wall-test subject, T-022) |

**T-298 — the conflict-register subjects (ADR-0046).** The seed holds a second
client and scheme so an exclusion has two projects to pair: **Marchwood
Aggregates** owns **Marchwood Quarry Rail Link**, and Calder & Hale acts for
both clients — the scenario the register exists for. `hannah.sturt@marchwood.example`
is that client's owner admin. **Eleanor Price works BOTH schemes**, so declaring
a wall over the pair immediately reports her (the retrospective case, §4 —
reported, never revoked). **`owen.vance@calderhale.example` works Wrenfield
only**, and is the subject an individual-grain wall on Eleanor must leave alone.
Declare from Personal settings → Ethical walls, signed in as Eleanor.

Use `rachel.bowen@trentmoor.example` for the full owner view. Marcus and
Priya can authenticate but are intentionally unentitled — they exist to
prove access-control boundaries, not as working accounts.

Also noted in [README.md](../../README.md).
