# Phần 2: upload và xử lý ảnh

Yêu cầu Node.js >= 22.13. Cài dependency tại `week9/api` bằng `npm install`. Chạy kiểm thử từ `week9`: `node --test tests/upload/*.test.mjs`.

## Tích hợp backend

```js
import { createUploadRouter } from './routes/upload.js';
// lifecycle là kết quả createStorageLifecycle({ repository, storage }).
app.use(createUploadRouter({ requireManager, lifecycle }));
```

`requireManager` là middleware do Người 1 cung cấp, phải kiểm tra phiên quản lý **và Origin** trước khi gọi `next()`. Router bắt buộc nhận middleware và `lifecycle.publish`, không có mặc định cho phép public. Gắn router trước middleware đọc body multipart; không dùng middleware buffer toàn bộ request. `stagingRoot` tùy chọn là thư mục đã tồn tại, mặc định là thư mục tạm của hệ điều hành; cần có quyền ghi và đủ dung lượng. Mỗi request có thư mục riêng, được dọn sau xử lý, lỗi hoặc ngắt kết nối. Cấu hình hạ tầng dọn thư mục tạm tồn dư sau tiến trình bị dừng đột ngột.

`lifecycle.publish(photo, variants)` là interface hiện có của Người 3: `photo` gồm `title`, `alt`, `width`, `height`; mỗi variant gồm `path`, `mime`, `width`, `height`, `bytes`. Các file chỉ tồn tại cho đến khi promise publish hoàn tất. Service đó chịu trách nhiệm manifest bền vững, PUT, DB commit và recovery; route không tự ghi storage hoặc DB.

## Hợp đồng POST /api/photos

Multipart có 1 trường `metadata` và 1–5 file trường `photos`, thứ tự file xác định index. Metadata là mảng JSON cùng số phần tử, mỗi phần tử chỉ có `title` và `alt`, chuỗi không rỗng sau khi trim; giới hạn lần lượt 160 và 1000 đơn vị UTF-16. JSON metadata tối đa 8192 bytes, tên field tối đa 100 bytes, tối đa 6 part. Các field không hỗ trợ, field trùng, JSON sai, số file sai hoặc multipart hỏng trả 400 `INVALID_REQUEST`; request vượt 55 MiB gồm overhead trả 413 `REQUEST_TOO_LARGE`. Không công bố file nào với lỗi cấp request.

Request hợp lệ trả 200 `{ "results": [...] }` theo thứ tự index. Thành công: `{ "index": 0, "ok": true, "photo": { "id": "..." } }`; thất bại: `{ "index": 1, "ok": false, "error": { "code": "INVALID_IMAGE", "message": "..." } }`. Mã file gồm `FILE_TOO_LARGE`, `INVALID_IMAGE`, `PUBLICATION_FAILED`. Mỗi file tối đa 10 MiB, JPEG/PNG thực, tối đa 40 triệu pixel; ảnh được xoay theo EXIF, loại metadata, sinh WebP tại các ngưỡng 320/960/1600 không upscale hoặc trùng width. Tối đa hai ảnh được xử lý đồng thời trong một tiến trình.

Test tự tạo ảnh JPEG/PNG và ảnh gắn orientation bằng Sharp, file giả/truncated, ảnh quá pixel, file quá bytes và client ngắt kết nối. Không sử dụng GPS cá nhân. Cần kiểm thử bổ sung với fixture GPS giả lập và kết nối SeaweedFS/DB thật khi Người 1 tích hợp backend; test hiện tại dùng publisher giả để cô lập pipeline, không chứng minh lưu trữ thật hoặc quyền/session thật.
