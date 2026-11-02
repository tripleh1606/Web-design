# Xác thực tài khoản trên SSR

### MSc. Ngô Ngọc Đăng Khoa

Phát triển ứng dụng web

# Xác thực tài khoản trên SSR

## Nội dung buổi học

1. Đăng ký, CAPTCHA và OTP kích hoạt
2. Đăng nhập, session và đăng xuất
3. Quên mật khẩu
4. Bài tập

Phát triển ứng dụng web

# Câu hỏi xuyên suốt

> Server chỉ nhận một request. Dựa vào đâu để biết request đó của ai?

Phát triển ứng dụng web

# Mục tiêu

* Phân biệt xác thực với phân quyền, session với cookie
* Mô tả đăng ký có CAPTCHA, kích hoạt bằng OTP, đăng nhập, đăng xuất và quên mật khẩu bằng trạng thái, token và điều kiện từ chối
* Giải thích session lưu ở server, cookie chỉ mang `sid`; chặn brute force bằng bộ đếm, thời gian chờ và CAPTCHA
* Kiểm chứng mã của agent bằng Network, Application và request trực tiếp

Phát triển ứng dụng web

# Xác thực và phân quyền

|  | Xác thực | Phân quyền |
| --- | --- | --- |
| Câu hỏi | Bạn là ai? | Bạn được làm gì? |
| Bằng chứng | password, mã OTP | role, thuộc tính, quy tắc |
| Ví dụ Books | email và password đúng | Editor sửa được sách, Viewer chỉ xem |
| Khi thất bại | Chưa biết người gọi: chuyển tới trang đăng nhập | Biết người gọi nhưng không cho phép: trang 403 |

Phát triển ứng dụng web

# Đăng ký và kích hoạt tài khoản

Phát triển ứng dụng web

# Vòng đời tài khoản

![](./Xác thực tài khoản trên SSR_files/block8-account-states.svg)

Phát triển ứng dụng web

# Luồng đăng ký

![](./Xác thực tài khoản trên SSR_files/block8-register-request.svg)

Trước luồng này: server áp rate limit và xác minh CAPTCHA.

Phát triển ứng dụng web

# Xác nhận OTP kích hoạt

![](./Xác thực tài khoản trên SSR_files/block8-activate-confirm.svg)

Phát triển ứng dụng web

# Xử lý form đăng ký

* Validate email và password theo quy tắc công bố; nhập sai trả `VALIDATION_FAILED`
* Chuẩn hóa email theo chính sách công bố, lưu cả bản nhập vào và bản chuẩn hóa; email duy nhất tính trên bản chuẩn hóa
* Role mặc định do server gán, ít quyền nhất (`viewer`); role trong form hoặc body bị bỏ qua
* Email đã có tài khoản: không tạo bản ghi thứ hai, phản hồi giống email mới

Phát triển ứng dụng web

# CAPTCHA trong đăng ký

* Hạn chế bot tạo hàng loạt tài khoản và kích hoạt gửi email OTP
* Server xác minh CAPTCHA trước khi băm password, tạo user hoặc gửi email
* CAPTCHA hợp lệ chỉ cho phép tiếp tục đăng ký, không chứng minh danh tính hay quyền sở hữu email
* Kết hợp rate limit cho đăng ký và gửi OTP; CAPTCHA có thể bị giải tự động hoặc thuê người giải

Phát triển ứng dụng web

# Mức 1: tự triển khai CAPTCHA đơn giản

MINH HỌA: Books yêu cầu tính `7 + 4`

1. Server sinh phép tính và `challengeId` ngẫu nhiên
2. Lưu đáp án tại server, gắn phiên ẩn danh và mục đích `register`; có hạn và giới hạn thử
3. Browser chỉ nhận câu hỏi và `challengeId`, gửi lại cùng câu trả lời
4. Server đối chiếu, tiêu thụ thử thách trong một thao tác; làm mới thì hủy thử thách cũ

* Chỉ để học cơ chế: bot đọc được phép tính và tự tính đáp án

Phát triển ứng dụng web

# Mức 2: dùng thư viện sinh CAPTCHA

Ví dụ Node.js: `svg-captcha` sinh ảnh SVG và đáp án

* Thư viện sinh ảnh; ứng dụng vẫn quản lý thử thách và xác minh ở server
* Chỉ trả ảnh và `challengeId` cho browser; giữ đáp án tại server
* Giữ hạn dùng, ràng buộc phiên, mục đích và quy tắc dùng một lần của mức 1
* Chữ biến dạng và nhiễu không bảo đảm chống OCR; xem tình trạng bảo trì và khả năng tiếp cận trước khi chọn

Phát triển ứng dụng web

# Mức 3: dùng Google reCAPTCHA

| Dạng tích hợp | Browser thực hiện | Backend quyết định |
| --- | --- | --- |
| reCAPTCHA v2 | Checkbox, có thể thêm thử thách hình ảnh | Chỉ tiếp tục khi token được xác minh hợp lệ |
| reCAPTCHA v3 | Lấy token theo action, không hiện câu đố | Kiểm tra token, action và score theo ngưỡng đã chọn |

* Site key công khai ở client; credential xác minh chỉ ở backend
* Score là tín hiệu rủi ro, không phải xác suất người dùng là người thật
* Phụ thuộc dịch vụ ngoài: cân nhắc kết nối, dữ liệu gửi đi và chi phí

Phát triển ứng dụng web

# reCAPTCHA: xác minh tại backend

1. Browser lấy token khi người dùng gửi form, gửi kèm email và password
2. Backend gửi token tới Google bằng credential của server
3. Kiểm tra token hợp lệ, hostname đúng; với score-based, kiểm tra thêm action và score
4. Đạt chính sách mới xử lý đăng ký; token đã dùng hoặc hết hạn phải lấy lại

* `siteverify` cho tích hợp v2/v3 cũ; API assessment cho tích hợp Google Cloud
* Không tin `captchaPassed: true` hoặc score do browser tự gửi

Phát triển ứng dụng web

# Lưu password bằng hash

MINH HỌA: bảng `users` của Books

| id | email | passwordHash |
| --- | --- | --- |
| 1 | `an@example.com` | `argon2id$tham-số$salt$giá-trị-băm` |
| 2 | `binh@example.com` | `argon2id$tham-số$salt$giá-trị-băm` |

* Database lưu kết quả băm, không lưu password
* Mỗi password có salt ngẫu nhiên riêng, hai user trùng password vẫn có hai chuỗi khác nhau
* Dùng thuật toán băm dành cho password do thư viện cung cấp, không tự thiết kế

Phát triển ứng dụng web

# Dữ liệu OTP kích hoạt

MINH HỌA: bảng `activation_challenges`, một dòng cho mỗi tài khoản pending

| Trường | Ý nghĩa |
| --- | --- |
| `userId`, `purpose` | Tài khoản cần kích hoạt; `activation`, chỉ dùng cho kích hoạt |
| `otpHash` | Hash của OTP, không lưu OTP |
| `expiresAt`, `usedAt` | Hạn dùng của mã hiện tại; thời điểm đã dùng |
| `attempts`, `lockedUntil` | Số lần nhập sai; thời điểm hết khóa tạm |
| `lastSentAt` | Lần gửi gần nhất, dùng cho thời gian chờ khi gửi lại |

* OTP chỉ xuất hiện trong email: không có trong response đăng ký, không có trong log
* Hash không thay giới hạn thử và hạn dùng: mã 6 chữ số chỉ có một triệu giá trị

Phát triển ứng dụng web

# Kiểm tra OTP kích hoạt

* Cùng lúc phải đúng: tài khoản pending, `purpose` là `activation`, chưa hết hạn, chưa dùng, chưa vượt giới hạn thử, hash khớp
* Sai vì bất kỳ lý do nào: cùng `INVALID_OTP`, tăng `attempts`, tài khoản vẫn pending
* Đúng: đặt `active`, ghi `emailVerifiedAt`, đánh dấu `usedAt` trong một thao tác không tách rời
* Hai request xác nhận đồng thời: chỉ một request thắng

Phát triển ứng dụng web

# Gửi lại OTP

* Có thời gian chờ giữa hai lần gửi và giới hạn số lần gửi theo tài khoản
* Mã mới ghi đè `otpHash` nên mã cũ không dùng được nữa
* `attempts` không về 0 khi gửi lại: gửi lại không mở thêm lượt thử
* Mã hết hạn: tài khoản vẫn pending, người dùng yêu cầu mã mới
* Phản hồi giống nhau dù email có tài khoản pending hay không

Phát triển ứng dụng web

# Kết quả đăng ký và kích hoạt

| Tình huống | Phản hồi | Tài khoản |
| --- | --- | --- |
| Email mới, dữ liệu hợp lệ | `200`, thông báo chung; OTP qua email | pending |
| Email đã có tài khoản | `200`, thông báo chung giống hệt | không đổi |
| Dữ liệu không hợp lệ | `200`, `VALIDATION_FAILED` | không tạo |
| OTP sai, hết hạn hoặc đã dùng | `200`, `INVALID_OTP` | pending, `attempts` tăng |
| Quá giới hạn thử hoặc gửi | `429`, `RATE_LIMITED` | pending |
| Gửi email thất bại | Lỗi kỹ thuật `500` nếu gửi đồng bộ | pending |

Phát triển ứng dụng web

# Tài khoản pending tại server

* Chưa kích hoạt thì chưa được đăng nhập và chưa có quyền truy cập đầy đủ
* Server kiểm tra trạng thái tài khoản, không dừng ở việc ẩn nút trên giao diện
* Khi pending chỉ có hai thao tác: nhập OTP và gửi lại OTP, xác định bằng email
* Kích hoạt chỉ đổi trạng thái tài khoản, không tự đăng nhập

Phát triển ứng dụng web

# Ý nghĩa của xác minh email

* Chứng minh quyền kiểm soát hộp thư tại thời điểm nhập OTP
* Không phải xác minh danh tính pháp lý của người dùng
* Email là yếu tố xác thực yếu, không thay cho các bước xác thực mạnh hơn
* Sau kích hoạt: tài khoản có role mặc định; quyền cao hơn do admin cấp

Phát triển ứng dụng web

# Đăng nhập SSR

Phát triển ứng dụng web

# Kiểm tra password khi đăng nhập

* Tra user theo email, băm password nhập vào bằng salt đã lưu rồi so với `passwordHash`
* Email không tồn tại và password sai cùng hiện một thông báo chung; form giữ email, bỏ password
* Không ghi password hoặc `passwordHash` vào log hay response
* Password đúng nhưng tài khoản `pending`: không tạo session, trang báo cần kích hoạt

Phát triển ứng dụng web

# Brute force: CAPTCHA là một lớp bổ sung

* Brute force thử nhiều password cho một tài khoản; credential stuffing dùng cặp email và password bị lộ
* Server đếm lần sai theo email chuẩn hóa trong một cửa sổ thời gian, kết hợp giới hạn theo IP
* Sau một số lần sai, yêu cầu CAPTCHA trước lần kiểm tra password tiếp theo
* CAPTCHA đúng không xóa bộ đếm, không bỏ thời gian chờ và không thay password

Phát triển ứng dụng web

# Khi nào đăng nhập phải có CAPTCHA?

MINH HỌA: chính sách giả định của Books, cửa sổ 15 phút

| Trạng thái trước request | Server xử lý |
| --- | --- |
| Chưa có 3 lần sai | Cho kiểm tra password, vẫn áp rate limit |
| Từ 3 lần sai | Yêu cầu CAPTCHA hợp lệ trước khi kiểm tra password |
| Đủ 10 lần sai | Tạm từ chối đăng nhập trong 5 phút, dù CAPTCHA đúng |
| Đăng nhập thành công | Xóa bộ đếm sai theo email, không xóa giới hạn IP |

* Backend quyết định có cần CAPTCHA; browser chỉ hiển thị theo phản hồi

Phát triển ứng dụng web

# Chặn đường vòng ở form đăng nhập

1. Kiểm tra rate limit và thời gian chờ tại server
2. Nếu chính sách yêu cầu, xác minh CAPTCHA; thiếu hoặc sai thì dừng
3. Kiểm tra password và trạng thái tài khoản, rồi mới tạo session

* Thiếu hoặc sai CAPTCHA: hiện lại form kèm CAPTCHA mới, giữ email, bỏ password
* Quá giới hạn: trang `429`; CAPTCHA đúng cũng không cho qua
* Xóa trường CAPTCHA, đổi cookie hoặc gửi `POST /login` trực tiếp không bỏ được bước kiểm tra

Phát triển ứng dụng web

# Luồng đăng nhập SSR

![](./Xác thực tài khoản trên SSR_files/block8-ssr-login.svg)

Nhánh thành công sau rate limit và CAPTCHA khi được yêu cầu.

Phát triển ứng dụng web

# Response đăng nhập SSR

`POST /login HTTP/1.1
Content-Type: application/x-www-form-urlencoded
email=an%40example.com&password=...
HTTP/1.1 303 See Other
Location: /books
Set-Cookie: sid=9f2c...; HttpOnly; Secure; SameSite=Lax; Path=/`

* Browser lưu cookie `sid` và gắn vào request tới cùng site theo phạm vi cookie
* Giá trị cookie là mã ngẫu nhiên, không chứa `userId`, role hay password

Phát triển ứng dụng web

# Session và cookie

### Session ở server

* Bản ghi: `sid` gắn với `userId`, hạn dùng
* Server quyết định còn hiệu lực hay không
* Hủy bản ghi thì `sid` cũ không còn dùng được

### Cookie ở browser

* Chỉ chứa mã tham chiếu `sid=9f2c...`
* Browser gửi theo phạm vi và chính sách của cookie
* Xóa cookie không hủy session ở server

Phát triển ứng dụng web

# Nơi lưu session

| Nơi lưu | Khi server khởi động lại | Nhiều instance cùng chạy |
| --- | --- | --- |
| Bộ nhớ của tiến trình | Mất mọi session, người dùng phải đăng nhập lại | Mỗi instance có bản ghi riêng |
| Database hoặc Redis | Session chưa hết hạn vẫn còn | Mọi instance tra cùng một nơi |

* Cookie vẫn chỉ mang `sid`; đổi nơi lưu không đổi cookie
* Hủy session là xóa hoặc đánh dấu bản ghi trong store; hết hạn do server kiểm tra `expiresAt`
* Bản ghi hết hạn cần được dọn định kỳ

Phát triển ứng dụng web

# Middleware khôi phục danh tính

![](./Xác thực tài khoản trên SSR_files/block8-ssr-middleware.svg)

Phát triển ứng dụng web

# Vòng đời session

| Sự kiện | Phía server | Phía browser |
| --- | --- | --- |
| Login thành công | Tạo session mới, sinh `sid` mới | Nhận `Set-Cookie` có `sid` mới |
| Request tiếp theo | Tra `sid`, có thể gia hạn theo chính sách | Gửi `Cookie` tự động |
| Hết hạn | Coi bản ghi vô hiệu | Cookie có thể còn, nhưng `sid` không còn khớp |
| Logout | Hủy bản ghi | Nhận `Set-Cookie` xóa cookie |

Sinh `sid` mới khi login để một `sid` có từ trước không trở thành phiên đã đăng nhập.

Phát triển ứng dụng web

# Logout SSR

* Server hủy session trước, sau đó gửi `Set-Cookie` để browser xóa cookie
* Chỉ xóa cookie chưa đủ: bản sao `sid` vẫn dùng được khi session còn ở server
* Logout là POST, không phải GET
* Nút Back có thể hiện lại trang đã tải, nhưng request kế tiếp tới server phải bị từ chối

Phát triển ứng dụng web

# Thuộc tính cookie

| Thuộc tính | Tác dụng | Với cookie `sid` |
| --- | --- | --- |
| `HttpOnly` | JavaScript trong trang không đọc được cookie | Bật |
| `Secure` | Chỉ gửi qua HTTPS | Bật khi triển khai |
| `SameSite` | Giới hạn gửi cookie trong request từ site khác | `Lax` hoặc `Strict` |
| `Path`, `Domain` | Phạm vi URL và domain nhận cookie | Hẹp nhất đủ dùng |
| `Max-Age`, `Expires` | Hạn của cookie; thiếu cả hai là cookie phiên | Theo chính sách đăng nhập |

Phát triển ứng dụng web

# CSRF

![](./Xác thực tài khoản trên SSR_files/block8-csrf.svg)

Phát triển ứng dụng web

# Công cụ xác thực theo platform

| Stack | Công cụ có sẵn |
| --- | --- |
| Node.js, Express | Passport.js |
| Python, Django | `django.contrib.auth` |
| Java, Spring | Spring Security |
| .NET | ASP.NET Core Identity |
| PHP, Laravel | Hệ thống authentication của Laravel |

Phát triển ứng dụng web

# Quên mật khẩu

Phát triển ứng dụng web

# Nguyên tắc đặt lại mật khẩu

* Hệ thống chỉ có hash nên không gửi lại password cũ; người dùng đặt password mới
* Quyền đặt lại đến từ việc kiểm soát hộp thư đã đăng ký, thể hiện bằng token trong link
* Token ngẫu nhiên đủ dài, lưu hash, gắn một user, có hạn, dùng một lần
* Chưa có token hợp lệ thì chưa đổi gì trong tài khoản

Phát triển ứng dụng web

# Yêu cầu đặt lại mật khẩu

![](./Xác thực tài khoản trên SSR_files/block8-reset-request.svg)

Phát triển ứng dụng web

# Dữ liệu reset token

MINH HỌA: bảng `password_resets`

| userId | tokenHash | expiresAt | usedAt |
| --- | --- | --- | --- |
| 7 | `b41c...` | 15 phút sau khi tạo | rỗng |

* Token gốc chỉ nằm trong email; database lưu hash nên đọc được bảng này chưa đủ để dùng link
* Hạn 15 phút là giá trị giả định; nhóm công bố hạn của mình
* Yêu cầu mới làm các token chưa dùng của user hết hiệu lực

Phát triển ứng dụng web

# Phản hồi khi quên mật khẩu

| Email nhập | Phản hồi cho browser | Việc server làm |
| --- | --- | --- |
| Có trong `users` | `200`, thông báo chung | Tạo token, gửi email |
| Không có | `200`, thông báo chung giống hệt | Không gửi |

Thông báo chung: `Nếu email đã đăng ký, hướng dẫn đã được gửi`.

* Nội dung, status và thời gian phản hồi không cho phép phân biệt hai dòng
* Giới hạn số yêu cầu theo email và theo địa chỉ gọi

Phát triển ứng dụng web

# Đặt mật khẩu mới

![](./Xác thực tài khoản trên SSR_files/block8-reset-confirm.svg)

Phát triển ứng dụng web

# GET không tiêu thụ reset token

* `GET /reset?token=...` chỉ hiện form, không đổi dữ liệu
* Phần mềm quét email hoặc xem trước link có thể tự mở URL trước người dùng
* Token chỉ bị tiêu thụ khi `POST /reset` thành công
* Trang reset đặt `Referrer-Policy: no-referrer` để token trên URL không rò qua header `Referer`

Phát triển ứng dụng web

# Trạng thái reset token

| Trạng thái token | Khi `GET` | Khi `POST` |
| --- | --- | --- |
| Hợp lệ | Hiện form | Đổi password, tiêu thụ token |
| Hết hạn | Báo link không dùng được | Từ chối, không đổi gì |
| Đã dùng | Báo link không dùng được | Từ chối, không đổi gì |
| Sai hoặc không có | Báo link không dùng được | Từ chối, không đổi gì |

Phát triển ứng dụng web

# Sau khi đặt lại mật khẩu

* Cập nhật `passwordHash`, đánh dấu token đã dùng, vô hiệu các token chưa dùng của user
* Gửi email báo password đã đổi, không gửi password; chuyển tới trang đăng nhập, không tự đăng nhập
* Hủy các session cũ của user; nhóm công bố chính sách này
* Reset token chỉ đặt lại password, không dùng được ở route khác

Phát triển ứng dụng web

# Bài tập

## Ứng dụng nhà hàng

Phát triển ứng dụng web

# Mô tả bài tập

* Đăng ký có xác minh email: OTP kích hoạt qua email và CAPTCHA
* Đăng nhập bằng session và cookie, có chống brute force; session lưu bền vững; đăng xuất
* Quên mật khẩu qua email bằng reset token
* Cụm CRUD của Block 5 yêu cầu đăng nhập

Phát triển ứng dụng web

# Dữ liệu cần thêm

| Đối tượng | Trường |
| --- | --- |
| `User` | `id`, `email` (bản chuẩn hóa, duy nhất), `passwordHash`, `role` (mặc định `viewer`, do server gán), `status` (`pending`, `active`), `emailVerifiedAt` |
| `ActivationChallenge` | `userId` duy nhất, `purpose`, `otpHash`, `expiresAt`, `attempts`, `lockedUntil`, `lastSentAt`, `usedAt` |
| `PasswordReset` | `userId`, `tokenHash`, `expiresAt`, `usedAt` |
| Session | `sid`, `userId`, `expiresAt`; lưu trong database hoặc Redis, không lưu trong bộ nhớ của tiến trình |
| Bộ đếm đăng nhập sai | Khóa theo email chuẩn hóa và theo IP; số lần sai, đầu cửa sổ đếm, `lockedUntil`; nhóm tự thiết kế |
| Thử thách CAPTCHA | Chỉ khi tự triển khai hoặc dùng thư viện sinh ảnh: `challengeId`, đáp án, phiên ẩn danh, `purpose`, `expiresAt`, `usedAt` |

Phát triển ứng dụng web

# Yêu cầu đăng ký

* `POST /register`: validate, chuẩn hóa email theo chính sách nhóm công bố, tạo user `pending` với role mặc định `viewer`
* Xác minh CAPTCHA tại server trước khi băm password, tạo user hoặc gửi OTP; áp rate limit
* Role trong form hoặc body bị bỏ qua; phản hồi giống nhau cho email mới và email đã có
* Có form đăng ký và trang nhập OTP; tài khoản `pending` đăng nhập đúng password không nhận session

Phát triển ứng dụng web

# Yêu cầu OTP kích hoạt

* OTP ngẫu nhiên gắn user và `activation`, có hạn, giới hạn lần thử, dùng một lần; chỉ lưu hash; không có trong response hay log
* `POST /activate`: sai, hết hạn, đã dùng đều hiện cùng một thông báo; đúng thì `active`, không tự đăng nhập
* `POST /activate/resend`: có thời gian chờ, mã mới thay mã cũ, `attempts` không về 0; quá giới hạn trả trang `429`
* OTP kích hoạt không dùng được làm password ở `/login`

Phát triển ứng dụng web

# Yêu cầu đăng nhập SSR

* Form `POST /login`; thông báo lỗi chung; `303` sau khi đăng nhập
* Session lưu bền vững ở database hoặc Redis: khởi động lại server không làm mất session còn hạn
* Cookie `sid` có `HttpOnly`, `SameSite`, `Secure` khi triển khai; đổi `sid` lúc login
* Form đổi dữ liệu có CSRF token hoặc biện pháp tương đương mà nhóm công bố

Phát triển ứng dụng web

# Yêu cầu CAPTCHA và chống brute force

* Chọn thư viện sinh CAPTCHA hoặc reCAPTCHA cho đăng ký và đăng nhập; tự triển khai phép tính chỉ dùng để minh họa
* Công bố ngưỡng yêu cầu CAPTCHA, cửa sổ đếm sai, thời gian chờ và giới hạn theo IP
* Giữ bộ đếm tại server; không đặt lại sau khi chỉ giải đúng CAPTCHA
* Thiếu hoặc sai CAPTCHA khi bị yêu cầu: dừng, hiện lại form; đang bị giới hạn: trang `429` dù CAPTCHA đúng

Phát triển ứng dụng web

# Yêu cầu đăng xuất và bảo vệ CRUD

* `POST /logout`: hủy session ở server rồi xóa cookie; dùng lại `sid` cũ bị từ chối
* Mọi route của cụm CRUD (danh sách, chi tiết, tạo, sửa, xóa) yêu cầu đăng nhập; chưa đăng nhập chuyển `303` tới `/login`
* Kiểm tra ở middleware phía server: gọi trực tiếp bằng công cụ HTTP cũng bị chặn; tài khoản `pending` không vào được
* Trang đăng ký, đăng nhập, kích hoạt vẫn truy cập được khi chưa đăng nhập

Phát triển ứng dụng web

# Yêu cầu quên mật khẩu

* `POST /forgot` trả cùng nội dung và status cho email có và không có; có giới hạn số yêu cầu
* Email chứa link `/reset?token=...`; database lưu hash token, `userId`, hạn, `usedAt`
* `GET /reset` chỉ hiện form; `POST /reset` mới đổi password và tiêu thụ token; không tự đăng nhập
* Token cũ, hết hạn, đã dùng bị từ chối; session cũ của user bị hủy; reset token không dùng được ở route khác

Phát triển ứng dụng web

# Giao việc cho coding agent

* Nêu stack, cơ chế và hợp đồng trong prompt: session-cookie lưu ở store bền vững, `303` tới `/login`, thông báo lỗi chung, trang `429`
* Có thể yêu cầu dùng Passport.js hoặc công cụ tương ứng; nhóm vẫn giải thích được luồng bằng sơ đồ
* Yêu cầu agent giải thích luồng, liệt kê file đã sửa; đọc diff trước khi chạy
* Secret, mật khẩu seed, credential email và khóa reCAPTCHA nằm trong `.env` hoặc script, không commit

Phát triển ứng dụng web

# Kiểm tra mã nguồn

* Password, token, OTP hoặc reset token có bị lưu, ghi log hay trả trong response ở dạng đọc được không
* Password được băm bằng Argon2id, scrypt hoặc bcrypt, không bằng MD5 hay SHA-256 trực tiếp
* Tài khoản pending có nhận được session ở bước đăng nhập không
* Có route CRUD nào thiếu kiểm tra đăng nhập không; có GET nào đổi dữ liệu không, kể cả `GET /reset`
* Session lưu ở đâu; bộ đếm đăng nhập sai lưu ở đâu; đáp án CAPTCHA có nằm trong response, hidden field hoặc cookie đọc được không

Phát triển ứng dụng web

# Nghiệm thu: đăng ký và kích hoạt

| Kịch bản | Kết quả cần chứng minh |
| --- | --- |
| Tài khoản pending đăng nhập | Không cấp session |
| OTP hợp lệ | Kích hoạt đúng user, `emailVerifiedAt` có giá trị |
| OTP sai, hết hạn hoặc đã dùng | Cùng thông báo lỗi, trạng thái tài khoản không đổi |
| Gửi lại OTP | Mã cũ bị từ chối, mã mới dùng được |
| Vượt giới hạn thử hoặc gửi | Trang `429` áp ở server, gửi lại không đặt lại số lần thử |
| Đăng ký kèm `role: admin` | Tài khoản vẫn là `viewer` |
| Kích hoạt xong | Không có session; người dùng phải đăng nhập ở bước riêng |
| Dùng OTP kích hoạt làm password ở `/login` | Bị từ chối |

Phát triển ứng dụng web

# Nghiệm thu: CAPTCHA và brute force

| Kịch bản | Kết quả cần chứng minh |
| --- | --- |
| Đăng ký thiếu hoặc sai CAPTCHA | Không tạo user, không gửi OTP |
| CAPTCHA hợp lệ, dữ liệu đăng ký hợp lệ | Đi tiếp luồng đăng ký và OTP |
| Dùng lại, dùng quá hạn hoặc sai mục đích | Bị từ chối, không cấp quyền tiếp tục |
| Đăng nhập sai đến ngưỡng, rồi bỏ trường CAPTCHA | Bị chặn trước bước kiểm tra password |
| Giải đúng CAPTCHA nhưng password sai | Bộ đếm sai tiếp tục tăng |
| Đạt giới hạn, gửi password và CAPTCHA đúng | Trang `429`, không có session |
| Xóa cookie hoặc mở phiên ẩn danh mới | Không đặt lại bộ đếm theo email |

Phát triển ứng dụng web

# Nghiệm thu: đăng nhập, đăng xuất và CRUD

| Kịch bản | Kết quả cần chứng minh |
| --- | --- |
| Chưa đăng nhập, gọi route CRUD bất kỳ | `303 /login`, dữ liệu không đổi |
| Đăng nhập đúng, tài khoản `active` | `303`, có `Set-Cookie: sid`, vào được CRUD |
| Sai email hoặc sai password | Cùng một thông báo cho email có và không có |
| So `sid` trước và sau đăng nhập | `sid` đã đổi |
| Khởi động lại server, dùng lại cookie | Vẫn đăng nhập, bản ghi session còn trong store |
| Logout rồi dùng lại `sid` cũ | Bị từ chối, bản ghi session đã hủy |
| Gửi form đổi dữ liệu từ trang khác | Bị từ chối nhờ biện pháp CSRF đã công bố |

Phát triển ứng dụng web

# Nghiệm thu: quên mật khẩu

| Kịch bản | Kết quả cần chứng minh |
| --- | --- |
| Email có và không có khi quên mật khẩu | Cùng nội dung và status |
| Vượt giới hạn số yêu cầu `/forgot` | Trang `429` áp ở server |
| Reset token cũ, hết hạn hoặc đã dùng | Bị từ chối, password không đổi |
| `GET /reset` với token hợp lệ | Chỉ hiện form, `usedAt` vẫn rỗng |
| Reset thành công | Không tự đăng nhập; `sid` cũ bị từ chối |
| Dùng reset token ở route khác | Bị từ chối |

Phát triển ứng dụng web

# Câu hỏi trình bày

* Cookie `sid` và bản ghi session khác nhau thế nào; xóa cookie có hủy được session không?
* Session lưu ở đâu, và quan sát nào chứng minh nó còn sau khi server khởi động lại?
* CAPTCHA chặn được gì và không chặn được gì; vì sao vẫn cần bộ đếm sai và thời gian chờ?
* Tài khoản pending bị chặn ở đâu, và gửi lại OTP có đặt lại số lần thử không?
* Route nào của ứng dụng được truy cập khi chưa đăng nhập, và vì sao?
* Reset token được lưu thế nào, và quan sát nào chứng minh session cũ bị hủy sau khi reset?

Phát triển ứng dụng web

# Bằng chứng nộp

* Với mỗi kịch bản: ảnh giao diện, Network, Application (Cookies), request trực tiếp
* `Set-Cookie`, email OTP, reset token và token CAPTCHA đã che; bản ghi database liên quan (hash, hạn, `usedAt`, `attempts`, session, bộ đếm)
* Sơ đồ luồng đăng ký có CAPTCHA, đăng nhập có chống brute force, đăng xuất và quên mật khẩu do nhóm vẽ
* Một lỗi do agent tạo ra: cách tái hiện và bằng chứng sau khi sửa

Phát triển ứng dụng web

# Tổng kết

* Session nằm ở server, cookie chỉ mang `sid`; session lưu ở store bền vững thì còn sau khi server khởi động lại
* Tài khoản pending khác tài khoản active; OTP kích hoạt, reset token mỗi loại có một nơi chấp nhận
* CAPTCHA là một lớp bổ sung cùng bộ đếm sai và thời gian chờ, không thay password

Phát triển ứng dụng web

# Tài liệu tham khảo

* OWASP, Password Storage, Session Management, Cross-Site Request Forgery Prevention Cheat Sheet
* OWASP, Authentication, Email Validation and Verification, Forgot Password Cheat Sheet
* [OWASP Authentication Cheat Sheet: CAPTCHA và login throttling](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#protect-against-automated-attacks)
* [svg-captcha: sinh ảnh SVG và đáp án tại server](https://github.com/produck/svg-captcha)
* Google reCAPTCHA: [v2](https://developers.google.com/recaptcha/docs/display), [v3](https://developers.google.com/recaptcha/docs/v3), [siteverify](https://developers.google.com/recaptcha/docs/verify), [assessment trên Google Cloud](https://docs.cloud.google.com/recaptcha/docs/create-assessment-website)
* Passport.js: Sessions (`passportjs.org/concepts/authentication/sessions`); MDN: Set-Cookie

Phát triển ứng dụng web

# Q & A

Phát triển ứng dụng web

Previous slidePage 60 of 66Next slideToggle fullscreenToggle overview viewOpen presenter view

Speaker note: Block 8 tiếp tục ứng dụng SSR đã có database và CRUD của Block 5. Các ví dụ giải thích dùng Books; bài tập áp dụng cho Restaurant App. Phần giảng chỉ trình bày cơ chế bằng sơ đồ, request và response, trạng thái, so sánh và tình huống. Sinh viên dùng coding agent để triển khai rồi thu bằng chứng cho đúng cơ chế vừa học; deck không hướng dẫn cài thư viện hay cú pháp theo stack. Phân quyền, MFA và SPA với JWT thuộc Block 9.

Speaker note: Block này đi theo vòng đời tài khoản trên ứng dụng SSR: đăng ký và kích hoạt bằng OTP qua email, có CAPTCHA chặn đăng ký tự động; đăng nhập bằng session và cookie, có chống brute force; đăng xuất; quên mật khẩu. Phân quyền RBAC và ABAC, MFA và xác thực cho SPA bằng JWT được dạy ở Block 9. Passport.js và các công cụ tương ứng chỉ được nêu tên để đưa vào prompt cho agent.

Speaker note: HTTP không nhớ request trước, như đã học ở Block 1. Cho lớp mô tả điều gì trong request GET /books ngay sau khi đăng nhập chứng minh được người gọi. Giữ câu trả lời để đối chiếu ở cuối block. Câu hỏi tiếp theo, người đó có được làm thao tác này không, là phân quyền và được trả lời ở Block 9.

Speaker note: Không đánh giá bằng việc có trang đăng nhập. Sinh viên cần giải thích request nào mang danh tính, server tra gì và trường hợp nào bị từ chối. Tự implement ở block này nghĩa là hiểu và vẽ được handler và middleware, không phải nhớ API của thư viện session hay thư viện băm. Không yêu cầu tự viết thuật toán mật mã.

Speaker note: Hai bước tách nhau: biết một người là ai chưa cho biết người đó sửa được cuốn sách nào. Hai thất bại cũng khác nghĩa: chưa chứng minh được danh tính thì đưa người dùng tới trang đăng nhập; đã biết danh tính nhưng không được phép thì trả trang 403 và không đổi dữ liệu. Block 8 giảng vế xác thực, theo vòng đời: tạo tài khoản, xác thực, rồi đăng xuất. Vế phân quyền thuộc Block 9; ở Block 8 mọi tài khoản đã đăng nhập đều được dùng cụm CRUD.

Speaker note: Phần này mô tả vòng đời của một tài khoản mới: tạo bản ghi user chưa có nghĩa là người đó được dùng ứng dụng. Server tạo tài khoản ở trạng thái chờ, gửi mã OTP qua email, và chỉ chuyển sang trạng thái dùng được khi nhận đúng mã. Cơ chế đăng nhập được trình bày ở phần sau, nên ở đây chỉ nói chung là tài khoản chưa kích hoạt thì chưa được đăng nhập. Dựa trên OWASP Email Validation and Verification Cheat Sheet và Authentication Cheat Sheet. Ví dụ dùng bảng users của Books; mọi con số là giả định để minh họa.

Speaker note: Có ba trạng thái. Chưa có tài khoản. Pending: bản ghi user đã tồn tại nhưng chưa được đăng nhập, vì chưa chứng minh quyền kiểm soát hộp thư. Active: được đăng nhập và dùng ứng dụng. OTP sai giữ pending và tăng số lần thử. OTP hết hạn hoặc yêu cầu gửi lại thì mã mới thay mã cũ, trạng thái vẫn pending. Quá giới hạn thử thì khóa tạm kích hoạt. OWASP yêu cầu xác minh quyền sở hữu email trước khi cho tài khoản được dùng và không kích hoạt tài khoản trước khi hoàn tất xác minh. Phân biệt tạo bản ghi với được phép đăng nhập đầy đủ là ý chính của phần này.

Speaker note: Sơ đồ mô tả nhánh đã qua rate limit và CAPTCHA. Browser gửi email, password và bằng chứng CAPTCHA; không có trường role. Các slide tiếp theo giải thích riêng cách sinh và xác minh CAPTCHA. Server validate, chuẩn hóa email theo chính sách đã công bố, băm password rồi tạo user pending; nguyên tắc lưu password dạng hash được giải thích ở slide Lưu password bằng hash. Sau đó sinh OTP bằng bộ sinh số ngẫu nhiên an toàn, lưu hash OTP kèm hạn dùng và mục đích activation. OTP chỉ đi tới người dùng qua email; phản hồi của đăng ký không chứa OTP. Phản hồi cho browser là một thông báo chung, theo hướng dẫn của OWASP Authentication Cheat Sheet cho tạo tài khoản: cùng một thông báo bất kể email đã tồn tại hay chưa. Việc đã gửi yêu cầu đăng ký chưa có nghĩa là đã kích hoạt.

Speaker note: Yêu cầu kích hoạt mang email và OTP. Server kiểm tra đồng thời sáu điều kiện: tài khoản đang pending, bản ghi OTP thuộc đúng mục đích activation, chưa quá hạn, chưa dùng, còn lượt thử và hash của mã nhận được khớp. Chỉ khi đủ cả sáu mới đặt tài khoản active, ghi emailVerifiedAt và đánh dấu OTP đã dùng. Phản hồi thành công không tự đăng nhập cho người dùng: kích hoạt chỉ đổi trạng thái tài khoản, người dùng đăng nhập ở bước riêng.

Speaker note: OWASP Email Validation and Verification Cheat Sheet yêu cầu định nghĩa chiến lược chuẩn hóa trước khi lưu và so sánh email, áp dụng nhất quán ở mọi chức năng dùng email; chuẩn hóa phần domain thành chữ thường, tránh biến đổi riêng của từng nhà cung cấp, lưu cả bản gốc để hiển thị và bản chuẩn hóa để so sánh. Phần local của email chỉ nên gộp chữ hoa chữ thường khi hệ thống kiểm soát được quy tắc đó. Dùng thư viện kiểm tra định dạng đã được kiểm thử, không tự viết regex. Format hợp lệ không chứng minh hộp thư tồn tại hay thuộc về người nhập. Role do server gán, không đến từ client: tự khai role admin trong form chỉ là dữ liệu bị bỏ qua. Với email đã có tài khoản đang pending, không ghi đè password của bản ghi đó bằng form đăng ký mới: nếu ghi đè, người đăng ký sau chọn được password của tài khoản mà chủ hộp thư sẽ kích hoạt. Coi lần đăng ký lặp là yêu cầu gửi lại theo giới hạn ở slide gửi lại. Email đã có tài khoản active: phản hồi giống email mới để không lộ email nào đã đăng ký; việc có gửi thư báo cho chủ hộp thư hay không là chính sách của nhóm.

Speaker note: Theo OWASP Authentication Cheat Sheet, CAPTCHA là lớp phòng vệ bổ sung làm tăng thời gian và chi phí tự động hóa, không phải bảo đảm chặn bot. OTP kích hoạt trả lời người nhập có kiểm soát hộp thư hay không; CAPTCHA trả lời một câu hỏi khác về rủi ro tự động hóa của request. Chính sách minh họa của Books yêu cầu CAPTCHA cho mỗi lần đăng ký, cùng rate limit ở server. Giới hạn cả endpoint cấp hoặc làm mới CAPTCHA để bot không tạo vô hạn thử thách. Phải có cách làm mới và phương án hỗ trợ người không thể hoàn thành thử thách hình ảnh; không đưa đáp án vào alt text. Nguồn: https://cheatsheetseries.owasp.org/cheatsheets/Authentication\_Cheat\_Sheet.html#captcha

Speaker note: Phép tính là giả định để minh họa vòng đời thử thách, không phải thiết kế chống bot cho môi trường thật. Dùng API ngẫu nhiên an toàn của nền tảng cho challengeId. Đáp án, hạn và liên kết phiên được giữ ở server; không gửi đáp án trong hidden field, JSON, localStorage hoặc cookie đọc được. Không gửi hash đáp án ngắn ra client vì bot có thể dò không gian giá trị nhỏ. Ví dụ này chọn tiêu thụ sau mỗi lần gửi câu trả lời, dù đúng hay sai; gửi lại phải lấy thử thách mới. Kiểm tra và tiêu thụ không tách rời để hai request đồng thời không cùng dùng một đáp án. Phiên ẩn danh dùng giữ thử thách không phải phiên đã đăng nhập.

Speaker note: README của svg-captcha mô tả create() trả data là SVG và text là đáp án. Không trả cả object đó cho browser. Thư viện tạo hình không tự cung cấp rate limit, thời hạn, chống dùng lại hoặc toàn bộ quy trình đăng ký; các phần đó vẫn thuộc ứng dụng. Tên thư viện là ví dụ để giao việc cho coding agent, không phải khuyến nghị rằng thư viện này chống được bot hiện đại hoặc còn được bảo trì tích cực. Trong các stack khác, chọn thư viện tương ứng nhưng giữ nguyên hợp đồng kiểm chứng. Không giảng lệnh cài hay cú pháp API trong block. Nguồn: https://github.com/produck/svg-captcha

Speaker note: Ba mức là mức tích hợp, không phải bảng xếp hạng bảo đảm an toàn. v2 checkbox không có nghĩa người dùng lần nào cũng chọn hình. v3 trả score, không tự chặn request; backend chọn cách xử lý khi score thấp, ví dụ yêu cầu bước xác minh bổ sung hoặc từ chối theo chính sách. Ngưỡng phải dựa trên lưu lượng và rủi ro của ứng dụng, không coi một giá trị là chuẩn chung. Tên v2 và v3 giúp nhận diện các tích hợp phổ biến; Google hiện hướng tài liệu mới sang Google Cloud Fraud Defense, có các loại key checkbox và score-based. Không trộn SDK và API xác minh của hai cách tích hợp. Nguồn: https://developers.google.com/recaptcha/docs/display và https://developers.google.com/recaptcha/docs/v3

Speaker note: Với tích hợp v2/v3 dùng siteverify, backend POST secret và response tới https://www.google.com/recaptcha/api/siteverify, kiểm tra success và hostname; v3 kiểm tra thêm action có đúng register hay login và score có đạt chính sách không. Tài liệu quy định token có hạn hai phút, chỉ xác minh một lần. Với Google Cloud, backend tạo assessment bằng API hoặc client library, kiểm tra tokenProperties.valid, hostname, action khi có và riskAnalysis.score theo chính sách; dùng đúng credential của cách tích hợp, không dùng secret của siteverify thay cho xác thực Cloud API. Token CAPTCHA không thay OTP hay session: mỗi loại có một nơi chấp nhận. Nếu không xác minh được do lỗi mạng hay dịch vụ, không mặc định cho qua và không tạo user hoặc gửi OTP; trả lỗi kỹ thuật để thử lại với token mới. Nguồn: https://developers.google.com/recaptcha/docs/verify và https://docs.cloud.google.com/recaptcha/docs/create-assessment-website

Speaker note: Băm là phép một chiều: từ hash không suy ra được password, nên hệ thống không thể gửi lại password cũ. Chuỗi trong bảng là minh họa định dạng, không phải giá trị thật. Hash lưu kèm thuật toán, tham số và salt để việc kiểm tra tính lại đúng giá trị. Theo OWASP Password Storage Cheat Sheet, Argon2id là lựa chọn đầu tiên, scrypt khi không có Argon2id, bcrypt chỉ cho hệ thống cũ. Hàm băm nhanh như MD5 hoặc SHA-256 dùng trực tiếp không phù hợp cho password vì kẻ tấn công thử được rất nhiều giá trị mỗi giây. Salt làm cho hai user trùng password không cho cùng hash. Thư viện thường tự sinh và lưu salt trong chuỗi hash, nhóm không tự quản lý.

Speaker note: Cấu trúc là minh họa; số chữ số, hạn dùng, số lần thử đều do nhóm công bố, các giá trị trong các slide sau là giả định (6 chữ số, 10 phút, 5 lần thử, chờ 60 giây giữa hai lần gửi). Cột purpose cho biết mã sinh ra để làm gì; mã này chỉ có nghĩa với việc kích hoạt. Một dòng cho mỗi tài khoản pending giúp việc phát mã mới ghi đè mã cũ nên mã cũ tự mất hiệu lực. Không lưu OTP dạng đọc được dài hạn và không ghi OTP hay URL xác minh vào log; OWASP nêu rõ không ghi token xác minh vào log. Theo OWASP Multifactor Authentication Cheat Sheet, OTP vẫn nên được hash, nhưng không gian giá trị nhỏ nên kẻ có quyền đọc database dò được mã rất nhanh; vì vậy hash không thay hạn ngắn và giới hạn lần thử, đây mới là lớp bảo vệ chính. Mã chỉ có hiệu lực trong khoảng đã công bố nên dò lại sau khi hết hạn là vô nghĩa.

Speaker note: Dùng một mã lỗi chung cho sai, hết hạn, đã dùng và không có tài khoản pending để phản hồi không cho biết email đó có tài khoản hay mã từng tồn tại; status 200 và ok: false theo hợp đồng Block 6, vì đây là lỗi nhập. Kiểm tra giới hạn thử phải chạy trước khi so hash, và mỗi lần sai tăng attempts. Phần chuyển sang active, ghi emailVerifiedAt và đánh dấu usedAt cần xảy ra trong một thao tác không tách rời, ví dụ một câu UPDATE có điều kiện chưa dùng và chưa hết hạn trong cùng transaction với việc đổi trạng thái user; nhờ đó hai request xác nhận gửi cùng lúc thì chỉ một request đổi được trạng thái, request còn lại nhận INVALID\_OTP. Kích hoạt xong không tự đăng nhập. Kiểm chứng: gửi cùng một OTP đúng hai lần, lần hai bị từ chối và dòng dữ liệu không đổi.

Speaker note: Nếu mỗi lần gửi lại đặt lại bộ đếm thử, kẻ tấn công xen kẽ gửi lại và đoán mã sẽ có số lần thử không giới hạn trên không gian chỉ một triệu giá trị. Vì vậy attempts gắn với tài khoản pending, không gắn với từng mã; khi vượt giới hạn thì khóa tạm trong thời gian nhóm công bố, kể cả khi người dùng yêu cầu mã mới. Thời gian chờ giữa hai lần gửi và giới hạn gửi theo tài khoản còn tránh làm ngập hộp thư của một người. Phản hồi giống nhau theo hướng dẫn chống dò tài khoản của OWASP. Không xây hàng đợi gửi lại hay hạ tầng email riêng trong bài; người dùng chủ động bấm gửi lại khi cần.

Speaker note: Mỗi dòng mô tả cả phản hồi lẫn trạng thái, vì yêu cầu đăng ký đã được nhận khác với tài khoản đã kích hoạt: chỉ OTP đúng mới đưa tài khoản sang active. Dòng gửi email thất bại: bản ghi pending đã tạo, tài khoản không active; người dùng dùng chức năng gửi lại. Với hợp đồng Block 6, lỗi hệ thống vẫn là 500. Lưu ý nhánh này chỉ xảy ra với email mới nên có thể làm lộ sự khác biệt giữa email mới và email đã có; nhóm giảm bằng cách xử lý gửi bất đồng bộ và ghi lỗi vào log không chứa mã, không xây hệ thống retry trong bài. 429 là mở rộng của hợp đồng cho giới hạn tần suất, body vẫn theo envelope với error.code. INVALID\_OTP và VALIDATION\_FAILED là lỗi nhập nên giữ status 200 như Block 6.

Speaker note: Tạo bản ghi user và được phép dùng ứng dụng là hai việc khác nhau. Trạng thái tài khoản phải được server kiểm tra ở chỗ quyết định cho phép đăng nhập; nếu chỉ giao diện ẩn nút thì gọi trực tiếp vẫn vượt qua được. Các thao tác hạn chế của tài khoản pending chỉ gồm nhập OTP và gửi lại OTP, xác định người dùng bằng email đã nhập chứ không bằng phiên đăng nhập nào. Kích hoạt thành công không đăng nhập hộ người dùng: họ đăng nhập ở bước riêng, theo cơ chế sẽ học ở phần tiếp theo. Cách xử lý chi tiết khi tài khoản pending cố đăng nhập được trình bày cùng phần đăng nhập.

Speaker note: OWASP Email Validation and Verification Cheat Sheet nói rõ email nên được xem là yếu tố xác thực yếu và nên yêu cầu thêm xác thực cho thao tác nhạy cảm. Kích hoạt chỉ trả lời một câu hỏi hẹp: người nhập có đọc được thư gửi tới địa chỉ đó hay không, lúc này. Hộp thư có thể thuộc về người khác sau này, hoặc bị chiếm, nên xác minh email không thay các bước xác thực khác. Role cao hơn viewer không thể có từ form đăng ký; admin cấp bằng chức năng quản trị của ứng dụng, ngoài phạm vi block.

Speaker note: Phần này giải thích cơ chế ở mức luồng với ứng dụng SSR đã học ở Block 5: form POST, tra user, kiểm tra hash, tạo session, Set-Cookie, redirect, rồi các request sau gửi cookie. Ví dụ dùng bảng users và books. Không giảng cú pháp của thư viện session hay thư viện băm.

Speaker note: Server không giải mã hash mà tính lại rồi so. Thông báo chung ngăn người ngoài dò xem email nào đã đăng ký; cùng nguyên tắc này áp dụng cho trang quên mật khẩu ở phần sau. Việc so sánh và tính hash do thư viện đảm nhiệm; sinh viên kiểm tra mã agent sinh ra xem có chỗ nào so password dạng chuỗi thường hoặc ghi log body của request đăng nhập hay không. Nhập sai là lỗi người dùng nhập, theo quy ước form của Block 5: hiện lại form và giữ giá trị đã nhập, trừ password. Sau khi password đúng, server còn kiểm tra trạng thái tài khoản: tài khoản pending (đăng ký nhưng chưa nhập OTP kích hoạt) không được tạo session. Thông báo cần kích hoạt chỉ hiện sau khi password đúng, nên người chưa biết password không rút ra được thông tin về tài khoản; OWASP Authentication Cheat Sheet đưa tài khoản bị khóa hoặc vô hiệu vào nhóm cần thông báo chung khi đăng nhập, nên đây là đánh đổi có chủ đích của lớp: người đã chứng minh password biết lý do chưa vào được. Việc kiểm tra trạng thái nằm ở hàm cấp session, không chỉ ở giao diện.

Speaker note: OWASP khuyến nghị gắn bộ đếm với tài khoản để đổi IP không có thêm lượt đoán; giới hạn IP bổ sung để hạn chế một nguồn thử nhiều email. Chỉ giới hạn theo IP bỏ sót tấn công phân tán và có thể ảnh hưởng nhiều người dùng chung mạng. Chỉ đếm trong cookie hoặc localStorage thì mở tab ẩn danh sẽ né được. Áp cùng cách đếm cho email chưa có tài khoản để việc yêu cầu CAPTCHA không xác nhận email tồn tại. Chỉ tin IP do hạ tầng proxy đã cấu hình cung cấp, không tin tùy ý header client tự gửi. Tránh khóa vĩnh viễn do nhập sai vì kẻ tấn công có thể cố tình làm chủ tài khoản không đăng nhập được. Nguồn: https://cheatsheetseries.owasp.org/cheatsheets/Authentication\_Cheat\_Sheet.html#protect-against-automated-attacks

Speaker note: Các số 3, 10, 15 phút và 5 phút là giả định để giải thích trạng thái, không phải khuyến nghị của OWASP. Lần sai thứ ba hiện thông báo lỗi chung cùng CAPTCHA cho lần sau; lần sai thứ mười thiết lập thời gian chờ. CAPTCHA sai không dẫn tới so hash password, nhưng request vẫn tính vào rate limit để chống dò CAPTCHA. Hết thời gian chờ cho phép thử lại ở trạng thái cần CAPTCHA nếu cửa sổ đếm sai còn hiệu lực; cửa sổ hết hạn thì số lần sai cũ không còn được tính. Chỉ đăng nhập thành công (password đúng, tài khoản active, session đã được tạo) mới xóa bộ đếm theo email; giải đúng CAPTCHA hoặc nhập đúng password cho tài khoản pending không xóa. Bộ đếm và cập nhật thời gian chờ ở server phải hỗ trợ request đồng thời.

Speaker note: Thứ tự quan trọng: kiểm tra giới hạn trước, CAPTCHA sau, so hash password cuối cùng; nhờ vậy request thiếu bằng chứng không tốn chi phí băm và không cho kẻ tấn công thử password. CAPTCHA không hợp lệ gồm thiếu, sai, hết hạn, đã dùng hoặc sai mục đích. Với reCAPTCHA v3, token hợp lệ nhưng score không đạt chính sách cũng không cho qua; thông báo chung không tiết lộ chi tiết tín hiệu đánh giá. Lỗi dịch vụ xác minh là lỗi kỹ thuật, không diễn giải thành đáp án người dùng sai. Các nhánh từ chối không được tạo session; có thể có cookie phiên ẩn danh để quản lý thử thách. Trạng thái pending vẫn áp dụng sau khi CAPTCHA đạt. Mỗi lần kiểm tra password khi đang bị yêu cầu CAPTCHA cần bằng chứng mới, không cấp cờ vượt CAPTCHA dùng vô hạn. Sinh viên kiểm chứng bằng cách gửi POST /login trực tiếp, bỏ trường CAPTCHA, và đọc bộ đếm.

Speaker note: Đi từ trên xuống. Browser gửi form POST. Server tra user, kiểm tra hash, tạo bản ghi session và sinh session ID. Response là redirect 303 kèm Set-Cookie chứa sid; 303 đưa browser sang GET nên Reload không gửi lại form, như Post/Redirect/Get ở Block 5. Phần dưới đường đứt: browser tự gắn Cookie vào request kế tiếp, server tra sid trong session store để biết userId rồi dựng trang của người đó. Server không đọc danh tính từ nội dung nào do người dùng tự khai. Sinh viên kiểm chứng ở Network: response đầu có Set-Cookie, request sau có Cookie.

Speaker note: Dấu ba chấm thay cho giá trị thật; password trong body chỉ xuất hiện trong request đăng nhập và không được ghi vào log. Set-Cookie là header của response, Cookie là header của request sau đó. Giá trị sid phải khó đoán; nếu chứa userId thì người dùng sửa được thành người khác. Các thuộc tính HttpOnly, Secure, SameSite được giải thích ở slide cookie. Trên localhost không có HTTPS, browser vẫn chấp nhận cookie Secure ở localhost nên cấu hình này kiểm tra được ở máy học; khi triển khai thật phải dùng HTTPS.

Speaker note: Passport.js mô tả cùng ý trong tài liệu về session: ứng dụng cần nhớ người dùng qua các request vì HTTP không giữ trạng thái; cookie mang session ID, dữ liệu người dùng nằm ở server. Hệ quả kiểm chứng được: nếu sao chép giá trị sid sang công cụ HTTP khác thì request đó vẫn được xem là của người dùng đó cho tới khi server hủy session hoặc session hết hạn. Do đó server mới là nơi kết thúc phiên, không phải browser. Slide này tách hai khái niệm thường bị gọi chung là session.

Speaker note: Slide này trả lời yêu cầu session lưu bền vững của bài tập. Session ở server là một bản ghi; câu hỏi là bản ghi nằm ở đâu. Nếu nằm trong bộ nhớ của tiến trình thì khởi động lại server làm mất toàn bộ, và hai instance sau một load balancer không thấy session của nhau. Database hoặc Redis giải quyết cả hai vấn đề vì dữ liệu nằm ngoài tiến trình ứng dụng. Cấu hình mặc định của thư viện session có thể dùng bộ nhớ của tiến trình; sinh viên kiểm tra cấu hình mà agent sinh ra thay vì giả định. Kiểm chứng: đăng nhập, khởi động lại server, tải lại trang bằng cùng cookie sid; request vẫn được nhận ra. Dọn bản ghi hết hạn là việc định kỳ hoặc do store tự làm; nhóm công bố cách chọn. Không giảng cú pháp cấu hình session store của từng thư viện.

Speaker note: Middleware chạy trước handler. Nó đọc cookie sid, tra session, nếu có thì gắn danh tính vào request. Trạm requireLogin chỉ hỏi request đã có danh tính hay chưa; không có thì chuyển sang trang đăng nhập bằng 303. Cookie lạ hoặc session hết hạn được xử lý như chưa đăng nhập, không phải lỗi hệ thống. Handler chỉ đọc danh tính đã được gắn, không tự đọc cookie. Cách tách này cho phép thêm bước kiểm tra role và thuộc tính ở Block 9 mà không sửa middleware đăng nhập. Bài tập của block này gắn requireLogin vào cụm CRUD. Sinh viên đọc mã của agent để tìm đúng ba chỗ: nơi đọc cookie, nơi tra session, nơi chặn request chưa đăng nhập.

Speaker note: Session fixation là tình huống kẻ tấn công đưa cho nạn nhân một sid đã biết trước, đợi nạn nhân đăng nhập rồi dùng chính sid đó. Nếu server giữ nguyên sid trước và sau login thì sid ấy bỗng có danh tính. OWASP Session Management Cheat Sheet yêu cầu đổi session ID sau bất kỳ thay đổi mức đặc quyền nào, trong đó có đăng nhập. Hạn của session ở server và hạn của cookie ở browser là hai giá trị độc lập, nên có trường hợp cookie còn nhưng session đã mất. Chính sách gia hạn là quyết định của nhóm; cần công bố hạn không hoạt động và hạn tối đa của phiên.

Speaker note: Thứ tự quan trọng: hủy bản ghi session làm sid cũ mất hiệu lực ở bất kỳ nơi nào đang giữ bản sao, còn xóa cookie chỉ dọn browser hiện tại. Logout dùng POST vì GET chỉ đọc dữ liệu như đã học ở Block 5; link hoặc ảnh trên trang khác có thể kích hoạt GET. Trang cũ hiện lại khi nhấn Back do browser lưu bản đã tải; điều cần kiểm chứng là thao tác tiếp theo gửi tới server không còn nhận được dữ liệu của người đã đăng xuất. Phiên chạy trên máy dùng chung phải kết thúc bằng logout, không dựa vào việc đóng browser.

Speaker note: Mô tả theo MDN về Set-Cookie. HttpOnly chỉ ngăn JavaScript đọc giá trị, browser vẫn gắn cookie vào request. Secure giới hạn gửi qua HTTPS; browser cho phép localhost như ngoại lệ khi phát triển. SameSite quyết định cookie có đi kèm request xuất phát từ site khác hay không. Domain rộng làm các subdomain cùng nhận cookie; OWASP CSRF Cheat Sheet cảnh báo không đặt cookie phiên cho cả domain khi không tin hết các subdomain. Cookie phiên là cookie không có Expires hay Max-Age; thời điểm browser bỏ nó do browser quyết định. Sinh viên kiểm chứng các cờ này ở Application, mục Cookies.

Speaker note: Browser gắn cookie theo đích của request, không theo trang đã tạo ra request. Trang lạ chứa một form tự gửi tới server Books; request đến với cookie sid hợp lệ nên server thấy một phiên đang đăng nhập và thực hiện thao tác. Ba lớp chặn thường kết hợp. SameSite=Lax khiến browser không gửi cookie trong POST từ site khác, nhưng vẫn gửi trong điều hướng GET cấp cao nhất, vì vậy GET không được đổi dữ liệu. CSRF token gắn với session và nằm trong form hợp lệ; trang lạ không đọc được giá trị này. Kiểm tra Origin loại request từ origin lạ. Theo OWASP, SameSite có giới hạn, ví dụ với subdomain cùng site, nên không dùng làm lớp duy nhất khi dữ liệu nhạy cảm.

Speaker note: Các công cụ này hiện thực cùng những cơ chế vừa học: băm password, tạo session, đặt cookie, khôi phục user ở mỗi request. Slide chỉ cho biết tên để đưa vào prompt cho coding agent. Với Passport.js, tài liệu chính thức mô tả cách đăng nhập bằng session và cookie. Block không giảng strategy, cách cài đặt hay chuyển mã tự viết sang thư viện. Dùng công cụ có sẵn không thay phần kiểm chứng: sinh viên vẫn đọc cờ cookie, thuật toán băm và chỗ kiểm tra session trong mã agent tạo ra.

Speaker note: Đây là quy trình bắt buộc trong bài tập. Trọng tâm là cơ chế: token ngẫu nhiên, hash, hạn dùng, dùng một lần, không lộ email nào tồn tại, và những điểm mà quy trình này có thể bị lợi dụng. Dựa trên OWASP Forgot Password Cheat Sheet.

Speaker note: Băm là phép một chiều nên không có cách lấy lại password cũ; hệ thống chỉ có thể cho đặt password mới. Người đang quên password không chứng minh được danh tính bằng password, nên hệ thống dùng một kênh khác là hộp thư đã đăng ký. Token trong link là bằng chứng tạm thời rằng người mở link kiểm soát hộp thư đó. OWASP yêu cầu token sinh bằng bộ sinh số ngẫu nhiên an toàn, đủ dài để chống đoán, lưu an toàn, dùng một lần và có hạn; ngoài ra không thay đổi gì trên tài khoản như khóa tài khoản trước khi có token hợp lệ.

Speaker note: Browser chỉ gửi email. Server tạo token ngẫu nhiên, lưu hash của token cùng userId và hạn dùng, rồi gửi link qua email. Token gốc chỉ tồn tại trong email và trong link. Phản hồi cho browser là một thông báo chung, tách khỏi việc email có tồn tại hay không; slide sau nói rõ lý do. Địa chỉ trong link lấy từ cấu hình của server, không lấy từ header Host của request, vì Host có thể bị người gọi giả mạo. Link dùng HTTPS khi triển khai.

Speaker note: Giá trị trong bảng là minh họa. Lưu hash của token theo cùng nguyên tắc với password: lộ database không kéo theo lộ link còn hiệu lực. Token ngẫu nhiên dài khác password do người chọn nên nhóm không cần thiết kế gì riêng; dùng hàm băm chuẩn của thư viện. Cột usedAt rỗng nghĩa là chưa tiêu thụ. Giới hạn một token còn hiệu lực cho mỗi user làm việc kiểm tra gọn hơn và giảm số link có thể bị đoán trong cùng một thời điểm. Gắn token với một user trong cùng bản ghi nên link không dùng được cho user khác.

Speaker note: Nếu trang trả lời khác nhau, kẻ tấn công dò được danh sách email đã đăng ký; OWASP gọi đây là user enumeration. Thời gian phản hồi cũng là tín hiệu: nhánh có gửi email chậm hơn nhánh không gửi, nên đưa việc gửi email vào hàng đợi hoặc xử lý bất đồng bộ để thời gian gần như nhau. Giới hạn số yêu cầu làm hai việc: tránh làm ngập hộp thư của một người và hạn chế dò token. Trang đăng nhập và trang đăng ký cũng có thể lộ email; đã dùng thông báo chung ở login.

Speaker note: Trình tự có hai request với hai ý nghĩa khác nhau. GET chỉ trả form và không đổi dữ liệu. POST mang token và password mới mới là thao tác đổi. Server so hash của token nhận được với bản ghi, kiểm tra còn hạn và chưa dùng, đổi passwordHash, đánh dấu token đã dùng. Kết thúc bằng redirect tới trang đăng nhập; người dùng đăng nhập lại theo luồng thông thường, kể cả CAPTCHA và giới hạn đăng nhập sai như đã học.

Speaker note: Nếu GET đã tiêu thụ token thì một lần quét tự động có thể làm link vô dụng trước khi người dùng mở. Điều này nhất quán với quy tắc đã học: GET chỉ đọc. Trang form có thể kiểm tra token để quyết định hiện form hay thông báo link không dùng được, nhưng không đánh dấu usedAt. OWASP nêu hai biện pháp cho trang này: Referrer-Policy no-referrer và giới hạn số lần thử để chống dò token qua URL. Token nằm trong URL nên có thể xuất hiện trong lịch sử browser và log; thời hạn ngắn và dùng một lần làm giảm hậu quả.

Speaker note: Ba trạng thái không hợp lệ dùng cùng một thông báo để không cho biết token từng tồn tại hay không. Khi POST, việc kiểm tra và đánh dấu đã dùng phải là một thao tác không tách rời, ví dụ một câu UPDATE có điều kiện usedAt rỗng và chưa quá hạn; nhờ vậy nếu hai request gửi cùng lúc thì chỉ một request thành công. Khi từ chối, không có thay đổi nào trong database. Kiểm chứng bằng cách gửi POST lần hai với cùng token và đọc bản ghi: usedAt đã có giá trị và password không đổi lần nữa.

Speaker note: OWASP khuyên không tự đăng nhập sau reset vì tăng độ phức tạp của phần xử lý phiên, và khuyên hủy các phiên cũ hoặc hỏi người dùng có hủy hay không, cùng các link và mã khôi phục còn tồn tại. Hủy bản ghi session làm sid cũ mất hiệu lực ở mọi nơi còn giữ bản sao, nên người đã chiếm phiên cũ mất quyền; việc này làm được vì session nằm ở store phía server. Reset token chỉ được endpoint đặt lại chấp nhận; gửi nó tới route khác phải bị từ chối. Reset password cũng không kích hoạt tài khoản đang pending. Người dùng đăng nhập lại theo luồng thường.

Speaker note: Tiếp tục Restaurant App SSR của Block 5, dùng lại database và cụm CRUD đã có. Không dựng app mới và không bỏ các chức năng đã có. Sinh viên dùng coding agent để gắn cụm authentication, rồi chứng minh bằng Network, Application, request trực tiếp và bản ghi database. Quan hệ giữa dữ liệu món ăn và đầu bếp đã có từ các bài trước, không phải mục tiêu mới.

Speaker note: Cả bốn mục đều bắt buộc và gắn vào Restaurant App SSR của Block 5, không dựng app mới. Không tự viết thuật toán mật mã: dùng thư viện băm password và bộ sinh số ngẫu nhiên an toàn của nền tảng. Ở Block 8 mọi tài khoản active đều dùng được cụm CRUD; chưa phân biệt quyền theo role. Phân quyền, MFA và bản SPA thuộc bài tập Block 9. Nhóm có thể dùng Passport.js hoặc công cụ tương ứng của stack, miễn giải thích được luồng bằng khái niệm đã học. Nếu nhóm đổi thư viện hay stack, vẫn giữ nguyên hành vi và tiêu chí nghiệm thu.

Speaker note: Phát công bố các trường mới để mọi nhóm có cùng cơ sở nghiệm thu. Trường role có mặt từ bây giờ vì đăng ký phải chứng minh role không đến từ form; việc dùng role để chặn thao tác thuộc Block 9. Dùng reCAPTCHA thì không cần bảng thử thách CAPTCHA, vì Google giữ trạng thái của thử thách. Bộ đếm đăng nhập sai nằm ở server, không nằm trong cookie hay localStorage, để mở tab ẩn danh không đặt lại bộ đếm. PasswordReset chỉ lưu hash của reset token; token gốc chỉ nằm trong email. Script seed tạo ít nhất một tài khoản đã kích hoạt (status = active, có emailVerifiedAt) để thử đăng nhập, quên mật khẩu và CRUD; tài khoản tạo mới qua đăng ký phải qua kích hoạt. Mật khẩu seed lấy từ biến môi trường hoặc script, không commit.

Speaker note: Nhóm công bố chính sách chuẩn hóa email (ví dụ cắt khoảng trắng, đổi phần domain thành chữ thường) và áp dụng cùng chính sách ở đăng ký, đăng nhập và quên mật khẩu. Kiểm tra bằng request trực tiếp: gửi body có role: admin rồi đọc bản ghi user, role phải là viewer. Pending phải bị chặn ở server, không chỉ ở giao diện.

Speaker note: Hạn dùng, số chữ số, số lần thử và thời gian chờ do nhóm tự chọn và công bố; các số trong slide trước chỉ là giả định để minh họa. Email gửi qua dịch vụ hoặc hộp thư thử nghiệm do nhóm chọn, credential nằm trong biến môi trường. Bằng chứng cho việc dùng một lần là bản ghi ActivationChallenge có usedAt sau lần xác nhận đầu và thông báo lỗi ở lần hai. Bằng chứng cho giới hạn là nhiều request sai liên tiếp dẫn tới khóa tạm, kể cả khi xen kẽ gửi lại.

Speaker note: Mỗi dòng chuyển thành một mục kiểm tra trước khi giao prompt cho agent. Thuộc tính cookie kiểm tra ở Application, mục Cookies và ở header Set-Cookie trong Network. Session bền vững kiểm tra bằng cách đăng nhập, khởi động lại server, rồi tải lại trang với cùng cookie. CSRF: nhóm nêu rõ chọn SameSite, token trong form hay kiểm tra Origin, và có một request mô phỏng từ trang khác bị từ chối. Đổi sid lúc login kiểm tra bằng cách so giá trị cookie trước và sau đăng nhập.

Speaker note: Không yêu cầu nhóm triển khai đồng thời cả ba mức. Mức tự làm giúp hiểu vòng đời nhưng không là lựa chọn nghiệm thu chống bot; nhóm chọn thư viện hoặc dịch vụ và nêu giới hạn còn lại. Với thư viện, bằng chứng gồm thử thách gắn phiên ẩn danh, mục đích, hạn và dùng một lần. Với reCAPTCHA, bằng chứng gồm backend gọi xác minh thật và kiểm tra hostname, action, score khi có, không chỉ widget hiện đúng. Site key có thể công khai; credential xác minh giữ trong biến môi trường ở backend. Không dùng chế độ giả lập hoặc test key luôn thành công làm bằng chứng chặn bot. Các số do nhóm chọn, không bắt buộc chép chính sách giả định Books.

Speaker note: Cụm CRUD là các route của Restaurant App ở Block 5, gồm cả các route đọc. Không dừng ở việc ẩn liên kết trên giao diện. Mọi tài khoản active đều dùng được cụm này; phân biệt Viewer, Editor, Admin là nội dung của Block 9. Kiểm chứng bằng request trực tiếp không có cookie tới từng route, cả GET lẫn POST, PATCH, DELETE: kết quả phải là 303 tới /login và dữ liệu không đổi. Logout kiểm tra bằng cách dùng lại sid cũ: phải bị từ chối dù cookie đã được sao chép.

Speaker note: Email gửi qua dịch vụ hoặc hộp thư thử nghiệm do nhóm chọn; credential nằm trong biến môi trường, không đưa vào mã. Bằng chứng gồm email nhận được với phần token che đi, bản ghi database có hash và hạn, và kết quả khi dùng lại token. Nhóm không tự viết bộ sinh số ngẫu nhiên: dùng bộ sinh an toàn của nền tảng. Session cũ bị hủy kiểm tra bằng cách dùng lại sid cũ sau khi reset: phải bị từ chối. Reset password không kích hoạt tài khoản đang pending. Sau reset, người dùng đăng nhập lại theo luồng thường, kể cả CAPTCHA và giới hạn đăng nhập sai.

Speaker note: Prompt nêu rõ cơ chế thay vì chỉ ghi thêm đăng nhập, nếu không agent có thể để session trong bộ nhớ hoặc bỏ qua bước xác minh CAPTCHA ở server. Đưa tên công cụ vào prompt là đủ; giảng viên không hướng dẫn cài đặt và không giảng cú pháp của chúng. Đọc diff là bước bắt buộc vì mã bảo mật do agent sinh dễ có lỗi âm thầm: so sánh password dạng chuỗi, route CRUD thiếu middleware, đáp án CAPTCHA nằm trong response.

Speaker note: Sinh viên không cần đọc từng dòng, nhưng cần biết dòng nào sai thì hỏng ở đâu. Mỗi câu hỏi tương ứng một điểm trong phần lý thuyết. Ghi lại vị trí trong mã cho từng câu, kể cả khi kết quả là không có lỗi. Với câu về thuật toán băm, tìm nơi tạo và nơi so passwordHash. Với câu về route, thử gọi từng route CRUD bằng công cụ HTTP khi không có cookie. Với câu về session và bộ đếm, tìm cấu hình store và nơi cập nhật bộ đếm.

Speaker note: Mỗi dòng cần một bước làm lại được bằng request trực tiếp. Với giới hạn thử, gửi liên tiếp nhiều OTP sai rồi xen một lần gửi lại và gửi tiếp: số lần thử không được đặt lại. Với hai request xác nhận cùng lúc, chỉ một request nhận active. Che OTP và token trong ảnh nộp.

Speaker note: Ghi rõ điều kiện đầu, ngưỡng nhóm chọn và chuỗi request để tái hiện. Với thư viện, thử gửi challengeId của phiên khác: bị từ chối. Với reCAPTCHA, dùng token thật mới cho nhánh thành công, rồi gửi lại token đó để chứng minh chống dùng lại; với score-based, thử token có action khác, server phải từ chối. Không gửi hàng loạt request tới dịch vụ bên ngoài; chỉ cần số lần đủ chạm ngưỡng cấu hình trong môi trường thử nghiệm. Kiểm tra cả trường hợp email chưa tồn tại có cùng quy tắc CAPTCHA để không tạo kênh dò tài khoản. Che token và credential trong ảnh, giữ lại thông báo lỗi, thời điểm và trạng thái bộ đếm.

Speaker note: Request trực tiếp bằng công cụ HTTP không kèm cookie phải cho cùng kết quả như truy cập khi chưa đăng nhập trên giao diện. Khởi động lại server là bước thật: dừng tiến trình, chạy lại, rồi gửi request với cookie đã có. Bản ghi session đọc từ database hoặc Redis, che giá trị sid khi nộp. Với CSRF, nêu rõ biện pháp nhóm chọn rồi dùng request mô phỏng từ trang khác.

Speaker note: Mỗi dòng cần một bước làm lại được. Với reset token, lưu token từ email, dùng thành công một lần rồi gửi lại lần hai và đọc bản ghi database: usedAt đã có giá trị. Với GET, mở link rồi đọc bản ghi trước khi gửi form. Với session cũ, đăng nhập ở một tab, reset password ở tab khác, rồi dùng lại sid của tab đầu. Che password, token và email trong ảnh nộp.

Speaker note: Sinh viên giải thích bằng ứng dụng đang chạy và bằng chứng, không lặp lại lời khẳng định của agent. Không yêu cầu mọi nhóm chọn cùng thư viện CAPTCHA hay cùng ngưỡng; yêu cầu là lựa chọn nhất quán với hành vi quan sát được và giới hạn được nêu trung thực. Câu hỏi là tiêu chí trình bày, không yêu cầu báo cáo chi tiết mã nguồn.

Speaker note: Che password, token, OTP và khóa bí mật trước khi nộp; chỉ giữ đủ để nhìn thấy cấu trúc. Bản ghi database chỉ cần cho thấy hash và trạng thái, không cần giá trị gốc. Sơ đồ do nhóm tự vẽ nhằm chứng tỏ hiểu luồng, không chép sơ đồ của slide. Lỗi do agent tạo ra có thể là cờ cookie thiếu, session nằm trong bộ nhớ, route CRUD thiếu kiểm tra đăng nhập hoặc đáp án CAPTCHA nằm trong response; ghi cách phát hiện và bằng chứng sau khi sửa.

Speaker note: Quay lại câu hỏi đầu giờ và cho lớp sửa câu trả lời bằng thuật ngữ vừa học: request chứng minh người gọi bằng cookie sid, server tra session trong store và quyết định tiếp tục hay chuyển tới trang đăng nhập. Mỗi nhóm viết một câu giải thích và một bằng chứng có thể tái sử dụng: một request trong Network hoặc một request mẫu chạy bằng công cụ HTTP. Block 9 trả lời vế còn lại: người đó được làm gì, cùng yếu tố xác thực thứ hai và cách SPA gửi credential.

Speaker note: Các nguồn OWASP là tài liệu chính cho các khẳng định về bảo mật trong deck: đăng ký, xác minh và chuẩn hóa email, lưu password, hủy session, CSRF, quên mật khẩu, CAPTCHA và giới hạn đăng nhập. Tài liệu reCAPTCHA v2/v3 và siteverify hiện được Google đánh dấu là tài liệu cũ và trỏ sang Google Cloud Fraud Defense; giữ liên kết để giải thích các tích hợp đang có, dự án mới theo tài liệu Cloud và loại key đã tạo. Không sao chép lẫn endpoint hoặc credential giữa hai cách. Các ngưỡng đăng nhập, hạn 900 giây, 15 phút, OTP 6 chữ số và 5 lần thử trong deck là giả định để minh họa, không phải khuyến nghị chung.

Speaker note: Dành thời gian cho câu hỏi về luồng đã học. Khi sinh viên hỏi về thư viện cụ thể, quay lại câu hỏi cơ chế: request nào mang danh tính, server tra gì, và kết quả khi thiếu hoặc sai.
