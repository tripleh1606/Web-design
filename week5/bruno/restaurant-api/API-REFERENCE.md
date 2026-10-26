# Restaurant API — Bruno (week4)

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

## Chạy

```sh
npm start --workspace @soucha/api
npm run test:bruno
```
