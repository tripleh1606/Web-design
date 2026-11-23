# Yêu cầu Photo Gallery — Week 9

## 1. Mục tiêu và phạm vi

Xây dựng ứng dụng Photo Gallery độc lập, responsive, đáp ứng bài học “Upload, xử lý, lưu trữ và phân phối ảnh” và bổ sung hiệu ứng khung tem bưu chính trên frontend.

- Upload nhiều ảnh trong một request, kiểm tra và chuẩn hóa trước khi công bố.
- Lưu metadata trong database; lưu bytes ảnh trên SeaweedFS qua S3 API.
- Gallery có danh sách, trang chi tiết, chia sẻ link xem và thao tác xóa có phân quyền.
- Component `StampPhoto` tái sử dụng, không chỉnh sửa file ảnh để tạo viền.
- Không phụ thuộc nghiệp vụ Restaurant App.

Ngoài phạm vi: trình chỉnh sửa ảnh, crop/xoay/lật tương tác, Konva, Fabric.js, tài khoản người dùng, album, bình luận, mạng xã hội và triển khai CDN riêng. Chuẩn hóa EXIF và sinh variant trên server vẫn thuộc phạm vi cốt lõi.

## 2. Stack và tổ chức dự kiến

- Backend: Node.js, Express, Busboy nhận multipart theo streaming, Sharp xử lý ảnh.
- Database: Prisma + SQLite cho mô hình một web server; file DB đặt trên ổ đĩa bền vững.
- Storage: SeaweedFS qua S3 gateway, AWS SDK S3; không cần thêm backend local storage.
- Frontend: JavaScript modules, HTML và CSS; API và frontend cùng origin.
- Chỉ phát triển ứng dụng trong `week9/`, không thay đổi ứng dụng các tuần trước.

```text
week9/
├── api/
│   ├── prisma/
│   └── src/
│       ├── routes/
│       ├── services/
│       └── storage/
├── web/
│   ├── src/
│   │   └── components/StampPhoto.js
│   └── public/
├── tests/
│   └── fixtures/
├── docs/
├── package.json
├── .env.example
├── README.md
└── requirements.md
```

DB, staging, nhật ký phục hồi và credential không được commit. Không tạo thêm tài liệu hoặc cấu trúc không phục vụ yêu cầu thực tế.

## 3. Upload và kết quả từng file

### 3.1. Request

- Form nhận từ 1 đến 5 ảnh trong cùng một request `multipart/form-data`.
- Các file dùng chung tên trường `photos`, thứ tự xuất hiện xác định index từ 0.
- Gửi một trường text `metadata` chứa mảng JSON theo thứ tự file: mỗi phần tử có `title` và `alt`.
- Tiêu đề và alt text phải được cung cấp cho từng ảnh; alt mô tả nội dung, không tự mặc định bằng filename.
- Hợp đồng API phải công bố giới hạn độ dài text, số field/part và từ chối cấu trúc không hợp lệ, metadata thiếu/thừa hoặc field không được hỗ trợ.
- Browser dùng `FormData`; không tự đặt header `Content-Type` khi gọi `fetch`.

### 3.2. Giới hạn

| Tài nguyên | Giới hạn |
| --- | --- |
| Số file | 1–5 file/request |
| Dung lượng mỗi file | Tối đa 10 MiB |
| Tổng bytes request, gồm multipart overhead | Tối đa 55 MiB |
| Pixel mỗi ảnh | Tối đa 40.000.000 pixel |
| Loại ảnh đầu vào | JPEG, PNG |

- Đếm bytes thực tế khi streaming, không chỉ tin `Content-Length`.
- Giới hạn file/request phải được áp dụng trong quá trình nhận; không giữ toàn bộ request trong RAM.
- File vượt ngưỡng riêng không được lưu toàn bộ vào staging; tiếp tục tiêu thụ có giới hạn để xác định kết quả các file khác và giới hạn toàn request.
- Dọn staging khi request bị hủy, vượt giới hạn hoặc xử lý hoàn tất.
- Giới hạn concurrency xử lý ảnh để tránh nhiều decoder cùng chiếm RAM/CPU không kiểm soát.

### 3.3. Phạm vi lỗi và response

- Lỗi cấp request: multipart hỏng, sai cấu trúc, không đủ/quá số file hoặc vượt tổng dung lượng. Không công bố ảnh nào; vượt tổng request trả HTTP 413.
- Lỗi cấp file: vượt dung lượng riêng, file giả/hỏng hoặc vượt pixel. Từ chối file đó, vẫn giữ kết quả các file hợp lệ trong request hợp lệ.
- Chỉ xử lý/công bố sau khi toàn multipart đã kết thúc và vượt qua kiểm tra cấp request.
- Response request hợp lệ có kết quả cho từng index đầu vào, kể cả khi filename trùng nhau.
- Kết quả thành công chứa photo ID và thông tin cần để mở ảnh; kết quả thất bại chứa mã lỗi và thông báo an toàn, không lộ đường dẫn nội bộ hoặc credential.

## 4. Kiểm tra và chuẩn hóa ảnh

- Đối chiếu chữ ký file với JPEG/PNG; không tin extension hay MIME do browser gửi.
- Đặt giới hạn pixel cho decoder trước khi giải mã toàn bộ.
- Kiểm tra giải mã thực, từ chối ảnh hỏng hoặc thiếu bytes dù chữ ký đúng.
- Áp dụng EXIF orientation để pixels đúng hướng trước khi bỏ metadata.
- File công khai không giữ EXIF, đặc biệt tọa độ GPS.
- Sinh WebP ở các ngưỡng chiều rộng 320, 960 và 1600px, giữ tỷ lệ.
- Không phóng lớn nguồn và không tạo hai variant trùng chiều rộng.
- Với mỗi ngưỡng, chiều rộng đầu ra là giá trị nhỏ hơn giữa chiều rộng nguồn đã chuẩn hóa và ngưỡng; loại các chiều rộng trùng.
- Ghi nhận width, height và bytes thực tế của từng file đã sinh.
- Không lưu bản gốc để phục vụ editor vì editor ngoài phạm vi.

## 5. Database và storage

### 5.1. Dữ liệu

| Thực thể | Dữ liệu chính |
| --- | --- |
| `Photo` | ID, title, alt, kích thước sau chuẩn hóa, trạng thái, thời gian tạo |
| `PhotoVariant` | Photo ID, width, height, MIME, bytes, storage key duy nhất |
| `CleanupJob` hoặc manifest bền vững | Upload/photo ID, các key cần dọn và trạng thái phục hồi |

- Database không lưu bytes ảnh, đường dẫn tuyệt đối hoặc credential.
- Storage key do server tạo; không ghép filename người dùng vào đường dẫn lưu.
- Không dùng URL hoặc signed URL làm định danh thay storage key.
- Photo có một PhotoVariant cho mỗi chiều rộng thực sự được tạo.

### 5.2. Hợp đồng SeaweedFS

Teammate phụ trách hạ tầng cung cấp và xác nhận:

- S3 endpoint, region, bucket, path-style và yêu cầu TLS.
- Credential có quyền cần thiết trong bucket/prefix được cấp; chỉ sử dụng phía backend.
- Hoạt động PUT, GET, HEAD và DELETE qua S3 gateway.
- Bucket private; browser không nhận credential hoặc quyền ghi object.
- Dữ liệu và cấu hình SeaweedFS tồn tại qua restart nhờ storage/volume bền vững.
- Quy tắc key dự kiến: `photos/<photoId>/<width>.webp`, photo ID duy nhất và URL không bị ghi đè nội dung.

Backend Gallery chịu trách nhiệm vòng đời file và cleanup. Không tự chuyển sang local storage khi SeaweedFS lỗi. `.env.example` chỉ có cấu hình mẫu, không chứa endpoint/credential thật nhạy cảm.

## 6. Tính nhất quán, lỗi và phục hồi

### 6.1. Công bố

1. Hoàn tất staging và kiểm tra cấp request.
2. Kiểm tra file và sinh các variant.
3. Ghi bền vững upload ID và danh sách key dự kiến trước khi PUT.
4. Ghi đủ variant lên storage.
5. Transaction tạo Photo và toàn bộ PhotoVariant.
6. Chỉ sau DB commit mới trả thành công và cho phép Gallery/media truy cập ảnh.

- Transaction DB không được xem là cơ chế tự rollback storage.
- Lỗi sinh/ghi variant hoặc transaction thất bại: dọn file tạm và các key đã có thể được ghi.
- Cleanup thất bại phải giữ key bền vững để xử lý lại, không chỉ thông báo thành công giả.
- Recovery sau restart đối chiếu DB trước khi xóa, tránh xóa variant của ảnh đã commit.
- Kết quả các file khác trong request hợp lệ không bị rollback chỉ vì một file xử lý lỗi.

### 6.2. Xóa

1. Kiểm tra quyền quản lý.
2. Transaction ẩn ảnh khỏi Gallery và ghi công việc cleanup.
3. Xóa toàn bộ variant theo cách idempotent; file đã không tồn tại không làm thao tác thất bại.
4. Khi dọn thành công mới xóa metadata hoặc đánh dấu đã dọn xong.

Không xóa mất danh sách key trước khi dọn file. Nếu storage lỗi, ảnh vẫn ẩn và công việc cleanup còn đủ dữ liệu để tiếp tục sau restart.

## 7. Gallery, chi tiết và chia sẻ

- Gallery responsive trên mobile, tablet và desktop, có phân trang để không tải toàn bộ danh sách cùng lúc.
- Trang chi tiết có ảnh lớn, title, alt phù hợp và link chia sẻ trực tiếp.
- Form upload cho chọn nhiều file, nhập mô tả từng ảnh và hiển thị kết quả theo index.
- Giao diện có trạng thái đang tải, rỗng, lỗi và kết quả thao tác rõ ràng.
- Delete có xác nhận và chỉ xuất hiện cho người có quyền quản lý; backend luôn kiểm quyền độc lập.
- Public có quyền xem Gallery, trang chi tiết và media của ảnh đã công bố.
- Dùng Clipboard API khi khả dụng để sao chép link; luôn có link văn bản có thể sao chép thủ công.
- Nội dung mô tả được render như text, không chèn HTML từ người dùng.

### 7.1. Quyền quản lý

- Không xây hệ thống tài khoản; dùng capability quản lý ngẫu nhiên, đủ mạnh, cấu hình ngoài source.
- Capability được gửi qua request đăng nhập quản lý, không đặt trong URL.
- Sau xác thực, dùng phiên phía server và cookie HttpOnly, SameSite=Strict; bật Secure khi triển khai HTTPS.
- Thao tác ghi kiểm tra phiên và Origin phù hợp; không cho phép cross-origin tùy ý.
- Có đăng xuất; không lưu capability vào URL, localStorage hoặc link chia sẻ.
- Public không có quyền upload/xóa dù tự gọi API.
- Các link công khai không chứa quyền quản lý. Nội dung công khai có thể được bất kỳ người nhận link xem và tải xuống.

## 8. Component StampPhoto

### 8.1. Hình thức

- Mô phỏng tem bưu chính: nền giấy và lỗ đục bán nguyệt đều nhau trên cả bốn cạnh.
- Dùng CSS Mask hoặc SVG Mask; ưu tiên CSS radial-gradient đơn giản, không sửa file ảnh.
- Lỗ đục trong suốt thực, không giả bằng cách tô màu trùng nền trang.
- Ảnh nằm trong phần giấy có padding đồng nhất trên bốn cạnh.
- Bán kính lỗ và khoảng cách lỗ phải giữ phần giấy còn lại hợp lệ, không đục vào ảnh.
- Có thể đặt shadow trên wrapper ngoài mask nếu cần; không làm mất mask hoặc che ảnh.

### 8.2. Responsive và API tùy chỉnh

- Component JavaScript dùng lại cho Gallery và trang chi tiết, nhận dữ liệu ảnh và biến thể hiện có.
- Mặc định `width: 100%; height: auto`, giữ tỷ lệ tự nhiên, không crop.
- Nếu bố cục dùng vùng cố định, dùng `object-fit: contain`, không kéo giãn ảnh.
- CSS variables dự kiến:

| Biến | Vai trò |
| --- | --- |
| `--stamp-paper` | Màu giấy |
| `--stamp-border` | Độ dày viền giấy |
| `--stamp-hole-radius` | Bán kính lỗ đục |
| `--stamp-hole-spacing` | Khoảng cách/mật độ lỗ |
| `--stamp-width` | Chiều rộng khung, bị giới hạn bởi container |

- Công bố các giới hạn giá trị để tránh lỗ chồng nhau hoặc xuyên vào ảnh.
- Browser không hỗ trợ mask vẫn hiển thị ảnh với viền giấy thường.
- Không dùng canvas, editor, observer hoặc resize listener riêng cho từng ảnh.

## 9. Responsive images và phân phối

- `<img>` có `srcset`, `sizes`, `width`, `height`, `alt` và `loading` phù hợp.
- `srcset` chỉ chứa variant tồn tại với width descriptor đúng kích thước thực.
- `sizes` phản ánh chiều rộng vùng ảnh trong bố cục, có xét phần viền tem.
- Lazy-load ảnh ngoài viewport; ảnh chính cần thiết không bị trì hoãn vô ích.
- Giữ chỗ theo tỷ lệ ảnh trước khi tải để giảm layout shift.
- Backend kiểm tra Photo đã công bố trước khi stream variant từ SeaweedFS.
- Media trả `Content-Type: image/webp`, Content-Length thực tế, ETag và Cache-Control phù hợp.
- Ảnh công khai dùng URL nội dung bất biến và cache dài hạn, dự kiến `public, max-age=31536000, immutable`.
- Không cache công khai response lỗi hoặc nội dung quản lý.
- Nếu sau này thay nội dung ảnh phải dùng URL/key mới, không ghi đè URL đã cache.
- Xóa ở origin không thu hồi ảnh đã tải hoặc còn trong browser/cache; giao diện/tài liệu phải nêu rõ giới hạn này.

## 10. API dự kiến

| Method | Endpoint | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/photos` | Public | Danh sách có phân trang và variant |
| GET | `/api/photos/:id` | Public | Chi tiết ảnh đã công bố |
| POST | `/api/photos` | Quản lý | Upload multipart, trả kết quả từng index |
| DELETE | `/api/photos/:id` | Quản lý | Ẩn ảnh và dọn file/metadata |
| POST | `/api/manage/session` | Capability hợp lệ | Tạo phiên quản lý |
| DELETE | `/api/manage/session` | Phiên quản lý | Đăng xuất |
| GET | `/media/...` | Public | Stream variant của ảnh đã công bố |
| GET | `/photos/:id` | Public | Trang chi tiết có link chia sẻ |

Hợp đồng triển khai phải ghi rõ status code, schema response, pagination, trạng thái cleanup đang chờ và lỗi không tìm thấy. Không trả key/đường dẫn tùy ý do client cung cấp để truy cập storage.

## 11. Plan triển khai — chia trực tiếp cho 4 người

Mỗi người triển khai, kiểm thử và viết hướng dẫn cho phần mình. Người 3 phụ trách SeaweedFS; Người 1 tích hợp backend và cấu hình chạy chung.

### Phần 1 — Người 1: Nền tảng, database và quyền quản lý

**Sở hữu:** entry point/config backend, `api/prisma/`, module database, phiên quản lý, routes danh sách/chi tiết/DELETE và scripts/dependency chung.

- [ ] Khởi tạo ứng dụng Express độc lập trong `week9/`, cấu hình môi trường và lệnh chạy.
- [ ] Tạo schema/migration cho Photo, PhotoVariant và trạng thái cleanup; DB lưu bền, không lưu bytes ảnh.
- [ ] Chốt schema API, pagination, lỗi, multipart metadata và các interface tích hợp với ba người còn lại.
- [ ] Xây phiên quản lý bằng capability, cookie an toàn, đăng xuất và kiểm tra quyền/Origin.
- [ ] Xây GET danh sách và chi tiết; chỉ trả ảnh đã công bố.
- [ ] Xây service transaction công bố Photo/variants sau khi storage đã ghi đủ.
- [ ] Xây DELETE: transaction ẩn ảnh và giữ key cần dọn; chỉ hoàn tất metadata khi cleanup thành công.
- [ ] Phối hợp Người 3 chốt manifest/recovery, không tạo hai cơ chế cleanup cạnh tranh.
- [ ] Kiểm chứng public không ghi được, DB lỗi không công bố ảnh và recovery không xóa ảnh đã commit.
- [ ] Tích hợp backend, scripts và README tổng hợp.

**Bàn giao:** migration, API metadata/quản lý, interface transaction, hướng dẫn cấu hình và bằng chứng DB/quyền truy cập.

### Phần 2 — Người 2: Upload, kiểm tra và xử lý ảnh

**Sở hữu:** route POST upload, module multipart/staging/Sharp trong `api/src/`, fixture và kiểm thử đầu vào.

- [ ] Nhận streaming multipart gồm `photos` và `metadata`, nối kết quả theo index từ 0.
- [ ] Áp dụng 1–5 file, 10 MiB/file và 55 MiB toàn request; không giữ toàn bộ request trong RAM.
- [ ] Phân biệt lỗi cấp request và lỗi cấp file; chỉ xử lý/công bố sau khi multipart hoàn tất hợp lệ.
- [ ] Kiểm tra signature JPEG/PNG, tối đa 40 triệu pixel và giải mã thực; từ chối file giả/hỏng.
- [ ] Chuẩn hóa EXIF orientation trước khi loại metadata/GPS.
- [ ] Sinh WebP 320/960/1600px theo kích thước nguồn, không upscale hoặc trùng chiều rộng.
- [ ] Giới hạn concurrency; ghi nhận MIME, width, height và bytes thực tế.
- [ ] Nối variant với storage/service công bố của Người 1 và Người 3; trả kết quả riêng từng file.
- [ ] Dọn staging khi hoàn tất, lỗi hoặc client ngắt kết nối.
- [ ] Chuẩn bị fixture và kiểm chứng ảnh hợp lệ/giả/truncated, EXIF/GPS, ảnh nhỏ, giới hạn bytes/pixel và request sai cấu trúc.

**Bàn giao:** pipeline upload/Sharp, hợp đồng variant, response theo index, fixture và bằng chứng kiểm tra đầu vào.

### Phần 3 — Người 3: SeaweedFS, media và phục hồi storage

**Sở hữu:** hạ tầng SeaweedFS, `api/src/storage/`, module media, worker cleanup/recovery và cấu hình S3 mẫu.

- [ ] Cấu hình S3 gateway, bucket private, credential tối thiểu và volume bền vững; xác nhận endpoint/region/path-style/TLS.
- [ ] Xây adapter PUT/GET/HEAD/DELETE, dùng key server tạo, không nhận đường dẫn tùy ý từ client.
- [ ] Cùng Người 1 chốt nơi lưu manifest/cleanup và quyền cập nhật trạng thái; ghi manifest bền trước PUT.
- [ ] Ghi đủ variant trước khi gọi transaction công bố; không fallback sang local khi S3 lỗi.
- [ ] Dọn object khi PUT/DB thất bại; giữ đủ key bền vững nếu cleanup chưa xong.
- [ ] Xây recovery sau restart: đối chiếu DB trước khi xóa và xử lý idempotent.
- [ ] Nhận cleanup từ luồng DELETE; báo hoàn tất để Người 1 xử lý metadata.
- [ ] Stream media sau khi kiểm tra Photo đã công bố; trả đúng MIME, Content-Length, ETag và Cache-Control.
- [ ] Kiểm chứng persistence, lỗi PUT/delete, restart giữa các bước và không xóa object của ảnh đã commit.
- [ ] Viết hướng dẫn SeaweedFS, kiểm tra object và phục hồi; không đưa credential xuống frontend hoặc vào tài liệu.

**Bàn giao:** SeaweedFS hoạt động thật, adapter storage, endpoint media, cleanup/recovery và bằng chứng object/header/restart.

### Phần 4 — Người 4: Frontend, StampPhoto và chia sẻ

**Sở hữu:** toàn bộ `web/`, gồm component `StampPhoto`, giao diện Gallery và UI quản lý.

- [ ] Xây Gallery có phân trang, trang chi tiết và trạng thái loading/rỗng/lỗi.
- [ ] Xây form chọn nhiều ảnh, nhập title/alt từng file; dùng FormData và hiển thị kết quả theo index.
- [ ] Xây UI đăng nhập/đăng xuất quản lý và xác nhận xóa; xử lý trạng thái cleanup đang chờ.
- [ ] Xây StampPhoto tái sử dụng với CSS/SVG Mask, lỗ bán nguyệt trong suốt đều trên bốn cạnh.
- [ ] Dùng viền giấy đồng nhất; tùy chỉnh màu giấy, độ dày viền, bán kính/khoảng cách lỗ và chiều rộng bằng CSS variables.
- [ ] Giữ tỷ lệ tự nhiên, không méo/crop; không canvas, editor hoặc resize listener riêng từng ảnh; có fallback khi không hỗ trợ mask.
- [ ] Tích hợp srcset/sizes/width/height/alt và lazy loading phù hợp với variant thực tế.
- [ ] Xây link chia sẻ trang chi tiết, sao chép link và fallback thủ công; không chứa capability quản lý.
- [ ] Nối API thật; render text an toàn và không lưu capability vào URL/localStorage.
- [ ] Kiểm chứng browser mobile/desktop, ảnh ngang/dọc/vuông, nền khác màu; ghi Network/currentSrc và DPR.

**Bàn giao:** frontend chạy với API/SeaweedFS thật, StampPhoto tùy chỉnh được, bằng chứng responsive và link public không có quyền ghi.

### 11.1. Hợp đồng phối hợp bắt buộc

- **Người 1 + Người 2:** schema multipart/response, status code và service công bố; không công bố trước khi request hợp lệ hoàn toàn.
- **Người 1 + Người 3:** trạng thái Photo, key dự kiến, manifest/cleanup job, transaction và recovery cho khoảng thời gian đã PUT nhưng chưa commit DB.
- **Người 2 + Người 3:** variant gồm file tạm, MIME, width, height, bytes; thống nhất concurrency, đóng stream và thời điểm xóa file tạm.
- **Người 1 + Người 4:** danh sách/chi tiết/pagination, phiên quản lý, lỗi API và trạng thái xóa.
- **Người 3 + Người 4:** URL media bất biến, width descriptor thực tế, cache và giới hạn thu hồi ảnh đã tải.
- Mỗi người sở hữu kiểm thử riêng; Người 1 tích hợp dependency/scripts và README chung để tránh sửa chồng.

### 11.2. Thứ tự triển khai và nghiệm thu chung

1. **Chốt nền tảng:** Người 1 dựng skeleton/schema, Người 3 xác nhận S3 thật; cả nhóm chốt các interface ở mục 11.1.
2. **Làm song song:** mỗi người triển khai phần sở hữu; frontend có thể dựng theo contract nhưng dữ liệu minh họa không tính là nghiệm thu.
3. **Tích hợp ghi:** Người 1, 2 và 3 nối upload → variant → manifest/PUT → DB commit; kiểm lỗi và cleanup.
4. **Tích hợp đọc/xóa:** Người 4 nối API thật; Người 1 và 3 hoàn tất ẩn ảnh → dọn object → hoàn tất metadata.
5. **Nghiệm thu:** đối chiếu request, DB, object và browser bằng cùng photo ID; hoàn thành ma trận ở mục 12 và tài liệu ở mục 13.

Không giao riêng một người chỉ làm báo cáo/kiểm thử. Quyền truy cập, nhánh lỗi và phục hồi phải được tích hợp đầy đủ, không để thành phần việc chưa có người nhận.

## 12. Ma trận nghiệm thu

| Nhóm | Tình huống | Kết quả phải quan sát |
| --- | --- | --- |
| Upload | JPEG và PNG hợp lệ | Có Photo và PhotoVariant tương ứng, response đúng index |
| Upload | Trộn file thật với text đổi đuôi | Chỉ file hợp lệ được lưu |
| Upload | Filename trùng nhau | Response vẫn nối đúng từng index |
| Request | 0/6 file, metadata/multipart sai | Không công bố ảnh nào |
| Giới hạn | Sát/vượt 10 MiB, 55 MiB và 40 triệu pixel | Phân biệt lỗi cấp file/request; không lưu ảnh bị từ chối |
| Giải mã | Ảnh thiếu bytes hoặc hỏng | Bị từ chối dù chữ ký hợp lệ |
| Chuẩn hóa | JPEG có orientation và GPS giả lập | Đúng hướng; kiểm metadata chứng minh không còn GPS/EXIF |
| Variant | Nguồn nhỏ và nguồn lớn | Không upscale/trùng width; tối đa ba WebP đúng tỷ lệ |
| Nhất quán | PUT hoặc DB lỗi sau khi ghi file | Không công bố thiếu; file được dọn hoặc có key phục hồi bền vững |
| Recovery | Restart giữa các bước ghi/cleanup | Không xóa ảnh đã commit; công việc dọn tiếp tục được |
| Persistence | Restart web server và SeaweedFS | Gallery và media đã lưu vẫn hoạt động |
| Xóa | Xóa thường, xóa khi storage lỗi, chạy lại cleanup | Ẩn trước; không mất key; cuối cùng không còn file/metadata cần dọn |
| Quyền | Public gọi POST/DELETE, request cross-origin | Không có quyền ghi; không rò capability trong link |
| Phân phối | GET media thực | MIME, cache header, length đúng; URL bất biến |
| Responsive | Viewport mobile/desktop, ghi nhận DPR và currentSrc | Browser chọn variant phù hợp, không mặc định file lớn nhất |
| DOM | Kiểm phần tử ảnh | Có srcset, sizes, width, height, loading và alt |
| StampPhoto | Ảnh ngang/dọc/vuông, nền khác màu, nhiều cấu hình | Lỗ trong suốt bốn cạnh, viền đều, ảnh không méo/crop |
| Chia sẻ | Mở link trong phiên không có quyền quản lý | Xem được ảnh công khai, không upload/xóa được |

## 13. Bằng chứng và tài liệu bàn giao

- README: cài đặt, cấu hình, migration, chạy app, giới hạn và cách cleanup/recovery.
- `.env.example`: mẫu DB, SeaweedFS, quản lý; không có secrets thật.
- Hợp đồng API và tích hợp S3, trách nhiệm backend/hạ tầng.
- Cách tạo fixture tái hiện: JPEG/PNG, orientation/GPS giả lập, file giả/hỏng và vượt giới hạn.
- Network multipart, response theo index, GET media, currentSrc tại hai viewport và DPR.
- Truy vấn Photo/PhotoVariant và danh sách object dùng cùng photo ID của một lần chạy.
- Bằng chứng lỗi DB/storage, restart và dọn file; không chỉ ảnh chụp giao diện.
- Che credential và thông tin nội bộ nhạy cảm trong mọi bằng chứng.

## 14. Điều kiện hoàn tất

Hoàn tất khi toàn bộ luồng upload → kiểm tra → chuẩn hóa → lưu → công bố → xem/chia sẻ → xóa hoạt động với SeaweedFS thật; các giới hạn và nhánh lỗi có bằng chứng; StampPhoto responsive được kiểm tra trên browser; dữ liệu tồn tại qua restart và tài liệu đủ để người khác chạy lại. Không dùng mock, fallback giả hoặc editor thay cho các yêu cầu cốt lõi.
