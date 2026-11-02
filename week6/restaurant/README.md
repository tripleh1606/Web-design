# Soucha — bản chuyển đổi Restaurant SSR

Đây là bản Restaurant SSR dùng **Express + EJS + Prisma + SQLite**, tiếp nối dữ liệu nhà hàng tuần 5 theo cấu hình SQLite của nhóm. Phần đăng ký dùng email OTP và reCAPTCHA v3. Các yêu cầu SSR tham khảo tại [`restaurant_SSR/requirement.md`](../restaurant_SSR/requirement.md).

## Những gì được mang từ app gốc

- Logo, tám ảnh trong `public/beverages/`, màu xanh `#155727` và nâu `#43281a`.
- Bố cục menu: logo lớn, thanh tìm kiếm, tab Matcha/Houjicha, sắp xếp giá, lưới thẻ đồ uống và footer Soucha.
- Tám món, tên, giá, danh mục và đường dẫn ảnh từ `lib/menu.ts` / `supabase/migrations/003_products.sql`, chuyển thành seed `Dish` trong `src/soucha-menu.js`.
- Kiểu giao diện quản trị của Soucha: tiêu đề, tab, danh sách thẻ, ảnh, nút thêm/sửa/xóa.

Phần xử lý React `useState`/`fetch`/Next API của menu và quản trị được thay bằng EJS render tại server, form HTML và Prisma. Chi tiết món mở trang `/dishes/:id` thay cho sheet tùy chỉnh; quy trình giỏ hàng/đặt hàng, khuyến mãi và giờ hoạt động của app gốc nằm ngoài phạm vi bài Restaurant SSR. Ba model bài tập là `Dish`, `Chef`, `Ingredient`.

## Chạy

Yêu cầu Node.js 20 trở lên. SQLite dùng file cục bộ, không cần cài server database.

```powershell
cd D:\Minh\Web-design\week6\restaurant
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Đặt `DATABASE_URL="file:./soucha.db"` trong `.env`: file nằm tại `week6/restaurant/prisma/soucha.db`. Điền SMTP và reCAPTCHA để đăng ký thực tế; **không commit `.env` hay file database**. Với database mới:

```powershell
npm run db:generate
npm run db:push
npm start
```

Mở `http://localhost:3001/register`. Chỉ chạy `npm run db:seed` khi muốn nạp dữ liệu mẫu vào database riêng vì seed có xóa dữ liệu nhà hàng. Để giữ dữ liệu tuần 5, dừng app tuần 5, sao lưu và sao chép file SQLite đang dùng sang `prisma/soucha.db` của tuần 6 (không ghi đè file đã tồn tại), rồi chạy `db:push` để bổ sung bảng auth. Xem [docRegister](../docRegister.md) nếu database đã có bảng tài khoản cũ. Restart server sau khi đổi cấu hình.
## Tài khoản và bảo mật

Đăng ký dùng `/register` → `/activate` → `/login`, CAPTCHA score-based v3 và OTP email sáu chữ số. Cấu hình `RECAPTCHA_ADAPTER=v3`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` đúng hostname của `APP_BASE_URL`; backend kiểm tra action `register`/`login`, score tối thiểu `RECAPTCHA_MIN_SCORE=0.5`, tuổi token và hostname. Không dùng key v2 checkbox hoặc credential Cloud với adapter này. Thiếu khóa hoặc provider lỗi thì từ chối xác minh, không có bypass trong app.

SMTP dùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và nếu cần `SMTP_USER`/`SMTP_PASS`; `SMTP_SECURE=true` bật TLS ngay khi kết nối. Register trả phản hồi chung trước khi gửi thư bất đồng bộ, không xác nhận giả rằng thư đã đến. OTP có hạn 10 phút, chỉ dùng một lần; gửi lại tối thiểu 60 giây, tối đa 5 yêu cầu/giờ/email và 20/15 phút/IP. Đăng ký có thêm giới hạn 5 request/15 phút/email và 20/15 phút/IP. Activate giới hạn 10 request/phút/email và 30/phút/IP. Sai OTP 5 lần khóa 15 phút; register/resend không xóa ngân sách sai hoặc khóa. Các giá trị có thể cấu hình trong `.env.example`.

Tài khoản mới có `status=pending`, `role=viewer`; password và OTP dùng Argon2id (`argon2@0.44.0`, salt ngẫu nhiên, memoryCost 65536 KiB, timeCost 3, parallelism 1, hashLength 32). Email trim ngoài và chỉ lowercase domain, giữ nguyên local-part/dấu chấm/plus; validator là `validator@13.15.23`. Đăng ký lại pending giữ nguyên mật khẩu đầu tiên và xử lý như resend; active không bị sửa. Kích hoạt thành công không tự đăng nhập. Phiên CSRF ẩn danh lưu SQLite, `userId=null`, có hạn 30 phút; cookie `soucha_csrf` chứa định danh ngẫu nhiên, token CSRF riêng nằm trong form.

Xem hướng dẫn triển khai, nâng schema cũ, thiết kế và kết quả test trong [docRegister](../docRegister.md). Chỉ database SQLite có `users`/`sessions` theo schema auth cũ, chưa có `status`/`emailOriginal`, mới chạy `npm run db:upgrade:register` một lần trước `db:push`. Script `prisma/registration-upgrade.sql` không dành cho database tuần 5 chỉ có dữ liệu nhà hàng. Liên kết GET `/auth/verify-email` cũ không còn kích hoạt tài khoản.

`APP_BASE_URL` phải là origin công khai HTTPS trong production. Session đăng nhập hiện có lưu SQLite 24 giờ theo mặc định (`SESSION_TTL_HOURS`); cookie `soucha_session` HttpOnly, SameSite=Lax, Secure với HTTPS/production. `/dishes`, `/dishes/:id` và mọi `/admin` yêu cầu tài khoản active đã xác minh; anonymous/pending nhận 303 `/login` trước query CRUD. Mọi thay đổi và đăng xuất yêu cầu CSRF. Luồng login hiện có vẫn dùng CAPTCHA mỗi lần và progressive lock: sau ba lần sai, lần tiếp theo chờ 30 giây, tăng gấp đôi đến 15 phút; reset khi login thành công hoặc không sai trong 24 giờ. Login giới hạn 20 request hợp lệ về định dạng/IP/phút. Các chính sách login này chưa được đổi thành ngưỡng login mới trong plan bởi nhánh này tập trung đăng ký. Ứng dụng mặc định không tin `X-Forwarded-For` do client tự gửi.

Giữ secret ngoài mã nguồn. Không dùng `db:seed` trên dữ liệu cần bảo toàn; chỉ `db:push` với database đã được phê duyệt vì thao tác này thay đổi schema.


## Luồng SSR

- `GET /dishes`: Prisma đọc database; `q`, `category`, `sort` từ query string được dùng để lọc và sắp xếp, rồi EJS dựng HTML.
- `GET /dishes/:id`: lấy `id` từ path, kiểm tra số hợp lệ, đọc lại món từ database; `404` nếu không có.
- `GET /admin/dishes`, `/admin/chefs`, `/admin/ingredients`: danh sách quản trị; mỗi loại có form thêm, sửa, xác nhận xóa.
- `POST` tạo mới; form sửa/xóa dùng `POST` với `?_method=PATCH`/`?_method=DELETE` để `method-override` chuyển thành đúng method. Server validate `req.body`, ghi bằng Prisma, rồi trả **303 See Other**. Trình duyệt `GET` trang kết quả và render dữ liệu mới; refresh không tạo bản ghi lặp.

Client không gửi CRUD bằng `fetch`/AJAX. `.env.example` không chứa credential. Prisma Client được generate vào `generated/prisma` và thư mục này được Git bỏ qua.

## Kiểm tra

```powershell
npm test
npm run test:register
npm run test:register:db
$env:LIVE_SMOKE_ALLOW_DB_WRITE="1"; npm run test:live
```

`npm test` dùng dữ liệu giả để kiểm tra HTTP, validation và xác thực. `test:register:db` tạo file SQLite riêng trong thư mục tạm cùng SMTP server cục bộ, kiểm tra nâng schema tuần 5, migration auth cũ, race/rollback và gửi thư qua Nodemailer; dọn database sau test. Bộ test không dùng `DATABASE_URL` của nhóm, không cần Docker hay SQLite. Chạy `npm run db:generate` trước lần test DB đầu tiên. `db:push` dùng wrapper đặt `RUST_LOG=info` để tránh lỗi schema engine khi tạo file SQLite mới trên Windows.

Live smoke ghi fixture vào SQLite và xóa tài khoản khi kết thúc; chỉ chạy với `DATABASE_URL` riêng dùng để thử nghiệm và `LIVE_SMOKE_ALLOW_DB_WRITE=1`. Adapter giả trong test và SMTP cục bộ không chứng minh Google hoặc hộp thư bên ngoài hoạt động. Kiểm chứng provider cần key v3 đúng hostname, SMTP thật và hộp thư do người kiểm thử kiểm soát.
