# Restaurant API — Bruno (week5)

Base: `{{baseUrl}}` = `http://localhost:3001`.
Header: `Origin: {{corsOrigin}}` (= `SPA_ORIGIN`, mặc định `http://localhost:5173`).

## Envelope

| Tình huống | HTTP | Body |
|------------|------|------|
| Thành công | 200 | `{ ok: true, data }` |
| Nghiệp vụ | 200 | `{ ok: false, error: { code, message, fields? } }` |
| Route/method sai | 404 | `{ message }` |
| JSON hỏng | 400 | `{ message }` |
| Body quá lớn | 413 | `{ message }` |
| Origin lạ | 403 | `{ message }` |
| Lỗi server | 500 | `{ message }` |

## CRUD

`GET|POST /api/{dishes|chefs|ingredients}`, `GET|PATCH|DELETE /api/.../:id`.

Dishes query: `q`, `category`, `sort=price-asc|price-desc`.

## Quan hệ

| Method | Path |
|--------|------|
| GET/POST | `/api/dishes/:id/ingredients` |
| GET/PATCH/DELETE | `/api/dishes/:id/ingredients/:ingredientId` |
| GET/POST | `/api/chefs/:id/dishes` |
| GET/DELETE | `/api/chefs/:id/dishes/:dishId` |

## Authentication and authorization

Protected requests use `Authorization: Bearer {{token}}`. Role and status are loaded from the current database account on each request; a token is not a durable source of authorization. Logout does not revoke a copied token before expiry. Client-side route/button hiding is not security enforcement.

| Method | Path | Access | Request |
|--------|------|--------|---------|
| GET | `/api/auth/me` | Authenticated | — |
| GET | `/api/users?page=1&pageSize=10` | Admin | — |
| PATCH | `/api/users/:id/role` | Admin | `{ "role": "admin|manager|chef|staff|customer" }` |
| PATCH | `/api/users/:id/chef` | Admin | `{ "chefId": 12 }` or `{ "chefId": null }` |
| PATCH | `/api/dishes/:id/availability` | Admin/manager; chef assigned to dish | Exactly `{ "available": true }` |

`GET /api/users` returns `{ ok:true, data:{ items:[{id,email,role,status,chefId}], total, page, pageSize } }`; identity mutation responses contain only safe account fields. Never expose or store password hashes, reset data, or real bearer tokens in the collection.

`GET /api/auth/me` returns `{ ok: true, data: { user: { id, role, chefId }, capabilities: [...] } }`. Capability names are `dish.read`, `dish.write`, `dish.availability.update`, `recipe.read`, `recipe.write`, `ingredient.read`, `ingredient.write`, `chef.read`, `chef.write`, `assignment.read`, `assignment.write`, and `user.role.update`. Capabilities describe coarse actions; resource scope still applies.

Roles are `admin`, `manager`, `chef`, `staff`, `customer`. Customers see available dishes only. Chefs require a persisted User–Chef link and ChefDish assignment; scoped access follows assigned dishes. Staff can read dishes but cannot write. Admin and manager have operational CRUD; only admin lists/manages accounts and Chef identity links. Manager cannot assign roles. Server checks must cover direct, detail and relation routes. Out-of-scope resources must not be exposed through nested responses.

## Rollout / migration

For either PostgreSQL or SQLite, back up the database and stop all application writers. Configure `DATABASE_URL`, then from repository root run `node scripts/database.js generate` and `node scripts/database.js push`. The push command runs `migrate-identity` first: known `viewer` accounts become `customer`; unknown role values cause migration refusal without being changed and must be explicitly resolved before retry. Prisma `db push` then adds the nullable unique Chef link from schema. Provider/version-dependent failures need operator review; never pass `--accept-data-loss`. Restore the backup if necessary.

Inventory existing viewers before rollout because their broad authenticated CRUD access is removed by mapping them to `customer`. After schema upgrade, activate an existing account and run trusted operator command `node api/prisma/bootstrap-admin.js <email>`. It promotes that account only if there is no active admin and never creates credentials. Restart writers, then use admin endpoints to assign operational roles and Chef links; retain the backup through cutover. Never bootstrap via public registration, default credentials, or first-user promotion.

## Chạy

```sh
npm start --workspace @soucha/api
npm run test:bruno
```
