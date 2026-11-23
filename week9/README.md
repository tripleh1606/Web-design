# Photo Gallery — Week 9

Phần Người 1: Express, Prisma/SQLite, phiên quản lý, API metadata/phân trang/xóa và tích hợp lifecycle/media của Người 3. Frontend của Người 4 được phục vụ cùng origin. Ứng dụng độc lập với Restaurant App.

## Cài đặt và chạy

Yêu cầu Node.js >=22.13, npm và một SeaweedFS S3 gateway/bucket private đã cấu hình theo [hướng dẫn storage](docs/seaweedfs.md). Thực hiện từ `week9/`:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Điền mã vừa sinh vào `MANAGE_CAPABILITY` trong `.env`, cùng cấu hình/credential SeaweedFS thật. Không dùng lại mã mẫu hoặc đưa mã vào URL. Tiếp theo:

```powershell
npm run db:generate
npm run db:deploy
npm run dev
```

Mở `http://127.0.0.1:5091`; `/manage` là trang quản lý, `/photos/:id` là link chia sẻ công khai. API, media và frontend dùng chung server. `npm start` chạy không watch. `npm run db:migrate -- --name ten_thay_doi` tạo migration khi phát triển schema; deploy chỉ áp dụng migration đã commit. Chạy `db:generate` sau khi cài dependency hoặc đổi schema, kể cả khi npm không cho chạy postinstall tự động.

`DATABASE_URL=file:../../data/gallery.sqlite` được resolve từ `api/prisma/`, nên DB nằm tại `week9/data/gallery.sqlite`. Có thể dùng `file:D:/duong-dan-ben-vung/gallery.sqlite` trên Windows. Thư mục DB được tạo bởi script migration; ứng dụng từ chối database chưa migrate. Prisma quản lý schema, dữ liệu dùng WAL + synchronous FULL. Database và file khóa `.lock` phải trên ổ local bền vững, cùng host, cùng đường dẫn canonical cho mọi process. Không xóa/di chuyển file khóa khi còn writer. Không commit DB, staging, `.env` hay credential.

Nếu dùng web dev proxy riêng, đặt `PUBLIC_ORIGIN=http://127.0.0.1:5090` cho API và khởi động lại API, rồi chạy `npm run dev:web` trong terminal khác. Proxy mặc định trỏ API tại `http://127.0.0.1:5091`. Không cần CORS. Origin của thao tác ghi phải khớp chính xác `PUBLIC_ORIGIN`; dùng cùng hostname. Khi triển khai HTTPS, đặt origin HTTPS và `COOKIE_SECURE=true`; reverse proxy phải phục vụ cùng origin.

## Tình trạng tích hợp

- GET danh sách/chi tiết, đăng nhập/đăng xuất/kiểm tra phiên, DELETE và media đã nối với Prisma và lifecycle hiện có.
- Upload thuộc Người 2, chưa có `api/src/routes/upload.js`. Người đã đăng nhập gọi POST ảnh sẽ nhận **503 `UPLOAD_NOT_READY`**. Public luôn bị kiểm quyền trước. Không có dữ liệu mẫu hoặc fallback storage trong runtime.
- Khi Người 2 bổ sung module `createUploadHandler(dependencies)` theo [contract](docs/api.md), server tự nạp module ở lần khởi động tiếp theo. Module phải trả Express handler, dùng `publishPhoto`, `parseUploadMetadata` và `limits` được cấp.
- Kiểm thử backend dùng DB SQLite thật và storage thay thế trong test để chủ động gây lỗi; chưa xác nhận luồng end-to-end với SeaweedFS thật trên máy này. Phần upload/Sharp và nghiệm thu browser/storage thực vẫn thuộc các phần tương ứng.

## Công bố, xóa và phục hồi

`publishPhoto(photo, variants)` kiểm mô tả/kích thước, gọi duy nhất lifecycle của Người 3: lưu đầy đủ manifest → PUT toàn bộ variant → transaction tạo Photo/PhotoVariant → bỏ manifest. Chỉ DB commit mới công bố ảnh. DB không chứa bytes ảnh, đường dẫn file tạm hay credential. Storage key do lifecycle sinh, không lấy từ filename/client.

DELETE kiểm phiên/Origin, transaction đổi `published=false` và ghi delete job trước khi xóa object. HTTP 200 `complete` chỉ khi metadata đã được dọn; HTTP 202 `pending` nghĩa ảnh đã ẩn và key còn bền trong DB để retry. GET/media từ chối ảnh ẩn. Gọi lại DELETE khi job đang chờ tiếp tục dọn; sau khi hoàn tất trả 404. Bản đã tải/cache công khai có thể còn sau khi xóa ở origin.

Server chạy recovery trước khi nhận traffic, sau đó worker retry mỗi `CLEANUP_INTERVAL_SECONDS` (mặc định 60). Worker không chạy chồng; startup, worker và lệnh thủ công đều dùng cùng repository, `cleanup_jobs` và khóa của lifecycle. Lỗi riêng từng job được giữ lại và retry; lỗi không thể đọc DB/job hoặc lấy khóa làm startup thất bại. Ảnh đã commit được đối chiếu DB trước khi quyết định xóa object. Job upload của ảnh đã commit chỉ bỏ manifest.

```powershell
npm run cleanup
```

Lệnh chạy recovery một lần, exit 1 nếu còn lỗi. Khi storage lỗi: giữ nguyên DB/job/volume, sửa gateway rồi để worker hoặc lệnh trên xử lý. Không xóa key/job thủ công để che lỗi. Trước backup/restore, dừng writer và worker, sao lưu DB cùng SeaweedFS ở trạng thái nhất quán; tham khảo hướng dẫn storage. Giới hạn PUT hoàn tất muộn sau khi tiến trình mất kết nối vẫn được nêu trong tài liệu Người 3; không có lời bảo đảm tự tìm mọi orphan.

## Kiểm chứng

```powershell
npm run check
npm test
```

Các test backend tự tạo DB tạm, chạy **Prisma migrate deploy thật**, dựng HTTP server Express trên cổng ngẫu nhiên và dọn sau test. Có kiểm tra:

- Public không upload/xóa/đăng xuất được; Origin sai/thiếu bị chặn; cookie HttpOnly/SameSite Strict/Secure, session hash, hết hạn, rotation và logout.
- Phân trang, 404 cho ảnh ẩn, không lộ key/credential, media MIME/length/ETag/cache, frontend route cùng origin.
- Trigger SQLite cố ý làm lỗi khi ghi variant hoặc delete job: transaction rollback đầy đủ, không công bố/ẩn nửa chừng.
- DB đã commit nhưng mất phản hồi/bỏ manifest lỗi: recovery không xóa object đã công bố.
- Storage delete lỗi: trả pending, job tồn tại qua mở lại DB; recovery dọn object và metadata.
- Repository Prisma tương thích cùng bảng/job với adapter SQLite của Người 3.

Hợp đồng đầy đủ: [API và interface tích hợp](docs/api.md). Các test/storage hiện có của Người 3 được chạy chung bằng `npm test`.
