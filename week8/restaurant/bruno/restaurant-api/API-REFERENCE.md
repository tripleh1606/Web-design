# Restaurant API (Bruno)

Base: `{{baseUrl}}` = `http://localhost:3001` (xem `PORT` trong `.env`).

Header khuyến nghị khi test: `Origin: http://localhost:5173` (`CORS_ORIGIN`).

## Envelope

| Tình huống | HTTP | Body |
|------------|------|------|
| Thành công | 200 | `{ "ok": true, "data": ... }` |
| Không tìm thấy / lỗi nghiệp vụ | 200 | `{ "ok": false, "error": { "code", "message", "fields"? } }` |
| Route sai | 404 | `Not Found` (plain text) |
| JSON hỏng | 400 | `Bad Request` (plain text) |
| Payload quá lớn | 413 | `Payload Too Large` (plain text) |
| Lỗi server | 500 | `Internal Server Error` (plain text) |

`error.code`: `NOT_FOUND`, `VALIDATION_FAILED`.

## CRUD (dishes, chefs, ingredients)

Mỗi resource: `dishes`, `chefs`, `ingredients`.

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/{resource}` | `dishes`: query `q`, `category`, `sort` |
| GET | `/api/{resource}/:id` | `id` phải là chuỗi số nguyên dương |
| POST | `/api/{resource}` | Body theo validation |
| PATCH | `/api/{resource}/:id` | Chỉ field gửi lên được validate |
| DELETE | `/api/{resource}/:id` | `data: null` khi xóa thành công |

### Body POST/PATCH

**dishes:** `name`, `description?`, `price` (int), `category?`, `image?` (`/beverages/*`), `available` (bool)

**chefs:** `name`, `specialty`

**ingredients:** `name`, `unit`, `stock` (int)

## Công thức món

| Method | Path | Body |
|--------|------|------|
| GET | `/api/dishes/:id/recipe` | - |
| POST | `/api/dishes/:id/ingredients` | `{ ingredientId, amount }` (>= 1) |
| PATCH | `/api/dishes/:id/ingredients/:ingredientId` | `{ amount }` |
| DELETE | `/api/dishes/:id/ingredients/:ingredientId` | - |

## Gán món cho đầu bếp

| Method | Path | Body |
|--------|------|------|
| GET | `/api/chefs/:id/dishes` | - |
| POST | `/api/chefs/:id/dishes` | `{ dishId }` |
| DELETE | `/api/chefs/:id/dishes/:dishId` | - |

## Chạy Bruno

1. `npm run db:seed` (nếu chưa có dữ liệu).
2. `npm run start:be` (API listen `PORT`).
3. `npm run test:bruno` hoặc mở collection `bruno/restaurant-api` trong Bruno app (env **local**).

`00-env` tự set `seedDishId` / `seedChefId` / `seedIngredientId` từ tên seed.
`99-flows` tạo rồi xóa bản ghi `bruno-contract-*`.

Xem ma trận assert: [TEST-MATRIX.md](TEST-MATRIX.md).
