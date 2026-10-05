# Academia · Danh bạ sinh viên

Giao diện futuristic cinematic với hero, orbit, dashboard Bento và danh sách sinh viên. Ứng dụng dùng Express/EJS, CSS và Web Animations API; dữ liệu nằm trong `data/students.json`.

## Chạy local

```powershell
cd D:\WebApplication\Web-design\student_list
npm ci
npm start
```

Mở http://localhost:3000/students. Trang `/` tự chuyển tới danh bạ. Nếu server cũ đang chạy, dừng bằng Ctrl+C rồi chạy lại để nạp backend mới. Tải lại bằng Ctrl+F5 để nhận CSS/JavaScript mới.

Có thể chạy trên cổng khác:

```powershell
$env:PORT = '3100'
npm start
```

## Chức năng

- Tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt theo tên, MSSV hoặc email.
- Lọc hồ sơ chưa có MSSV; số liệu tổng quan luôn tính toàn bộ danh bạ.
- Thêm sinh viên ngay trong trang; lỗi được hiển thị cạnh trường nhập và giữ dữ liệu đã điền.
- Khi tắt JavaScript, form HTML vẫn gửi và nhận thông báo từ server.
- Hỗ trợ bàn phím và tùy chọn giảm chuyển động của thiết bị. Parallax chỉ chạy từ 1024px; các hiệu ứng nền dừng khi hero hoặc tab không hiển thị.

## Kiểm thử

Yêu cầu Node.js 24.13+ hoặc 22.12+ để chạy bộ kiểm thử DOM bằng jsdom 29; ứng dụng đã được kiểm tra với phiên bản Node trong môi trường làm việc hiện tại.

```powershell
npm test
```

Bộ kiểm thử dùng dữ liệu trong bộ nhớ và file tạm riêng, không thêm hồ sơ thử vào danh bạ thật. jsdom là phụ thuộc phát triển và không được tải trong trình duyệt của người dùng.

Kiểm tra trực quan bổ sung trên trình duyệt: 390, 768, 1280 và 1440px; tên/email dài; Tab/Shift+Tab; reduced motion; đổi tab; tìm kiếm/lọc; thêm hồ sơ và lỗi mạng. DOM mô phỏng kiểm tra hành vi nhưng không đo layout hoặc độ mượt thực tế.

## Phản hồi POST /students

Gửi dữ liệu URL-encoded với `Accept: application/json` để nhận JSON:

- `201`: `{ student, summary }`, summary gồm `total`, `withStudentId`, `missingStudentId`.
- `400` / `409`: `{ error: { field, message } }`.
- `500`: thông báo tổng quát, không đưa stack trace vào phản hồi.

Gửi form HTML nhận trang lỗi kèm giá trị đã nhập hoặc redirect 303 về hồ sơ vừa tạo. Server kiểm tra MSSV 8 chữ số, họ tên 2–100 ký tự, email hợp lệ và tính duy nhất của MSSV/email.
