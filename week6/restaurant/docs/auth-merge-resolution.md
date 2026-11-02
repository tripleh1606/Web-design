# Ghép conflict authentication — 02/11/2026

Nguồn quyết định: `week6/plan/auth-parallel-plan.md` và plan thành phần; commit remote mới `76c34a7` (reset password) và các thay đổi local được áp lại từ stash.

Lượt ghép tiếp: remote `1b0964f`/`2e81441` (signup OTP với SQLite) tạo 23 conflict với stash đã tích hợp. Người dùng xác nhận giữ **PostgreSQL/Supabase** sau khi kiểm tra slide và week5. Vì vậy giữ schema PostgreSQL và hợp đồng helper đang dùng cho đủ bốn luồng auth; không đổi database thật hoặc dữ liệu sang SQLite. Các bổ sung script test/register được ghép, còn lệnh test DB trỏ suite PostgreSQL. Dev dependency smtp-server được giữ đồng bộ lockfile. Công cụ/migration SQLite cũ được đánh dấu lịch sử và không nằm trong luồng chạy app; entrypoint test DB cũ chuyển sang suite PostgreSQL, bản SQLite gốc vẫn có trong Git.

## Quyết định

| File conflict | Nội dung giữ và ghép |
| --- | --- |
| prisma/schema.prisma | Giữ User status/role/emailOriginal, OTP, sidHash, idle expiry, counter chung của local; thêm PasswordReset và quan hệ User từ remote; giữ bảng PasswordResetLimit legacy nhưng không dùng làm limiter mới |
| src/app.js | Giữ route root, guard cả dishes/admin và logout v2; mount thêm router forgot/reset của teammate với cùng mailer |
| src/auth/registration.js | Giữ OTP POST, quota/cooldown và password pending nguyên vẹn; chuyển các method gửi reset/notification của remote vào mail.js dùng chung |
| src/auth/session.js | Giữ persistent anonymous/auth sessions, server CSRF, idle/absolute expiry, monotonic touch và 303/login; thêm forgot/reset vào danh sách form cấp CSRF |
| views/auth/login.ejs | Giữ form root/login và CAPTCHA theo ngưỡng, ghép link Quên mật khẩu tới /forgot |

Reset của remote được giữ và điều chỉnh contract: dùng shared credentials/CSRF/throttle, bỏ limiter RAM và catch bỏ qua lỗi khóa, chỉ route root, fresh token check dưới User lock. POST reset cập nhật password/consume token/vô hiệu token khác/hủy tất cả session nguyên tử. GET/HEAD không consume và dùng quota IP chung với POST. Email gửi sau response, log mã an toàn.

Không lấy toàn bộ một phía: nền local đáp ứng plan đăng ký/login/logout hơn; remote có phần forgot/reset mới cần bảo toàn. Không hoàn tác thay đổi week5, không xóa stash, không đổi .env thật, không commit/push hoặc áp schema lên database trong lượt ghép.

## Kiểm chứng

- `npm test`: **78/78 pass** sau chuyển reCAPTCHA v2. Bao phủ HTTP/module với store/provider inject, đăng ký OTP/password pending, brute force/CAPTCHA, guard CRUD, CSRF, session A/B, logout/replay, reset token/expiry/claim/rollback/all-session revocation, cấu hình session và thứ tự smoke lifecycle. SMTP loopback cục bộ nhận đủ OTP/reset/notification qua SMTP; chưa chứng minh TLS/auth của dịch vụ hoặc delivery tới inbox bên ngoài.
- `npm run db:generate`: thành công với Prisma 6.12.0; generate cục bộ không áp schema lên DB.
- PostgreSQL integration chưa chạy nghiệp vụ: skip vì chưa có cặp biến opt-in AUTH_TEST_DATABASE_URL/AUTH_TEST_ALLOW_DB_WRITE. Test fixture không chứng minh locking/concurrency PostgreSQL thật.
- Google/SMTP/browser thật và restart với store thật vẫn cần nghiệm thu. Chưa tạo bằng chứng ảnh/video giả hoặc đánh dấu đủ toàn bộ checklist bài học.

## Chạy sau khi chọn database

Xem README để cấu hình reCAPTCHA v2 Checkbox: auth dùng RECAPTCHA_V2_SITE_KEY/RECAPTCHA_V2_SECRET_KEY, hoặc nguyên cặp logout nếu cả hai auth giá trị đều vắng/rỗng. Khi đã điền bất kỳ auth giá trị nào thì phải điền đủ cặp; không trộn cặp. Thêm SMTP và SESSION_IDLE_MINUTES/SESSION_MAX_HOURS theo plan (alias millisecond vẫn hỗ trợ; cấu hình mâu thuẫn bị từ chối). Không copy đè .env hiện có. Khi đã backup/review database: db:push → db:upgrade:auth nếu có legacy user/counter → npm start. Route chính: /register, /activate, /login, /logout/confirm, /forgot, /reset. Cookie mới sid yêu cầu login lại từ cookie soucha_session cũ.

## Sửa sau review

Smoke cũ logout trước khi kiểm tra CSRF/restart rồi mong sid đã thu hồi vẫn hoạt động. Đã chuyển chuỗi kiểm tra sang helper dùng chung: CSRF + restart khi phiên còn sống, rồi logout, row bị xóa và replay GET/POST phải 303/login. Regression HTTP cô lập kiểm tra chuỗi thành công và phát hiện trường hợp mất session qua khởi tạo lại app. Live smoke vẫn phải chạy với database thử nghiệm/tiến trình thật, chưa có bằng chứng pass ở đây.

Cấu hình nhận đúng SESSION_IDLE_MINUTES/SESSION_MAX_HOURS, giữ alias SESSION_IDLE_MS/SESSION_TTL_MS cho .env cũ; hai dạng cùng có phải bằng nhau. Test bao phủ quy đổi đơn vị, mặc định, alias, giá trị mâu thuẫn/không hợp lệ/overflow và bảo vệ Secure cookie production. .env thật không bị chỉnh sửa.

## Quyết định mới — CAPTCHA v2 và email

Người dùng chọn lại v2 Checkbox cho register/login, giữ mọi ngưỡng/rate limit và logout v2. V2 không có action/score; helper purpose chỉ là ngữ cảnh route, không chứng minh token thuộc form nào khi dùng chung key. Giữ Nodemailer + SMTP để gửi ba email bắt buộc của slide; slide không bắt SMTP hoặc một vendor và SMTP không phụ thuộc v2/v3. Xem [email setup](email-setup.md). Chưa tạo account/key nhà cung cấp, chưa gửi thư ra ngoài hoặc sửa secret thật.
