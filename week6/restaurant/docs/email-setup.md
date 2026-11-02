# Gửi email theo yêu cầu bài SSR

Nguồn: [bài giảng HTML](<D:/User_C_BackUp/Download/Xác thực tài khoản trên SSR.html>), slide 17, 20, 42, 46, 50–51 và 55. Bài yêu cầu:

- Gửi mã OTP kích hoạt qua email; không trả OTP trong response hay log.
- Gửi link reset password; database chỉ lưu hash token.
- Gửi thông báo sau khi password thay đổi, không gửi password.

Slide không chỉ định giao thức SMTP, thư viện gửi hoặc nhà cung cấp. Project giữ **Nodemailer + SMTP** đã có trong `src/auth/mail.js`, vì một transport gửi được cả ba loại thư. reCAPTCHA v2 kiểm tra CAPTCHA; SMTP vận chuyển email. Hai phần độc lập, không có loại SMTP dành riêng cho reCAPTCHA v2.

## Điền cấu hình cục bộ

Lấy thông số SMTP từ dịch vụ email bạn có quyền sử dụng. Không cần thay code khi đổi host/account, và không tự tạo credential giả để vượt bước gửi thư. Thêm các biến vào `.env` hiện có; không copy đè database hoặc key CAPTCHA:

```dotenv
SMTP_HOST=YOUR_SMTP_HOST
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=YOUR_SMTP_USERNAME
SMTP_PASS=YOUR_SMTP_CREDENTIAL
SMTP_FROM=YOUR_VERIFIED_SENDER
```

Ví dụ trên là placeholder. Theo [Nodemailer SMTP](https://nodemailer.com/smtp), port 587 thường dùng `secure=false` và nâng cấp STARTTLS; port 465 dùng `secure=true` để TLS ngay khi kết nối. Dùng đúng thông số nhà cung cấp. Nếu SMTP yêu cầu auth, điền **cả** USER và PASS; nếu server được phép dùng không auth thì để cả hai rỗng. FROM phải là địa chỉ người gửi được dịch vụ cho phép. Đừng gửi credential trong chat hoặc commit `.env`.

Restart app sau khi thay `.env`. Register/forgot/resend kiểm tra cấu hình email; thiếu cấu hình trả lỗi kỹ thuật, không giả đã gửi thư. Thư được gửi bất đồng bộ sau response chung để giảm khác biệt thời gian theo sự tồn tại email. Lỗi gửi/crash có thể làm mất thư; người dùng yêu cầu resend/link mới sau thời gian chờ.

## Xác nhận hoạt động

1. `isConfigured()` chỉ cho biết các trường cấu hình cần thiết đã có, không chứng minh mật khẩu SMTP đúng hoặc mạng kết nối được.
2. SMTP `verify()` (nếu dùng để chẩn đoán riêng) kiểm tra kết nối/TLS/auth theo cấu hình, không gửi thư và không chứng minh địa chỉ FROM được chấp nhận hoặc thư đến inbox. [Giới hạn verify](https://nodemailer.com/smtp#verifying-the-configuration).
3. Nghiệm thu qua web bằng inbox bạn kiểm soát: register + checkbox v2 → nhận OTP → activate → login → forgot → nhận reset link → reset thành công → nhận thông báo password đổi. Đọc cả thư mục spam nếu chưa thấy thư; chỉ kết luận delivery khi nhận được thư thật.
4. Kiểm tra CAPTCHA sai không tạo user/gửi OTP; email mới/đã có cùng response, OTP/reset chỉ hash trong DB; che password/OTP/token/secrets trong bằng chứng. Lưu UI, Network, inbox đã che và DB state theo checklist; không dùng log chứa OTP làm cách thay email.

Test SMTP loopback hiện tại nhận được cả ba loại message qua giao thức SMTP trên máy, hữu ích để kiểm tra transport/nội dung. Nó chưa kiểm tra provider authentication, TLS hay inbox bên ngoài. Google v2 cũng cần nghiệm thu key/hostname thật; xem [Google widget](https://developers.google.com/recaptcha/docs/display), [siteverify](https://developers.google.com/recaptcha/docs/verify) và [logout v2](logout-integration.md). Các phần provider/PostgreSQL/browser thật vẫn chưa được chứng nhận chỉ từ test cô lập.
