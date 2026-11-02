# Hiện trạng repository — week6

## Cập nhật sau tích hợp — 02/11/2026

App hiện đã có schema PostgreSQL auth, đăng ký OTP, login/session bền vững, guard toàn bộ dishes/admin, logout v2 và forgot/reset. Code đã ghép theo plan; xem [README](../restaurant/README.md) và [kết quả ghép](../restaurant/docs/auth-merge-resolution.md). Smoke dùng thứ tự live session → CSRF → restart → logout → replay; cấu hình session nhận phút/giờ theo plan và alias millisecond tương thích. Test cô lập không chứng nhận PostgreSQL/provider/browser thật; checklist nghiệm thu vẫn chưa hoàn tất.

## Baseline lịch sử trước triển khai

Nội dung dưới đây ghi lần audit ban đầu ngày 02/11/2026, không mô tả code hiện tại và không phải chứng nhận runtime.

- App tại `../restaurant`: CommonJS Node >=20, Express 4.21.x, EJS 3.1.x, Prisma/Client 6.12.0 và PostgreSQL theo package.json.
- server.js tải dotenv, kiểm tra DATABASE_URL, tạo PrismaClient và truyền vào createApp. Không đọc/in credential thật để lập plan.
- prisma/schema.prisma hiện chỉ có Dish, Chef, Ingredient, DishIngredient, ChefDish. Chưa có model auth.
- src/app.js có EJS, URL-encoded form, method-override, static assets, public /dishes và /dishes/:id. /admin có CRUD ba thực thể và quản lý quan hệ món/nguyên liệu, đầu bếp/món.
- App chính chưa có session/cookie/auth middleware, OTP, forgot/reset hay route logout được mount. Đã thêm module logout + adapter reCAPTCHA v2 và view/test cô lập theo yêu cầu mới; chờ teammate cung cấp session/login/helper thật để ghép. Header hiện vẫn có Thực đơn và Quản lý.
- tests/app.test.js dùng fake Prisma và HTTP, đang giả định admin công khai. tests/live-smoke.js là kiểm tra DB thật kiểu read-only theo README; không đổi nó thành công cụ ghi DB ngầm.
- package.json có npm test, test:live, db:generate, db:push, db:seed. Dependencies auth chưa được thêm. README còn đường dẫn dự án cũ; sửa khi triển khai/tích hợp.
- `npm test` trong lần kiểm tra trước gặp spawn EPERM của sandbox; chạy `node --test --test-isolation=none tests/app.test.js` sau đó gặp MODULE_NOT_FOUND: express. Cần npm ci trước baseline; không được báo test pass.
- Lượt chỉnh plan trước chưa cài dependencies hoặc kiểm chứng runtime. Ở lượt code module logout tiếp theo đã chạy npm ci và npm test: 23/23 đạt (7 test app + 16 logout/adapter, HTTP fixture/provider inject). Chưa kiểm tra Supabase thật, SMTP, reCAPTCHA thật hay restart session; schema/DB chưa thay đổi.

## Đối chiếu với bài HTML

Có nền CRUD SSR. Bốn phần auth ở slide 48 đều còn phải làm: đăng ký/OTP/CAPTCHA; login/session/brute force; logout/bảo vệ CRUD; forgot/reset. Các file trong folder plan là đặc tả tương lai, không được tính là code.

Xem [hợp đồng chung](auth-parallel-plan.md) và [checklist](auth-acceptance-checklist.md). Các model, module và view auth được nêu trong plan là đường dẫn dự kiến, không phải file đã tồn tại.
