# Soucha — bản chuyển đổi Restaurant SSR

Nhóm chốt **PostgreSQL trên Supabase**, kế thừa week5. Prisma dùng provider postgresql; không đổi .env sang file SQLite. Slide yêu cầu store bền vững, còn lựa chọn PostgreSQL là quyết định của nhóm.

## Module logout và reCAPTCHA v2

Đã ghép đăng ký OTP, login/session, logout v2 và forgot/reset password vào app chính theo [plan chung](../plan/auth-parallel-plan.md). Xem [quyết định ghép conflict](docs/auth-merge-resolution.md) và [hướng dẫn key logout](docs/logout-integration.md).

`npm test` kiểm tra HTTP và các nhánh lỗi bằng store/provider inject. Không coi kết quả test cô lập là bằng chứng Google/SMTP/PostgreSQL thật. Chỉ điền secret cục bộ trong `.env`; `.env.example` chỉ chứa placeholder.

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
cd D:\WebApplication\Web-design\week6\restaurant
npm ci
# Chỉ copy nếu chưa có .env; không ghi đè cấu hình/key thật.
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Điền `DATABASE_URL` thật vào `.env` trên máy cá nhân; **không commit file này**. Nếu `.env` đã có thì giữ nguyên, không copy đè. Sau đó:

```powershell
npm run db:generate
# Database Supabase hiện tại đã bổ sung auth bằng SQL migration một lần.
# Không tự chạy db:push trên DB dùng chung có cột/index fts riêng.
# Chỉ dùng db:upgrade:auth khi thực sự có auth legacy cần nâng cấp.
npm start
```

Mở `http://localhost:3001/register`, kích hoạt OTP qua email tại `/activate`, rồi login tại `/login`. Header mở `/logout/confirm`; `/forgot` và `/reset` phục vụ quên mật khẩu. `/dishes` và mọi `/admin` yêu cầu đăng nhập. Restart app sau khi thay cấu hình. Không tự chạy `db:push`/seed trên database dùng chung khi chưa chọn và review đích.
## Tài khoản và bảo mật

Register/login đã chuyển sang **reCAPTCHA v2 Checkbox**. Register luôn có checkbox; login cần từ 3 lần sai do server quyết định. Auth dùng `RECAPTCHA_V2_SITE_KEY`/`RECAPTCHA_V2_SECRET_KEY`. Nếu cả hai giá trị đều vắng/rỗng, auth dùng nguyên cặp `LOGOUT_RECAPTCHA_V2_SITE_KEY`/`LOGOUT_RECAPTCHA_V2_SECRET_KEY` đã cấu hình cho cùng hostname. Nếu đã điền một biến auth thì phải điền đủ cặp, không trộn một nửa cặp auth với một nửa cặp logout. Logout vẫn có thể dùng cặp riêng. Backend kiểm tra kết quả Google/hostname; Google kiểm tra expiry/single-use. V2 không có action/score và không chứng minh token thuộc riêng một form khi dùng chung key. Site key được công khai, secret chỉ ở backend.

Slide yêu cầu email OTP, link reset và thông báo password đã đổi, không bắt buộc SMTP hay nhà cung cấp. Giữ **Nodemailer + SMTP** đang có vì gửi được cả ba loại thư; email và CAPTCHA là hai phần độc lập nên v2 không yêu cầu thay transport. SMTP cần `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và cả `SMTP_USER`/`SMTP_PASS` khi dịch vụ yêu cầu. Thông thường port 587 dùng `SMTP_SECURE=false` để nâng cấp STARTTLS; port 465 dùng `true` cho TLS ngay khi kết nối. Lấy thông số thật từ nhà cung cấp, không tự điền placeholder như credential. Xem [cấu hình và nghiệm thu email](docs/email-setup.md).

OTP 6 số chỉ qua email, hash Argon2id trong DB, 10 phút, một lần; 5 lần sai khóa 15 phút. Resend chờ 60 giây, 5 lần/giờ/email và 20/15 phút/IP, không reset attempts. Register có giới hạn 5 request/15 phút/email và 20/15 phút/IP. Đăng ký lại pending giữ password gốc, phản hồi chung với email mới/active. Kích hoạt không tự login.

`APP_BASE_URL` phải HTTPS trong production. Session PostgreSQL có idle 30 phút, tuyệt đối 24 giờ; dùng `SESSION_IDLE_MINUTES=30`/`SESSION_MAX_HOURS=24` theo plan (số nguyên dương). Hai biến millisecond cũ `SESSION_IDLE_MS`/`SESSION_TTL_MS` vẫn được hỗ trợ; nếu điền cả hai dạng thì giá trị quy đổi phải bằng nhau, khác nhau sẽ báo lỗi cấu hình thay vì âm thầm bỏ qua. Anonymous CSRF dùng `ANONYMOUS_SESSION_TTL_MS=1800000`. Cookie `sid` host-only, HttpOnly, SameSite=Lax, Path=/, Secure với HTTPS/production; login đổi sid. Cửa sổ login 15 phút: từ 3 lỗi cần CAPTCHA, lần sai thứ 10 khóa 5 phút; 50 request/15 phút/IP. Chỉ login active thành công xóa counter email, giữ quota IP. Counter không nằm trong cookie và app mặc định không tin proxy. Dynamic responses no-store, mọi auth POST/admin mutation kiểm tra CSRF/Origin.

Forgot dùng phản hồi chung, 3 request/15 phút/email và 20/15 phút/IP; reset token 32 byte chỉ lưu SHA-256, 15 phút, một lần. GET/HEAD/POST reset chia sẻ 20 request/15 phút/IP. GET không consume; POST đổi password, consume token, vô hiệu token khác và hủy toàn bộ session trong một transaction, không kích hoạt pending/auto-login. SMTP gửi bất đồng bộ sau response; lỗi gửi có thể cần yêu cầu mã/link mới. Provider/store lỗi không được coi là xác thực thành công.

Password/OTP mới dùng `argon2@0.44.0` Argon2id (19456 KiB, 2 vòng, parallelism 1); scrypt password cũ vẫn verify. Email trim ngoài, lowercase domain, giữ local-part, validate bằng `validator`. `sidHash` map vào cột `tokenHash` cũ. Các bảng legacy được giữ để tránh drop, route cũ `/auth/*` không còn hoạt động. `db:upgrade:auth` backfill tài khoản verified cũ và rekey counter, không đổi password; cookie cũ yêu cầu login lại. Cấu hình CAPTCHA dùng các biến v2 nói trên; không dùng biến v3/score cũ. Có thể tạo active viewer demo từ `AUTH_SEED_EMAIL`/`AUTH_SEED_PASSWORD` bằng `npm run db:seed:auth`; script không thay tài khoản đã tồn tại. Dọn session hết idle/absolute theo lịch bằng `npm run db:clean:sessions`.

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
# Test DB riêng, không dùng DATABASE_URL của app làm fallback:
$env:AUTH_TEST_DATABASE_URL="postgresql://...database-thu-nghiem..."
$env:AUTH_TEST_ALLOW_DB_WRITE="1"
npm run test:auth:postgres
# Smoke restart tiến trình thật; cần schema mới sẵn trong DB thử nghiệm:
npm run test:live
```

`npm test` dùng dữ liệu giả. Test PostgreSQL opt-in tạo schema `auth_test_<random>` và xóa đúng schema đó sau test; smoke restart tạo/xóa user/session fixture trong DB thử nghiệm được chọn. Provider vẫn inject. Nghiệm thu thật cần inbox và cặp key đúng loại, browser, PostgreSQL và replay cookie; không dùng test pass để thay bằng chứng này.

Sau chuyển v2, `npm test` đạt **78/78**: gồm HTTP/provider inject và một SMTP loopback cục bộ nhận đủ ba loại thư thật qua giao thức SMTP. Loopback chưa chứng minh TLS/authentication của nhà cung cấp hoặc thư đến inbox bên ngoài; các bước Google/SMTP/PostgreSQL/browser thật vẫn còn chờ nghiệm thu.

Smoke kiểm tra CSRF và restart tiến trình khi session còn sống, rồi logout và kiểm tra replay sid trả 303 `/login`. Test `smoke-lifecycle.test.js` chạy cùng chuỗi kiểm tra trên HTTP/store cô lập và chứng minh chuỗi đó phát hiện mất session khi khởi tạo lại app; chưa thay thế smoke với PostgreSQL/tiến trình thật.

`npm run test:register` chạy test đăng ký cô lập; `npm run test:register:db` chạy suite PostgreSQL opt-in ở trên. `db:upgrade:register` là alias của `db:upgrade:auth`. SQL/helper/tài liệu SQLite từ nhánh cũ chỉ giữ tham khảo, không dùng cho database hiện tại; suite SQLite gốc có trong Git commit `2e81441`. Không chạy migration SQLite `registration-upgrade.sql` trên PostgreSQL. Script CAPTCHA đang dùng là `/auth.js`; `recaptcha.js` cũ không được các form hiện tại nạp.


## Cập nhật database và quyền CRUD — 02/11/2026

- Database Supabase hiện dùng `public` có 5 bảng nghiệp vụ cũ và 10 bảng authentication được thêm bằng `prisma/auth-schema-additions.sql`. Nhật ký trước đó ghi snapshot chỉ đọc của 5 bảng tại `%LOCALAPPDATA%\Bim\restaurant-db-backups` (không thuộc Git).
- **Không chạy `prisma db push` lên DB dùng chung**: bảng `dishes` có cột `fts` và index full-text/trigram riêng chưa khai báo trong Prisma. Chỉ sử dụng migration đã review với một database mới/được phê duyệt; script `auth-schema-additions.sql` là migration **một lần**, chạy lại sẽ lỗi.
- Nếu DB mới đang chỉ có 5 bảng nghiệp vụ và cần bổ sung auth, sau khi backup và xác minh đích, chạy `npx prisma db execute --file prisma/auth-schema-additions.sql --schema prisma/schema.prisma`. Không áp dụng script nếu đã có các bảng auth.
- Theo speaker notes slide 48, 49 và 54, **mọi tài khoản active đã xác minh email và có session hợp lệ được dùng toàn bộ CRUD**, kể cả `role='viewer'`. Sau login chuyển tới `/admin/dishes`; header hiển thị link Quản lý cho user đã xác thực. Phân quyền theo role thuộc bài sau.
- Các route đọc/ghi vẫn kiểm tra session ở server; anonymous, pending, chưa xác minh email, expired hoặc revoked bị chuyển `303 /login`. POST/PATCH/DELETE vẫn cần CSRF hợp lệ.
- Seed demo dùng `AUTH_SEED_EMAIL` và `AUTH_SEED_PASSWORD` (8–128 ký tự); `npm run db:seed:auth` chỉ tạo tài khoản viewer active mới. Không còn tùy chọn `AUTH_SEED_ROLE`; seed không thay password, status hoặc role của tài khoản đã tồn tại. Chỉ chạy seed tường minh trên DB đã chọn.
- Kiểm tra sau hiệu chỉnh: `node --test --test-isolation=none tests/*.test.js` đạt **81/81**, không fail/skip. Chế độ chạy cùng tiến trình được dùng vì môi trường này chặn tiến trình con của test runner (`spawn EPERM`). Có kiểm tra HTTP login viewer → tạo món → logout → chặn request ghi với sid cũ, CRUD/PATCH/DELETE/quan hệ bằng viewer, CSRF sai, pending/expired/revoked và session qua khởi tạo lại app cô lập.
- Đây là kiểm chứng HTTP/store/provider cô lập và SMTP loopback. Chưa chạy thêm migration/seed hoặc ghi DB dùng chung trong lượt hiệu chỉnh; chưa thay thế nghiệm thu Google/SMTP bên ngoài, PostgreSQL và restart tiến trình thật.
- Nhật ký triển khai, backup, thay đổi và đính chính: `../track_what_GPT-6_does.md`.
## Form đăng nhập, đăng ký và xử lý HTTP 403

Form login/register dùng `public/auth.css`: card một cột, ô nhập cao 52px có label riêng, focus/error rõ, lỗi đăng ký theo từng trường, nút hiện/ẩn password và bố cục phù hợp màn hình 320px trở lên. Gửi form SSR và kiểm tra CAPTCHA phía server được giữ nguyên.

Lỗi đã tái hiện bằng Chrome: `Referrer-Policy: no-referrer` khiến submit form HTML gửi `Origin: null`, dù thao tác trên đúng trang; phép thử bằng `fetch()` mặc định CORS trước đó không tái hiện được. Backend hiện chỉ chấp nhận trường hợp null này khi `Sec-Fetch-Site: same-origin`, Host (kèm port) đúng `APP_BASE_URL`, session hợp lệ và token CSRF khớp. Origin nước ngoài, thiếu metadata, sai Host hoặc thiếu/sai token vẫn bị chặn. Giữ `no-referrer` để tránh lộ reset token; không tin `X-Forwarded-Host` tùy ý. Reverse proxy phải giữ Host công khai; trình duyệt thiếu Fetch Metadata có thể bị từ chối với Origin null.

Trang 403 có mã `FORM_STALE`, `SESSION_EXPIRED` hoặc `ORIGIN_MISMATCH`, giải thích và link GET mở lại đúng form. Nếu form đã mở trước khi cookie đổi/hết hạn, mở lại form rồi nhập lại; không tự gửi lại password hoặc bỏ qua CSRF. Sau sửa backend, dừng `npm start` bằng Ctrl+C rồi chạy lại, mở mới `http://localhost:3001/register` (giữ cùng hostname với `APP_BASE_URL`).

Kiểm chứng lần này: **83/83 test** bằng `node --test --test-isolation=none tests/*.test.js`; Chrome kiểm tra native HTML POST có Origin null, form cũ bị chặn và mở lại form gửi được tới bước validation (store cô lập). Giao diện được kiểm tra trên Chrome desktop và 375/320px, không tràn ngang, nút hiện/ẩn password hoạt động. Kiểm tra live chỉ mở form và gửi dữ liệu không hợp lệ: có session ẩn danh/counter phát sinh theo cơ chế app, không tạo user, không gửi email, không sửa món hoặc schema. Chưa nghiệm thu trọn luồng đăng ký bằng Google CAPTCHA và email thật.
