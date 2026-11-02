# Hợp đồng chung — xác thực tài khoản trên SSR

Cập nhật 02/11/2026. **Plan, chưa phải chức năng đã triển khai.** Đây là đặc tả chuẩn của bộ tài liệu; [English summary](auth-contract-english.md) và các plan thành phần phải tuân theo tài liệu này.

## 1. Nguồn, hiện trạng và phạm vi

Nguồn: [Xác thực tài khoản trên SSR.html](<D:/User_C_BackUp/Download/Xác thực tài khoản trên SSR.html>), đặc biệt slide 48–63 và speaker notes. [Discovery](auth-discovery.md) ghi nhận app CommonJS Node.js/Express 4/EJS, Prisma 6.12 và PostgreSQL hiện có CRUD nhưng chưa có auth.

Bốn phần bắt buộc: đăng ký có CAPTCHA + OTP; login/session bền vững + chống brute force; logout/bảo vệ CRUD; forgot/reset password. Tích hợp vào `week6/restaurant`, giữ dữ liệu nhà hàng. Mọi tài khoản **active** được dùng CRUD ở block này; vẫn lưu `role=viewer` do server gán để chứng minh client không tự nâng quyền. Phân quyền theo role, MFA, JWT/SPA, đăng nhập bằng mạng xã hội và logout mọi thiết bị bằng nút riêng nằm ngoài bài.

Slide 54 không nêu ngoại lệ cho trang thực đơn: bảo vệ cả `GET /dishes`, `GET /dishes/:id` và toàn bộ `/admin` (danh sách, chi tiết, form, ghi và quan hệ), vì các route này đều đọc/ghi dữ liệu nhà hàng. Đây là thay đổi so với menu đang công khai trong code cũ. Trang auth cần thiết và static assets vẫn truy cập được khi chưa đăng nhập. Không tạo JSON CRUD API mới. Auth dùng form POST và server render EJS.

## 2. Quyết định triển khai và chính sách công bố

| Nội dung | Lựa chọn của nhóm |
| --- | --- |
| Database/session store | PostgreSQL hiện có qua Prisma; không MemoryStore trong tiến trình |
| Password | Thư viện Argon2id, salt riêng do thư viện sinh; verify bằng thư viện; chốt phiên bản/tham số theo tài liệu chính thức khi cài và ghi README |
| Email | Lưu `emailOriginal` và `email` chuẩn hóa unique; trim ngoài, lowercase domain, giữ nguyên local-part, không xóa dấu chấm/plus theo nhà cung cấp; dùng thư viện kiểm tra email đã được kiểm thử |
| Password input | 8–128 ký tự theo chính sách bài tập, xác nhận trùng; không trim/đổi nội dung password |
| OTP | 6 chữ số, sinh bằng CSPRNG; 10 phút, một lần, purpose `activation`; chỉ lưu hash |
| Giới hạn OTP | 5 lần sai thì khóa 15 phút. Gửi lại không reset attempts/khóa. Chỉ hết kỳ khóa mới mở một ngân sách thử mới; mã hết hạn vẫn phải gửi lại |
| Gửi lại OTP | Chờ ít nhất 60 giây; tối đa 5 lần yêu cầu/giờ/email, 20 lần/15 phút/IP. Áp bucket kể cả email không tồn tại hoặc đã active |
| Register | CAPTCHA mọi lần; giới hạn 5 request/15 phút/email và 20/15 phút/IP |
| Login | Cửa sổ 15 phút: từ 3 lần sai cần CAPTCHA; lần sai thứ 10 khóa 5 phút; giới hạn thêm 50 request/15 phút/IP |
| Activate request | Giới hạn 10 request/phút/email và 30/phút/IP, độc lập ngân sách thử OTP |
| Forgot | 3 request/15 phút/email và 20/15 phút/IP, áp cả email không tồn tại |
| Reset token | 32 byte ngẫu nhiên, hash trong DB; 15 phút; một lần; yêu cầu mới vô hiệu mọi token cũ chưa dùng |
| Reset GET/HEAD/POST | Dùng chung giới hạn 20 request/15 phút/IP, bao phủ cả việc dò token trong URL; không khóa tài khoản theo token người ngoài tự gửi |
| Session | Auth: idle timeout 30 phút, absolute timeout 24 giờ; anonymous CSRF session: 30 phút. Cookie `sid` HttpOnly, Path=/, host-only, SameSite=Lax, Secure khi triển khai HTTPS |
| CAPTCHA | Theo lựa chọn mới của người dùng: Google reCAPTCHA v2 Checkbox. Register luôn cần checkbox; login cần từ 3 lần sai. Backend kiểm tra kết quả siteverify và hostname, Google quyết định expiry/single-use; không kiểm tra action/score |
| Email delivery | Giữ Nodemailer + SMTP để gửi OTP, link reset và thông báo đổi password; credential qua env; không phản hồi OTP/reset token cho browser. SMTP là lựa chọn triển khai, không phải công nghệ slide bắt buộc |
| Logout CAPTCHA — yêu cầu bổ sung của người dùng | reCAPTCHA v2 Checkbox với cặp key siteverify riêng LOGOUT_RECAPTCHA_V2_SITE_KEY/SECRET_KEY; không kiểm tra action/score v3 trên token v2 |

Các con số là quyết định có thể cấu hình, phải đồng bộ README và test. Người dùng chọn lại **reCAPTCHA v2 Checkbox**, thay lựa chọn v3 trước đó. Browser hiển thị widget và gửi `g-recaptcha-response` cùng form; backend gọi siteverify bằng cặp key v2. Không dùng action/score của v3 trên token v2. Tham số `purpose` trong helper `verify(token, purpose)` chỉ là ngữ cảnh route do server truyền (`register`/`login`), không phải thông tin Google xác nhận và không tạo ràng buộc token với từng form. Khi dùng chung key, không tuyên bố token chưa dùng của một form bị phân biệt bằng action ở form khác. Provider lỗi phải fail closed (lỗi kỹ thuật), không xem là CAPTCHA đạt hoặc password sai. Nếu Google cấp credential chỉ dùng assessment thì phải chọn adapter tương ứng; không đưa Cloud API key vào secret siteverify.

Auth đọc cặp `RECAPTCHA_V2_SITE_KEY`/`RECAPTCHA_V2_SECRET_KEY`. Nếu cả hai giá trị đều vắng/rỗng, có thể dùng nguyên cặp `LOGOUT_RECAPTCHA_V2_SITE_KEY`/`LOGOUT_RECAPTCHA_V2_SECRET_KEY` đã cấu hình cho cùng hostname làm fallback. Nếu đã điền bất kỳ biến auth nào thì phải điền đủ cặp auth, không ghép site key của cặp này với secret của cặp khác; cấu hình thiếu phải fail closed. Logout vẫn cho phép cấu hình cặp riêng.

Slide 17, 20, 42, 46, 50–51 và 55 yêu cầu email OTP, email reset và thông báo password đã đổi; không chỉ định SMTP hay nhà cung cấp. Nodemailer + SMTP đang có đáp ứng vai trò gửi email và hoạt động độc lập với CAPTCHA. Xem [cách cấu hình và nghiệm thu email](../restaurant/docs/email-setup.md); đổi phiên bản CAPTCHA không yêu cầu đổi SMTP.

Counter nằm tại server trong PostgreSQL, không cookie/localStorage; dùng cùng luật cho email tồn tại và không tồn tại. IP chỉ lấy từ kết nối hoặc proxy tin cậy đã cấu hình, không tin tùy ý X-Forwarded-For. Chỉ login thành công mới xóa số lần sai theo email; không xóa giới hạn IP, không reset counter khi CAPTCHA đúng hoặc password đúng của user pending. Hết thời gian khóa login vẫn cần CAPTCHA nếu cửa sổ sai còn hiệu lực.

## 3. Dữ liệu và module dùng chung

Giữ nguyên Dish/Chef/Ingredient và các quan hệ. Thêm các model sau; tên cột cụ thể phải thống nhất trong Prisma và tất cả plan/test:

| Model | Các trường chính và ràng buộc |
| --- | --- |
| User | id; emailOriginal; email normalized unique; passwordHash; role default viewer; status enum pending/active default pending; emailVerifiedAt nullable; createdAt/updatedAt |
| ActivationChallenge | userId unique + FK; purpose=activation; otpHash; expiresAt; attempts; lockedUntil nullable; lastSentAt; usedAt nullable. Một hàng cho mỗi user; giữ dấu usedAt sau kích hoạt để kiểm chứng |
| PasswordReset | id; userId FK; tokenHash unique; expiresAt; usedAt nullable; invalidatedAt nullable; createdAt. Giữ dấu token đã dùng/hết hiệu lực, không lưu token thô |
| Session | id; sidHash unique; userId FK nullable cho phiên form ẩn danh; csrfToken; createdAt; lastSeenAt; expiresAt (hạn tuyệt đối) |
| ActivationAttempt | emailKey unique; attempts; lockedUntil. Theo dõi ngân sách sai OTP cho mọi email (pending/active/không tồn tại); là nguồn chung để quyết định khóa, đồng bộ attempts/lockedUntil vào ActivationChallenge khi hàng đó tồn tại |
| LoginAttempt | emailKey unique (HMAC hoặc hash khóa chuẩn hóa theo lựa chọn được công bố); failedCount; windowStartedAt; lockedUntil |
| RateLimitBucket | key unique gồm purpose + email/IP; count; windowStartedAt; nextAllowedAt nullable; cập nhật nguyên tử cho các endpoint giới hạn |

Cookie chỉ chứa `sid` ngẫu nhiên 32 byte, không userId/role/password. DB lưu SHA-256 của sid để tra cứu; không dùng SHA-256 thay Argon2id cho password. OTP dùng hash có salt qua thư viện; hash không thay giới hạn thử và hạn dùng. Session có userId=null chỉ là phiên CSRF ẩn danh, **không phải đăng nhập**; pending không bao giờ được cấp session gắn userId. CSRF token trong form là dữ liệu được phép render, không nhầm với OTP/reset token cần giữ kín.

Các module dự kiến dưới `restaurant/src/auth/`:

- `config.js`: validate origin, HTTPS/secure-cookie, TTL, ngưỡng và provider config; không in secret.
- `credentials.js`: chuẩn hóa/validate email, hash/verify password, random token/OTP, hash định danh và so sánh an toàn; dùng thư viện/crypto của nền tảng.
- `session.js`: đọc cookie, tra store, gắn req.auth và res.locals.currentUser, tạo phiên ẩn danh cho form, tạo/rotate auth session, expire cookie, requireLogin, requireCsrf.
- `throttle.js`: bucket theo email/IP và cửa sổ sai login, cập nhật nguyên tử.
- `captcha.js`: adapter Google v2, trả invalid và providerError riêng; purpose chỉ là ngữ cảnh route cố định ở server. Không tin action/score/captchaPassed do browser khai, không kiểm tra action/score v3.
- `mail.js`: sendActivationOtp, sendPasswordReset, sendPasswordChangedNotice; text/HTML escaped, timeout, không log payload chứa bí mật.
- `registration.js`, `login.js`, `logout.js`, `password-reset.js`: route theo mục 4, không tự viết lại helper chung.

Không yêu cầu dựng framework auth mới. Khi code chọn thư viện cookie/CSRF/store có sẵn phù hợp, giữ nguyên hành vi trên. Các handler async phải chuyển lỗi vào error middleware Express 4.

## 4. Hợp đồng route và phản hồi

Đường dẫn bắt buộc trong bộ plan này nằm ở root, **không thêm prefix /auth**.

| Route | Hành vi và phản hồi |
| --- | --- |
| GET /register | Form đăng ký + CAPTCHA; phiên CSRF ẩn danh, không auth |
| POST /register | Rate limit → CSRF/validate → CAPTCHA backend → xử lý user/OTP. Email mới hoặc đã có: cùng 200 và thông báo chung, không trả trạng thái tồn tại. Input sai: 200 VALIDATION_FAILED |
| GET /activate | Form email + OTP + gửi lại, không yêu cầu auth |
| POST /activate | Rate limit → CSRF → kiểm tra pending/purpose/hạn/chưa dùng/giới hạn/hash. Sai/hết hạn/đã dùng/không có: cùng 200 INVALID_OTP. Đúng: 200, active + emailVerifiedAt + usedAt; không auto-login |
| POST /activate/resend | Rate limit/cooldown → CSRF → nếu pending thì thay mã, giữ attempts/lockedUntil; phản hồi chung 200 cho mọi email. Quá giới hạn: 429 RATE_LIMITED |
| GET /login | Form email/password; hiển thị CAPTCHA khi server xác định cần |
| POST /login | Rate limit/lock → CSRF/validate → CAPTCHA nếu cần → verify password → kiểm tra active → tạo sid mới → 303 /admin/dishes |
| GET /logout/confirm | Trang xác nhận logout + checkbox v2; requireLogin, không hủy session |
| POST /logout | requireLogin → CSRF → reCAPTCHA v2 backend → hủy session hiện tại ở server → expire cookie sid → 303 /login |
| GET /logout | 404 hoặc 405 theo lựa chọn chung: chọn 404; không thay đổi dữ liệu |
| GET /forgot | Form email, truy cập được khi chưa đăng nhập |
| POST /forgot | Rate limit → CSRF/validate → phản hồi chung 200 cho email có/không có. Nếu đủ điều kiện thì sinh reset token, lưu hash, gửi link email |
| GET /reset?token=... | Kiểm tra limiter IP chung GET/HEAD/POST reset, sau đó chỉ hiển thị form hoặc thông báo link không hợp lệ; quá giới hạn 429; không tiêu thụ token, không đổi password |
| POST /reset | Rate limit → CSRF/validate → kiểm tra token → transaction đổi password/consume token/vô hiệu token khác/hủy mọi session của user → 303 /login; không auto-login |
| CRUD /dishes, /dishes/:id và mọi /admin | Middleware trước handler: thiếu/invalid/expired session hoặc pending → 303 /login cho cả đọc và ghi, không truy vấn dữ liệu CRUD. User active được dùng CRUD; write cần CSRF |

Login sai email/password dùng cùng thông báo, giữ email bỏ password. Kế hoạch chọn 200 cho lỗi form login, 200 với thông báo cần kích hoạt chỉ sau password đúng của pending; không suy ra 401/403 là bắt buộc trong slide. Chọn 200 INVALID_RESET_TOKEN cho reset token sai/hết hạn/đã dùng. 403 dành cho CSRF/origin sai; 429 cho giới hạn; 500 cho lỗi kỹ thuật. Các lựa chọn bổ sung này cần test nhất quán.

Slide 20 quy định 200 cho VALIDATION_FAILED/INVALID_OTP và 429 RATE_LIMITED; slide 54 yêu cầu 303 /login cho CRUD chưa auth. Mã lỗi là contract nội bộ/view-model (`ok, error.code`) và được render thành trang EJS; không tự đổi toàn bộ bài SSR thành JSON API. SMTP đồng bộ nếu dùng mà thất bại là lỗi kỹ thuật 500 theo slide; phương án ở mục 5 giảm rò rỉ tồn tại email bằng gửi bất đồng bộ.

## 5. Luồng và điều kiện không được phá vỡ

### Đăng ký, OTP và email

1. Kiểm tra rate limit cả email/IP, khóa ActivationAttempt và CAPTCHA trước hash password, tạo user hoặc gửi OTP. Register và resend chia sẻ bucket gửi mã/cooldown cho mọi email trước khi rẽ nhánh tồn tại, nên đổi endpoint hoặc dùng email active/unknown không tạo phản hồi 429 khác chỉ vì trạng thái tài khoản.
2. User mới: transaction tạo pending, role viewer do server gán (bỏ qua role/status/emailVerifiedAt từ body), lưu challenge hash. Dữ liệu response giữ email nhưng không password/OTP.
3. Email pending đã có: **giữ passwordHash cũ**; xử lý như resend có cùng cooldown/giới hạn; không tạo user thứ hai. Email active: không sửa thông tin, cùng phản hồi chung.
4. Register/activate/resend cùng khóa ActivationAttempt theo email trước, rồi khóa User nếu có, theo thứ tự thống nhất để tránh deadlock; tạo challenge mới kế thừa ngân sách/khóa theo email, không tự mở ngân sách mới. Dùng cùng transaction cho activate và resend. Activate chỉ thành công khi cả sáu điều kiện đúng; cập nhật status/emailVerifiedAt/usedAt nguyên tử; hai request OTP đúng đồng thời chỉ một thắng.
5. Mỗi lần xác nhận OTP không hợp lệ tăng ActivationAttempt.attempts cho mọi email, kể cả active/unknown; nếu có challenge thì đồng bộ attempts/lockedUntil vào đó trong cùng transaction. Không làm active quay về pending, không tạo User/challenge giả. Kiểm tra khóa chung trước so hash; lần sai thứ 5 đặt khóa 15 phút và trả 429. Register/activate/resend cùng đọc khóa theo email này, nên sau cùng một chuỗi mã sai, email pending/active/unknown đều có cùng hành vi 429. Chỉ hết kỳ khóa mới reset ngân sách theo một chuyển trạng thái chung, không reset vì resend/đăng ký lại.
6. Resend chỉ thay otpHash/expiresAt/lastSentAt/usedAt cho user vẫn pending, không reset attempts/lockedUntil. Hết hạn không kích hoạt tài khoản. Sau kích hoạt hiện link login, không tạo authenticated session.
7. Phản hồi register/resend/forgot không chờ SMTP: commit dữ liệu rồi giao gửi thư bất đồng bộ sau response chung. Chỉ giữ mã thô tạm trong bộ nhớ phục vụ gửi, không persist plaintext/log. Đây là lựa chọn đơn giản của bài, không xây hàng đợi retry lớn; crash/gửi lỗi có thể mất thư, người dùng dùng resend/yêu cầu reset mới. Ghi lỗi đã che bí mật. Kiểm tra thời gian phản hồi giữa email có/không có để tránh chênh lệch rõ; không tuyên bố chống enumeration chỉ vì thông báo giống nhau.

### Login, session, CSRF và CRUD

- Với login, quyết định CAPTCHA từ counter ở server ngay trong POST, không tin UI. Nếu đạt ngưỡng ở POST đầu tiên chưa có widget, render lại form yêu cầu CAPTCHA. Token mới mỗi lần, không cấp cờ vượt CAPTCHA vĩnh viễn. Khi đang khóa, password/CAPTCHA đúng vẫn 429.
- Sai password tăng counter nguyên tử theo email tồn tại/không tồn tại như nhau. Unknown user vẫn chạy dummy password verify phù hợp để giảm chênh lệch thời gian. CAPTCHA sai không thử password nhưng request vẫn tính vào limiter.
- Chỉ password đúng + active + tạo session thành công mới xóa failedCount theo email. Login thay sid ẩn danh/cũ bằng sid mới; tạo session và thu hồi sid cũ trong transaction, chỉ Set-Cookie sau commit. Giữ các phiên khác.
- Middleware kiểm tra session còn hạn tuyệt đối và chưa quá idle trước khi cập nhật lastSeenAt. Update không được tái tạo row bị logout xóa hoặc hồi sinh phiên hết hạn. Store outage là 500, không giả là anonymous/đăng xuất thành công. Dọn session hết hạn bằng script định kỳ; auth vẫn phải kiểm tra hạn dù chưa dọn.
- Form GET auth có thể tạo session CSRF ẩn danh. requireLogin đòi userId + user active + emailVerifiedAt; anonymous cookie không được vào CRUD. Form POST so sánh CSRF với session và kiểm tra Origin khi có; nếu không Origin thì kiểm tra Referer khi có. Thiếu cả hai vẫn phải có CSRF hợp lệ. Không chỉ dựa vào SameSite.
- CSRF áp cho register/activate/resend/login/logout/forgot/reset và mọi POST/PATCH/DELETE quản lý, kể cả method-override và các quan hệ.
- Static files không cần DB/auth; dynamic auth và mọi trang dữ liệu được bảo vệ (cả /dishes lẫn /admin) dùng Cache-Control: no-store. Trang reset thêm Referrer-Policy: no-referrer và không tải tài nguyên bên thứ ba mang token trên URL.
- Giới hạn phạm vi cookie host-only; cookie hết hạn có cùng name/path/domain như lúc tạo. HTTPS + Secure khi deploy; cấu hình HTTP loopback test được công bố, không coi đó là bằng chứng cờ Secure production.

### Logout và reset password

- Theo yêu cầu bổ sung của người dùng, logout kiểm tra v2 sau requireLogin/CSRF; CAPTCHA thiếu/sai → form 200 và giữ phiên, config/provider lỗi → 500. V2 không có action/score, dùng cặp key logout riêng; không áp luật v3. GET /logout/confirm chỉ hiện form. Module và hợp đồng ghép được mô tả trong [hướng dẫn tích hợp](../restaurant/docs/logout-integration.md).
- Logout hủy đúng sid hiện tại, await store trước clear-cookie/303. Cookie-only logout không đạt. DB lỗi không báo thành công. GET không có side effect. Back có thể hiện cache nhưng request mới phải bị chặn.
- Theo phạm vi module đã chốt với người dùng: logout chỉ cho tài khoản authenticated; thiếu/expired/pending session → requireLogin trả 303 /login, CSRF/origin sai → 403. Không dùng logout này để hủy phiên form anonymous. Không cần bảo đảm thành công cho replay request logout cũ.
- Forgot dùng cùng phản hồi/status/luật throttle cho mọi email. Chọn hỗ trợ user pending lẫn active; reset **không kích hoạt pending**, vẫn phải OTP. Link được tạo từ APP_BASE_URL tin cậy, không lấy Host tùy ý; HTTPS khi deploy.
- GET/HEAD reset chạy limiter IP chung với POST trước khi kiểm tra token; vượt ngưỡng trả 429 nhưng không tiêu thụ token. GET reset chỉ đọc auth/reset state, không đánh usedAt hay hủy session. Token được đưa vào hidden input để POST lại; đây là token do người dùng đã mang từ link email, không phải API forgot trả token mới. Không log query token/body password.
- POST reset giữ một transaction với khóa User và điều kiện token chưa dùng/chưa hết hạn/chưa invalidated. Đổi passwordHash + usedAt + vô hiệu mọi reset token chưa dùng + xóa mọi session của user trong cùng transaction. Thất bại rollback toàn bộ. Gửi thư báo đã đổi (không chứa password), redirect login, không reset failed-login counter để lách khóa.
- Login/reset dùng chung khóa User; nếu password được verify trước khi khóa thì login phải đọc lại passwordHash/status dưới khóa. Password đã thay giữa hai bước phải bị từ chối. Không được tạo session từ password cũ sau khi reset hoàn tất.
- Hai request reset cùng token chỉ một thắng; reset cũ sau yêu cầu mới thất bại. Các route chỉ chấp nhận credential đúng purpose: OTP không làm password, reset token không làm sid/OTP hoặc credential CRUD.

## 6. Thứ tự, file ownership và triển khai

1. **Đối chiếu/setup:** đọc checklist, kiểm tra git diff và dependencies. Chạy npm ci rồi baseline test. Lưu ảnh/chỉ số hiện trạng theo nhu cầu. Chưa có dependency/provider không được coi là chức năng đã đạt.
2. **Nền tảng do một người tích hợp:** schema; helper config/credentials/session/throttle/captcha/mail; Prisma client; cấu hình .env.example; middleware và contract test fixture. Không tạo stub/no-op để báo hoàn thành. Các module nền tảng không import feature router chưa tồn tại.
3. **Feature:** có thể làm tuần tự hoặc chia phần sau khi nền tảng chạy thật: đăng ký/OTP, login, logout, forgot/reset theo các plan liên kết. Đăng ký có thêm views activate; reset có views forgot/reset. Người tích hợp quản lý mọi file chung.
4. **Tích hợp:** mount router thật ở root, guard /dishes và /dishes/:id cùng toàn prefix /admin, CSRF mọi form, header login/register/logout, thống nhất error view/route/status và sửa test cũ đang cho đọc/ghi nhà hàng khi chưa đăng nhập.
5. **Seed/test/evidence:** script seed-auth riêng, test HTTP isolated, test DB thử nghiệm, email/CAPTCHA provider thật, restart session thật và checklist slide. Không dùng seed nhà hàng có thể xóa dữ liệu để tạo tài khoản auth.
6. **Review:** đối chiếu checklist và code độc lập; sửa findings rồi chạy lại phần bị ảnh hưởng; cập nhật README và bằng chứng. Không đánh dấu pass khi chỉ đọc code hoặc chạy mock.

| Người/module | File được phụ trách khi code |
| --- | --- |
| Người tích hợp/login | package.json/lock, schema, server.js, src/app.js, src/auth/{config,credentials,session,throttle,captcha,mail,login}.js; header và mọi form admin; views/auth/login.ejs; tests shared/login/session; README/.env.example; prisma/seed-auth.js; script dọn session |
| Đăng ký/OTP | src/auth/registration.js; views/auth/register.ejs, activate.ejs; tests/auth-registration.test.js |
| Logout | src/auth/logout.js, recaptcha-v2.js; views/auth/logout.ejs; tests/auth-logout.test.js, recaptcha-v2.test.js; docs/logout-integration.md; cấu hình v2 trong .env.example |
| Forgot/reset | src/auth/password-reset.js; views/auth/forgot.ejs, reset.ejs; tests/auth-password-reset.test.js |

Không bắt buộc nhiều agent. Nếu chia việc, mỗi người không sửa file chung của người khác; phát hiện contract thiếu thì trao đổi với người tích hợp. Tất cả feature dùng helper chung, không có schema/cookie/normalization riêng.

## 7. Cấu hình, seed và chạy kiểm chứng

Cấu hình qua .env.example, chỉ placeholder: DATABASE_URL, PORT, APP_BASE_URL; SESSION_IDLE_MINUTES/SESSION_MAX_HOURS (số nguyên dương, mặc định 30 phút/24 giờ); ANONYMOUS_SESSION_TTL_MS=1800000. Code nhận cả alias millisecond SESSION_IDLE_MS/SESSION_TTL_MS để giữ cấu hình cũ; nếu có cả hai cách thì phải bằng nhau sau quy đổi, mâu thuẫn làm khởi động thất bại. Các TTL/threshold ở mục 2; SMTP_HOST/PORT/SECURE/USER/PASS/FROM; RECAPTCHA_V2_SITE_KEY/RECAPTCHA_V2_SECRET_KEY hoặc nguyên cặp logout làm fallback theo mục 2; AUTH_SEED_EMAIL/AUTH_SEED_PASSWORD. Không commit .env, password seed, key hay credential. LOGOUT_RECAPTCHA_V2_SITE_KEY/LOGOUT_RECAPTCHA_V2_SECRET_KEY tiếp tục dùng cho logout. Không gửi credential server vào EJS; chỉ site key được công khai.

Script `prisma/seed-auth.js` tạo ít nhất một user active có emailVerifiedAt và password hash từ env để demo login/forgot/CRUD (slide 49 notes). Chỉ chạy tường minh; nếu email đã có thì không ghi đè password/status hoặc tự kích hoạt pending. Không xóa dữ liệu khác, không seed lúc server khởi động.

Khi triển khai: npm ci → npm run db:generate → áp schema đã review vào DB thử nghiệm riêng → npm test và browser/live tests phù hợp. `npm run test:live` cũ là read-only CRUD; nếu bổ sung test ghi phải tách lệnh hoặc có opt-in rõ và DATABASE_URL thử nghiệm được chọn, chỉ cleanup dữ liệu của lần test. Không chạy db:push/seed trên DB dùng chung trong lúc lập plan.

Nhánh giả lập SMTP/CAPTCHA chỉ được inject vào test; thiếu provider thật phải báo phần chưa kiểm chứng, không thêm bypass app. Test khóa/transaction/đua request cần PostgreSQL thật; mock không chứng minh được tính nguyên tử.

## 8. Nghiệm thu và bằng chứng

Dùng [checklist đối chiếu](auth-acceptance-checklist.md), chưa đánh dấu hoàn thành trước runtime. Lưu dưới `restaurant/evidence/auth/` khi chạy nghiệm thu; không tạo ảnh/video giả.

Với từng kịch bản: kết quả UI, Network, Application/Cookies, request trực tiếp và bản ghi DB phù hợp; che token/password/OTP/secrets. Nhóm tự vẽ sơ đồ đăng ký+CAPTCHA+OTP, login+brute force, logout, forgot/reset. Ghi ít nhất một lỗi thực tế do agent tạo ra, cách tái hiện, diff sửa và bằng chứng sau sửa; không bịa lỗi để đủ mục.

Các câu trình bày ở slide 62 được giải thích trong evidence/README: session khác cookie; session store/restart; CAPTCHA và giới hạn thử; pending/resend attempts; public/protected routes; reset token và vô hiệu phiên cũ.
