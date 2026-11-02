# Soucha — bản chuyển đổi Restaurant SSR

Đây là bản chuyển đổi từ app Soucha Next.js ở thư mục cha sang **Express + EJS + Prisma + Supabase PostgreSQL** theo [`restaurant_SSR/requirement.md`](../restaurant_SSR/requirement.md). App gốc ở `../soucha/` không bị sửa.

## Những gì được mang từ app gốc

- Logo, tám ảnh trong `public/beverages/`, màu xanh `#155727` và nâu `#43281a`.
- Bố cục menu: logo lớn, thanh tìm kiếm, tab Matcha/Houjicha, sắp xếp giá, lưới thẻ đồ uống và footer Soucha.
- Tám món, tên, giá, danh mục và đường dẫn ảnh từ `lib/menu.ts` / `supabase/migrations/003_products.sql`, chuyển thành seed `Dish` trong `src/soucha-menu.js`.
- Kiểu giao diện quản trị của Soucha: tiêu đề, tab, danh sách thẻ, ảnh, nút thêm/sửa/xóa.

Phần xử lý React `useState`/`fetch`/Next API của menu và quản trị được thay bằng EJS render tại server, form HTML và Prisma. Chi tiết món mở trang `/dishes/:id` thay cho sheet tùy chỉnh; quy trình giỏ hàng/đặt hàng, khuyến mãi và giờ hoạt động của app gốc nằm ngoài phạm vi bài Restaurant SSR. Ba model bài tập là `Dish`, `Chef`, `Ingredient`.

## Chạy

Yêu cầu Node.js 20 trở lên và Session pooler URL (port 5432) của Supabase.

```powershell
cd D:\WebApplication\Web-design\Soucha\restaurant-ssr
npm install
Copy-Item .env.example .env
```

Điền `DATABASE_URL` thật vào `.env` trên máy cá nhân; **không commit file này**. Nếu `.env` đã có thì giữ nguyên, không copy đè. Sau đó:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
npm start
```

Mở `http://localhost:3001/dishes`. Port 3001 tránh xung đột với app Soucha Next.js trên port 3000. Restart `npm start` nếu server đang chạy từ trước khi cập nhật code.
## Tài khoản và bảo mật

Trước khi đăng ký hoặc đăng nhập, cấu hình `RECAPTCHA_SITE_KEY` và `RECAPTCHA_SECRET_KEY` cho Google reCAPTCHA v2 checkbox đúng hostname của `APP_BASE_URL`. Thiếu khóa hoặc Google không phản hồi sẽ từ chối đăng nhập/đăng ký. Đăng ký cũng yêu cầu `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và, nếu máy chủ yêu cầu, `SMTP_USER`/`SMTP_PASS`; `SMTP_SECURE=true` bật TLS ngay khi kết nối. Người dùng mở liên kết trong email để xác minh, sau đó đăng nhập; xác minh không tự đăng nhập. Đăng ký lại email chưa xác minh thay thế mật khẩu đang chờ và vô hiệu hóa liên kết cũ.

`APP_BASE_URL` phải là origin công khai HTTPS trong production. Session lưu PostgreSQL 24 giờ theo mặc định (`SESSION_TTL_HOURS`); cookie HttpOnly, SameSite=Lax, Secure với HTTPS/production. Mọi `/admin` yêu cầu tài khoản đã xác minh; mọi thay đổi và đăng xuất yêu cầu CSRF. Sau ba lần sai cùng email chuẩn hóa, lần thử tiếp theo phải chờ 30 giây; mỗi lần sai sau đó thời gian chờ tăng gấp đôi đến 15 phút. Bộ đếm xóa sau khi đăng nhập thành công hoặc không có lỗi trong 24 giờ. Ngoài ra giới hạn 20 yêu cầu đăng nhập hợp lệ về định dạng mỗi IP mỗi phút; ứng dụng mặc định không tin tưởng proxy, vì vậy cần cấu hình hạ tầng phù hợp để nhận IP trực tiếp đáng tin cậy.

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
$env:LIVE_SMOKE_ALLOW_DB_WRITE="1"; npm run test:live
```

`npm test` dùng dữ liệu giả để kiểm tra HTTP, validation và xác thực. Live smoke ghi fixture vào PostgreSQL và xóa tài khoản khi kết thúc; chỉ chạy sau khi chỉ định `DATABASE_URL` là database riêng dùng để thử nghiệm và đồng ý bằng `LIVE_SMOKE_ALLOW_DB_WRITE=1`. Smoke dùng adapter CAPTCHA thử nghiệm tiêm riêng, không chứng minh tích hợp Google hoặc SMTP thực tế; để kiểm tra provider, dùng khóa v2 đúng hostname, SMTP và hộp thư do bạn kiểm soát rồi đăng ký, xác minh email, đăng nhập và đăng xuất qua trình duyệt.
