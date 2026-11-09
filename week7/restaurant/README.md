# Soucha - nhà hàng CSR

API và SPA chạy ở hai origin.
Backend giữ Prisma và PostgreSQL.
Frontend là một trang chạy trong trình duyệt và gọi API bằng axios.

## Chạy

Cần Node.js 20 trở lên và Session pooler URL (cổng 5432) của Supabase.

```sh
cd D:/WebApplication/Web-design/week5/restaurant
npm install
cp .env.example .env
```

Điền `DATABASE_URL` vào `.env`.
Không commit file này.
`CORS_ORIGIN` là origin của SPA, không có dấu `/` cuối và không dùng `*`.
Địa chỉ backend của SPA nằm ở một chỗ: `web/config.js`.

```sh
npm run db:generate
npm run db:push
npm run db:seed
npm run dev:be
npm run dev:fe
```

Mở `http://localhost:5173/dishes`.
API lắng nghe `http://localhost:3001`.
Chạy hai lệnh ở hai terminal.

## Kiểm tra

```sh
npm test
npm run test:live
```

`npm test` kiểm tra response shape, `NOT_FOUND`, `VALIDATION_FAILED`, CORS, 404, 500, và fallback của SPA.
`npm run test:live` đọc Supabase thật, không ghi dữ liệu.

### Bruno (API contract trên DB đã seed)

API phải đang chạy (`npm run start:be` hoặc `dev:be`).

```sh
npm run test:bruno
```

Collection nằm ở `bruno/restaurant-api`.
Test plan: `bruno/restaurant-api/TEST-PLAN.md`.
Ma trận lỗi: `bruno/restaurant-api/TEST-MATRIX.md`.
Bruno tạo rồi xóa bản ghi tên `bruno-contract-*` trong folder `99-flows`.
