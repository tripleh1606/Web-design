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
