# Plan xác thực SSR — week6

Cập nhật 02/11/2026. Trạng thái: **đặc tả triển khai; chưa triển khai hoặc nghiệm thu chức năng**.

Nguồn: [Xác thực tài khoản trên SSR.html](<D:/User_C_BackUp/Download/Xác thực tài khoản trên SSR.html>), 66 slide, đọc cả speaker notes. Bài tập ở slide 48–63 áp dụng vào app nhà hàng SSR hiện có trong `../restaurant`.

Đọc theo thứ tự:

1. [Hiện trạng code](auth-discovery.md).
2. [Hợp đồng chung và thứ tự triển khai](auth-parallel-plan.md) — tài liệu chuẩn duy nhất cho schema, route, chính sách và phạm vi.
3. [Checklist đối chiếu slide và bằng chứng](auth-acceptance-checklist.md).
4. Các plan thực hiện: [nền tảng và đăng nhập](auth-login-english.md), [đăng ký và OTP](auth-registration-english.md), [đăng xuất](logout-implementation-plan.md), [quên mật khẩu](auth-password-reset-english.md).

Các file mang hậu tố `english` là hướng dẫn giao việc bằng tiếng Anh, dùng cùng hợp đồng chung; [English contract](auth-contract-english.md) là bản tóm tắt tra cứu. Không tự coi bản dịch/tóm tắt là đặc tả khác.

Bộ plan này thay thế nội dung cũ về link kích hoạt, sửa password pending khi đăng ký lại, bỏ reset password và redirect 302 cho CRUD chưa đăng nhập. `../recovered-auth-plans.md` chỉ là bản khôi phục lịch sử; không dùng làm yêu cầu triển khai hiện tại.

Ngưỡng thời gian/số lần thử trong hợp đồng là **lựa chọn của nhóm cho bài tập**, không phải giá trị bắt buộc do giảng viên hoặc OWASP quy định. Đọc source HTML khi có mâu thuẫn, sửa hợp đồng chung và các plan liên quan trước khi code.
