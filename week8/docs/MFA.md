# MFA của Week 8

Nguồn: `Phân quyền và MFA_ deck tương tác ( week8 ).html`, phần TOTP, thiết lập, trạng thái chờ MFA, đường vòng, recovery code và MFA khi client là SPA. Deck nói bài gốc làm trên SSR và dẫn sang `block9-deck` cho bảng nghiệm thu chi tiết (chưa có trong tài liệu được cung cấp). Theo lựa chọn của người dùng, phần này tích hợp vào **REST API + SPA hiện tại** của `week8/api` và `week8/web`. Không triển khai RBAC/ABAC, WebAuthn hay social login trong task MFA này. `restaurant/` là bản tham khảo cũ, không phải ứng dụng được cập nhật.

## Cài và chạy

Từ `D:\WebApplication\Web-design\week8`:

```powershell
npm install --include=dev
npm run db:generate --workspace @soucha/api
npm run setup:mfa
npm run dev
```

`setup:mfa` chỉ bổ sung ba bảng PostgreSQL từ `api/sql/004-mfa.sql`; không chạy seed, không xóa hay thay schema món ăn. Nếu chưa có `MFA_ENCRYPTION_KEY` (hoặc placeholder trống), script chỉ sinh khóa 32 byte base64url khi DB chưa có secret MFA mã hóa. Nếu đã có secret, phải khôi phục khóa gốc; script từ chối tạo khóa thay thế và kiểm tra khóa đang cấu hình có giải mã được dữ liệu hay không. Khóa độc lập với `JWT_ACCESS_SECRET`. Sao lưu khóa riêng tư, không commit `.env`, không đổi khóa tùy tiện: mất khóa sẽ không giải mã được thiết bị đã đăng ký. Máy/teammate dùng cùng DB phải có cùng khóa này qua kênh riêng tư.

## Dùng trên giao diện

1. Đăng nhập tài khoản đã kích hoạt → **Bảo mật** (`/account/security`).
2. Nhập mật khẩu hiện tại → **Bắt đầu thiết lập**. Quét QR bằng Google Authenticator hoặc nhập khóa thủ công. Secret ngẫu nhiên riêng từng tài khoản, không dùng secret minh họa trong slide.
3. Nhập mã 6 số → **Xác nhận và bật**. Chỉ bước này bật MFA. Lưu tám mã khôi phục đang hiển thị; chúng không xuất hiện lại khi rời trang.
4. Đăng xuất và đăng nhập lại: sau mật khẩu, ứng dụng chuyển tới `/mfa`; chưa có JWT và chưa mở được dữ liệu. Nhập mã TOTP mới hoặc một recovery code chưa dùng.
5. Tạo lại recovery code hoặc tắt MFA cần mật khẩu hiện tại và TOTP/recovery code. Bộ mã mới vô hiệu toàn bộ bộ cũ. Đổi thiết bị bằng cách tắt MFA có xác minh rồi thiết lập lại.

Giữ nguyên JWT 60 giây từ Week 7: nếu thao tác thiết lập lâu và API báo phiên hết hạn, đăng nhập lại → Bảo mật → **Xác nhận thiết lập đang chờ**, nhập mã từ QR đã quét. Không bấm tạo thiết lập mới nếu muốn giữ QR cũ. Server chỉ trả trạng thái pending, không hiện lại secret. Reload cũng mất JWT và challenge vì SPA chỉ lưu chúng trong bộ nhớ. Không lưu token/secret/recovery code vào localStorage. Hạn setup là 10 phút, challenge đăng nhập là 5 phút; hai giá trị này không kéo dài JWT.

## Hợp đồng API

Mọi response theo `{ok,data}` hoặc `{ok:false,error:{code,message}}`. Các route quản lý bắt buộc JWT hợp lệ và kiểm tra trạng thái tài khoản/MFA trong DB. Không nhận userId từ form.

| Route | Input | Kết quả |
| --- | --- | --- |
| `POST /api/auth/login` | email, password, CAPTCHA nếu cần | Chưa bật MFA: JWT; đã bật: `{next:"mfa",challenge,expiresIn:300}`, không JWT/user |
| `POST /api/auth/mfa` | challenge, code | TOTP hoặc recovery đúng → JWT; challenge dùng một lần |
| `GET /api/auth/mfa/status` | Bearer JWT | enabled, configured, recoveryRemaining; không secret |
| `POST /api/auth/mfa/setup` | JWT + password | QR PNG, otpauth URI, secret; chưa bật MFA |
| `POST /api/auth/mfa/enable` | JWT + code | Bật MFA, bộ recovery code duy nhất, JWT thay thế |
| `POST /api/auth/mfa/recovery` | JWT + password + code | Thay bộ mã khôi phục |
| `POST /api/auth/mfa/disable` | JWT + password + code | Xóa thiết bị/mã khôi phục, JWT thay thế |

- TOTP: RFC 6238, HMAC-SHA1, 6 số, bước 30 giây, nhận ±1 bước. DB giữ bước đã nhận; kể cả mã dùng ở bước xác nhận setup cũng không dùng lại để login.
- AES-256-GCM mã hóa secret, AAD ràng buộc userId; khóa ngoài DB. QR/secret chỉ trả ở bước setup. Challenge ngẫu nhiên 256 bit chỉ lưu SHA-256. Recovery code 80 bit/mã, chỉ lưu hash kèm userId và usedAt.
- 5 lần thử sai liên tiếp khóa MFA 15 phút; lưu per-user, dùng chung cho TOTP/recovery/quản lý. Tạo challenge mới, đăng nhập lại, restart server hoặc reset mật khẩu không xóa bộ đếm khóa. Thêm giới hạn IP cho endpoint MFA.
- Kiểm tra, dùng mã, cập nhật bước, tiêu thụ challenge trong transaction khóa theo User. PostgreSQL dùng row lock; SQLite trong test dùng write lock.
- JWT mang phiên bản xác thực; guard kiểm tra phiên bản và bằng chứng MFA tại server. Bật/tắt MFA và reset mật khẩu thu hồi JWT cũ ngay; reset giữ nguyên thiết bị và recovery code, xóa challenge chờ. Vì vậy Week 8 có đọc DB ở guard, khác phần verify JWT thuần stateless của Week 7. Logout vẫn bỏ JWT ở client; bản sao còn hạn/đúng phiên bản vẫn có hiệu lực.
- Không chạy bản xác thực cũ Week 6/7 với cùng tài khoản đã bật MFA mà chưa bổ sung guard: các bản cũ không hiểu trạng thái MFA.

## Kiểm tra

```powershell
npm run test:mfa
npm run test:mfa:browser
npm test
npm run test:auth:browser
```

Test dùng DB cô lập. RFC vector kiểm tra thuật toán độc lập; API kiểm tra pending/no JWT, challenge hết hạn, replay TOTP/recovery, cạnh tranh cùng challenge, lockout qua nhiều challenge, đổi bộ mã, disable và reset giữ MFA. Browser test dùng backend thật + DB test và tự tính mã từ secret test, không thay thế thao tác quét QR trên điện thoại thật.

Nghiệm thu tay: quét QR thật; thử mã sai; thử vào thẳng API sau password bằng challenge (401); mã đúng mới có JWT; thử mã đã dùng (bị từ chối); thử recovery hai lần; tạo bộ mới rồi thử bộ cũ; reset password rồi xác nhận MFA vẫn được hỏi; restart server rồi kiểm tra MFA/lockout còn nguyên. Không đưa token, secret, QR hoặc mã khôi phục thật vào ảnh/log bài nộp. Thu thập bằng chứng bằng tài khoản demo riêng.

## Kết quả kiểm tra khi triển khai

- `npm test`: 40/40 đạt, gồm MFA và các chức năng API/tìm kiếm/phân trang cũ.
- `npm run test:auth:browser`: đạt luồng đăng ký/OTP/login/reset cũ trên DB test, SMTP/Google giả lập.
- `npm run test:mfa:browser`: đạt Chrome mobile 375px với API thật + DB test, gồm reload → đăng nhập lại → xác nhận QR cũ → recovery login → tắt MFA.
- SQL bổ sung chạy được hai lần trên PostgreSQL nhúng, dữ liệu món ăn được giữ nguyên.
- PostgreSQL cấu hình thật: đã thêm ba bảng MFA và tạo khóa local. Tài khoản tạm `.invalid` xác nhận setup/enable, challenge không có JWT, hai verifier tranh cùng challenge/recovery code chỉ một bên có JWT. Tài khoản và dữ liệu thử đã xóa. Lần smoke đầu timeout transaction `P2028`; lần chẩn đoán chạy lại đã qua, chưa đánh giá tải hoặc độ ổn định dài hạn.
- Reviewer kiểm tra riêng sáu tình huống giữ/khôi phục khóa bằng mô phỏng filesystem/DB; không ghi đè khóa của secret đã tồn tại.
- Chưa quét QR bằng điện thoại thật hoặc nghiệm thu restart tiến trình trên tài khoản thực của người dùng. Các kết quả tự động không thay thế hai bước nghiệm thu này.
