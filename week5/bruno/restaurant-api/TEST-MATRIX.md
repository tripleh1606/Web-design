# Bruno test matrix (week4)

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
