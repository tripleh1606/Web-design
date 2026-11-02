## Repository discovery

Source: AuthDiscovery read-only inspection in this session. No repository changes or runtime checks.

- Node >=20, Express ^4.21.2, EJS ^3.1.10, Prisma/Client 6.12.0, PostgreSQL. Scripts npm test, npm run test:live, npm run db:generate, npm run db:push, npm run db:seed: restaurant/package.json:5-28. Lockfile restaurant/package-lock.json.
- restaurant/server.js:1-14 loads dotenv, requires DATABASE_URL, constructs Prisma and injects createApp. restaurant/.env.example:1-4 contains DATABASE_URL and PORT only.
- restaurant/prisma/schema.prisma:1-68 contains restaurant entities and relations, no auth entities.
- restaurant/src/app.js:16-27 exports createApp({ prisma, logger = console }), URL-encoded forms then query method override. Public GET /, /dishes, /dishes/:id at :38-61. Header management link restaurant/views/partials/header.ejs:11-15.
- CRUD are SSR/form HTTP endpoints, not JSON APIs. Generic /admin/{dishes,chefs,ingredients}: GET list, GET /new, POST create, GET /:id/edit, PATCH /:id, GET /:id/delete, DELETE /:id at restaurant/src/app.js:63-130. /admin redirects. Mapping restaurant/src/validation.js:1-28.
- Dish association endpoints restaurant/src/app.js:163-283: GET /admin/dishes/:id; POST /admin/dishes/:id/ingredients; GET /admin/dishes/:id/ingredients/:ingredientId/edit; PATCH and DELETE /admin/dishes/:id/ingredients/:ingredientId; GET /admin/dishes/:id/ingredients/:ingredientId/delete.
- Chef association endpoints restaurant/src/app.js:313-378: GET /admin/chefs/:id; POST /admin/chefs/:id/dishes; GET /admin/chefs/:id/dishes/:dishId/delete; DELETE /admin/chefs/:id/dishes/:dishId.
- restaurant/tests/app.test.js:18-135 uses node:test, injected fake Prisma and local HTTP. Unauthenticated CRUD assumptions at :167-184, :212, :272. restaurant/tests/live-smoke.js:24-26 similarly assumes public admin.
- restaurant/src/app.js:384-397 generic 500 handler redacts DB URLs.

## Design seams (proposals, not existing paths)

Registration owns proposed src/auth/registration.js plus dedicated views/tests. Login owner owns proposed src/auth/session.js and all shared integration: app/server/schema/manifests/header/env/shared tests. Logout owns proposed src/auth/logout.js plus dedicated tests. All relative paths in this paragraph are under restaurant/.

SMTP, origin, sender and reCAPTCHA keys are deployment prerequisites. Existing test commands were read, not executed.

## Confirmed scope

The user selected protecting existing CRUD only. All /admin management endpoints require a verified, authenticated user; public browsing remains public. Do not create a separate JSON CRUD API.
