# Upload, xử lý, lưu trữ và

# phân phối ảnh

MSc. Ngô Ngọc Đăng Khoa

Phát triển ứng dụng web

# Nội dung

## Photo Gallery

1. Request upload
2. Kiểm tra và xử lý ảnh
3. Lưu trữ và phân phối ảnh
4. Bài tập Photo Gallery
5. Bonus: chỉnh sửa ảnh

Phát triển ứng dụng web

# Luồng ghi và luồng đọc

Luồng ghi
Luồng đọc
Người đăng ảnh
Photo Gallery
Người xem ảnh

Browser
Ảnh đã công bố
Browser
File tải lên
File tải về
Kiểm tra file trước khi công bố
Tải ảnh để hiển thị
Phát triển ứng dụng web

# Mục tiêu đầu ra

* Gửi file ảnh và trường mô tả trong cùng một request.
* Kiểm tra file trước khi cho phép người khác xem ảnh.
* Lưu thông tin mô tả tách khỏi file ảnh.
* Giảm lượng dữ liệu browser phải tải để hiển thị ảnh.

Phát triển ứng dụng web

# Request upload

## Browser gửi text và file trong cùng request

Phát triển ứng dụng web

# Đường đi của ảnh

Ghi ảnh
Đọc ảnh

Browser
Web server
Kho file
Cơ sở dữ liệu
Browser
Webserver

POST file và mô tả

Kiểm tra và xử lý ảnh
File ảnh đã xử lý
Tiêu đề, kích thước ảnh
GET trang gallery
Danh sách ảnh và URL
GET URL ảnh
Bytes của file ảnh

# Multipart request

> Multipart chia body thành các phần để gửi trường mô tả và file trong cùng một request.

Content-Type: multipart/form-data; boundary=gallery
Body theo thứ tự truyền

Text part
name="title"
Bờ biển
File part
name="photos"
Bytes của bien.jpg
File part
name="photos"
Bytes của ho.png

--gallery
--gallery
--gallery
--gallery--
Phát triển ứng dụng web

# FormData

* `FormData` gom trường text và các đối tượng `File`.
* Nhiều file có thể dùng chung tên trường `photos`.
* Khi gửi bằng `fetch`, browser tạo body và header chứa boundary.

Phát triển ứng dụng web

# Kết quả từng file

| Phạm vi lỗi | Ví dụ | Hệ quả |
| --- | --- | --- |
| Request | Sai cấu trúc, quá số file hoặc quá tổng bytes | Không công bố ảnh nào |
| File | File hỏng hoặc vượt giới hạn riêng | Từ chối file đó, giữ kết quả của file hợp lệ |

* Response gắn mỗi kết quả với **index** của file trong request.

Phát triển ứng dụng web

# Kiểm tra và xử lý ảnh

## Từ file chưa tin cậy đến ảnh có thể công bố

Phát triển ứng dụng web

# Kiểm tra ảnh

1. **Giới hạn bytes:** dừng nhận khi file hoặc request vượt ngưỡng.
2. **Nhận dạng:** đối chiếu chữ ký file với JPEG hoặc PNG.
3. **Giới hạn pixel:** kiểm tra chiều rộng nhân chiều cao trước khi giải mã toàn bộ.
4. **Giải mã:** từ chối ảnh hỏng dù chữ ký ban đầu đúng.

Phát triển ứng dụng web

# Giới hạn tài nguyên

| Giới hạn | Giá trị bài tập | Bằng chứng |
| --- | --- | --- |
| Số file | 1 đến 5 | Response theo từng index |
| Mỗi file | Tối đa 10 MiB | File vượt ngưỡng không được lưu |
| Tổng request | Tối đa 55 MiB | Server trả `413` |
| Số pixel | Tối đa 40 triệu pixel | Decoder từ chối trước khi giải mã toàn bộ |

Phát triển ứng dụng web

# Chuẩn hóa trước khi công bố

> EXIF có thể lưu hướng hiển thị và tọa độ GPS ngay trong file ảnh.

File nhận từ browser
Ảnh đã chuẩn hóa

Pixels lưu ngang
EXIF: cần xoay 90°
EXIF: có tọa độ GPS
Pixels đúng hướng
Không giữ EXIF

Xoay pixels
Rồi bỏ EXIF

Phát triển ứng dụng web

# Variant ảnh

> Variant là file được tạo từ ảnh gốc ở một kích thước khác hoặc ở định dạng khác.

WebP, giữ tỉ lệ ảnh gốc

320 pxThumbnail
960 pxVùng cỡ vừa
1600 pxVùng hiển thị lớn
Phát triển ứng dụng web

# File và metadata

### File storage

* Storage giữ **bytes WebP** của từng variant.
* **Storage key** là mã do server tạo để tìm file đã lưu.

### Cơ sở dữ liệu (DB)

* DB giữ **title, kích thước và storage key**.
* DB không giữ bytes ảnh hoặc đường dẫn tuyệt đối.
* Web server dùng storage key để tạo URL tải ảnh.

Phát triển ứng dụng web

# Metadata của ảnh

| Bản ghi | Lưu gì | Vì sao |
| --- | --- | --- |
| `Photo` | Tiêu đề, văn bản thay thế (alt text) | Mô tả một ảnh trong gallery |
| `PhotoVariant` | Chiều rộng, chiều cao, MIME, số bytes, storage key | Mô tả một file đã sinh |

* Một `Photo` có một `PhotoVariant` cho mỗi chiều rộng đã tạo.

Phát triển ứng dụng web

# Lưu trữ ảnh

## Giữ ảnh sau restart và khi thay web server

Phát triển ứng dụng web

# Local filesystem

> Local filesystem đủ cho một web server và không yêu cầu dịch vụ lưu trữ riêng.

| Khái niệm | Ví dụ |
| --- | --- |
| Thư mục gốc | `/srv/gallery-uploads` |
| Storage key trong DB | `photos/p01/960.webp` |

* Web server ánh xạ storage key vào thư mục gốc.
* Đặt thư mục upload ngoài source code, trên ổ đĩa bền vững.

Phát triển ứng dụng web

# Object storage

Ổ đĩa riêng
Object storage dùng chung

Web server A
Web server B
Web server A
Web server B
Ổ đĩa A
Ổ đĩa B
Bucket chung

HTTP API
Có ảnh A đã ghi
Không có ảnh đó
Cả A và B đọc được ảnh A đã ghi
File gắn với ổ đĩa của từng máy
Object: key, bytes, loại nội dung
Phát triển ứng dụng web

# S3-compatible API

* Amazon S3 cung cấp các thao tác ghi, đọc, liệt kê và xóa object.
* Sản phẩm tương thích triển khai các thao tác theo contract S3.
* Server cấu hình địa chỉ S3, tên bucket và thông tin xác thực.

Phát triển ứng dụng web

# SeaweedFS và MinIO

### SeaweedFS

* SeaweedFS cung cấp S3 API qua gateway.
* Web server đọc và ghi ảnh qua gateway này.

### MinIO

* MinIO cung cấp kho object tương thích S3.
* Web server đọc và ghi ảnh qua cùng các thao tác S3.

Bài cốt lõi lưu ảnh trên ổ đĩa của web server. SeaweedFS và MinIO là tùy chọn.

Phát triển ứng dụng web

# Ghi một ảnh

1. **Kiểm tra:** xác nhận file hợp lệ và tạo photoId.
2. **Xử lý:** sinh các variant trước khi công bố.
3. **Lưu:** ghi đủ file, rồi ghi metadata trong DB transaction.
4. **Công bố:** commit DB rồi trả kết quả thành công.

Phát triển ứng dụng web

# Lỗi từng bước

> Giao dịch DB không hoàn tác các file đã ghi vào kho.

| Điểm lỗi | Metadata | File cần xử lý |
| --- | --- | --- |
| Kiểm tra hoặc giải mã | Không ghi | Xóa file tạm |
| Sinh hoặc ghi variant | Không ghi | Xóa variant đã tạo |
| Giao dịch DB thất bại | Hủy thay đổi | Xóa các file vừa ghi |
| Commit thành công | Đủ bản ghi | Giữ đủ variant |

Phát triển ứng dụng web

# Xóa ảnh

1. **Ẩn ảnh:** đánh dấu ảnh không còn được công bố.
2. **Dọn file:** xóa mọi variant và bản gốc nếu có.
3. **Hoàn tất:** xóa metadata hoặc đánh dấu bản ghi đã dọn xong.

Phát triển ứng dụng web

# Phân phối ảnh

## Giảm dữ liệu tải và số lượt đọc từ nguồn

Phát triển ứng dụng web

# Phục vụ ảnh từ origin

* **Origin** là nguồn cung cấp file ảnh, trong bài tập là web server.
* Nếu browser chưa lưu bản dùng lại được, nó tải ảnh từ origin.
* Người dùng ở xa origin có thể chờ phản hồi lâu hơn.
* Khi nhiều người tải cùng ảnh, origin phải gửi lại các bytes đó.

Phát triển ứng dụng web

# CDN phân phối ảnh

> CDN là mạng máy chủ phân phối. Máy chủ CDN có thể lưu bản sao ảnh và trả ảnh cho browser thay cho origin.

Cache hit
Cache miss

Browser
Browser
Máy chủ CDN
Máy chủ CDN
Origin
Origin

Có bản cache còn hạn
Không có cache còn hạn
Không nhận request
GET ảnh
Bytes ảnh
GET ảnh
Bytes ảnh
GET ảnh
Bytes ảnh
Phát triển ứng dụng web

# HTTP cache

`GET /media/photos/p01/960.webp HTTP/1.1
HTTP/1.1 200 OK
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable`

* Chỉ cho phép **cache dùng chung** đối với ảnh công khai.
* Khi nội dung ảnh thay đổi, gallery dùng **URL mới**.
* Xóa ảnh ở origin không xóa bản đã lưu trong cache.

Phát triển ứng dụng web

# Responsive image

`<img
src="/media/photos/p01/960.webp"
srcset="/media/photos/p01/320.webp 320w,
/media/photos/p01/960.webp 960w,
/media/photos/p01/1600.webp 1600w"
sizes="(max-width: 600px) 100vw, 33vw"
width="960" height="640"
loading="lazy"
alt="Bờ biển lúc chiều">`
Phát triển ứng dụng web

# Browser chọn variant

* Tab **Network** trong DevTools cho biết URL ảnh đã tải.
* `currentSrc` là URL file mà phần tử `<img>` đang dùng.
* Browser chọn file theo chiều rộng ô ảnh và mật độ điểm ảnh.
* Browser có thể dùng lại file đã tải từ cache.

Một cột
Ba cột
Ảnh
Ảnh
100vw
33vw mỗi ô

Phát triển ứng dụng web

# Bài tập

## Xây Photo Gallery end-to-end

Phát triển ứng dụng web

# Bài tập

## Sản phẩm cần hoàn thành

* Form upload nhận **1 đến 5 ảnh** trong một request.
* Server sinh variant và lưu metadata theo từng file.
* Gallery responsive có trang chi tiết và thao tác xóa.
* Local filesystem giữ file sau khi restart web server.

Phát triển ứng dụng web

# Bài tập

## Dữ liệu kiểm thử

* Chuẩn bị JPEG, PNG và ảnh có **EXIF orientation**.
* Dùng tọa độ giả lập cho ảnh có thông tin GPS trong EXIF.
* Chuẩn bị file text đổi đuôi và file ảnh thiếu bytes ở cuối.
* Chuẩn bị ảnh vượt giới hạn dung lượng hoặc số pixel.

Phát triển ứng dụng web

# Bài tập

## Yêu cầu cốt lõi

* Response trả **kết quả riêng** cho từng file.
* Ảnh hợp lệ được chuẩn hóa và sinh tối đa ba variant.
* DB lưu storage key, không lưu đường dẫn tuyệt đối.
* Gallery dùng `srcset`, `sizes`, kích thước và alt text.
* Xóa ảnh khỏi gallery rồi dọn metadata và file liên quan.

Phát triển ứng dụng web

# Bài tập

## Nghiệm thu upload

| Thao tác | Kết quả cần quan sát |
| --- | --- |
| Upload JPEG và PNG | Có Photo và các PhotoVariant tương ứng |
| Trộn file hợp lệ và file giả | Chỉ file hợp lệ được lưu |
| Vượt ngưỡng byte hoặc pixel | Không lưu bản ghi hay file của ảnh bị từ chối |
| DB lỗi sau khi ghi file | Xóa file mới hoặc lưu key để dọn lại |
| Restart web server | Gallery và URL media vẫn hoạt động |

Phát triển ứng dụng web

# Bài tập

## Nghiệm thu hiển thị

* Network cho thấy gallery tải **variant phù hợp**, không mặc định tải file lớn nhất.
* Response media có đúng `Content-Type` và `Cache-Control`.
* DOM có `srcset`, `sizes`, `width`, `height`, `loading` và `alt`.
* Ảnh sau xử lý hiển thị đúng hướng và không còn tọa độ GPS trong EXIF.
* Khi dọn xong, kho không còn file; DB xóa bản ghi hoặc đánh dấu đã dọn.

Phát triển ứng dụng web

# Bài tập

## Bằng chứng nộp

* Network của multipart, response từng file và GET media.
* Truy vấn `Photo`, `PhotoVariant` và danh sách key tương ứng.
* Kết quả kiểm tra file giả, file ảnh thiếu bytes và ảnh vượt giới hạn.
* Kết quả sau khi khởi động lại và sau khi dọn file do lỗi lưu.
* Cấu hình mẫu cho nơi lưu ảnh, không chứa thông tin xác thực thật.

Phát triển ứng dụng web

# Bonus: chỉnh sửa ảnh

## Crop, xoay, lật và khôi phục

Phát triển ứng dụng web

# Bản gốc và bản công bố

> Mỗi lần chỉnh sửa bắt đầu từ bản gốc đã chuẩn hóa, không từ variant đã nén.

* Browser cho xem trước kết quả rồi gửi thông số chỉnh sửa.
* Server kiểm tra thông số rồi tạo các variant để công bố.
* Các variant sau chỉnh sửa không giữ EXIF.

Phát triển ứng dụng web

# Phép chỉnh sửa

* **Crop:** giữ vùng chữ nhật hợp lệ trong ảnh gốc.
* **Xoay:** chỉ nhận góc 0, 90, 180 hoặc 270 độ.
* **Lật ngang:** nhận giá trị boolean từ request.
* **Khôi phục:** sinh lại variant từ bản gốc chuẩn hóa.

Phát triển ứng dụng web

# Version chỉnh sửa

1. **Tạo bộ file mới:** ghi các variant dưới tiền tố `photos/p01/v2/`.
2. **Ghi metadata:** thêm các bản ghi `PhotoVariant` của version mới.
3. **Công bố:** cập nhật `currentVersion` khi đủ file và metadata.
4. **Dọn bản cũ:** xóa các file theo thời hạn nhóm ghi trong README.

Phát triển ứng dụng web

# Q & A

## Photo Gallery

Phát triển ứng dụng web

Previous slidePage 1 of 42Next slideToggle fullscreenToggle overview viewOpen presenter view

Speaker note: Mũi tên chỉ chiều đi của bytes ảnh, không phải chiều của từng HTTP request. Luồng ghi bắt đầu khi người đăng chọn file. Ở luồng đọc, browser yêu cầu ảnh cần hiển thị. Một response upload thành công chưa chứng minh người xem đã tải được ảnh.

Speaker note: Hai quyết định cần tách riêng: file nằm ở đâu và thành phần nào trả file khi browser yêu cầu. Một web server có thể làm cả hai trong bài tập. Khi đánh giá kết quả, đối chiếu dữ liệu gửi lên, file được lưu và file browser thực sự tải.

Speaker note: Browser gửi một POST chứa tiêu đề và file. Web server kiểm tra đầu vào rồi lưu file đã xử lý và thông tin mô tả vào hai nơi riêng. Nửa phải minh họa cách phục vụ trực tiếp trong bài tập. Khi mở gallery, browser nhận danh sách ảnh kèm URL rồi gửi GET riêng để tải từng file cần hiển thị.

Speaker note: JSON không chứa binary trực tiếp. Có thể mã hóa file bằng Base64 để đưa vào JSON, nhưng body sẽ lớn hơn; multipart giữ nguyên bytes. Header của request khai báo boundary; trong body, hai dấu gạch ngang đứng trước boundary, còn dấu phân cách cuối có thêm hai dấu gạch ngang ở cuối. Mỗi part có header riêng: Content-Disposition nêu tên trường và có thể kèm filename. MIME khai báo của file part do client gửi, không chứng minh bytes là ảnh.

Speaker note: Khi truyền FormData vào fetch, không đặt thủ công Content-Type vì boundary trong header phải khớp với body do browser tạo. Thuộc tính multiple chỉ cho phép chọn nhiều file ở giao diện. Server vẫn phải kiểm tra số lượng và kích thước.

Speaker note: Chính sách theo từng file tránh buộc người dùng gửi lại các ảnh đã được chấp nhận khi chỉ một ảnh lỗi. Index nối kết quả với đầu vào ngay cả khi hai file trùng tên. Nếu tổng request vượt ngưỡng, server có thể đã đọc hoặc ghi tạm một phần body, nhưng phải dọn phần tạm và không công bố ảnh nào.

Speaker note: Extension và MIME khai báo không xác nhận loại file. Chữ ký file loại được một file text đổi đuôi nhưng chưa phát hiện file ảnh thiếu bytes ở cuối. Một file nén nhỏ vẫn có thể khai báo rất nhiều pixel, nên cần đặt giới hạn cho decoder trước khi nó cấp phát bộ đệm ảnh đầy đủ. Chỉ đổi kích thước sau khi file vượt qua các bước kiểm tra.

Speaker note: Các con số trên là giá trị giả định của bài tập, không phải mặc định cho mọi ứng dụng. Tổng request cao hơn năm lần giới hạn file để chừa multipart overhead. Nhóm phải công bố ngưỡng và tạo dữ liệu kiểm thử tương ứng. Với số pixel, kiểm phép nhân bằng kiểu số phù hợp để tránh tràn số.

Speaker note: Sơ đồ dùng một ảnh giả định: pixels lưu ngang và trường EXIF orientation chỉ hướng cần hiển thị. Nếu bỏ EXIF trước khi xoay, ảnh chụp dọc có thể hiển thị ngang. Giữ EXIF trong file công khai có thể làm lộ vị trí chụp dù giao diện không hiển thị thông tin đó. Sau khi chuẩn hóa, server tạo file WebP ở các chiều rộng cần thiết và ghi kích thước thực tế.

Speaker note: Ba khung giữ cùng tỉ lệ và được vẽ theo chiều rộng của các file khi nguồn đủ lớn. Ba ngưỡng chiều rộng tối đa là giá trị của bài tập, không phải quy tắc theo từng thiết bị. Dùng file lớn nhất cho thumbnail có thể truyền nhiều bytes hơn mức cần thiết; số pixel cần tải còn phụ thuộc vào mật độ điểm ảnh của màn hình. Nếu nguồn nhỏ hơn một ngưỡng, server không phóng lớn hoặc tạo bản trùng chiều rộng. Gallery chỉ đưa ra các lựa chọn thực sự tồn tại, kèm chiều rộng pixel của từng file.

Speaker note: File và metadata có vòng đời liên quan nhưng nằm ở hai hệ thống khác nhau. Tên file do người dùng gửi có thể dùng để hiển thị sau khi làm sạch, nhưng không được ghép vào đường dẫn lưu. Lưu key thay vì đường dẫn tuyệt đối cho phép dời thư mục lưu mà không sửa bản ghi. URL tạm thời cũng không thay thế được storage key.

Speaker note: Photo mô tả ảnh như một mục trong gallery còn PhotoVariant mô tả file cụ thể. Ví dụ, một ảnh có hai file rộng 320 px và 960 px thì có hai bản ghi PhotoVariant, mỗi bản ghi trỏ đến key riêng. MIME cho biết định dạng, chẳng hạn image/webp. Alt text mô tả nội dung ảnh thay vì lặp lại tên file.

Speaker note: Một web server có thể đọc file từ ổ đĩa gắn với máy đó. Khi chạy container, đặt thư mục upload trên volume bền vững để thay container mà không mất ảnh. Khi nhiều máy dùng các ổ đĩa riêng, máy nhận request đọc có thể không phải máy đã ghi file. Server chỉ ánh xạ key hợp lệ vào thư mục gốc.

Speaker note: Với ổ đĩa riêng, file ghi trên web server A không tự xuất hiện ở web server B. Thay web server A có thể làm ảnh mất khỏi gallery nếu ổ đĩa của nó không được giữ. Volume dùng chung cũng có thể giải quyết vấn đề nhìn thấy cùng file. Bucket là vùng chứa object mà cả hai web server truy cập qua HTTP API. Thông tin gắn với object như Content-Type mô tả file, không thay thế tiêu đề hay alt text trong DB. Nếu browser vẫn tải qua web server, máy đó vẫn phải gửi bytes ảnh.

Speaker note: API chung cho phép giữ logic đọc và ghi theo key khi đổi sang dịch vụ hỗ trợ cùng các thao tác. Điều đó không bảo đảm chính sách quyền, tính năng hoặc hành vi ngoài phạm vi bài tập giống nhau. DB giữ storage key, không giữ thông tin xác thực kết nối S3.

Speaker note: SeaweedFS là lựa chọn đề xuất cho phần tùy chọn; nhóm đã quen MinIO có thể dùng MinIO để thực hiện cùng contract S3 cơ bản. Hai sản phẩm có kiến trúc nội bộ khác nhau nhưng application nhìn thấy bucket, key và các thao tác object. Ứng dụng chọn nơi lưu khi khởi động. Tự chuyển sang local khi S3 endpoint lỗi có thể làm file nằm rải ở hai storage. Lỗi cần được trả về và giữ đủ trạng thái để xử lý lại.

Speaker note: Nếu gallery thấy một Photo trước khi đủ file, browser có thể nhận URL dẫn đến ảnh chưa tồn tại. Vì vậy ứng dụng ghi file trước và chỉ cho gallery thấy bản ghi sau khi DB commit. DB transaction giúp ghi metadata đồng bộ, nhưng không thể tự hoàn tác các file đã ghi.

Speaker note: Bảng mô tả phép bù trừ, không phải transaction xuyên DB và storage. Nếu thao tác xóa bù thất bại, ứng dụng phải lưu hoặc ghi log danh sách key cần dọn lại. Các file khác trong cùng multipart request vẫn giữ kết quả riêng. Nghiệm thu cần chủ động gây lỗi sau khi ghi variant để kiểm tra trạng thái còn lại.

Speaker note: Nếu xóa metadata trước, ứng dụng có thể mất danh sách key cần dọn khi kho file gặp lỗi. Thao tác xóa phải chạy lại được ngay cả khi một file đã không còn. Gallery không liệt kê ảnh đang chờ dọn file. Nếu cần giữ bản ghi để theo dõi, chỉ đánh dấu đã dọn xong sau khi các file không còn trong kho.

Speaker note: Phục vụ file trực tiếp là đủ khi web server đáp ứng được lưu lượng và người dùng không gặp độ trễ đáng kể. Cache là bản response được lưu để dùng lại. Browser cache của người thứ nhất không giúp người thứ hai, nên nếu không có cache dùng chung, origin vẫn dùng băng thông để gửi cùng file nhiều lần. Đổi ổ đĩa local sang object storage không tự tạo điểm phân phối gần người dùng.

Speaker note: Máy chủ CDN trong sơ đồ là một máy chủ thuộc mạng CDN, có thể lưu và trả bản sao response. Browser gửi request ảnh đến CDN. Với cache hit, máy chủ CDN trả ảnh từ cache nên origin không nhận request. Với cache miss, máy chủ CDN lấy ảnh từ origin, trả cho browser và có thể lưu lại cho lần sau. CDN có thể định tuyến request đến các máy chủ khác nhau theo vị trí mạng. Origin có thể là web server hoặc object storage. CDN là lớp phân phối, không thay kho dữ liệu chính và không phải yêu cầu triển khai của bài tập.

Speaker note: Header Cache-Control quy định cách cache dùng lại response. Max-age một năm là giá trị giả định cho URL có nội dung không đổi. Immutable cho cache biết không cần kiểm tra lại khi response còn tươi. Nếu gallery đổi URL, URL cũ vẫn có thể trả bản cũ từ cache. Khi xóa ảnh, có thể cần purge tại CDN, nhưng purge không xóa bản đã lưu trong browser. Chọn thời hạn cache theo thời gian ứng dụng chấp nhận để bản cũ còn được phục vụ.

Speaker note: Srcset liệt kê các file browser có thể chọn. Hậu tố 320w là chiều rộng pixel thực của file, còn sizes mô tả chiều rộng dự kiến của ô ảnh trong bố cục. Browser kết hợp hai thuộc tính này với kích thước vùng hiển thị và mật độ điểm ảnh. Width và height giữ chỗ trước khi tải, còn loading lazy trì hoãn tải ảnh ngoài vùng nhìn thấy.

Speaker note: Sizes trong ví dụ cho browser biết một ô ảnh rộng khoảng 100vw ở bố cục một cột và 33vw ở bố cục ba cột. Không kết luận chỉ từ src vì browser có thể chọn URL khác trong srcset. DPR (device pixel ratio) là tỉ lệ giữa điểm ảnh thiết bị và pixel CSS. Khi DPR lớn hơn một, browser có thể chọn file rộng hơn ô ảnh tính theo pixel CSS. Có thể tắt cache trong DevTools để quan sát lại cách browser chọn file khi đổi kích thước vùng hiển thị.

Speaker note: Ứng dụng mới không phụ thuộc Restaurant App hoặc Books. Bài cốt lõi không có tài khoản, album, bình luận hay chia sẻ. SeaweedFS hoặc MinIO chỉ thay local storage khi nhóm tự chọn phần S3. Chức năng được nghiệm thu qua request thật và trạng thái lưu, không chỉ qua ảnh chụp giao diện.

Speaker note: Ảnh có vị trí phải dùng dữ liệu dành riêng cho lớp, không chứa vị trí cá nhân thật. File text đổi đuôi kiểm tra chữ ký file, còn file ảnh thiếu bytes ở cuối kiểm tra khâu giải mã. Ảnh vượt giới hạn pixel có thể nhỏ về dung lượng nên cần một ca riêng. Mỗi nhóm ghi lại cách tạo dữ liệu để nhóm khác tái hiện.

Speaker note: Nếu ảnh gốc nhỏ hơn một ngưỡng, nhóm có thể không sinh variant lớn hơn nhưng phải ghi width descriptor đúng file thực. Alt text do người dùng nhập hoặc được xác định trong dữ liệu, không mặc định bằng filename. Một file lỗi không làm mất file hợp lệ khác trong cùng request. Mọi giới hạn và cách xử lý cleanup phải được công bố trong README.

Speaker note: Dùng cùng photoId để nối response, hàng trong DB và key trong storage. Request multipart và response phải được chụp từ Network. Khi gây lỗi DB, kiểm tra thư mục hoặc SeaweedFS thay vì chỉ đọc log. Restart cần dừng và chạy lại web server, không xóa storage hoặc DB.

Speaker note: Kiểm currentSrc ở hai độ rộng vùng hiển thị và ghi nhận DPR. Dùng công cụ đọc metadata để kiểm EXIF thay vì suy luận từ giao diện. Khi dọn xong, các file không còn trong kho và bản ghi đã bị xóa hoặc được đánh dấu đã dọn. Gửi request mới tới origin để tránh nhầm với response còn trong browser cache. Nếu dọn thất bại, hệ thống phải giữ danh sách key để chạy lại.

Speaker note: Bằng chứng cần dùng dữ liệu cùng một lần chạy để có thể đối chiếu. Che endpoint nội bộ hoặc credential nếu môi trường có thông tin nhạy cảm. Nhóm dùng SeaweedFS hoặc MinIO nộp thêm ảnh hay log liệt kê object trong bucket. Nhóm dùng local vẫn đạt toàn bộ phần cốt lõi.

Speaker note: Nếu lần thứ hai cắt từ file WebP của lần thứ nhất, vùng đã cắt không còn để khôi phục; mã hóa mất dữ liệu nhiều lần cũng có thể làm giảm chất lượng. Giữ bản gốc đã chuẩn hóa cho phép tính lại ảnh từ thông số hiện tại. Browser phải quy đổi vùng crop về tọa độ pixel của bản gốc; server từ chối vùng nằm ngoài ảnh thay vì công bố kết quả sai.

Speaker note: Giao diện gửi đầy đủ trạng thái biến đổi hiện tại thay vì chỉ gửi thao tác vừa thực hiện. Nếu request yêu cầu khôi phục, server bỏ qua crop, góc xoay và cờ lật trong cùng request. Request không hợp lệ không thay đổi ảnh đã công bố.

Speaker note: Mỗi version là một bộ variant của ảnh sau một lần lưu. Ví dụ, ở phần bonus p01 có bộ đầu dưới photos/p01/v1/ và bộ tiếp theo dưới photos/p01/v2/. DB có thể giữ originalKey để tìm bản gốc đã chuẩn hóa và phân biệt các PhotoVariant theo photoId, version và chiều rộng. Không ghi đè file v1 vì browser hoặc CDN có thể còn cache URL cũ. Chuyển currentVersion trong giao dịch DB; nếu lỗi trước commit, ứng dụng dọn file mới và tiếp tục phục vụ bản cũ. Hai lần chỉnh sửa đồng thời cần version riêng và điều kiện khi cập nhật currentVersion; nếu dọn file cũ thất bại, lưu key để chạy lại.
