# Academia · Danh bạ sinh viên

Giao diện futuristic cinematic với hero, đoạn chuyển cảnh nối con số hồ sơ sang dashboard Bento, danh sách sinh viên và bảng xem nhanh. Ứng dụng dùng Node.js + Express, JavaScript trên trình duyệt, CSS và Web Animations API; dữ liệu nằm trong `data/students.json`.

Trang sử dụng CSR: `GET /students` trả HTML tĩnh chưa có hồ sơ. JavaScript gọi `GET /api/students`, nhận JSON rồi dựng danh sách, thống kê, phân trang và dữ liệu cho cảnh 3D. Form gửi `POST /api/students` bằng `fetch`; khi lưu thành công, JavaScript cập nhật giao diện ngay, không tải lại trang. Server vẫn kiểm tra dữ liệu và ghi file JSON. Không dùng database server hoặc ORM.

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
- Khi JavaScript không chạy hoặc API không sẵn sàng, trang thông báo lỗi và không gửi form. Nút “Thử tải lại” gọi lại API mà không reload trang.
- Hỗ trợ bàn phím và tùy chọn giảm chuyển động của thiết bị. Parallax chỉ chạy từ 1024px; các hiệu ứng nền dừng khi hero hoặc tab không hiển thị.
- Chuyển cảnh hero → tổng quan giữ số hồ sơ làm điểm neo; cuộn ngược cũng đảo được chuyển động. Bảng xem nhanh mở bằng hover, focus hoặc nút trên màn hình cảm ứng, có hành động gửi và sao chép email riêng biệt.

## Kiểm thử

Yêu cầu Node.js 24.13+ hoặc 22.12+ để chạy bộ kiểm thử DOM bằng jsdom 29; ứng dụng đã được kiểm tra với phiên bản Node trong môi trường làm việc hiện tại.

```powershell
npm test
```

Bộ kiểm thử dùng dữ liệu trong bộ nhớ và file tạm riêng, không thêm hồ sơ thử vào danh bạ thật. jsdom là phụ thuộc phát triển và không được tải trong trình duyệt của người dùng.

Kiểm tra trực quan bổ sung trên trình duyệt: 390, 768, 1280 và 1440px; tên/email dài; Tab/Shift+Tab; reduced motion; đổi tab; tìm kiếm/lọc; thêm hồ sơ và lỗi mạng. DOM mô phỏng kiểm tra hành vi nhưng không đo layout hoặc độ mượt thực tế.

Ảnh trong `evidence/qa-*.png` là tư liệu giao diện trước khi chuyển sang CSR. Sau thay đổi này cần kiểm tra lại trên trình duyệt thật ở các kích thước trên, đặc biệt quá trình tải dữ liệu và cảnh 3D khi API trả danh sách. Ảnh không thay thế phép đo FPS trên thiết bị thật.

## API

`GET /api/students` trả `{ students, summary }`, với hồ sơ sắp theo ID giảm dần. Nếu không đọc được dữ liệu, API trả `500` và một thông báo JSON; HTML shell vẫn mở được.

`POST /api/students` nhận dữ liệu URL-encoded và trả JSON:

- `201`: `{ student, summary }`, summary gồm `total`, `withStudentId`, `missingStudentId`.
- `400` / `409`: `{ error: { field, message } }`.
- `500`: thông báo tổng quát, không đưa stack trace vào phản hồi.

`POST /students` được giữ làm bí danh JSON cho client cũ. Server kiểm tra MSSV 8 chữ số, họ tên 2–100 ký tự, email hợp lệ và tính duy nhất của MSSV/email.
