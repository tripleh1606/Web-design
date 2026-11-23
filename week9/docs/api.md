# API và hợp đồng tích hợp — Người 1

API/media/web cùng origin, JSON UTF-8 cho API. Mọi response API đặt `Cache-Control: no-store`. Không bật CORS tùy ý; mọi thao tác ghi yêu cầu header `Origin` khớp chính xác `PUBLIC_ORIGIN`, kể cả login. CLI gọi thao tác ghi cũng phải gửi Origin đúng. Public được đọc ảnh đã công bố.

## Phiên quản lý

| Endpoint | Request | Thành công | Lỗi chính |
| --- | --- | --- | --- |
| GET `/api/manage/session` | Cookie nếu có | 200 `{authenticated: boolean}` | 500 nếu DB lỗi |
| POST `/api/manage/session` | JSON `{capability: string}`, tối đa 2 KiB | 204, cookie mới; vô hiệu phiên cũ trong cookie nếu có | 400 JSON/schema sai, 401 capability sai, 403 Origin, 413 body, 429 quá 10 lần sai/15 phút/IP |
| DELETE `/api/manage/session` | Cookie và Origin | 204, xóa session/cookie | 401 chưa đăng nhập/hết hạn, 403 Origin |

Capability sinh ngẫu nhiên tối thiểu 32 bytes (base64url 43–256 ký tự), chỉ lấy từ môi trường. So sánh bằng hash SHA-256 và timingSafeEqual. Cookie `gallery_session` chứa token ngẫu nhiên 32 bytes, HttpOnly, SameSite=Strict, Path=/, Secure khi HTTPS; không đặt Domain. DB chỉ giữ hash token và expiry. TTL mặc định 8 giờ, không sliding. Phiên còn hạn tồn tại qua restart; token đã logout/hết hạn không dùng lại được. Rate limit local có bộ nhớ giới hạn, phù hợp mô hình một server.

## Photo và phân trang

```json
{
  "id": "server-generated-uuid",
  "title": "Buổi chiều",
  "alt": "Mây phía trên ngọn đồi",
  "width": 1800,
  "height": 1200,
  "createdAt": "2026-11-23T10:00:00.000Z",
  "variants": [
    {"url": "/media/server-generated-uuid/320.webp", "width": 320, "height": 213, "bytes": 12000, "mime": "image/webp"},
    {"url": "/media/server-generated-uuid/960.webp", "width": 960, "height": 640, "bytes": 45000, "mime": "image/webp"},
    {"url": "/media/server-generated-uuid/1600.webp", "width": 1600, "height": 1067, "bytes": 80000, "mime": "image/webp"}
  ]
}
```

Photo dùng kích thước nguồn đã chuẩn hóa; variant dùng kích thước/bytes thực. API chỉ trả URL do server tạo, không trả storage key hoặc đường dẫn staging. Variant tăng dần theo width. Title/alt giữ dạng text; frontend dùng textContent.

| Endpoint | Response |
| --- | --- |
| GET `/api/photos?page=1&limit=12` | 200 `{items: Photo[], page, limit, total}` |
| GET `/api/photos/:id` | 200 `{photo: Photo}`; 404 `PHOTO_NOT_FOUND` khi không tồn tại/đã ẩn |
| DELETE `/api/photos/:id` | Có phiên/Origin: 200 `{id, cleanup:"complete"}` hoặc 202 `{id, cleanup:"pending"}`; 404 nếu không có photo/job |
| GET `/media/:id/:width.webp` | WebP của variant đã công bố, 404 khi không tồn tại, 503 lỗi storage/khóa trước khi stream |

Page mặc định 1, tối đa 1.000.000; limit mặc định 12, tối đa 100. Chỉ chấp nhận chuỗi số nguyên dương chuẩn; query trùng, giá trị mảng hoặc field không hỗ trợ trả 400 `INVALID_PAGINATION`. Thứ tự `createdAt DESC, id DESC`; count/items đọc trong cùng DB transaction. Page vượt số trang trả items rỗng, giữ page đã yêu cầu. Phân trang offset có thể thay đổi khi có ảnh mới/xóa.

Media trả `Content-Type: image/webp`, Content-Length, ETag thực và `public, max-age=31536000, immutable`; không cache công khai lỗi. Stream lỗi sau khi đã gửi header sẽ hủy kết nối. `/photos/:id` là route SPA chia sẻ, không mang quyền quản lý. Cookie không có trong URL.

## Multipart — Người 2

POST `/api/photos` được mount sau kiểm Origin/phiên. Không có JSON/body parser toàn cục chạm vào upload stream. Người 2 tạo `api/src/routes/upload.js`:

```js
export function createUploadHandler({ publishPhoto, parseUploadMetadata, limits, repository }) {
  return async function upload(req, res) {
    // Busboy -> staging, đếm bytes thực -> chờ multipart hoàn tất hợp lệ.
    // parseUploadMetadata(metadataText, fileCount) -> [{title, alt}, ...].
    // Kiểm signature/decode/pixel, Sharp orientation + strip metadata, WebP.
    // const id = await publishPhoto({title, alt, width, height}, variants);
    // Trả kết quả từng index, luôn dọn file tạm trong finally.
  };
}
```

Server nạp factory khi khởi động. Không có module thì POST được xác thực trả 503 `UPLOAD_NOT_READY`. `publishPhoto` là hàm bất đồng bộ trả ID, chỉ gọi **sau khi toàn request đã qua kiểm tra**; không nhận ID/key từ client. Người 2 sở hữu multipart/staging/Sharp và không tự tạo lifecycle hoặc DB riêng.

| Giới hạn dùng chung (`services/contracts.js`) | Giá trị |
| --- | --- |
| File field | `photos`, lặp 1–5, index 0 theo thứ tự xuất hiện |
| Text field | Một `metadata`, JSON array đúng số file, chỉ có `{title, alt}` |
| Độ dài | title 1–160, alt 1–1000 UTF-16 code units; không chỉ whitespace; trim sau kiểm độ dài |
| Field/part | Tối đa 1 text field, 6 part; metadata tối đa 32 KiB UTF-8 |
| Bytes | 10 MiB/file, 55 MiB toàn request gồm overhead; đếm khi streaming |
| Ảnh | JPEG/PNG bằng signature và decode, tối đa 40.000.000 pixel |
| Variant | WebP, width `unique(min(sourceWidth, 320/960/1600))`, không upscale |
| Concurrency Sharp | 2 cho toàn process, không chỉ mỗi request |

Từ chối field/file field không hỗ trợ, field metadata lặp, metadata thiếu/thừa/sai cấu trúc. `parseUploadMetadata` chỉ kiểm metadata; các giới hạn multipart/stream do Người 2 thực thi, không coi helper này là parser upload.

Request hợp lệ trả 200 `{results:[...]}` đầy đủ từng index, kể cả tất cả file lỗi. Filename trùng không ảnh hưởng ghép kết quả:

```json
{"results":[{"index":0,"ok":true,"photo":{"id":"new-photo-id"}},{"index":1,"ok":false,"error":{"code":"INVALID_IMAGE","message":"Ảnh không hợp lệ."}}]}
```

Lỗi cấp request: 400 `INVALID_MULTIPART`, `INVALID_METADATA`, `INVALID_FILE_COUNT`, `UNSUPPORTED_FIELD`; vượt tổng 55 MiB là 413 `REQUEST_TOO_LARGE`. Không công bố bất kỳ ảnh nào. Lỗi cấp file trong response 200: `FILE_TOO_LARGE`, `INVALID_IMAGE`, `PIXEL_LIMIT`, `PROCESSING_FAILED`, `STORAGE_FAILED`; message an toàn. Những mã dành cho pipeline là hợp đồng Người 2 cần triển khai, chưa phải bằng chứng các nhánh upload đã hoạt động. FormData trên browser tự đặt multipart boundary.

## Transaction và storage — Người 3

Repository production tại `api/src/database/repository.js` dùng Prisma, map đúng các bảng của adapter SQLite hiện có. Schema tạo bằng migration; adapter SQLite cũ vẫn dùng cho test module, không khởi tạo một DB thứ hai trong server.

- `Photo.published=true`: public; false: ẩn/chờ xóa. `PhotoVariant` liên kết FK/cascade, unique `(photoId,width)` và storage key.
- `CleanupJob.kind=upload|delete`; job tồn tại nghĩa pending, job biến mất nghĩa đã hoàn tất. `keysJson` chứa toàn bộ key dự kiến, không có FK đến Photo vì upload manifest phải có trước Photo. Đây là nguồn cleanup duy nhất.
- Cùng interface `withLock`, `createUploadManifest`, `publishPhoto`, `findPublishedPhoto`, `removeUploadManifest`, `beginDelete`, `listCleanupJobs`, `finishDelete`, `findPublishedVariant` đã nêu trong `storage/lifecycle.js`. Mọi method là async trong repository Prisma; caller luôn phải `await`.
- `withStorageLock` serialize trong process; SQLite `<canonicalDbPath>.lock` serialize giữa process, tự nhả khi process chết. Lock không phải transaction dữ liệu hay S3.
- `publishPhoto` repository kiểm manifest đủ key rồi transaction tạo Photo và mọi variant. Chỉ lifecycle được gọi method này sau đủ PUT; route dùng service `publishPhoto` của runtime. DB không thể tự chứng minh trạng thái S3, không giả định rollback S3 từ transaction DB.
- `beginDelete` transaction ẩn + tạo job; job có sẵn được trả lại để retry. `finishDelete` chỉ xóa metadata ẩn và job sau khi mọi DELETE thành công; từ chối ảnh vẫn public.
- Recovery phải đọc DB trước khi xóa object. Upload đã commit chỉ bỏ manifest, kể cả commit thành công nhưng caller nhận lỗi. Startup/worker/CLI dùng cùng lifecycle, không tạo worker storage cạnh tranh.

Variant truyền cho service: `{path, mime:'image/webp', width, height, bytes}`. Path là file tạm do server/Sharp sinh, không nhận path từ client; bytes là số nguyên dương thực. Service kiểm tập width, tỷ lệ và giới hạn trước khi gọi lifecycle. S3 adapter PUT đóng stream trước khi resolve/reject. Người 2 chỉ xóa variant/staging sau khi service kết thúc, bằng finally. Không lưu bản gốc.

S3 endpoint/region/bucket/path-style/TLS và quyền PUT/GET/HEAD/DELETE do Người 3 xác nhận. Credential chỉ ở backend. Không fallback local. Xem [SeaweedFS và giới hạn phục hồi](seaweedfs.md), đặc biệt PUT có thể hoàn tất muộn sau khi process chết.

## Lỗi

API lỗi dùng `{error:{code,message}}`, không trả stack, đường dẫn hay credential. Lỗi ngoài dự kiến trả 500 `INTERNAL_ERROR`; chưa đăng nhập là 401 `AUTH_REQUIRED`, Origin sai/thiếu là 403 `ORIGIN_FORBIDDEN`. DELETE chỉ báo pending sau transaction ẩn thành công; lỗi DB trước khi ẩn trả 500. Media giữ response stream/empty-error của module Người 3, không bắt buộc JSON. Client không tự retry upload khi mất response vì commit có thể đã thành công.
