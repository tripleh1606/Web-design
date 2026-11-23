# POSTAGE — Frontend Week 9

Phần Người 4: Gallery responsive, chi tiết, upload, UI quản lý/xóa, chia sẻ và StampPhoto. JavaScript modules và CSS thuần, không dependency frontend, không editor ảnh.

## Chạy

Yêu cầu Node.js 22 trở lên. Trong PowerShell:

```powershell
cd D:\WebApplication\Web-design\week9\web
$env:API_ORIGIN = "http://127.0.0.1:5091"
npm run dev
```

Mở `http://127.0.0.1:5090`. Có thể đổi cổng web bằng biến `PORT`. Không cần `npm install` vì chưa có dependency.

Server phát triển phục vụ web và proxy `/api/*`, `/media/*` đến `API_ORIGIN`. Backend phải cho phép Origin phát triển `http://127.0.0.1:5090` khi kiểm tra thao tác ghi; proxy giữ nguyên Origin và cookie, không giả mạo quyền. Dùng cùng hostname khi cấu hình/chạy. Khi triển khai thật, backend hoặc reverse proxy cần phục vụ web, API và media cùng origin, bật HTTPS và cookie an toàn. `dev-server.mjs` chỉ dành cho phát triển local.

Nếu backend chưa chạy, giao diện báo lỗi kết nối và có nút thử lại. Không có ảnh mẫu hoặc dữ liệu thành công giả trong ứng dụng.

## Các màn hình

- `/`: Gallery phân trang 12 ảnh, loading/rỗng/lỗi, tem ảnh.
- `/photos/:id`: ảnh lớn, mô tả, link công khai và sao chép link; fallback chọn/copy thủ công.
- `/manage`: kiểm tra phiên; đăng nhập bằng capability; chọn 1–5 JPEG/PNG, preview, nhập title/alt, upload và kết quả theo index; đăng xuất.
- Người quản lý có nút xóa tại trang chi tiết; dialog xác nhận và kết quả dọn xong/đang chờ. Backend mới là nơi thực thi quyền.

Capability không lưu vào URL, localStorage hoặc sessionStorage. Cookie phiên do backend thiết lập. Preview dùng object URL và được revoke khi chọn lại, rời trang hoặc xử lý upload xong. Không tự retry thao tác ghi khi mất kết nối vì server có thể đã xử lý.

## Hợp đồng API cần thống nhất với Người 1–3

Đây là contract frontend đang gọi, không phải khẳng định backend đã triển khai. Response JSON, trừ POST/DELETE phiên trả 204. Lỗi: `{ "error": { "code": "...", "message": "..." } }` với HTTP status phù hợp.

### Photo

```json
{
  "id": "server-generated-id",
  "title": "Một buổi chiều",
  "alt": "Mặt trời phía trên những ngọn đồi",
  "width": 1800,
  "height": 1200,
  "variants": [
    { "url": "/media/photos/id/320.webp", "width": 320, "height": 213 },
    { "url": "/media/photos/id/960.webp", "width": 960, "height": 640 },
    { "url": "/media/photos/id/1600.webp", "width": 1600, "height": 1067 }
  ]
}
```

Kích thước Photo là tỷ lệ nguồn đã chuẩn hóa; variant ghi kích thước thực. URL phải công khai để xem nhưng không cấp quyền ghi, bất biến, HTTP(S) hợp lệ; ưu tiên đường dẫn cùng origin. Frontend không cần storage key hoặc credential SeaweedFS.

| Endpoint | Response |
| --- | --- |
| `GET /api/photos?page=1&limit=12` | `{items: Photo[], page: 1, limit: 12, total: 25}`; page/limit là số |
| `GET /api/photos/:id` | `{photo: Photo}`; 404 nếu không còn công bố |
| `GET /api/manage/session` | `{authenticated: boolean}`; `Cache-Control: no-store` |
| `POST /api/manage/session` | Body JSON `{capability: string}`; 204 và cookie HttpOnly; lỗi 401/403 |
| `DELETE /api/manage/session` | 204, hủy phiên/cookie |
| `POST /api/photos` | Multipart; JSON `{results: [...]}` |
| `DELETE /api/photos/:id` | 200 `{id, cleanup: "complete"}` hoặc 202 `{id, cleanup: "pending"}` |

**GET phiên là bổ sung cần Người 1 triển khai** để frontend biết quyền sau reload mà không lưu mã quản lý. Public vẫn xem được chi tiết khi API phiên lỗi; thao tác quản lý không được mở khi chưa xác nhận phiên.

Upload:

- Trường `metadata`: JSON `[{title, alt}, ...]`, đúng thứ tự file.
- Trường `photos` lặp lại cho từng File; browser tự tạo Content-Type/boundary.
- Title tối đa 160 ký tự, alt tối đa 1000 ký tự trên UI, không được chỉ chứa khoảng trắng; backend cần thống nhất và kiểm lại.
- Client kiểm tra số file, MIME khai báo, 10 MiB/file và kích thước ảnh đọc được. Đây chỉ là hỗ trợ UX; signature, decode, tổng 55 MiB, 40 triệu pixel và mọi giới hạn bảo mật bắt buộc kiểm ở backend.
- Lỗi cấp request dùng non-2xx, không công bố ảnh. Request hợp lệ trả 200 với đủ một kết quả cho mỗi index, kể cả khi tất cả file bị từ chối.

```json
{
  "results": [
    { "index": 0, "ok": true, "photo": { "id": "new-photo-id" } },
    { "index": 1, "ok": false, "error": { "code": "INVALID_IMAGE", "message": "Ảnh không hợp lệ" } }
  ]
}
```

Frontend sắp xếp kết quả theo index, không filename. Sau mỗi lần gửi, file selection được xóa để tránh vô tình gửi lại ảnh đã thành công. Kết quả vẫn hiển thị. Khi response bị mất/sai contract, người dùng được nhắc kiểm tra Gallery trước khi gửi lại.

Xóa `pending` có nghĩa ảnh đã bị ẩn nhưng storage đang chờ dọn; không được trả pending trước khi ẩn thành công. Không có polling hoặc tuyên bố đã dọn xong khi chỉ nhận pending. Bản đã tải hoặc cache công khai có thể còn sau khi xóa origin.

## StampPhoto

```js
import { StampPhoto } from './src/components/StampPhoto.js';
container.append(StampPhoto(photo, {
  sizes: '(max-width: 639px) calc(100vw - 80px), 365px',
  loading: 'lazy',
}));
```

Import `public/styles/stamp.css`. Component trả `<figure>` chứa `<img>`; ảnh giữ tỷ lệ tự nhiên, không crop. Gallery dùng lazy, chi tiết dùng eager. `srcset` chỉ dùng variant thực tế; `sizes` phải phản ánh bố cục nơi tích hợp. Preview có thể truyền `{url: objectURL, width, height, alt}`; bên tạo object URL chịu trách nhiệm revoke.

```css
.my-gallery {
  --stamp-paper: #fffdf5;
  --stamp-border: 20px;
  --stamp-hole-radius: 5px;
  --stamp-hole-spacing: 22px;
  --stamp-width: 100%;
}
```

Bốn radial-gradient mask giao nhau tạo lỗ trong suốt bốn cạnh. Padding đều; viền bị giới hạn 0–4rem, bán kính 0–min(2rem, viền), khoảng cách tối thiểu bằng đường kính + 2px và tối đa 8rem. Nên giữ bán kính nhỏ hơn viền để còn phần giấy nguyên giữa lỗ và ảnh. Không có mask-composite thì fallback thành viền giấy không đục lỗ. Không canvas, thư viện editor, xử lý lại file gốc hoặc listener resize cho từng ảnh.

## Kiểm chứng đã thực hiện

- Node syntax check: dev server, app, API client và StampPhoto.
- Browser Chromium: Gallery/manager với backend chưa có trả lỗi 502 thật; desktop và mobile 390px không tràn ngang.
- Phiên browser kiểm thử riêng với response API được chặn theo contract: render Gallery/chi tiết, link chia sẻ, login UI, chọn hai JPEG có sẵn trong repo, preview, multipart upload và kết quả index trả ngược thứ tự (một thành công/một lỗi), dọn preview, dialog giữ lại/xóa, trạng thái cleanup pending và empty Gallery.
- Screenshot xác nhận lỗ tem bốn cạnh và ảnh giữ tỷ lệ; kiểm DOM có mask, padding 20px, srcset và currentSrc. Viewport 320px không tràn ngang; phiên kiểm thử không có JavaScript error.
- Dữ liệu contract test không được lưu trong app, không chứng minh xác thực/lưu/xóa thật.

**Chưa nghiệm thu end-to-end:** backend và SeaweedFS chưa được triển khai trong workspace khi làm frontend. Cần Người 1–3 cung cấp API trên, rồi kiểm lại phiên/cookie thật, upload/variant, phân trang, quyền, media headers, persistence và cleanup với storage thật theo `../requirements.md`. Không đánh dấu các tiêu chí tích hợp đó đã hoàn thành.
