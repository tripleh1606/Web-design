# Hiện trạng repository — week6

Kiểm tra mã nguồn ngày 02/11/2026. Đây là kết quả audit tĩnh và lịch sử thử chạy test trong phiên hiện tại; không phải chứng nhận app chạy được.

- App tại `../restaurant`: CommonJS Node >=20, Express 4.21.x, EJS 3.1.x, Prisma/Client 6.12.0 và PostgreSQL theo package.json.
- server.js tải dotenv, kiểm tra DATABASE_URL, tạo PrismaClient và truyền vào createApp. Không đọc/in credential thật để lập plan.
- prisma/schema.prisma hiện chỉ có Dish, Chef, Ingredient, DishIngredient, ChefDish. Chưa có model auth.
- src/app.js có EJS, URL-encoded form, method-override, static assets, public /dishes và /dishes/:id. /admin có CRUD ba thực thể và quản lý quan hệ món/nguyên liệu, đầu bếp/món.
- Chưa có session/cookie/auth middleware, CAPTCHA, OTP, forgot/reset hay logout trong code hiện tại. Header có Thực đơn và Quản lý.
- tests/app.test.js dùng fake Prisma và HTTP, đang giả định admin công khai. tests/live-smoke.js là kiểm tra DB thật kiểu read-only theo README; không đổi nó thành công cụ ghi DB ngầm.
- package.json có npm test, test:live, db:generate, db:push, db:seed. Dependencies auth chưa được thêm. README còn đường dẫn dự án cũ; sửa khi triển khai/tích hợp.
- `npm test` trong lần kiểm tra trước gặp spawn EPERM của sandbox; chạy `node --test --test-isolation=none tests/app.test.js` sau đó gặp MODULE_NOT_FOUND: express. Cần npm ci trước baseline; không được báo test pass.
- Chưa kiểm tra Supabase thật, SMTP, reCAPTCHA hay restart session. Trong lượt chỉnh plan này không cài dependencies, không đổi schema/DB và không chạy test chức năng mới.

## Đối chiếu với bài HTML

Có nền CRUD SSR. Bốn phần auth ở slide 48 đều còn phải làm: đăng ký/OTP/CAPTCHA; login/session/brute force; logout/bảo vệ CRUD; forgot/reset. Các file trong folder plan là đặc tả tương lai, không được tính là code.

Xem [hợp đồng chung](auth-parallel-plan.md) và [checklist](auth-acceptance-checklist.md). Các model, module và view auth được nêu trong plan là đường dẫn dự kiến, không phải file đã tồn tại.
