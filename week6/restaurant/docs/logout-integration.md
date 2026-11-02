# Logout + Google reCAPTCHA v2 — ghép với login/session

Module đã ghép vào nền login/session trong app.js và header theo plan. Cookie `sid`/CSRF dùng chung với login; Prisma `sidHash` map cột cũ `tokenHash`. Không còn handler logout thứ hai tại `/auth/logout`.

## File đã có

- `src/auth/logout.js`: `createLogoutRouter` và `createLogoutRecaptchaFromEnv`.
- `src/auth/recaptcha-v2.js`: xác minh Google ở backend, kiểm tra hostname, timeout/lỗi provider; secret không gửi vào template.
- `views/auth/logout.ejs`: form xác nhận với checkbox v2, CSRF và nút hủy.
- `tests/auth-logout.test.js`, `tests/recaptcha-v2.test.js`: HTTP/module tests với fixture store và provider được inject rõ.

## Tạo key v2 cho localhost

1. Mở [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin/create), đăng nhập Google của bạn.
2. Tạo cấu hình cho `Soucha week6 logout`, chọn **reCAPTCHA v2 → “I'm not a robot” Checkbox**. Cần cặp **site key + secret key tương thích siteverify**; không dùng v3 key hoặc chỉ một Google Cloud API key cho module này.
3. Thêm domain `localhost` vào danh sách cho phép; không thêm `http://`, port hoặc path. Giữ domain validation bật. Dùng `http://localhost:3001` nhất quán khi thử; khi deploy thêm domain thật và đổi APP_BASE_URL sang HTTPS.
4. Google có thể yêu cầu chọn/tạo Cloud project theo giao diện tài khoản. Hoàn tất thiết lập rồi lấy site key và secret key của key v2. Nếu tài khoản chỉ cung cấp Enterprise assessment credentials, cần teammate chuyển adapter sang assessment đúng loại trước khi dùng; không tráo credential vào siteverify.
5. Trong `week6/restaurant`, nếu chưa có `.env`, copy `.env.example` thành `.env`; nếu đã có thì chỉ thêm biến, không ghi đè DATABASE_URL. Điền cục bộ:

```dotenv
APP_BASE_URL=http://localhost:3001
LOGOUT_RECAPTCHA_V2_SITE_KEY=YOUR_V2_SITE_KEY
LOGOUT_RECAPTCHA_V2_SECRET_KEY=YOUR_V2_SECRET_KEY
```

Site key được render công khai để Google vẽ widget. Secret chỉ backend đọc từ `.env`; không commit hoặc gửi trong chat. File `.env` đã nằm trong `.gitignore`. Không có key thật nào được tạo hoặc điền tự động trong lượt triển khai này.

Register/login cũng dùng v2 theo lựa chọn mới. Auth có cặp tùy chọn `RECAPTCHA_V2_SITE_KEY`/`RECAPTCHA_V2_SECRET_KEY`; nếu cả hai vắng/rỗng, dùng nguyên cặp logout ở trên cho cùng hostname. Nếu auth đã có bất kỳ giá trị nào thì phải cung cấp đủ cặp auth; không ghép partial pair. Không cần tạo thêm key chỉ để chuyển từ v3 sang v2 nếu cặp logout hiện có là v2 Checkbox/siteverify đúng hostname. Không chỉnh hoặc copy đè `.env` thật bằng ví dụ.

Nguồn Google: [hiển thị v2](https://developers.google.com/recaptcha/docs/display), [xác minh backend](https://developers.google.com/recaptcha/docs/verify), [domain localhost](https://developers.google.com/recaptcha/docs/domain_validation). Google quyết định token hết hạn/dùng lại; mỗi lần thử lại cần bằng chứng mới. Module này không có chế độ bỏ qua CAPTCHA khi thiếu key hoặc Google lỗi.

## Hợp đồng teammate cần cung cấp

`createLogoutRouter` nhận các dependency thật sau:

| Tham số/trạng thái | Yêu cầu |
| --- | --- |
| `prisma` | Có `session.deleteMany`; bảng session bền vững lưu `sidHash` SHA-256 hex 64 ký tự và `userId` |
| `requireLogin(req,res,next)` | Chặn thiếu/expired/revoked/pending bằng 303 `/login`; không biến DB outage thành anonymous |
| `requireCsrf(req,res,next)` | So khớp `_csrf` với phiên tại server và kiểm tra Origin/Referer; sai trả 403 trước khi gọi Google |
| `clearSessionCookie(res, authConfig)` | Xóa đúng cookie sid với name/path/domain và các cờ giống login; chỉ được gọi sau store delete thành công |
| `authConfig` | Cấu hình cookie dùng chung với login, không tạo tên cookie thứ hai |
| `req.auth.user` | User đã xác thực có `id`, `email` |
| `req.auth.session` | Phiên hiện tại có `userId` trùng user.id và `sidHash` đúng hàng store |
| `res.locals.csrfToken` | CSRF token hiện tại để render form |

Body parser và session middleware thật đã đặt trước router. Các helper có trong `src/auth/session.js`. Đoạn ghép tương ứng trong createApp:

```js
const { createLogoutRouter, createLogoutRecaptchaFromEnv } = require('./auth/logout');

// Sau express.urlencoded, static assets và middleware session thật:
app.use(createLogoutRouter({
  prisma,
  authConfig,
  requireLogin,
  requireCsrf,
  clearSessionCookie,
  recaptchaVerifier: createLogoutRecaptchaFromEnv()
}));
```

Những biến helper trong ví dụ phải lấy từ module login/session dùng chung. Factory từ chối dependency thiếu; không thêm `next()` giả để vượt authentication/CSRF. Nền login phải quản lý sid ngẫu nhiên, hash tra cứu, idle/absolute expiry, cookie flags và rotate sid; module logout không tạo hoặc đăng nhập user.

Header có thể dùng link tới trang xác nhận (GET chỉ hiện form):

```html
<a href="/logout/confirm">Đăng xuất</a>
```

Nếu giữ form POST logout trong header theo plan gốc, lần POST chưa có `g-recaptcha-response` sẽ hiện lại form xác nhận, không hủy session. Người dùng hoàn thành checkbox rồi submit POST `/logout` có CSRF và bằng chứng Google.

## Route và kết quả

- `GET /logout/confirm`: requireLogin, hiện form; không hủy session. Thiếu key hiển thị lỗi kỹ thuật, không bật nút xác nhận.
- `GET /logout`: vẫn 404, không làm thay đổi trạng thái.
- `POST /logout`: requireLogin → requireCsrf → Google siteverify → xóa đúng `sidHash + userId` → clear cookie → 303 `/login`.
- CAPTCHA thiếu/sai/hết hạn/dùng lại: 200 hiện form lỗi, giữ session. Browser gửi `captchaPassed=true` không được tin.
- Key/provider/store lỗi: 500, không redirect thành công và không chỉ xóa cookie để giả logout.
- Sau logout A, guard của teammate phải chặn sid A ở `/dishes`, `/dishes/:id` và mọi `/admin`; session B cùng user vẫn hoạt động.

CSRF vẫn bắt buộc khi thêm CAPTCHA. reCAPTCHA v2 Checkbox không có action/score như v3. Google quyết định một token đã dùng có bị từ chối; khi dùng chung key cho nhiều form, provider không xác nhận form/purpose đã tạo token. Purpose ở helper chỉ là ngữ cảnh server, không phải ràng buộc mật mã hay Google-attested action. Không tuyên bố token chưa dùng của form khác bị phân biệt bằng action. Logout vẫn phải qua requireLogin/CSRF riêng.

## Kiểm chứng đã chạy và còn chờ

HTTP/module tests dùng store fixture và provider inject; không gọi Google hay ghi Supabase. Có thêm `tests/auth-integration.test.js` kiểm tra wiring app thật, login hai phiên rồi logout A/replay A/B survival. Không coi fixture là bằng chứng PostgreSQL/provider thật. Xem [kết quả ghép](auth-merge-resolution.md).

```powershell
cd D:\WebApplication\Web-design\week6\restaurant
npm ci --ignore-scripts
node --test --test-isolation=none tests/auth-logout.test.js tests/recaptcha-v2.test.js
```

Sau khi teammate ghép và có key thật: login bằng hai browser profiles A/B; mở trang xác nhận A; giải checkbox; POST logout; kiểm tra Network 303, cookie hết hạn và row A bị xóa; replay sid A bị 303 login, B vẫn dùng được. Kiểm tra restart/session-store bằng DB thử nghiệm thật. Che sid, CAPTCHA token và secret trong bằng chứng. Các bước browser/provider/PostgreSQL này **chưa được thực hiện**.

## Lỗi đã được phát hiện và sửa qua review

Bản đầu của adapter coi `challenge_ts` là lúc cấp token và tự từ chối timestamp cũ hơn 120 giây. Reviewer đối chiếu tài liệu Google thấy đây là thời điểm tải thử thách: người dùng giải lâu vẫn có thể nhận một response token mới hợp lệ. Đã bỏ kiểm tra tuổi dựa trên trường này, giữ kiểm tra hostname và dựa vào kết quả siteverify/timeout-or-duplicate cho expiry. Test `a fresh valid solution is accepted after a long challenge` tái hiện trường hợp này bằng provider inject; test token bị Google từ chối vẫn phải không qua.
