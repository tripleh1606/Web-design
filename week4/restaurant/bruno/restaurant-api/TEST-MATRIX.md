# Bruno test matrix

Environment: `local` (`baseUrl`, `corsOrigin`, seed/test ids).

Runner: `npm run test:bruno` (API must already listen on `PORT`).

## Technical (HTTP status, no `ok` envelope)

| Request | Expect |
|---------|--------|
| GET `/api/bok` | 404 plain |
| POST dishes with `{bad` | 400 plain |
| OPTIONS + valid Origin | 204 + CORS headers |
| GET + wrong Origin | 200 ok, no `Access-Control-Allow-Origin` |
| POST body > 32kb | 413 plain |

## Business (`HTTP 200`, `ok: false`)

### CRUD dishes / chefs / ingredients

| Case | code |
|------|------|
| Path id `abc` / `0` | NOT_FOUND |
| Id `999999` GET/PATCH/DELETE | NOT_FOUND |
| POST `{}` or wrong types | VALIDATION_FAILED + fields |
| dishes bad `image` | VALIDATION_FAILED |
| PATCH invalid number | VALIDATION_FAILED |

### Recipe

| Case | code |
|------|------|
| Dish missing | NOT_FOUND |
| amount 0 / missing fields | VALIDATION_FAILED |
| ingredientId not exist | VALIDATION_FAILED |
| duplicate link (flow) | VALIDATION_FAILED |
| PATCH/DELETE missing link | NOT_FOUND |

### Chef dishes

| Case | code |
|------|------|
| Chef missing | NOT_FOUND |
| dishId invalid / missing / not exist | VALIDATION_FAILED |
| duplicate assign (flow) | VALIDATION_FAILED |
| DELETE missing link | NOT_FOUND |

## Happy / write flow (`99-flows`)

1. Create unique ingredient, dish, chef (`bruno-contract-*`).
2. PATCH dish, link recipe, duplicate link, PATCH amount.
3. Assign dish, duplicate assign, unassign, unlink.
4. DELETE dish (ok), DELETE again (NOT_FOUND), DELETE chef, DELETE ingredient.

Helpers: `js/contract.js` (`expectOk`, `expectNotFound`, `expectValidation`, `expectPlain`).
