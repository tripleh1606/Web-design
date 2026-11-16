# Kiểm chứng Week 8 sau tích hợp Access Control và MFA

Ngày kiểm chứng 16/11/2026. Nhánh thực hiện là `week8/feature-access-control`, tích hợp commit `4bf3ba0` của main vào HEAD `269d84c`.

## Căn cứ và phạm vi

Căn cứ yêu cầu duy nhất là file người dùng cung cấp `Phân quyền và MFA_ deck tương tác.html`, gồm 19 slide và ghi chú giảng viên. Các tài liệu HTML khác trong Downloads không được dùng để xác định yêu cầu của thay đổi này.

Project chạy Express REST API trong `api/` và SPA ES modules trong `web/`. Giữ bảng quyền năm vai trò, API JSON, mã lỗi, JWT 60 giây, sessionStorage, tìm kiếm và phân trang đang có. Slide 3 cho phép ứng dụng công bố bảng quyền riêng. Các thông số khóa 15 phút, 5 lần sai và 8 recovery code là lựa chọn triển khai của project.

ABAC dùng `User.chefId` và các dòng `ChefDish.chefId` hiện có để xác định người phụ trách. Bổ sung `Dish.status` với `draft/published` theo ví dụ trạng thái trên slide 4–6. Chef được đổi availability của món đã gán khi còn draft. Manager/admin tiếp tục có quyền ghi nghiệp vụ theo bảng quyền project. Đây là cách áp dụng ví dụ vào mô hình nhiều đầu bếp của project. Ghi chú bài tập nhắc chefId của Dish, còn source hiện biểu diễn người phụ trách qua quan hệ ChefDish.

## Đối chiếu từng yêu cầu

| Slide | Yêu cầu | Kết quả và bằng chứng |
| --- | --- | --- |
| 2–3 | Xác thực trước phân quyền, role từ DB, bảng quyền tại server | Đạt trên API. `access-token.js` tải principal hiện tại. `authorization.test.js` kiểm tra đủ năm vai trò và vai trò lạ. |
| 4–6 | Xét người phụ trách và trạng thái tài nguyên | Đạt theo mô hình project. PATCH availability dùng điều kiện SQL gồm phân công hiện tại, trạng thái tài khoản, liên kết Chef và Dish.status. Test đổi trạng thái/phân công sau khi đọc chi tiết rồi gửi PATCH xác nhận 403 và dữ liệu giữ nguyên. |
| 6 | Kiểm tra danh tính, role, sự tồn tại rồi thuộc tính | Đạt trên API. Thiếu token trả 401, thiếu action trả 403, bản ghi thiếu trả 404, ABAC từ chối ghi trả 403. Các đường đọc giữ convention 404 khi bản ghi nằm ngoài phạm vi. |
| 7 | Request trực tiếp bị kiểm tra, danh tính/thuộc tính client không làm tăng quyền | Đạt trên API và SPA. Test PATCH/DELETE trực tiếp, body trộn role/price/status, thay role trong DB với JWT còn hạn, chef mở thẳng trang quản trị. |
| 9–10 | Password và bằng chứng sở hữu ứng dụng xác thực | Đạt trên API. Login đúng password của tài khoản bật MFA chỉ tạo challenge. |
| 11 | TOTP 6 số, bước 30 giây, kiểm tra cửa sổ lân cận | Đạt tự động. Test độc lập bằng RFC vectors, lệch thời gian và từ chối replay trong `mfa.test.js`. |
| 12 | Secret riêng, QR/nhập tay, lưu mã hóa, xác nhận mã trước khi bật | Đạt tự động. API và browser kiểm tra QR, pending setup, mã hóa ràng buộc user, xác nhận rồi mới bật. Reload không trả lại secret. |
| 13, 17 | Trạng thái chờ chưa được đăng nhập đầy đủ | Đạt trên API/SPA. Challenge không có JWT/user. Gửi challenge tới API nghiệp vụ nhận 401. Browser mở /admin lúc chờ bị đưa về login. Reload mất challenge. |
| 14 | Giới hạn thử, không dùng lại TOTP, kiểm tra mọi đường cấp token | Đạt trên API. Test khóa qua nhiều challenge và instance verifier, cạnh tranh cùng challenge, replay, bảo vệ /me, /logout, /users và nghiệp vụ. |
| 14 | Thay/tắt MFA cần xác thực lại, reset password giữ MFA | Đạt trên API. Thay thiết bị đi qua tắt có password + mã rồi setup lại. Reset giữ secret/recovery, tăng authVersion, vô hiệu JWT/challenge cũ. |
| 15 | Recovery chỉ hiện một lần, lưu hash/usedAt, dùng một lần, bộ mới vô hiệu bộ cũ | Đạt tự động. API kiểm tra hash, tiêu thụ đồng thời và bộ mã cũ. Browser kiểm tra hiện/xóa mã khỏi view và đăng nhập bằng recovery. |
| 16 | Hiểu hạn chế phishing chuyển tiếp TOTP | Được ghi nhận trong tài liệu. TOTP không bảo đảm chống trang giả chuyển tiếp thời gian thực. |
| 17 | API/SPA dùng challenge ngắn hạn rồi mới cấp access token | Đạt. `mfa-browser.js` dùng API thật với DB test, kiểm tra luồng pending tới JWT. |
| 19 và ghi chú 17 | Bài tập trên Restaurant App SSR | Chưa đáp ứng bản SSR. Entrypoint Week 8 là API/SPA, `restaurant/` cũng là API/CSR cũ. Phiên bản này chưa có trang SSR MFA, session mfaPending, đổi sid sau OTP hoặc nghiệm thu redirect 303/trang 403 của SSR. |

Mức đạt API/SPA không thay thế nghiệm thu riêng của bản SSR được nhắc trên slide cuối. Thao tác quét QR bằng điện thoại thật, SMTP/reCAPTCHA thật và chạy lại tiến trình triển khai vẫn cần nghiệm thu trên môi trường của nhóm.

## Kiểm thử đã chạy

| Lệnh từ week8 | Kết quả |
| --- | --- |
| `npm.cmd test` | 52/52 đạt, 0 fail, 0 skip. Bao gồm test phân quyền vừa được đưa vào script mặc định. |
| `npm.cmd run test:auth:browser` | 2/2 đạt trên Chrome. Đăng ký/OTP/login/reset, XSS escaping, reload token, thay role, ABAC, 403 giữ token và 401 xóa token. Google/SMTP giả lập. |
| `npm.cmd run test:mfa:browser` | 1/1 đạt trên Chrome viewport 375px. Setup, pending/reload, xác nhận, recovery login, direct route/API và tắt MFA. |
| `npm.cmd run test:browser` | 20/20 kiểm tra đạt. CRUD, recipe, phân công, tìm kiếm, lịch sử điều hướng, responsive, preflight và lỗi mạng. |
| `npm.cmd run test:pagination:browser` | 10/10 kiểm tra đạt. Phân trang, tải thêm, cuộn liên tục, hủy request cũ và prefetch. |
| `npm.cmd run test:fulltext:browser` | 8/8 kiểm tra đạt. SQL tìm kiếm thật trên PostgreSQL nhúng, bộ lọc, lỗi gõ và sửa từ qua ba kiểu phân trang. |
| `node --test tests/mfa.test.js` | 7/7 đạt sau khi bổ sung khẳng định mã setup sai chưa bật MFA. |
| `npm.cmd run db:generate --workspace @soucha/api` | Generate được cả PostgreSQL và SQLite Client. |
| `scripts/export-sql.js` | Xuất core SQL thành công. Hai file export được khôi phục về nội dung trước kiểm chứng để giữ phần SQL bổ sung tách riêng. |
| `git diff --check` và kiểm tra cú pháp bốn file conflict | Đạt. |

SQLite của test nằm trong `tests/.tmp/`. Test SQL dùng PostgreSQL nhúng PGlite. Report và ảnh của bộ CRUD browser nằm trong `tests/results/`, được Git ignore.

Các lệnh live, live-pagination và Bruno cần cấu hình DB/API triển khai. Chưa chạy chúng trong workspace này vì thiếu cấu hình đó. Bằng chứng tự động ở trên được lấy từ DB cô lập và backend test thực tế.

## Lỗi tích hợp đã phát hiện và sửa

- HEAD tải role/chefId từ DB, main thêm claims MFA. Middleware hợp nhất giữ cả principal và accessClaims.
- Router hợp nhất giữ /me, quản trị tài khoản, các route MFA và guard kiểm tra authVersion cho mọi API được bảo vệ.
- setAccount của HEAD bất đồng bộ. Các điểm gọi từ main được await trước khi chuyển trang hoặc cập nhật view MFA.
- Test trên main giả định token chỉ ở bộ nhớ. Test hợp nhất kiểm tra sessionStorage của HEAD, đồng thời challenge vẫn mất khi reload.
- Test phân quyền tạo user active nhưng thiếu emailVerifiedAt. Fixture được cập nhật cho guard MFA kiểm tra email đã xác minh.
- Smart search ở HEAD lấy vocabulary sau cả bộ lọc danh mục, làm mất diễn giải chatma thành matcha khi lọc coffee. Tách visibility theo quyền khỏi bộ lọc tìm kiếm, dùng vocabulary của toàn bộ tập được phép đọc. Test hồi quy kiểm tra cả diễn giải độc lập danh mục và không lộ từ của món bị ẩn.
- Control trạng thái món ban đầu gán thuộc tính type chỉ đọc của select, làm form lỗi. Đã sửa và chạy qua 20 kiểm tra browser.
- Export core schema có quan hệ Chef.user trỏ tới model User đã được tách ra. Bỏ back-reference này khỏi phần export core. Dish.status tiếp tục nằm trong SQL bổ sung.
- GET trạng thái MFA từng tạo credential mặc định. Đã đổi sang đọc trạng thái mà không tạo bản ghi credential.

## Database và triển khai

Schema PostgreSQL/SQLite được bổ sung các model MFA từ main và Dish.status. Các quan hệ ChefDish đang có được giữ. File `004-mfa.sql` tạo ba bảng MFA. File `005-dish-status.sql` chỉ bổ sung cột trạng thái với mặc định draft cho dữ liệu cũ.

`database.test.js` áp dụng cả SQL MFA và trạng thái hai lần trên PostgreSQL nhúng. Test giữ món published qua lần chạy thứ hai, kiểm tra số dòng nghiệp vụ, quan hệ, Unicode và stock hiện có.

Workspace hiện chưa có `api/.env`. Các biến DATABASE_URL, JWT_ACCESS_SECRET và MFA_ENCRYPTION_KEY cũng chưa được cấu hình trong môi trường. Vì vậy chưa áp dụng các SQL lên database triển khai thật. Muốn chạy ứng dụng cần cấu hình các biến này, generate client rồi áp dụng SQL bổ sung phù hợp với schema đích. Nếu đã có secret MFA mã hóa, cần dùng lại khóa hiện có. Hướng dẫn chi tiết nằm ở `api/sql/README.md` và `docs/MFA.md`.

## Danh sách file thay đổi so với HEAD trước merge

Các đường dẫn dưới đây tương đối với week8, gồm thay đổi nhận từ main và phần chỉnh sửa tích hợp.

```text
README.md
api/.env.example
api/package.json
api/prisma/schema.prisma
api/prisma/schema.sqlite.prisma
api/sql/004-mfa.sql
api/sql/005-dish-status.sql
api/sql/README.md
api/src/app.js
api/src/auth/access-token.js
api/src/auth/login.js
api/src/auth/mfa-crypto.js
api/src/auth/mfa-service.js
api/src/auth/mfa.js
api/src/auth/password-reset.js
api/src/auth/router.js
api/src/pagination.js
api/src/validation.js
docs/MFA.md
docs/WEEK8-VERIFICATION.md
package-lock.json
package.json
scripts/export-sql.js
scripts/setup-mfa.js
tests/auth-browser.js
tests/auth.test.js
tests/authorization.test.js
tests/database.test.js
tests/fulltext.test.js
tests/helpers.js
tests/mfa-browser.js
tests/mfa.test.js
tests/web.test.js
web/index.html
web/public/style.css
web/src/app.js
web/src/auth.js
web/src/mfa.js
web/src/resources.js
```
