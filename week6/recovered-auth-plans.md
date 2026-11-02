# Kế hoạch khôi phục từ phiên chat cũ

Nguồn: phiên `01a19a2f-7641-769d-a938-c3469913471c`, tạo ngày 2026-11-02, thư mục `local/` của phiên. Nội dung bên dưới được chép nguyên văn từ các artifact của phiên, không phải kế hoạch mới. Các tài liệu là bản dự thảo có thể không nhất quán: ví dụ nội dung đăng ký về xử lý mật khẩu tài khoản chưa xác minh khác nhau giữa hợp đồng và bản đăng ký; cần đối chiếu trước khi triển khai. Đường dẫn `local://` trong nội dung là tham chiếu cũ của phiên, không phải file trong workspace hiện tại.

---

## Nguồn: auth-parallel-plan.md

# Hợp đồng chung: đăng ký, đăng nhập và logout song song

Nguồn tiếng Anh: local://auth-contract-english.md. Chỉ mục bộ tài liệu: local://auth-bundle-english.md.

Ba file plan triển khai:
- [Đăng ký — email và reCAPTCHA](local://auth-registration-plan.md)
- [Đăng nhập — session DB và bảo vệ CRUD](local://auth-login-plan.md)
- [Logout — thu hồi session](local://auth-logout-plan.md)

## Bối cảnh hiện tại

Cần ba plan triển khai cùng một hợp đồng chung cho phép làm song song: đăng ký với email xác minh thực và Google reCAPTCHA; đăng nhập bằng cookie/session lưu PostgreSQL, yêu cầu đăng nhập trước khi dùng CRUD; logout. Phạm vi đã chốt là bảo vệ các endpoint SSR/form `/admin` hiện có, không thêm JSON API. Việc xem thực đơn công khai vẫn công khai. Hợp đồng này quyết định các giao diện dùng chung của ba plan; các đường dẫn auth đề xuất bên dưới là file mới.

Ứng dụng hiện tại: CommonJS Node >=20, Express 4/EJS, Prisma 6.12/PostgreSQL (`restaurant/package.json:1-29`); app factory `createApp({ prisma, logger = console })` (`restaurant/src/app.js:16-402`); khởi động tại `restaurant/server.js:1-27`; chưa có thực thể auth (`restaurant/prisma/schema.prisma:1-68`). Test CRUD dùng fake Prisma được inject và giả định admin truy cập công khai (`restaurant/tests/app.test.js:18-135,167-184`); live smoke cũng vậy (`restaurant/tests/live-smoke.js:24-26`). Các lệnh dưới đây chỉ chạy từ `restaurant/` sau khi phê duyệt triển khai, không chạy trong lúc lập kế hoạch.

## Chức năng cần triển khai

Chỉ người dùng đã xác minh email mới được truy cập mọi route `/admin`, bao gồm trang đọc và mọi thao tác ghi thực thể/liên kết. Trình duyệt giữ định danh session ngẫu nhiên, không chứa thông tin người dùng, trong cookie HttpOnly; PostgreSQL giữ trạng thái session qua lần khởi động lại ứng dụng. Xác minh email không tự đăng nhập. Logout vô hiệu hóa session DB hiện tại, không phải mọi session của tài khoản. Nhiều thiết bị có thể đăng nhập độc lập. Token session và xác minh chỉ lưu hash trong DB, không lưu bản thô.

## Hướng triển khai tổng thể

### Quyền sửa file và các mốc đồng bộ

Chỉ định đúng một người tích hợp, đồng thời phụ trách đăng nhập. Người này hoàn thành trước nền tảng dùng chung: dependencies/lockfile, schema, Prisma client đã generate, và đầy đủ tiện ích/middleware trong `src/auth/session.js`; module này không import registration/logout. Mốc này phải cung cấp mã hoạt động, không phải stub, route giả hay interface no-op. Không thêm import vào `app.js` khi module tương ứng còn thiếu.

Sau mốc nền tảng, ba nhánh đăng ký, phần đăng nhập/tích hợp còn lại và logout chạy đồng thời trong các file riêng bên dưới. Người tích hợp mount toàn bộ router sau khi cả ba module thật tồn tại. Không worker khác sửa file chung, manifest, schema hoặc file generate. Không chạy cài đặt/generation/test/formatter dùng chung đồng thời với chỉnh sửa. Ba việc độc lập sau bước nền tảng chung, không phải trước bước đó.

- **Đăng ký** chỉ sở hữu file mới `restaurant/src/auth/registration.js`, `restaurant/views/auth/register.ejs`, `restaurant/views/auth/verify-result.ejs`, `restaurant/tests/auth-registration.test.js`.
- **Logout** chỉ sở hữu file mới `restaurant/src/auth/logout.js`, `restaurant/tests/auth-logout.test.js`.
- **Đăng nhập/người tích hợp** sở hữu file mới `restaurant/src/auth/session.js`, `restaurant/views/auth/login.ejs`, `restaurant/tests/auth-session.test.js`; các file chung hiện có `restaurant/package.json`, `restaurant/package-lock.json`, `restaurant/.env.example`, `restaurant/prisma/schema.prisma`, `restaurant/generated/prisma/**`, `restaurant/server.js`, `restaurant/src/app.js`, `restaurant/views/partials/header.ejs`, `restaurant/views/admin/form.ejs`, `restaurant/views/admin/delete.ejs`, `restaurant/views/admin/unlink.ejs`, `restaurant/views/admin/dish-detail.ejs`, `restaurant/views/admin/dish-ingredient-edit.ejs`, `restaurant/views/admin/chef-detail.ejs`, `restaurant/tests/app.test.js`, `restaurant/tests/live-smoke.js`. Không thêm công việc CSS không liên quan. Người tích hợp sở hữu cập nhật tài liệu hành vi nếu quy ước repository yêu cầu.

### Schema lưu trữ đã chốt

Thêm các model sau, giữ nguyên mọi thực thể nhà hàng:

```prisma
model User {
  id Int @id @default(autoincrement())
  email String @unique
  passwordHash String
  emailVerifiedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  sessions Session[]
  verificationTokens EmailVerificationToken[]
  @@map("users")
}
model Session {
  id Int @id @default(autoincrement())
  tokenHash String @unique
  csrfToken String
  userId Int
  expiresAt DateTime
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}
model EmailVerificationToken {
  id Int @id @default(autoincrement())
  tokenHash String @unique
  userId Int
  expiresAt DateTime
  usedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("email_verification_tokens")
}
```

Dùng quy ước `npm run db:generate` / `npm run db:push` hiện có, không tạo quy ước migration thứ hai. `db:push` chỉ chạy với DB kiểm chứng riêng dùng một lần, không dùng DB production chưa được phê duyệt. Không chạy seed cho authentication smoke; phải đọc lại hành vi phá hủy của seed trước bất kỳ lần sử dụng riêng nào.

### API module dùng chung đã chốt

`restaurant/src/auth/session.js` export các hàm CommonJS sau; mọi hàm phải được triển khai thật trước mốc nền tảng:

- `resolveAuthConfig(overrides = {}) -> config`: input override và output dùng các key `appBaseUrl`, `sessionCookieName`, `csrfCookieName`, `sessionTtlMs`, `emailVerifyTtlMs`, `cookieSecure`, `recaptchaSiteKey`, `recaptchaSecretKey`. Override tường minh ưu tiên hơn env. TTL override là số nguyên an toàn dương tính bằng mili giây; env `SESSION_TTL_HOURS`/`EMAIL_VERIFY_TTL_HOURS` là số giờ nguyên dương hữu hạn, chuyển thành mili giây nguyên an toàn, mặc định 24 giờ. Origin mặc định `http://localhost:${process.env.PORT || 3001}`; chỉ chấp nhận URL gốc HTTP(S), không credentials/query/fragment/đường dẫn khác gốc, bỏ slash cuối. Production bắt buộc cấu hình tường minh APP_BASE_URL HTTPS công khai. Giá trị được cung cấp nhưng sai phải throw khi khởi động. Secure bật khi production HOẶC origin HTTPS; chỉ cấu hình test inject mới được override boolean. Tên mặc định `soucha_session`/`soucha_csrf`; tên cookie đúng cú pháp HTTP token. Chỉ test được override csrfCookieName.
- `normalizeEmail(value) -> string`: string thì trim+lowercase, không phải string trả rỗng. Hai form dùng email tối đa120 ký tự, regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `hashPassword(password) -> Promise<string>` và `verifyPassword(password, storedHash) -> Promise<boolean>`: scrypt async của Node, salt16 byte ngẫu nhiên, key64 byte, `N=16384,r=8,p=1`; lưu `scrypt$<32 lower hex salt>$<128 lower hex key>`. Hash đúng UTF-8 đã nhập, không trim/chuẩn hóa Unicode. Hash sai định dạng trả false, không throw; so sánh timingSafeEqual. Đăng ký password8..128 ký tự, confirmPassword khớp chính xác. Đăng nhập tối đa128 ký tự, email không tồn tại dùng một dummy hash hợp lệ tính trước, không tạo dummy mỗi request.
- `generateRawToken() -> string`:32 byte ngẫu nhiên thành64hex chữ thường. `hashToken(rawToken) -> string`:SHA-256 hex chữ thường. `safeEqualToken(a,b) -> boolean`: yêu cầu hai chuỗi64hex chữ thường rồi so sánh buffer thời gian hằng.
- `parseCookies(header = '') -> object`: tách cặp bằng dấu chấm phẩy, decode an toàn, bỏ mã hóa sai; tên cookie trùng làm cookie đó không hợp lệ thay vì chọn theo thứ tự. Export dùng lại `serializeCookie(name,value,options) -> string`; options `httpOnly`, `secure`, `sameSite`, `path`, `maxAge` (giây), `expires` (Date).
- `setSessionCookie(res, rawToken, config)` và `clearSessionCookie(res, config)`: append Set-Cookie, không ghi đè cookie khác. Thuộc tính `HttpOnly; Path=/; SameSite=Lax`, thêm Secure có điều kiện; cấp `Max-Age=floor(sessionTtlMs/1000)`, xóa `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`. Host-only, không Domain. Cookie CSRF ẩn danh cùng thuộc tính, Max-Age7200.
- `sanitizeNextPath(value) -> string`: chỉ cho đường dẫn cùng origin có pathname đúng `/admin` hoặc bắt đầu `/admin/`, tối đa200 ký tự; không backslash/control/protocol-relative/encoded pathname separators; sai thì `/admin/dishes`. Dùng URL với dummy origin cố định; chỉ trả pathname+search và bỏ `_method` khỏi đích redirect. Chỉ điều hướng, không phát lại ghi.
- `createSessionForUser({ prisma, userId, authConfig, res }) -> Promise<{rawToken,tokenHash,csrfToken,expiresAt}>`: tạo token/CSRF mới, lưu session có expiresAt tuyệt đối now+TTL. `res` tùy chọn: có thì append cookie sau lưu, không có thì trả token data mà không phát header. Login truyền transaction delegate làm prisma, bỏ res khi nguyên tử xóa hàng cũ được trình ra và tạo hàng mới; sau commit gọi setSessionCookie với res thật. Không sliding refresh; giữ session khác. Lỗi DB không phát redirect thành công/cookie session mới.
- `attachSessionMiddleware({ prisma, authConfig }) -> middleware`: khởi tạo `req.auth={user:null,session:null,rawToken:null}`, `req.cookies`, `res.locals.currentUser=null`, `res.locals.csrfToken=''`; lookup cookie session đúng định dạng theo tokenHash include user. Chỉ xác thực hàng tồn tại, chưa hết hạn và user đã xác minh. Điền req.auth đầy đủ chỉ dùng nội bộ, currentUser chỉ `{id,email}`, csrfToken lấy từ session DB. Xóa cookie được trình ra nếu thiếu trong DB/sai/hết hạn/đã xóa/user chưa xác minh; có thể deleteMany hàng hết hạn theo hash. DB outage gọi next(error)/500, không coi là ẩn danh. GET auth ẩn danh tạo/tái dùng cookie `soucha_csrf`64hex và expose qua res.locals/`req.csrfToken`; route động khác có thể khởi tạo tương tự nhưng không chấp nhận token submit tự tạo mới. Chuyển lỗi async đúng Express4.
- `requireCsrf(req,res,next)`: expected là session.csrfToken đã xác thực hoặc cookie CSRF ẩn danh gửi đến; submitted là body `_csrf`; thiếu/sai định dạng/không khớp ->error view403. Origin có mặt phải trùng app origin; không Origin nhưng có Referer thì Referer cùng origin. Thiếu cả hai chỉ được chấp nhận khi token hợp lệ, phục vụ HTTP client. Đọc cấu hình từ `req.authConfig` do attachSessionMiddleware đặt. Login/register/logout tự áp dụng; mọi `/admin` ngoài GET/HEAD/OPTIONS áp dụng sau guard/methodOverride. Không so sánh với cookie vừa cấp nếu request không có cookie đến.
- `requireAdminAuth(req,res,next)`: yêu cầu session đã gắn của user đã xác minh; GET/HEAD ẩn danh ->302 `/auth/login?next=<encoded sanitized original admin path>`; method khác ->303 `/auth/login`, không ghi. Mount `app.use('/admin', ...)` trước mọi admin handler.
- `createLoginRouter({ prisma, authConfig }) -> express.Router`: triển khai đầy đủ login dưới đây. Mỗi router tự gắn requireCsrf trên POST để test độc lập vẫn bảo vệ như tích hợp.

### Route và adapter đã chốt

Mọi router mới mount `/auth`, dùng EJS, không JSON. Handler async Express4 catch/next(error). Mọi auth response có `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; admin đã xác thực có no-store. Session middleware cấp currentUser/csrfToken; không lộ hash/credential trong HTML/log.

Module đăng ký export `validateRegistrationInput(body) -> {values:{email}, errors, password}` (không render password), `createSmtpMailer(env = process.env)`, `createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch)`, `createRegistrationRouter({ prisma, mailer, recaptchaVerifier, authConfig, logger = console })`.

Mailer trả `{isConfigured(), sendVerificationEmail({to,verifyUrl}):Promise<void>}`. Dùng Nodemailer SMTP với SMTP_HOST, port mặc định587, SMTP_SECURE boolean, SMTP_USER/PASS tùy chọn, SMTP_FROM bắt buộc. Thiếu/sai cấu hình fail closed lúc gửi, không giả thành công; SMTP local có thể không auth. Email tiếng Việt text+HTML chứa link, escape nội suy HTML, không log link/token/credential. connectionTimeout/socketTimeout10000ms. Người tích hợp chạy `npm install nodemailer` một lần lấy stable hiện tại, giữ phiên bản resolve trong lockfile, không ghim khuyến nghị cũ.

CAPTCHA adapter trả `{isConfigured(),siteKey,verifyToken(token,remoteIp):Promise<{ok:boolean,reason:string|null}>}`. Google v2 checkbox; POST backend `https://www.google.com/recaptcha/api/siteverify` với URLSearchParams secret/response/remoteip tùy chọn; timeout10000ms; yêu cầu HTTP ok và JSON success===true. Token bị từ chối ->verification-failed; vắng token ->missing-input-response; thiếu key ->not-configured; mạng/timeout/JSON sai ->network-error. Hostname trả về phải khớp hostname APP_BASE_URL chuẩn hóa, không xét port; lệch ->verification-failed. Không production bypass; chỉ inject adapter test tường minh.

- **GET `/auth/register`**:200 form `{title,values:{email:''},errors:{},recaptchaSiteKey}`; user đã xác minh/đăng nhập ->302 `/admin/dishes`.
- **POST `/auth/register`**: CSRF trước; validate email/password/confirmPassword rồi CAPTCHA trước ghi DB. Trường/token sai ->400; provider unavailable/not-configured ->503; không phản chiếu password/CAPTCHA. Email đã xác minh trùng ->400. Email mới: hash password, tạo user+token cùng interactive transaction. Email CHƯA xác minh: khóa User bằng parameterized SELECT FOR UPDATE, đọc lại sau lock; đã verified thì từ chối, nếu chưa thì thay passwordHash đang chờ, vô hiệu mọi token cũ chưa dùng, tạo token mới cùng transaction. Password mới chỉ dùng sau link mới tương ứng được verify. Không giữ password do kẻ tấn công đăng ký trước. Verify dùng cùng khóa, không cho link cũ xác minh password vừa thay hay ghi đè password verified. P2002 tạo user đồng thời ->400 duplicate/retry. SMTP sau commit; gửi lỗi503, account vẫn unverified và cho thử lại cùng email. Không gửi mail trong transaction/không auto-login. URL `<appBaseUrl>/auth/verify-email?token=<64hex>`; DB chỉ hash, mặc định24h. Gửi thành công ->201 result pending, không session cookie.
- **GET `/auth/verify-email?token=...`**: thiếu/sai/không tồn tại/hết hạn/đã dùng ->400 result invalid/expired. Thành công200, link `/auth/login?verified=1`, không session. Một transaction: tìm token include user, parameterized User FOR UPDATE, tính now SAU lấy khóa, claim `emailVerificationToken.updateMany({where:{id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}})`; chỉ count===1 mới cập nhật emailVerifiedAt nếu null. Count0/lỗi transaction không được partial verify/báo thành công. Concurrent consume đúng một thành công; token bị xóa/rotate trong resend có count0. View `{title,status,heading,message,actionHref,actionLabel}`, status pending/verified/invalid/expired.
- **GET `/auth/login`**:200 form `{title,values:{email:'',next:sanitizeNextPath(query.next)},errors:{},notice}`; chỉ banner tiếng Việt cố định verified=1/loggedOut=1. Đã auth ->302 safe next.
- **POST `/auth/login`**:CSRF trước; input sai400, unknown email/wrong password401 cùng thông báo chung, password đúng nhưng chưa verify403 không session. Verified credential tạo định danh session mới, chỉ xóa session cũ được trình ra,303 safe next hoặc `/admin/dishes`. Không tái dùng ID do client cấp. Form email/password/hidden next/hidden _csrf; không giữ password.
- **Logout** export `createLogoutRouter({ prisma, authConfig }) -> express.Router`. POST `/auth/logout` requireCsrf; deleteMany theo hash của `req.auth.rawToken || req.cookies[sessionCookieName]` nếu đúng định dạng; sau thành công clear cookie rồi303 `/auth/login?loggedOut=1`. DB deletion lỗi ->next(error), không success redirect/không báo thành công bằng cookie-only logout. Anonymous CSRF hợp lệ với session thiếu/đã xóa ->303 idempotent. Replay CSRF session cũ không có anonymous CSRF hợp lệ có thể403. GET `/auth/logout` không đăng ký ->404, không logout. Session khác giữ nguyên.

### Cấu hình và tích hợp

Giữ DATABASE_URL/PORT; thêm APP_BASE_URL=http://localhost:3001, SESSION_COOKIE_NAME=soucha_session, SESSION_TTL_HOURS=24, EMAIL_VERIFY_TTL_HOURS=24, SMTP_HOST, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER, SMTP_PASS, SMTP_FROM, RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET_KEY vào `.env.example`. Secret cung cấp riêng, không commit. SMTP sender/domain và v2 site/secret cho hostname thật là điều kiện bên ngoài. Production APP_BASE_URL phải public HTTPS. Thiếu provider vẫn chạy menu/login, registration503 không fake verify.

Factory mới `createApp({prisma,logger=console,mailer,recaptchaVerifier,authConfig:authConfigOverrides} = {})`. Resolve một lần; CAPTCHA factory thật nhận `{...process.env,APP_BASE_URL:authConfig.appBaseUrl,RECAPTCHA_SITE_KEY:authConfig.recaptchaSiteKey,RECAPTCHA_SECRET_KEY:authConfig.recaptchaSecretKey}` cho hostname/key khớp override. Body parser/methodOverride trước session; rồi `/auth` no-store/no-referrer +3 router; `/admin` no-store/auth guard/write-CSRF trước handler/404/error. Static trước lookup DB. Header anonymous menu+login/register; authenticated menu+management+escaped email+POST logout. Thêm hidden `_csrf` vào mọi POST form: admin/form:3,delete:2,unlink:7,dish-detail:54,dish-ingredient-edit:14,chef-detail:40. Login/register/header logout cũng có; GET search/sort công khai không cần. Caller createApp prisma/logger hiện tại vẫn dùng được vì injection tùy chọn, không thêm compatibility shim.

CRUD hiện có: dishes/chefs/ingredients list/new/create/edit/PATCH/delete-confirm/DELETE (`src/app.js:63-130`), dish detail+ingredient links (`:163-283`), chef detail+dish links (`:313-378`). Bảo vệ prefix, không liệt kê chọn lọc endpoint. Anonymous write không chạy restaurant Prisma operation. Giữ validation/redirect CRUD khi authenticated. Giữ DB URL redaction, thêm SMTP_PASS/RECAPTCHA_SECRET_KEY/provider URL; không log password/session/email token thô/provider payload.

## Kiểm chứng

Giai đoạn lập kế hoạch chỉ kiểm tra source; chưa chạy các kiểm chứng triển khai dưới đây.

Sau nền tảng và3 nhánh tích hợp, chạy `npm test` hiện có (`node --test tests/*.test.js`). Test chuyên biệt có fixture riêng; không tranh sửa fake Prisma chung. Fake auth delegate mô phỏng callback transaction/conditional update count/rollback ở test cần thiết; khóa/concurrency phải chứng minh bằng PostgreSQL thật. Cập nhật app tests với verified user/session/cookie/form CSRF, giữ assertion CRUD; chủ ý thay giả định admin công khai.

Chạy `npm run db:generate`, `npm run db:push` với DATABASE_URL disposable đã cung cấp tường minh, sau đó live smoke đã điều chỉnh. Không seed/SQL phá hủy dữ liệu người dùng. Interface test `AUTH_SMOKE_*` và `LIVE_SMOKE_ALLOW_DB_WRITE=1` được chốt tại plan đăng nhập; test config inject, không production bypass.

Phải quan sát: public anonymous vẫn hoạt động; `/admin` anonymous read302/write303 không mutation; đăng ký qua widget v2 thật gửi email đến inbox kiểm soát, verify cho phép login nhưng không auto-auth; CAPTCHA lỗi/provider lỗi không verified account; unverified login403; verified login cấp cookie đúng thuộc tính và session hash DB; entity/association writes với CSRF thành công, thiếu CSRF403; session expired/deleted bị từ chối; process restart cùng DB/unexpired cookie vẫn authenticated; logout xóa đúng session, cookie capture replay bị từ chối. Verify token concurrent đúng một thành công với PostgreSQL thật. Kiểm tra UI register/login/result/header/logout, đóng tab. Injected mail/CAPTCHA tests không thay real-provider proof.

Sau triển khai có reviewer độc lập effort medium trở xuống kiểm tra diff/security/ownership/hành vi; sửa finding rồi chạy lại smoke bị ảnh hưởng. Thiếu prerequisite phải báo chính xác; hoàn thành mọi test có thể chạy, không khẳng định real mail/CAPTCHA thành công khi chưa quan sát.

## Giả định và phương án dự phòng

Mặc định v2 checkbox, SMTP, session/verify TTL tuyệt đối24h, logout current-session-only, mọi verified account dùng CRUD (không role mới). Người dùng có thể đổi trước triển khai; nếu không các lựa chọn đã chốt. Re-register unverified email thay pending credential nguyên tử và vô hiệu link cũ; không thêm password reset verified account. Plan mode chỉ lưu local://, không tạo Markdown repository trước phê duyệt.

Thiếu SMTP/Google keys/inbox: triển khai adapter thật, chạy injected coverage nhưng đánh dấu real-provider smoke blocked và nêu prerequisite. Thiếu DB disposable: hoàn thành fake-Prisma tests, báo live persistence/concurrency blocked; không trỏ schema push vào DB hiện hữu tùy ý. Không thay bằng JSON API, fake mail success, CAPTCHA bypass hoặc in-memory production sessions.


---

## Nguồn: auth-contract-english.md

# Shared contract: parallel registration, login and logout

## Current context

The user requests three implementation-plan files plus a shared contract permitting parallel implementation: registration with real verification email and Google reCAPTCHA, login using cookie sessions persisted in PostgreSQL, authenticated-only CRUD, and logout. The user explicitly selected protecting the existing SSR/form `/admin` endpoints, not adding JSON APIs. Public menu browsing stays public. This contract is authoritative for the three companion plans; existing source paths below were inspected by AuthDiscovery and AuthContractDesign during this session, proposed auth paths do not exist yet.

Existing application: CommonJS Node >=20, Express 4/EJS, Prisma 6.12/PostgreSQL (`restaurant/package.json:1-29`); app factory `createApp({ prisma, logger = console })` (`restaurant/src/app.js:16-402`); startup (`restaurant/server.js:1-27`); no auth entities (`restaurant/prisma/schema.prisma:1-68`). Existing CRUD tests use an injected fake Prisma and assume public admin access (`restaurant/tests/app.test.js:18-135,167-184`); live smoke also assumes it (`restaurant/tests/live-smoke.js:24-26`). Commands below execute from `restaurant/` only after implementation approval, never during planning.

## Required functionality

Only verified users may access any `/admin` route, including read pages and all entity/association writes. A browser holds an opaque session identifier in an HttpOnly cookie; session state survives application restart in PostgreSQL. Email verification does not log a user in. Logout invalidates the current DB session, not every session belonging to that user. Multiple devices may remain logged in independently. Cookie and verification secrets are stored hashed, never raw, in DB.

## Overall implementation approach

### Ownership and execution barriers

Assign exactly one integrator, also the login implementer. First that owner completes the real shared foundation: dependencies/lockfile, schema, generated Prisma client and complete `src/auth/session.js` shared utilities/middleware; these have no imports of registration/logout. This barrier exposes working code, not stubs, fake routes or no-op interfaces. Do not wire imports into `app.js` while the corresponding modules are missing. Then registration, remaining login/integration work and logout execute concurrently within the exclusive files below. The integrator mounts all routers after the three real modules are present. No other worker edits shared files, dependency manifests, schema or generated files. Do not run shared installs, generation, tests or formatters concurrently with edits. A short shared prerequisite is necessary; the three tasks are independent after it, not magically independent before it.

- Registration owns proposed `restaurant/src/auth/registration.js`, `restaurant/views/auth/register.ejs`, `restaurant/views/auth/verify-result.ejs`, `restaurant/tests/auth-registration.test.js` only.
- Logout owns proposed `restaurant/src/auth/logout.js`, `restaurant/tests/auth-logout.test.js` only.
- Login/integrator owns proposed `restaurant/src/auth/session.js`, `restaurant/views/auth/login.ejs`, `restaurant/tests/auth-session.test.js`; existing `restaurant/package.json`, `restaurant/package-lock.json`, `restaurant/.env.example`, `restaurant/prisma/schema.prisma`, `restaurant/generated/prisma/**`, `restaurant/server.js`, `restaurant/src/app.js`, `restaurant/views/partials/header.ejs`, `restaurant/views/admin/form.ejs`, `restaurant/views/admin/delete.ejs`, `restaurant/views/admin/unlink.ejs`, `restaurant/views/admin/dish-detail.ejs`, `restaurant/views/admin/dish-ingredient-edit.ejs`, `restaurant/views/admin/chef-detail.ejs`, `restaurant/tests/app.test.js`, `restaurant/tests/live-smoke.js`. Do not introduce unrelated styling work. Login integrator owns any behavior documentation automatically required by repository conventions.

### Frozen persistence schema

Append these models, leaving all restaurant entities unchanged:

```prisma
model User {
  id Int @id @default(autoincrement())
  email String @unique
  passwordHash String
  emailVerifiedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  sessions Session[]
  verificationTokens EmailVerificationToken[]
  @@map("users")
}
model Session {
  id Int @id @default(autoincrement())
  tokenHash String @unique
  csrfToken String
  userId Int
  expiresAt DateTime
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}
model EmailVerificationToken {
  id Int @id @default(autoincrement())
  tokenHash String @unique
  userId Int
  expiresAt DateTime
  usedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
  @@map("email_verification_tokens")
}
```

Use existing `npm run db:generate` / `npm run db:push` convention, not a second migration convention. `db:push` requires a dedicated disposable verification database, never an unapproved production database. Do not run seed for authentication smoke: the existing seed was inspected and must be reread for destructive behavior before any separate use.

### Frozen shared module API

`restaurant/src/auth/session.js` exports these CommonJS functions; all named functions must be real implementations before the barrier clears:

- `resolveAuthConfig(overrides = {}) -> config`: input overrides and output share keys `appBaseUrl`, `sessionCookieName`, `csrfCookieName`, `sessionTtlMs`, `emailVerifyTtlMs`, `cookieSecure`, `recaptchaSiteKey`, `recaptchaSecretKey`. Explicit overrides take precedence over env; TTL overrides are positive safe-integer milliseconds, env SESSION_TTL_HOURS/EMAIL_VERIFY_TTL_HOURS are positive finite integer hours converted to safe-integer milliseconds, defaults24h. Default origin is `http://localhost:${process.env.PORT || 3001}`; validate HTTP(S) root URL with no credentials/query/fragment/non-root path and strip trailing slash. In production require explicitly configured public HTTPS APP_BASE_URL. Invalid supplied config throws at startup. Derive Secure from production OR normalized HTTPS origin, with explicit boolean override only through injected test config. Default names soucha_session/soucha_csrf; cookie names must match HTTP token syntax. Only tests may override csrfCookieName.
- `normalizeEmail(value) -> string`: string trim + lowercase or empty. Both forms use email max 120 chars and `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- `hashPassword(password) -> Promise<string>` and `verifyPassword(password, storedHash) -> Promise<boolean>`: Node async scrypt, 16 random salt bytes, 64 derived bytes, `N=16384,r=8,p=1`; store `scrypt$<32 lower hex salt>$<128 lower hex key>`. Hash UTF-8 password exactly as entered (no trim or Unicode normalization). Reject malformed hashes without throwing; use timingSafeEqual. Registration password 8..128 characters inclusive, exact confirmPassword match. Login caps input at 128 and uses a valid precomputed dummy hash on unknown email; no per-request dummy generation.
- `generateRawToken() -> string`: 32 random bytes as 64 lowercase hex; `hashToken(rawToken) -> string`: SHA-256 lowercase hex; `safeEqualToken(a,b) -> boolean`: require two 64-lowercase-hex strings then constant-time buffer comparison.
- `parseCookies(header = '') -> object`: parse semicolon-separated cookie pairs, use safe decoding, ignore malformed encoding; duplicate cookie names invalidate that cookie instead of selecting attacker-controlled order. `serializeCookie(name,value,options) -> string` is internal reusable export; options are `httpOnly`, `secure`, `sameSite`, `path`, `maxAge` (seconds), `expires` (Date).
- `setSessionCookie(res, rawToken, config)` and `clearSessionCookie(res, config)`: append Set-Cookie (never overwrite another cookie). Session attributes `HttpOnly; Path=/; SameSite=Lax`, conditional `Secure`; issue `Max-Age=floor(sessionTtlMs/1000)`, clear `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`. Host-only, no Domain. Anonymous CSRF cookie uses same attributes and Max-Age 7200.
- `sanitizeNextPath(value) -> string`: allow only same-origin paths whose pathname is exactly `/admin` or starts `/admin/`, maximum 200 chars, no backslashes, controls, protocol-relative prefixes or encoded pathname separators; otherwise `/admin/dishes`. Validate against a fixed dummy origin with URL, return pathname+search only; never forward `_method` on a redirect target. This is a navigation target, never write replay.
- `createSessionForUser({ prisma, userId, authConfig, res }) -> Promise<{rawToken,tokenHash,csrfToken,expiresAt}>`: create fresh token/CSRF and persist session, absolute expiresAt=now+TTL. `res` is optional: when supplied append cookie after persistence; when omitted return token data without emitting headers. Login passes the transaction delegate as prisma and omits res while atomically deleting only the old presented row and creating the new one; after transaction commits, call setSessionCookie with real res. No sliding refresh; unrelated sessions remain. A failed DB operation emits neither a successful-login redirect nor a new session cookie.
- `attachSessionMiddleware({ prisma, authConfig }) -> middleware`: initialize `req.auth={user:null,session:null,rawToken:null}`, `req.cookies`, `res.locals.currentUser=null`, `res.locals.csrfToken=''`; look up a valid-format session cookie by tokenHash including user. Authenticate only existing unexpired row with verified user. Populate req.auth (full user/session internal only), render currentUser `{id,email}`, and persisted session csrfToken. Missing/invalid/expired/deleted/unverified session cookie is cleared; expired rows may be deleteMany by tokenHash. Never treat DB outage as anonymous; next(error) and existing 500 response. For anonymous GET auth forms generate/reuse 64-hex `soucha_csrf` cookie and expose same token through res.locals and `req.csrfToken`; initialization on other dynamic routes may do likewise, but never manufacture a successful submitted token. Async middleware forwards errors under Express 4.
- `requireCsrf(req,res,next)`: expected token is authenticated DB session csrfToken, otherwise incoming anonymous CSRF cookie; submitted body field is `_csrf`; missing/malformed/mismatch -> 403 error view. Also reject a supplied Origin different from configured app origin; if Origin absent but Referer supplied, require same origin; allow both absent for non-browser HTTP clients only with valid token. Middleware accesses config through `req.authConfig`, set by attachSessionMiddleware. Login/register/logout call this middleware; all non-GET/HEAD/OPTIONS `/admin` requests call it after auth guard and method override. Do not compare against a newly issued cookie when no incoming cookie exists.
- `requireAdminAuth(req,res,next)`: require verified attached session; anonymous GET/HEAD -> 302 `/auth/login?next=<encoded sanitized original admin path>`; anonymous other methods -> 303 `/auth/login` without writes. Guard mounted with app.use('/admin', ...) before every existing admin handler.
- `createLoginRouter({ prisma, authConfig }) -> express.Router`: full real login implementation described below. Routers install requireCsrf themselves on their POST routes, so isolated tests enforce the same behavior.

### Frozen routes and adapters

All new routers mount at `/auth` and use EJS, not JSON. Express 4 async handlers catch and call next(error). All auth responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; authenticated admin pages are no-store. Shared session middleware supplies template `currentUser` and `csrfToken`; do not expose hashes or raw credentials in HTML/logs.

Registration module exports `validateRegistrationInput(body) -> {values:{email}, errors, password}` (never render returned password), `createSmtpMailer(env = process.env)`, `createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch)`, `createRegistrationRouter({ prisma, mailer, recaptchaVerifier, authConfig, logger = console })`.

Mailer returns `{isConfigured(), sendVerificationEmail({to,verifyUrl}):Promise<void>}`. Nodemailer SMTP transport, `SMTP_HOST`, port (default 587), boolean SMTP_SECURE, optional SMTP_USER/PASS, required SMTP_FROM. Missing/invalid config fails closed when sending, not a fake success; development local SMTP may omit authentication. Send Vietnamese text+HTML verification link, escape interpolated HTML, never log links/tokens/provider credentials. Configure connectionTimeout and socketTimeout 10000ms. Integrator installs current stable `nodemailer` once with `npm install nodemailer`; use resolved lockfile version rather than hard-coded stale recommendation.

CAPTCHA adapter returns `{isConfigured(),siteKey,verifyToken(token,remoteIp):Promise<{ok:boolean,reason:string|null}>}`. Google reCAPTCHA v2 checkbox, backend POST `https://www.google.com/recaptcha/api/siteverify`, URLSearchParams secret/response/optional remoteip, timeout 10000ms, check HTTP ok and JSON `success === true`. Missing/failed token reason `verification-failed`, absent token `missing-input-response`, missing keys `not-configured`, network/timeout/provider malformed response `network-error`. Require successful response hostname matches normalized APP_BASE_URL.hostname (ignore port); mismatch -> verification-failed. No bypass in application code. Test adapters may be injected explicitly.

- GET `/auth/register`: 200 register form `{title,values:{email:''},errors:{},recaptchaSiteKey}`; verified signed-in user ->302 `/admin/dishes`.
- POST `/auth/register`: CSRF first; validate email/password/confirmPassword, then CAPTCHA before DB writes. Invalid fields/token ->400 register form, provider unavailable/not-configured ->503; never echo password or CAPTCHA response. Verified existing email ->400 email-already-registered error. For a new email, hash password and create user+token in a Prisma interactive transaction. For an existing UNVERIFIED email, lock its User row using parameterized SELECT FOR UPDATE, reread verified status after acquiring the lock, and reject if now verified; otherwise replace its pending password hash, invalidate every unused prior verification token, and issue the new token in the same transaction. The new password becomes usable only after the matching new link is verified. Preserving an attacker-pre-registered password is forbidden. Verification acquires the same per-user lock, so no stale link can verify a newly replaced password, and a verified password can never be overwritten by registration. Treat concurrent new-user P2002 as 400 duplicate/retry, no 500. SMTP send happens after commit; failure returns503, leaves account unverified and permits same-email retry. Do not send mail inside an open DB transaction or automatically log in. Link `<appBaseUrl>/auth/verify-email?token=<64hex>`; DB holds hash only, expires after24h default. Successful send ->201 verify-result view pending; no session cookie.
- GET `/auth/verify-email?token=...`: malformed/missing, absent, expired, used ->400 result view invalid/expired; success ->200 result view with login link `/auth/login?verified=1`. No session. One transaction: look up token (including user), lock its user using parameterized SELECT FOR UPDATE, compute now AFTER lock acquisition, conditionally claim with `emailVerificationToken.updateMany({where:{id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}})`; only count===1 then user.update emailVerifiedAt if still null. Zero count/transaction failure cannot partially verify or report success. Concurrent consume: exactly one success. For deleted/rotated token under a resend race conditional update count===0. View contract `{title,status,heading,message,actionHref,actionLabel}`; statuses pending/verified/invalid/expired.
- GET `/auth/login`: 200 form `{title,values:{email:'',next:sanitizeNextPath(query.next)},errors:{},notice}`; show fixed Vietnamese notices only for verified=1/loggedOut=1; already authenticated ->302 safe next.
- POST `/auth/login`: CSRF first; invalid fields ->400; unknown email/wrong password ->401 same generic message; correct password but unverified ->403 no session. Verified password success creates new session identity and removes only the old presented DB session if any, then303 safe next or `/admin/dishes`. Do not reuse attacker-provided session IDs. Form fields email/password/hidden next/hidden _csrf; never retain password.
- Logout module exports `createLogoutRouter({ prisma, authConfig }) -> express.Router`. POST `/auth/logout` runs requireCsrf; deleteMany session by hash of `req.auth.rawToken || req.cookies[sessionCookieName]` when valid format, then clear cookie, then303 `/auth/login?loggedOut=1`. DB deletion failure calls next(error), no success redirect or cookie-only successful logout. Valid anonymous CSRF + missing/already-deleted session returns same303 (idempotent); replaying old authenticated CSRF without valid anonymous CSRF may403, which is safe. GET `/auth/logout` unregistered ->404, never logs out. Other session rows unaffected.

### Configuration and integration

Keep existing DATABASE_URL/PORT config; append APP_BASE_URL=http://localhost:3001, SESSION_COOKIE_NAME=soucha_session, SESSION_TTL_HOURS=24, EMAIL_VERIFY_TTL_HOURS=24, SMTP_HOST, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER, SMTP_PASS, SMTP_FROM, RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET_KEY to `.env.example`. Real secrets supplied privately; not committed. SMTP sender/domain and Google v2 site/secret registered for the actual hostname are external prerequisites. Production APP_BASE_URL must be configured as public HTTPS URL. Without providers, public menu/login can run; registration returns503, never fake verification.

Change factory to `createApp({prisma,logger=console,mailer,recaptchaVerifier,authConfig:authConfigOverrides} = {})` using injected or real providers. Resolve config once; real CAPTCHA factory receives `{...process.env,APP_BASE_URL:authConfig.appBaseUrl,RECAPTCHA_SITE_KEY:authConfig.recaptchaSiteKey,RECAPTCHA_SECRET_KEY:authConfig.recaptchaSecretKey}` so hostname/keys match overrides, not unrelated env. Existing body parser/methodOverride precede session middleware, then `/auth` no-store/no-referrer header middleware and all three routers, then `/admin` no-store/auth guard+CSRF before existing handlers/404/error. Preserve static middleware ordering before DB lookup. Header shows public menu+login/register when anonymous; authenticated menu+management+escaped email+POST logout form. Every existing POST form gets hidden `_csrf`: admin/form:3,delete:2,unlink:7,dish-detail:54,dish-ingredient-edit:14,chef-detail:40. Login/register/header logout forms include it; existing public GET search/sort forms do not. Existing createApp prisma/logger callers remain valid with optional injected arguments, not a compatibility shim.

Existing CRUD route coverage: generic dishes/chefs/ingredients list/new/create/edit/PATCH/delete-confirm/DELETE (`src/app.js:63-130`), dish detail and ingredient links CRUD (`:163-283`), chef detail and dish links (`:313-378`). Protect the prefix, not a hand-picked endpoint list. Unauthenticated writes never run restaurant Prisma operations. Keep current CRUD validation/redirect semantics when authenticated. Error logs preserve existing DB URL redaction and redact configured SMTP_PASS/RECAPTCHA_SECRET_KEY plus provider URLs; never print raw passwords/session/email tokens or provider request payloads.

## Verification

During current planning only source inspection is performed; none of the following implementation checks are claimed as run.

After shared foundation and three slices integrate, use existing `npm test` (`node --test tests/*.test.js`). Dedicated test files own their fixtures; do not race-edit shared fake Prisma. Fake auth delegates implement transaction callback, conditional update counts and rollback semantics where tested; real PostgreSQL smoke is required for locks/concurrency, not asserted from mocks. Update existing app tests with verified user/session fixtures and CSRF cookie/form handling while preserving CRUD assertions. Existing unauthenticated assumptions intentionally change.

Run `npm run db:generate`, then `npm run db:push` against explicitly provided disposable DATABASE_URL; execute `npm run test:live` after adapting it. Never seed or run destructive SQL against user data. Login plan must freeze a concrete new `AUTH_SMOKE_*` test-only fixture interface if needed; test config is injected, never production bypass.

Required observable scenarios: public pages still work anonymously; every `/admin` anonymous read redirects302 and write redirects303 without mutation; valid registration through a real browser v2 widget sends email to a controlled inbox, verification enables login but not automatic authentication; wrong/missing CAPTCHA and provider failures leave no verified account; unverified login403; verified login issues secure attributes and DB hash, then all entity and association writes work with CSRF and fail403 without it; DB-expired/deleted session fails; process restart with same DB and unexpired cookie preserves access; logout deletes only current DB row and captured cookie replay fails. Verify verification single-use concurrently with real PostgreSQL. Inspect browser UI of login/register/verification/header/logout; close browser tab. Unit tests with injected mail/CAPTCHA do not replace real-provider verification.

After implementation assign a separate medium-or-lower effort reviewer to inspect actual diff/security/ownership and relevant behavior; fix actionable findings, rerun affected smoke. Runtime external prerequisites missing at execution are reported precisely; complete all reachable tests, never claim real mail/CAPTCHA delivered without evidence.

## Assumptions and contingencies

Defaults are reCAPTCHA v2 checkbox, SMTP, 24-hour absolute session and verification lifetimes, current-session-only logout, and all verified accounts can manage existing CRUD (no new roles). User may override these before implementation; otherwise they are fixed. Same unverified email resubmission atomically replaces pending credentials and invalidates all prior unused links; verified-account password reset is not added. Plan mode stores deliverables only at local://; repository markdown copies are not created before approval.

If SMTP/Google keys or controlled inbox are unavailable, implement real adapters and run deterministic injected failure/success coverage, but mark real-provider smoke blocked with missing prerequisites. If no disposable PostgreSQL URL is available, finish fake-Prisma tests and report live persistence/concurrency verification blocked; never point schema push at an arbitrary existing database. No substitute JSON API, mock mail success, CAPTCHA bypass, or in-memory production session store.


---

## Nguồn: auth-registration-english.md

# Registration: email verification, SMTP and Google reCAPTCHA

## Current context

Shared contract: local://auth-parallel-plan.md (Vietnamese) and local://auth-contract-english.md (English authority). Existing Express/EJS conventions are in `restaurant/src/app.js:16-27`, admin form partials and `restaurant/tests/app.test.js:18-135`; PostgreSQL schema currently has no auth models (`restaurant/prisma/schema.prisma:1-68`). No new JSON API or restriction on public menu browsing is requested. This plan defines future implementation, not completed code/tests.

## Required functionality

Vietnamese registration form, CSRF and real Google reCAPTCHA v2 checkbox verified server-side, real SMTP verification email, hashed expiring single-use tokens, email activation before login. Verification never logs the user in. Unverified re-registration replaces pending credentials and invalidates previous links atomically; verified users cannot be overwritten. Provider/config/DB errors never fake success.

## Overall implementation approach

### 1. Ownership and dependencies

Create only `restaurant/src/auth/registration.js`, `restaurant/views/auth/register.ejs`, `restaurant/views/auth/verify-result.ejs`, `restaurant/tests/auth-registration.test.js` (new paths). The login integrator exclusively owns dependencies, schema/generated client, shared session helpers, app/server/config/header/shared test/live smoke edits. Begin after its real shared-foundation barrier; do not invent replacement crypto/config/CSRF helpers. Router mounting occurs after all three real modules exist. No shared tests/install/generation while siblings edit.

### 2. Validation and provider adapters

Export CommonJS `validateRegistrationInput(body)`, `createSmtpMailer(env = process.env)`, `createRecaptchaVerifier(env = process.env, fetchImpl = globalThis.fetch)`, `createRegistrationRouter({prisma,mailer,recaptchaVerifier,authConfig,logger=console})` exactly as contract. Use shared normalizeEmail/hashPassword/generateRawToken/hashToken/requireCsrf. Express4 async handlers catch and call next(error). Router responses have no-store/no-referrer, including forwarded errors through shared integration.

Validation returns `{values:{email},errors,password}`. Email trimmed/lowercased, max120, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; password string8..128 inclusive, confirmPassword exactly equal. No password trim/Unicode normalization. Nonstring inputs invalid; never render password/confirmation/CAPTCHA response. Reuse existing EJS escaped fields/partials, not raw interpolation.

SMTP: return `{isConfigured(),sendVerificationEmail({to,verifyUrl})}`. Nodemailer dependency installed by integrator. SMTP_HOST and SMTP_FROM required; port integer1..65535 default587, SMTP_SECURE literal true/false defaultfalse; SMTP_USER/PASS optional together for real authenticated SMTP, local test SMTP may omit both. Missing/invalid config makes send throw, not succeed. Transport connectionTimeout/socketTimeout10000ms. Vietnamese text+HTML with escaped link/display values; never log raw links, tokens, provider payloads/credentials. Check isConfigured before DB writes; send failure after commit still leaves unverified retryable account.

CAPTCHA: return `{isConfigured(),siteKey,verifyToken(token,remoteIp)}`. Node global fetch with AbortSignal.timeout(10000), POST form-urlencoded secret/response/optional remoteip to `https://www.google.com/recaptcha/api/siteverify`. Require HTTP ok, well-formed JSON, `success===true`, hostname equals normalized application hostname ignoring port. APP_BASE_URL from env must match resolved app config; pass normalized base URL to adapter env in integrator rather than recomputing unrelated fallback. Return exact reasons missing-input-response/not-configured/network-error/verification-failed or success reason null. Reject before DB writes. No production bypass; injected adapters only in explicit tests.

### 3. Routes and transaction boundaries

GET `/auth/register`: authenticated verified user302 `/admin/dishes`; otherwise200 form locals `{title,values:{email:''},errors:{},recaptchaSiteKey}` plus shared csrfToken/currentUser.

POST `/auth/register`: requireCsrf first; invalid input ->400, CAPTCHA missing/failed ->400, unconfigured/unavailable CAPTCHA or SMTP ->503. Preserve normalized email only in errors. Check email: verified duplicate400. Hash password and generate fresh raw64hex token, store hash and expiresAt=now+emailVerifyTtlMs.

New account: interactive `prisma.$transaction(async tx => ...)` creates user with emailVerifiedAt null and token atomically; concurrent unique-email P2002 ->400 duplicate/retry, no500. Existing unverified account: lock user with parameterized Prisma tagged query `await tx.$queryRaw\`SELECT id FROM users WHERE id = ${userId} FOR UPDATE\``; reread user after lock. If now verified, reject400 without changes. Otherwise update pending passwordHash, delete all unused old tokens and create the new token, all in one transaction. No password overwrite after verification. Transaction errors roll back and go through error handler. Do not hold transactions open for mail.

After commit send `<appBaseUrl>/auth/verify-email?token=<raw64hex>` to normalized email. SMTP failure ->503 register form and no session; committed account remains unverified and another same-email registration can retry. Successful SMTP submission ->201 result view pending; report actual inbox delivery only after real-provider smoke. Verification lifetime defaults24h.

GET `/auth/verify-email`: missing/malformed raw token ->400 invalid. In one interactive transaction find token by hash including user; absent/used/expired ->400 invalid/expired. Acquire same parameterized user FOR UPDATE lock, then conditionally claim `tx.emailVerificationToken.updateMany({where:{id:record.id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}})` using now after lock acquisition. Only count1 may set user.emailVerifiedAt (if still null); count0 returns400. Rollback on failure prevents partial claim/verification. Success200 result with `/auth/login?verified=1`, no session. Exactly one concurrent consume succeeds. If resend wins the lock, old token is deleted and claim fails; if verification wins, resend's post-lock reread rejects credential change.

### 4. Views

`register.ejs`: Vietnamese email/password/confirmPassword inputs, hidden `_csrf`, real v2 checkbox `<div class="g-recaptcha" data-sitekey="<%= recaptchaSiteKey %>"></div>` and `https://www.google.com/recaptcha/api.js` async/defer script. Escaped field/general errors, no retained password values. Keep existing partial/class conventions; no shared CSS edits by this slice.

`verify-result.ejs`: exact locals `{title,status,heading,message,actionHref,actionLabel}`; statuses pending/verified/invalid/expired. Pending explains inbox delivery/verification requirement; verified offers login; invalid/expired offers registration again. Escape text/URLs, never display raw query token. Integrator supplies shared response headers and template locals.

## Verification

Planning performed source inspection only. After all slices integrate run from `restaurant/`: `node --test tests/auth-registration.test.js`, then shared `npm test`. Use node:test HTTP style with private fake Prisma/transaction rollback and explicitly injected mail/CAPTCHA adapters; do not alter shared fixture files. Keep tests focused on behavior: invalid field boundaries and CSRF stop writes/mail; CAPTCHA reject/hostname mismatch/timeout/malformed result503 as appropriate; unavailable mail503; new account unverified with hashed password/token and no session; duplicate400; resend old link invalid, new password not usable before matching verification; valid link200 once, unknown/used/expired400; DB failure rollback; verification does not authenticate; password login only after activation. Inject fetch failures at provider boundary, not mock echoes of internal wiring. Inspect actual rendered form for widget and no password retention as browser smoke, not brittle source-text assertions.

Real PostgreSQL proof belongs in integrator-owned live smoke on an approved disposable DATABASE_URL, generated/pushed schema and `LIVE_SMOKE_ALLOW_DB_WRITE=1`. Two concurrent real HTTP verification requests for one run-owned token -> exactly one200 and one400, one verified account. Real DB sequential resend-before-old-verify and verify-before-resend check the lock contract's observable outcomes; additionally simultaneous resend/verify must yield only one consistent serial order, never a verified user with a password introduced after token claim. Use injected test adapters in the test child process only; production server never exposes a bypass. The login plan freezes the exact harness setup and commands. Do not seed.

Real-provider browser prerequisites: integrated running server with matching APP_BASE_URL, v2 checkbox keys registered for exact hostname, reachable SMTP with authorized sender, controlled inbox. Solve real widget, submit, observe201 then actual email arrival, follow URL ->200 without authenticated admin access, then log in with matching password. Missing/invalid CAPTCHA cannot create verified account. Confirm expired/replayed link fails. Inspect register/result/login/header/logout UI; close tab. No claim of email delivery or Google success from injected tests. Separate medium-or-lower reviewer inspects final diff/security, fixes are followed by affected smoke.

## Assumptions and contingencies

Shared defaults: SMTP, v2 checkbox,24h expiry, verified accounts may manage CRUD, no automatic login/roles/password reset. Missing SMTP/Google keys/inbox blocks only real-provider smoke; implement real adapters and finish deterministic coverage, explicitly report unavailable proof. Missing approved disposable DB blocks live locking/persistence proof, not reachable fake-Prisma tests. Never use an arbitrary user database, fake mail success or production CAPTCHA bypass.


---

## Nguồn: auth-login-english.md

# Login: persistent cookie sessions and protected existing CRUD

## Current context

Shared contract: local://auth-parallel-plan.md (Vietnamese), local://auth-contract-english.md (English authority). Source-grounded stack is CommonJS Node>=20, Express4/EJS, Prisma6.12/PostgreSQL (`restaurant/package.json:1-29`). `restaurant/src/app.js:16-402` mixes public menu with unguarded SSR/form admin routes. Existing HTTP fake-Prisma tests and live smoke assume unauthenticated admin access. The user selected protecting those existing endpoints, not building JSON APIs. This document describes future implementation; no tests/runtime have been executed during planning.

## Required functionality

Only verified accounts with unexpired DB-backed sessions may access any `/admin` page/write. Cookies contain opaque random tokens; DB stores their SHA-256 hashes and CSRF state. Login creates fresh identity, survives process restart via PostgreSQL, and applies absolute24h default expiry. All admin writes require CSRF including method override and relationship operations. Public browsing stays anonymous. Registration and logout integrate through exact shared modules without file-write overlap.

## Overall implementation approach

### 1. Foundation, parallel work and integration barriers

This owner is the sole shared-file integrator. Before siblings depend on shared code: install current stable Nodemailer once (`npm install nodemailer`), update lockfile, append exact three Prisma models from shared contract and run `npm run db:generate`, implement every exported shared utility/middleware plus complete login router in proposed `restaurant/src/auth/session.js`. Module must not import registration/logout. No temporary stubs/routes. Do not edit app.js to require missing sibling modules. This is the foundation barrier; never run shared installs/generation concurrently with edits.

After barrier, registration and logout implement their exclusively owned modules/views/tests while integrator finishes login views, existing forms/config/tests. After all real modules exist, mount them and run verification once. Exclusive login ownership: session.js, views/auth/login.ejs, tests/auth-session.test.js (new); package.json/lockfile, .env.example, prisma/schema.prisma, generated/prisma/**, server.js, src/app.js, views/partials/header.ejs, views/admin/{form,delete,unlink,dish-detail,dish-ingredient-edit,chef-detail}.ejs, tests/app.test.js, tests/live-smoke.js (existing, all below restaurant/). No edits to registration.js/register.ejs/verify-result.ejs/auth-registration.test.js or logout.js/auth-logout.test.js. No unrelated CSS work.

### 2. Schema, shared APIs and configuration

Append contract's `User`, `Session`, `EmailVerificationToken` models literally, keeping existing restaurant models. Use db:push workflow already present, not a new migration convention. User.email unique normalized; sessions contain unique tokenHash, csrfToken, user relation, expiresAt; verification tokens unique tokenHash, user, expiresAt/usedAt. Cascade user deletion and indexes exactly contract. No raw passwords/tokens in DB.

Implement complete CommonJS exports in session.js: resolveAuthConfig, normalizeEmail, hashPassword, verifyPassword, generateRawToken, hashToken, safeEqualToken, parseCookies, serializeCookie, setSessionCookie, clearSessionCookie, sanitizeNextPath, createSessionForUser, attachSessionMiddleware, requireCsrf, requireAdminAuth, createLoginRouter. Exact signatures/formats are frozen in shared contract; callers registration/logout reuse them, not copies.

Key invariants: async built-in scrypt16-byte salt/64-byte key,N16384/r8/p1 with exact UTF-8 password; stored `scrypt$<32hex>$<128hex>`, timingSafeEqual; unknown login uses one valid precomputed dummy hash. Raw tokens32 random bytes ->64lowerhex; SHA-256 hashes. Duplicate cookie names invalidated, malformed decode ignored. Cookies appended rather than replacing existing Set-Cookie; host-only HttpOnly/Path=/;SameSite=Lax, Secure in production/HTTPS, issue absolute TTL, clear Max-Age=0 and epoch Expires. Anonymous CSRF cookie soucha_csrf has7200seconds. safe next allows only exact /admin or /admin/ descendant, <=200chars, no protocol-relative/backslash/control/encoded separators; drop _method from target search, fallback/admin/dishes.

Resolve config once; validate HTTP(S) root base URL and positive finite integer-hour TTLs; invalid provided values throw at startup. Preserve DATABASE_URL/PORT and add to .env.example:

```dotenv
APP_BASE_URL=http://localhost:3001
SESSION_COOKIE_NAME=soucha_session
SESSION_TTL_HOURS=24
EMAIL_VERIFY_TTL_HOURS=24
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
```

APP_BASE_URL defaults to http://localhost:${PORT||3001}; production requires explicit public HTTPS origin. Missing provider keys does not stop public/login startup; registration fails503. Pass normalized resolved origin to CAPTCHA adapter env so hostname validation matches actual appBaseUrl, including injected test config. Real secrets supplied privately. Do not add env flags disabling production auth/CAPTCHA.

### 3. Session, CSRF and login behavior

attachSessionMiddleware initializes req.auth/req.cookies/req.authConfig, safe template currentUser and csrfToken. Valid-format session cookie ->findUnique tokenHash include user. Only unexpired row with verified user authenticates; use persisted csrfToken. Clear malformed/missing-in-DB/expired/unverified presented cookie, delete expired row by hash if needed. DB errors next(error), not anonymous fallback. Unauthenticated auth GET gets/reuses valid incoming anonymous CSRF cookie or generates one; render same value, but POST validation only accepts incoming cookie, never newly minted state. Static requests remain before this DB middleware.

requireCsrf compares _csrf to authenticated session token or incoming anonymous cookie; missing/mismatch/malformed403 error view. Configured-origin comparison rejects foreign Origin or, absent Origin, foreign Referer. No headers allowed only with valid token. Router POST handlers install requireCsrf themselves. After methodOverride the /admin prefix guard precedes write-CSRF; unauthenticated GET/HEAD302 login?next=encoded safe original path, other methods303/login without mutation. Guard covers all prefix routes, not selected resource handlers.

GET/auth/login ->200 `{title,values:{email:'',next:safeNext},errors:{},notice}`; only fixed verified=1/loggedOut=1 notices. Authenticated302 safe next. EJS email/password/hidden next/hidden _csrf; normal escaped interpolation, no retained password.

POST/auth/login CSRF first. Email shared format/max120, password nonempty and max128; invalid400. Query normalized email; verify supplied or dummy hash; unknown/wrong401 same Vietnamese message. Correct but unverified403 and no session. Successful verified credentials rotate only presented existing session: in one Prisma transaction delete old row by its presented token hash if any, then call createSessionForUser with transaction delegate as prisma and omit optional res. Unrelated sessions remain. After commit call setSessionCookie with returned rawToken and real res, then303 sanitized next/default/admin/dishes. Transaction failure issues no new session cookie or successful-login redirect and does not partially delete the old row. Never replay a write.

### 4. Shared app and existing form integration

Change factory to `createApp({prisma,logger=console,mailer,recaptchaVerifier,authConfig:authConfigOverrides} = {})`. Read references before exported signature changes using LSP if available; keep current callsites using prisma/logger valid via optional injections. Resolve config, existing static parser/method override order; session middleware; `/auth` no-store/no-referrer headers and routers registration/login/logout; `/admin` no-store/auth guard/write-CSRF; existing public/admin routes and404/error. Headers must apply to auth errors and unregistered GET/auth/logout too. Wire adapter defaults real SMTP/Google; injected tests explicit only. Keep server database requirement/shutdown behavior; validate production origin at startup.

Header always public menu; anonymous login/register links; authenticated management + escaped email + POST/auth/logout form with_csrf. Add hidden `<input type="hidden" name="_csrf" value="<%= csrfToken %>">` to all existing POST forms at admin/form:3,delete:2,unlink:7,dish-detail:54,dish-ingredient-edit:14,chef-detail:40 (restaurant/views/). Public GET search/sort unchanged.

Prefix coverage includes generic dishes/chefs/ingredients list/new/create/edit/PATCH/delete confirmation/DELETE (`src/app.js:63-130`); dish detail and ingredient link add/edit/PATCH/delete (`:163-283`); chef detail and dish link add/delete (`:313-378`). Preserve authenticated CRUD validation/redirects. Existing error handler redacts DB URLs; additionally redact SMTP_PASS/RECAPTCHA_SECRET_KEY/provider URLs and never log raw tokens/password/provider payload.

### 5. Adapt tests without losing existing CRUD assertions

Create dedicated tests/auth-session.test.js private fake Prisma/HTTP fixtures. Cover actual login/session/CSRF/auth boundaries, format/expiry and redirect safety; avoid permanent source-text/wiring/incidental-default tests. Update tests/app.test.js fake Prisma with verified user/session delegates; carry cookies and _csrf from rendered pages. Retain existing CRUD/search/validation/error/escaping assertions but authenticate admin operations. Add anonymous302/303 no-mutation and authenticated wrong-CSRF403 across all entity and relationship families. Registration/logout retain their own fixtures and tests, not simultaneous shared edits.

## Verification

After all edits finish, from restaurant/: `npm run db:generate`, `npm test`. Dedicated targeted command `node --test tests/auth-session.test.js tests/app.test.js`. Verify invalid/wrong/unverified credentials400/401/403, session fixation rotation, independent sessions, configured cookie attributes, expired/deleted rows rejected, DB errors not anonymous, malformed/duplicate cookie safety, next values external/encoded/admin-lookalike rejected, missing/foreign-origin CSRF403 and no writes. Authenticated standard POST and method-overridden PATCH/DELETE must retain existing CRUD semantics.

### Disposable live harness: exact interface and process restart

Implement in existing tests/live-smoke.js only; no seed and no external test-account prerequisite. Require operator-supplied disposable DATABASE_URL and LIVE_SMOKE_ALLOW_DB_WRITE=1 before any fixture write. Missing either ->explicit failure, not skip/fallback. Flag is permission acknowledgement, not automatic detection that DB is disposable; operator must provision it explicitly before db:push. Use one random run ID/email under.invalid and in-memory password, create verified and unverified fixtures through real Prisma/shared hashPassword, and record every created primary key. Reuse valid restaurant field payloads from existing app.test.js/schema/validation rather than guessing new model fields. Replace dependence on preseeded Matcha/Houjicha rows with own records. Do not invoke seed/reset/truncate/broad delete.

Parent selects a free loopback port. Spawn `node tests/live-smoke.js` with env `AUTH_SMOKE_CHILD=1`, `AUTH_SMOKE_PORT=<selected port>`, same DATABASE_URL and explicit consent; IPC enabled. Child constructs real Prisma/createApp, injects authConfig with loopback appBaseUrl and cookieSecure=false for this test only, reports ready over IPC, closes server/disconnects on stop message. Child mode lives only in test script, never production server. Parent uses readiness/exit timeout10000ms, hard-kills failed child if needed and reports error. On port conflict choose a new port once before any restart scenario; after cookies are captured preserve same port or fail rather than claim restart proof.

To exercise registration without external providers in automated DB smoke, child injects an explicit deterministic CAPTCHA adapter accepting only in-memory per-run sentinel and a collecting mailer. Parent provides sentinel by private IPC startup message, never env/log/HTTP control endpoint. Outgoing verification URLs can be returned privately via IPC; never print secrets. These test adapters exist only in tests/live-smoke.js; production createApp defaults remain real. Actual provider acceptance remains separate below.

Parent maintains real cookie jars and parses_csrf from rendered forms, manual redirects. Assert public list/search/detail/invalid ID/static asset anonymously, anonymous read302/write303 no-mutation across entity and association families. Login wrong401/unverified403/verified303; DB row stores hash, issued cookie attributes correct. Exercise dishes/chefs/ingredients create/edit/delete and dish-ingredient add/edit/remove, chef-dish add/remove with real DB effects. Missing/wrongCSRF or foreign origin403 with no mutation. Expire one row/delete another ->captured cookies no longer authenticate.

Keep a valid session cookie, stop and await child exit, start NEW child PID with same DB+port, retained cookie ->200/admin/dishes. This must be actual process restart, not recreating createApp. Two sessions A/B for same user: POST logoutA deletes onlyA, capturedA read302/write303, B remains200 even after restart. GET logout404. Inspect actual UI separately.

Registration DB scenarios: create run-owned verification token and send two concurrent HTTP consumes ->exactly one200/one400. Resend before old-link consume ->old400/new200 with replacement-password login only after new verify. Verify first then resend ->400 duplicate and original verified credentials unchanged. Simultaneous resend/verify must match one of those serial outcomes, never verified credentials different from the successfully claimed generation. Use real row locking and transactions, not mock claims. All created auth/restaurant/link rows tracked by IDs. In finally stop child, delete only run-owned association/session/token/user/restaurant records in dependency order, disconnect; cleanup failure is failure.

Operator commands after confirming DATABASE_URL identifies a disposable DB:

```sh
cd restaurant
export DATABASE_URL='<dedicated-disposable-postgresql-url>'
npm run db:generate
npm run db:push
npm test
LIVE_SMOKE_ALLOW_DB_WRITE=1 npm run test:live
```

Do not db:seed. Public production APP_BASE_URL/HTTPS cookie checks are separate from loopback test config. Real provider smoke requires reachable SMTP/sender, controlled inbox, v2 keys for exact browser hostname and matching APP_BASE_URL. In browser solve real CAPTCHA, submit registration, observe actual email, verify link without automatic login, login/admin CRUD/logout, inspect cookies and rendered header/forms; close tab. Missing external credentials means precisely reported blocked provider proof, not fake success.

After implementation assign independent medium-or-lower reviewer to actual diff/behavior/ownership/security; fix findings then rerun affected smoke. No listed execution command has been run during planning.

## Assumptions and contingencies

Defaults24h absolute TTL, equal CRUD access for verified users, SMTP/v2 checkbox, current-session-only logout. No role system/new JSON API/password-reset feature. Real registration resend semantics are fixed in shared contract. Missing approved disposable DB ->finish deterministic tests, report live persistence/concurrency proof blocked, never pick an arbitrary DB. Missing providers ->registration503 and deterministic adapter tests, no production bypass. If readiness fails, report startup/port cause and do not assert restart success.


---

## Nguồn: auth-logout-english.md

# Logout: current-session revocation

## Current context

Companion contract: local://auth-parallel-plan.md (Vietnamese), local://auth-contract-english.md (English authority). The existing CommonJS Express/EJS app uses injected Prisma (`restaurant/src/app.js:16-27`) and HTTP tests with a fake Prisma (`restaurant/tests/app.test.js:18-135`). Logout is a separate parallel slice after the login owner's real shared foundation barrier. No code or runtime check is performed by this plan.

## Required functionality

POST-only logout invalidates the current PostgreSQL session before expiring its cookie. A captured pre-logout cookie cannot regain admin access; other sessions for the same user remain valid. CSRF and origin checks apply. Database failures must not be reported as successful logout.

## Overall implementation approach

### 1. Observe the ownership barrier

Exclusively create `restaurant/src/auth/logout.js` and `restaurant/tests/auth-logout.test.js` (both proposed paths). Do not edit app.js, schema, header, session.js, manifests or shared tests. Begin after the integrator supplies real `hashToken`, `clearSessionCookie`, `requireCsrf`, `attachSessionMiddleware` and schema from the shared contract. Router mounting and header logout form remain login owner work. Do not introduce independent cookie or session implementations.

### 2. Implement the complete router

CommonJS export `{ createLogoutRouter }`, signature `createLogoutRouter({ prisma, authConfig }) -> express.Router`. Import Express and `requireCsrf`, `hashToken`, `clearSessionCookie` from `./session`. Register only `router.post('/logout', requireCsrf, asyncHandler)`, mounted at `/auth` by integrator. Catch async errors and call next(error), as required by Express 4.

Resolve `rawToken = req.auth.rawToken || req.cookies[authConfig.sessionCookieName]`. For a string matching `/^[0-9a-f]{64}$/`, await `prisma.session.deleteMany({where:{tokenHash:hashToken(rawToken)}})`. Count zero is successful, never delete by userId. When no valid token is presented, skip deletion. Only after deletion succeeds (or is unnecessary), call `clearSessionCookie(res, authConfig)` and `res.redirect(303, '/auth/login?loggedOut=1')`. The shared helper appends HttpOnly/Path=/;SameSite=Lax, conditional Secure, Max-Age=0 and epoch Expires with the same cookie name/path as login.

On deletion failure call next(error), do not clear or redirect from this handler. Earlier session middleware may independently clear an expired/invalid cookie; deletion-failure checks must use a valid authenticated session. GET `/auth/logout` remains unregistered and falls through to404. No logout-all, GET side effects or new view. Auth responses inherit no-store/no-referrer integration. Do not log token/hash/CSRF values.

### 3. Define anonymous and replay behavior

Valid anonymous cookie-CSRF plus matching `_csrf` permits idempotent303 with missing/already-deleted session. A stale authenticated `_csrf` does not become valid anonymous CSRF: replay without a matching anonymous cookie may403. Missing/mismatched/malformed CSRF or cross-origin Origin/Referer is403 before deletion. A DB outage is500 through existing error handling, not a cookie-only successful logout.

## Verification

Write `tests/auth-logout.test.js` with node:test, strict assertions and an ephemeral real HTTP server following `tests/app.test.js:18-135`; use real shared session/CSRF/auth-guard functions and this router with a private fake session delegate, not shared fixture edits. Assert consumer-visible transitions:

- Valid authenticated POST ->303 exact Location, deleted A hash row, expired session cookie attributes; protected request with captured A cookie now302 login. Session B for the same user still gets200 and its DB row remains.
- Hold the deletion promise: client receives no success response until deletion resolves. Reject it:500, no success Location, no logout cookie expiry for the valid attached session, A remains accessible. This verifies revocation-before-success, not source wiring.
- Missing/wrong/malformed CSRF and different Origin ->403, original session still works; valid same-origin and absent Origin/Referer with correct token are allowed.
- Anonymous valid CSRF with no session, malformed session, or already-deleted session ->303 without creating or deleting another session. Former authenticated CSRF without matching anonymous cookie ->403.
- GET with valid session ->404 and subsequent protected read still200. Responses do not include credentials/tokens and integrated auth responses have no-store/no-referrer.

After all slices land, coordinator runs from `restaurant/`: `node --test tests/auth-logout.test.js`, then `npm test`. Prerequisite for real DB proof: explicitly supplied disposable PostgreSQL DATABASE_URL, generated client and pushed schema, integrated running server with matching APP_BASE_URL, privately available verified test-account credentials. Do not seed or use arbitrary user data.

Concrete real-server scenario: log in twice in two isolated browser cookie jars; confirm both access `/admin/dishes`. Privately capture A's raw session cookie and derive its SHA-256 hash without printing it. Inspect matching DB rows. Submit A's rendered header POST with `_csrf` ->303 `/auth/login?loggedOut=1` and expired cookie; query confirms A absent, B present. Replay captured A cookie with redirects disabled ->302 `/auth/login?next=...`; B still200. Restart same server against same DB ->B still200. Repeat logout with fresh anonymous CSRF ->303. Deterministic fake-DB rejection covers exact delete-failure ordering without deliberately disrupting a shared database.

Run the integrator's adapted live harness from `restaurant/`: `LIVE_SMOKE_ALLOW_DB_WRITE=1 npm run test:live`, with DATABASE_URL pointing only at a disposable DB and APP_BASE_URL/config as specified in login plan. Obtain separate medium-or-lower effort code review after implementation, fix findings, rerun affected smoke. None of these runtime checks has been run during planning.

## Assumptions and contingencies

Current-session-only revocation and shared CSRF/cookie configuration are fixed. If disposable PostgreSQL is missing, complete deterministic HTTP tests and report live persistence/replay proof blocked. Missing SMTP/Google keys or inbox blocks real-provider registration smoke, not reachable logout coverage. Integration/header/live harness are exclusively login owner tasks, not additional logout file edits.


---

## Nguồn: auth-bundle-english.md

# Authentication parallel planning bundle

## Draft documents and final destinations

The complete English execution specification is the four linked documents below, read in this order. They were written during this planning session and must all be read before translation. This index is not a substitute for the four contents.

1. Shared contract: local://auth-contract-english.md -> final canonical proposal local://auth-parallel-plan.md.
2. Registration: local://auth-registration-english.md -> final local://auth-registration-plan.md.
3. Login and sole shared integration owner: local://auth-login-english.md -> final local://auth-login-plan.md.
4. Logout: local://auth-logout-english.md -> final local://auth-logout-plan.md.

## Presentation contract

Each final document must be a faithful Vietnamese translation preserving all substantive details, literals, APIs, constraints, prerequisites, checks, decisions and uncertainties. First three level-two headings in each document, in this order: Bối cảnh hiện tại; Chức năng cần triển khai; Hướng triển khai tổng thể. Translate remaining headings appropriately. Do not add implementation, invent runtime evidence, shorten away load-bearing details or change code/env/paths. Include the corresponding English source path and this bundle index in each final document so future agents can use English model-to-model communication.

The final shared contract must link the three final companion plans and state the actual order: sole login integrator completes shared foundation first; all three finish disjoint work in parallel; then same integrator mounts real modules, independent review and verification. Three feature plans plus one shared contract are the requested output. Repository remains unchanged during plan mode; all deliverables are session-local files.


---

## Nguồn: auth-discovery.md

## Repository discovery

Source: AuthDiscovery read-only inspection in this session. No repository changes or runtime checks.

- Node >=20, Express ^4.21.2, EJS ^3.1.10, Prisma/Client 6.12.0, PostgreSQL. Scripts npm test, npm run test:live, npm run db:generate, npm run db:push, npm run db:seed: restaurant/package.json:5-28. Lockfile restaurant/package-lock.json.
- restaurant/server.js:1-14 loads dotenv, requires DATABASE_URL, constructs Prisma and injects createApp. restaurant/.env.example:1-4 contains DATABASE_URL and PORT only.
- restaurant/prisma/schema.prisma:1-68 contains restaurant entities and relations, no auth entities.
- restaurant/src/app.js:16-27 exports createApp({ prisma, logger = console }), URL-encoded forms then query method override. Public GET /, /dishes, /dishes/:id at :38-61. Header management link restaurant/views/partials/header.ejs:11-15.
- CRUD are SSR/form HTTP endpoints, not JSON APIs. Generic /admin/{dishes,chefs,ingredients}: GET list, GET /new, POST create, GET /:id/edit, PATCH /:id, GET /:id/delete, DELETE /:id at restaurant/src/app.js:63-130. /admin redirects. Mapping restaurant/src/validation.js:1-28.
- Dish association endpoints restaurant/src/app.js:163-283: GET /admin/dishes/:id; POST /admin/dishes/:id/ingredients; GET /admin/dishes/:id/ingredients/:ingredientId/edit; PATCH and DELETE /admin/dishes/:id/ingredients/:ingredientId; GET /admin/dishes/:id/ingredients/:ingredientId/delete.
- Chef association endpoints restaurant/src/app.js:313-378: GET /admin/chefs/:id; POST /admin/chefs/:id/dishes; GET /admin/chefs/:id/dishes/:dishId/delete; DELETE /admin/chefs/:id/dishes/:dishId.
- restaurant/tests/app.test.js:18-135 uses node:test, injected fake Prisma and local HTTP. Unauthenticated CRUD assumptions at :167-184, :212, :272. restaurant/tests/live-smoke.js:24-26 similarly assumes public admin.
- restaurant/src/app.js:384-397 generic 500 handler redacts DB URLs.

## Design seams (proposals, not existing paths)

Registration owns proposed src/auth/registration.js plus dedicated views/tests. Login owner owns proposed src/auth/session.js and all shared integration: app/server/schema/manifests/header/env/shared tests. Logout owns proposed src/auth/logout.js plus dedicated tests. All relative paths in this paragraph are under restaurant/.

SMTP, origin, sender and reCAPTCHA keys are deployment prerequisites. Existing test commands were read, not executed.

## Confirmed scope

The user selected protecting existing CRUD only. All /admin management endpoints require a verified, authenticated user; public browsing remains public. Do not create a separate JSON CRUD API.

