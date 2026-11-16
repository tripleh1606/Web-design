# Bruno test matrix (week5)

Environment: `local`. Runner: `npm run test:bruno` (API đang listen).

## Technical (không có `ok`)

| Request | Expect |
|---------|--------|
| GET `/api/bok` | 404 `{ message }` |
| POST dishes `{bad` | 400 `{ message }` |
| OPTIONS + SPA Origin | 204 + CORS |
| POST + Origin lạ | 403 `{ message }`, no ACAO |
| POST body > 32kb | 413 `{ message }` |

## Business (HTTP 200, `ok: false`)

| Case | code |
|------|------|
| Id path / missing | NOT_FOUND |
| POST thiếu/sai kiểu / bad image | VALIDATION_FAILED |
| PATCH `{}` | VALIDATION_FAILED `_form` |
| Recipe amount 0 / FK thiếu / duplicate | VALIDATION_FAILED |
| Recipe / assign link missing | NOT_FOUND |
| Assign dishId invalid / missing / FK / duplicate | VALIDATION_FAILED |

## Flow (`99-flows`)

Create → link/assign → duplicate → delete once ok → delete again NOT_FOUND → teardown.

## Authorization (direct HTTP; run with role-specific bearer tokens)

Use dedicated active test accounts for each role. Do not use production tokens/passwords in the collection. Obtain the current principal with `GET /api/auth/me`; its envelope is `{ ok: true, data: { user: { id, role, chefId }, capabilities } }`. Capabilities are UI hints and do not replace resource-scope assertions.

| Role | Allowed cases | Denied / scoped cases |
|------|---------------|-----------------------|
| admin | Operational CRUD; list users; change role; link/unlink Chef; availability update | Reject invalid role/link; reject removal/demotion of the last admin |
| manager | Operational CRUD and availability update | `GET /api/users`, role update, and Chef account-link update denied |
| chef | Read assigned dish, recipe and recipe ingredients; update availability of assigned dish; own Chef/assignment data | Unassigned dish/recipe/ingredient hidden; no dish price/general CRUD, recipe write, ingredient write, assignment management or user management; unlinked chef denied scoped reads |
| staff | Read dish list/detail | Dish writes, availability update, recipe/ingredient/chef/assignment and user management denied |
| customer | List/read available dishes | Unavailable dish omitted; unavailable detail hidden; all writes and recipe/ingredient/chef/assignment/account data denied |

### Authorization request contracts

| Request | Expected |
|---------|----------|
| GET `/api/auth/me` with valid token | 200 `{ ok:true, data:{ user:{id,role,chefId}, capabilities:[...] } }` |
| GET `/api/auth/me` without/invalid token | 401 |
| PATCH `/api/dishes/:id/availability` as admin/manager or assigned chef, `{ "available": false }` | Allowed; only availability changes |
| Same availability route as unrelated role or unassigned chef | Denied; scoped resource may be 404 |
| Availability body with `price`, other fields, or missing/non-boolean `available` | Rejected; verify dish remains unchanged |
| GET `/api/users` or PATCH `/api/users/:id/{role,chef}` as non-admin | Denied |
| PATCH role with noncanonical role or PATCH chef with invalid/nonexistent link | Rejected; persisted account unchanged |
| Role/link change followed by request using already-issued token | Next request uses current DB role/link |
| Last admin role removal/demotion, including concurrent attempts | Rejected; at least one admin remains |

Use different chefs with explicit, disjoint ChefDish assignments to prove cross-assignment isolation. Check collection, detail, nested relation, and mutation paths (including recipe/ingredient access); a hidden item must not leak in nested response data or counts. Check both HTTP response and persisted state. Never treat a capability or hidden SPA control as proof of API authorization.
