# REST API và SPA

### MSc. Ngô Ngọc Đăng Khoa

Phát triển ứng dụng web

# REST API và SPA

## Nội dung buổi học

1. Câu hỏi và mental model
2. Tách backend thành REST API
3. SPA gọi API: lỗi và CORS
4. Routing, form và lỗi trong SPA
5. Bài tập nhà hàng và nghiệm thu

Phát triển ứng dụng web

# Câu hỏi

> Khi giao diện là một SPA chạy trong browser, dữ liệu từ database đến SPA như thế nào?

Phát triển ứng dụng web

# Mục tiêu

* Thiết kế REST API trả JSON theo một response shape thống nhất
* Phân biệt lỗi kỹ thuật (status HTTP) và lỗi nghiệp vụ (body) khi SPA gọi API
* Cho phép SPA gọi API khác origin với CORS
* Client-side routing

Phát triển ứng dụng web

# Ba thành phần của ứng dụng

![](./REST API và SPA_files/block6-split.svg)

Phát triển ứng dụng web

# Mental model

![](./REST API và SPA_files/block6-mental-model.svg)

Phát triển ứng dụng web

# Lưu ý

* SPA chạy trong browser trên máy người dùng, không giữ được secret
* Chuỗi kết nối database phải nằm ở BE
* SPA và BE là hai ứng dụng độc lập

Phát triển ứng dụng web

# RESTful API Design Guidelines

Phát triển ứng dụng web

# Đặt tên URL theo tài nguyên

| Việc cần làm | Đặt tên theo hành động | Đặt tên theo tài nguyên |
| --- | --- | --- |
| Lấy danh sách sách | `/getAllBooks` | `GET /books` |
| Thêm một cuốn | `/addNewBook` | `POST /books` |
| Xem cuốn số 2 | `/getBook?id=2` | `GET /books/2` |
| Xóa cuốn số 2 | `/deleteBook?id=2` | `DELETE /books/2` |

* Tài nguyên là loại đối tượng mà API quản lý, ví dụ sách; URL dùng danh từ số nhiều: `/books`
* Một cuốn sách cụ thể thì thêm id vào: `/books/2`; HTTP method sẽ quy định hành động

Phát triển ứng dụng web

# REST API cho sách

| Thao tác | Request | Thành công | Lỗi nghiệp vụ |
| --- | --- | --- | --- |
| Danh sách | `GET /api/books?q=sql` | mảng, có thể rỗng |  |
| Một cuốn | `GET /api/books/2` | bản ghi | `NOT_FOUND` |
| Thêm | `POST /api/books` | bản ghi vừa tạo | `VALIDATION_FAILED` |
| Sửa | `PATCH /api/books/2` | bản ghi đã sửa | `VALIDATION_FAILED`, `NOT_FOUND` |
| Xóa | `DELETE /api/books/2` | `null` | `NOT_FOUND` |

Phát triển ứng dụng web

# PUT và PATCH

### PUT

* Gửi toàn bộ biểu diễn của bản ghi
* Gửi lại cùng yêu cầu cho cùng kết quả

### PATCH

* Chỉ gửi các trường cần đổi
* Bài tập dùng PATCH
* API chỉ ghi những trường đã qua validate

Phát triển ứng dụng web

# Hai loại lỗi khi gọi API

### Lỗi kỹ thuật

* Hệ thống hỏng hoặc gọi sai, API không xử lý được request
* Ví dụ: gõ sai URL, API đang tắt, mất kết nối database
* Dấu hiệu: status 4xx, 5xx hoặc không có response

### Lỗi nghiệp vụ

* Hệ thống chạy đúng, nhưng request vi phạm quy tắc của ứng dụng
* Ví dụ: tìm sách số 999 không có, thêm sách thiếu tên
* Dấu hiệu: status 200, body có `ok: false`

Phát triển ứng dụng web

# HTTP Status và kết quả nghiệp vụ

| Tình huống | Status | Kết quả |
| --- | --- | --- |
| Danh sách chưa có phần tử | 200 | Thành công: `ok: true`, `data: []` |
| `GET /api/books/999`, id không có | 200 | Lỗi nghiệp vụ: `NOT_FOUND` |
| `POST /api/books`, input sai | 200 | Lỗi nghiệp vụ: `VALIDATION_FAILED` |
| `GET /api/bok`, sai URL | 404 | Lỗi kỹ thuật: body không có `ok` |
| Mất kết nối database | 500 | Lỗi kỹ thuật: body không có `ok` |
| API không chạy | Không có | Lỗi kỹ thuật: không nhận được response |

Phát triển ứng dụng web

# Response shape

`// Thành công
{ "ok": true, "data": { "id": 2, "title": "SQL cơ bản" } }
// Lỗi nghiệp vụ
{ "ok": false,
"error": { "code": "VALIDATION_FAILED",
"message": "Dữ liệu không hợp lệ",
"fields": { "title": "Bắt buộc" } } }`

* Response do handler xử lý đều có `ok`; `data` khi thành công, `error` khi không
* `code` là giá trị cố định để SPA rẽ nhánh, không rẽ nhánh theo `message`
* `fields` chỉ có khi lỗi gắn với trường nhập

Phát triển ứng dụng web

# Ví dụ: sửa một cuốn sách

`PATCH /api/books/2 HTTP/1.1
Content-Type: application/json
{ "title": "SQL cơ bản", "price": 50000 }
HTTP/1.1 200 OK
Content-Type: application/json
{ "ok": true, "data": { "id": 2, "title": "SQL cơ bản", "price": 50000 } }`

* Method và URL mô tả tài nguyên & hành động thực hiện; body mang các trường cần đổi
* `Content-Type` báo cách đọc body; thiếu thì server không đọc được JSON
* Response theo response shape: `ok: true` và `data` là bản ghi sau khi sửa

Phát triển ứng dụng web

# Mã lỗi nghiệp vụ

| Mã lỗi | Khi nào | Kèm fields |
| --- | --- | --- |
| `NOT_FOUND` | Id không có bản ghi tương ứng | Không |
| `VALIDATION_FAILED` | Input sai kiểu hoặc thiếu | Có |
| `ALREADY_EXISTS` (ví dụ giả định) | Giá trị phải duy nhất theo nghiệp vụ đã tồn tại | Có thể |

Phát triển ứng dụng web

# Một request đi qua API

| Bước | Câu hỏi | Thất bại | Loại lỗi |
| --- | --- | --- | --- |
| 1. Route | Route khớp URL, method? | `404` | Kỹ thuật |
| 2. Body | Body đọc được? | `400` | Kỹ thuật |
| 3. Input | Input hợp lệ? | `200`, `ok: false`, `VALIDATION_FAILED` | Nghiệp vụ |
| 4. Database | Truy cập thành công? | `500` | Kỹ thuật |
| 5. Bản ghi | Bản ghi cần thao tác tồn tại? | `200`, `ok: false`, `NOT_FOUND` | Nghiệp vụ |

Phát triển ứng dụng web

# Quy tắc xử lý trong API

* Lỗi nghiệp vụ biết trước (input sai, không có bản ghi): trả **200** kèm `ok: false`
* Lỗi không lường trước (mất kết nối, lỗi mã nguồn): **500**
* Chỉ đưa các trường đã chọn từ body vào lệnh ghi, không đưa nguyên body
* Id sai kiểu xử lý như không có bản ghi, cần *kiểm tra trước khi truy cập database*

Phát triển ứng dụng web

# Lỗi thường gặp ở API

* Trả 404 khi không có bản ghi: SPA không phân biệt được với lỗi sai URL
* Bao cả lỗi hệ thống rồi trả `ok: false`: lỗi hạ tầng thành lỗi nghiệp vụ
* Mỗi route một dạng body: SPA đọc `data` hoặc `error` sai chỗ
* Trả kết quả khi lệnh ghi chưa hoàn tất: `ok: true` nhưng database chưa có dữ liệu

Phát triển ứng dụng web

# Kiểm tra API trước khi xây dựng SPA

| Request | Kết quả mong đợi |
| --- | --- |
| `GET /api/books` | 200, `ok: true`, `data` là mảng |
| `GET /api/books/999` | 200, `ok: false`, `NOT_FOUND` |
| `POST /api/books`, title rỗng, price âm | 200, `ok: false`, `VALIDATION_FAILED` kèm `fields` |
| `GET /api/bok` | 404, không theo response shape |
| `GET /api/books` khi database dừng | 500, không theo response shape |

* Gọi bằng công cụ HTTP bất kỳ: `curl`, client trong IDE, Postman

Phát triển ứng dụng web

# CORS

Phát triển ứng dụng web

# Cross origin

* Origin gồm giao thức, tên miền và cổng: `localhost:5173` khác `localhost:3000`
* Mã JavaScript chỉ đọc được response khác origin khi có header `CORS`
* Request cần preflight: *server không cho phép thì request không được gửi*
* Lỗi `CORS` chỉ hiện chi tiết trong Console

Phát triển ứng dụng web

# Request nào cần preflight

### Không cần

* `GET` không có header đặc biệt
* `POST` với `Content-Type` là `application/x-www-form-urlencoded`, `multipart/form-data` hoặc `text/plain`

### Cần

* `PATCH` và `DELETE`
* Request có `Content-Type: application/json`

Phát triển ứng dụng web

# Preflight trước khi gửi PATCH

![](./REST API và SPA_files/block6-cors.svg)

Phát triển ứng dụng web

# Xử lý CORS

### Cho phép origin ở API

* API trả header CORS cho đúng origin của SPA
* SPA gọi thẳng địa chỉ của API
* Khi triển khai, đổi cấu hình origin

### Proxy ở dev server

* Dev server của SPA chuyển `/api` sang API
* Browser thấy cùng origin nên không có CORS
* Chỉ dùng khi phát triển; bản triển khai cần proxy tương đương

Phát triển ứng dụng web

# API cần làm gì để cho phép CORS

* Response gửi cho SPA có `Access-Control-Allow-Origin` bằng origin của SPA
* Request `OPTIONS` của preflight được trả lời thành công, thường là 204
* Response preflight có `Access-Control-Allow-Methods` và `Access-Control-Allow-Headers`
* Origin lấy từ cấu hình; không đặt `*` khi API có thao tác quản trị

Phát triển ứng dụng web

# SPA gọi API và nhận kết quả

Phát triển ứng dụng web

# Ba tầng lỗi khi gọi API

![](./REST API và SPA_files/block6-three-layers.svg)

Phát triển ứng dụng web

# Gom lời gọi API vào một lớp

* Một chỗ đặt URL gốc và header
* Một chỗ kiểm tra ba tầng lỗi
* Trang nhận `data` hoặc một lỗi có loại (kỹ thuật hay nghiệp vụ), `code`, `fields`
* Trang không tự gọi HTTP trực tiếp

Phát triển ứng dụng web

# Các trạng thái khi tải dữ liệu

![](./REST API và SPA_files/block6-states.svg)

Phát triển ứng dụng web

# Dữ liệu thuộc về trang

### Không nên

* Giữ danh sách ở nơi nhiều trang dùng chung
* Sửa bản sao ở client rồi tin rằng khớp database

### Nên

* Mỗi trang tải dữ liệu của nó khi mở
* Sau khi ghi, điều hướng sang trang đích để trang đó tải lại

Phát triển ứng dụng web

# Lỗi thường gặp khi tải dữ liệu

* Chỉ kiểm tra status HTTP: lỗi nghiệp vụ có status 200 nên hiện như thành công
* Đổi `id` giữa chừng, response cũ đến sau ghi đè response mới
* Đọc trường của dữ liệu khi chưa tải xong: lỗi lúc trang đang tải
* Trang trắng khi API tắt vì không có trạng thái `error`

Phát triển ứng dụng web

# Xét chức năng: xem chi tiết sách

1. **Mở URL**: Mở thẳng `/books/2` hoặc bấm link trong ứng dụng
2. **Routing**: Router khớp `/books/:id`, chọn trang chi tiết, lấy `id` từ URL
3. **Gọi API**: Trang gọi `GET /api/books/2`
4. **Hiển thị**: Trang hiển thị theo `loading`, `ok`, `notFound` hoặc `error`

Phát triển ứng dụng web

# Client-side routing

* Router đọc URL và chọn trang, không có document request mới
* Link nội bộ đổi URL bằng History API, trang không tải lại
* Path param và query param đọc từ router: `/books/2` cho id, `?q=sql` cho từ khóa
* Mỗi framework FE có router riêng; chọn router trước khi viết prompt

Phát triển ứng dụng web

# URL của trang khác URL của API

| Thao tác | URL trên thanh địa chỉ | Request tới API |
| --- | --- | --- |
| Danh sách, tìm | `/books?q=sql` | `GET /api/books?q=sql` |
| Chi tiết | `/books/2` | `GET /api/books/2` |
| Form thêm | `/admin/books/new` | Khi gửi: `POST /api/books` |
| Form sửa | `/admin/books/2/edit` | `GET /api/books/2`   `PATCH /api/books/2` |
| Xác nhận xóa | `/admin/books/2/delete` | `GET /api/books/2`  `DELETE /api/books/2` |

Phát triển ứng dụng web

# URL của SPA

| Cách mở `/books/2` | Điều xảy ra |
| --- | --- |
| Bấm link trong SPA | Router đổi URL và hiện trang, không hỏi server |
| Gõ URL hoặc bấm Reload | Browser gửi `GET /books/2` tới server giữ file của SPA |

* Server chỉ có `index.html` mà không biết `/books/2` là gì thì trả 404
* Cách xử lý: server trả `index.html` cho các đường dẫn của SPA; SPA chạy lên, router đọc URL rồi hiện đúng trang

Phát triển ứng dụng web

# Phân biệt không tìm thấy và lỗi kỹ thuật

| Tình huống | Nơi quyết định | Kết quả |
| --- | --- | --- |
| `/abc`, không route nào khớp | Routing trong SPA | Document `200` (fallback `index.html`); SPA hiện trang không tìm thấy |
| `/books/999`, id không có | BE | Status `200`, `ok: false`, `NOT_FOUND`; SPA hiện trang không tìm thấy |
| `GET /api/bok`, sai URL | BE | Status `404`: lỗi kỹ thuật; SPA hiện lỗi chung |

Phát triển ứng dụng web

# Client navigation

![](./REST API và SPA_files/block6-after-write.svg)

Phát triển ứng dụng web

# Form trong SPA

| Tình huống | SPA |
| --- | --- |
| Bấm Gửi: browser tự tải lại trang | Chặn việc tải lại; SPA tự gửi dữ liệu tới API |
| Bấm Gửi hai lần liên tiếp | Khóa nút Gửi khi đang chờ API trả lời, nếu không API nhận hai request |
| Mở form sửa | Lấy id từ URL, gọi `GET /api/books/2`, điền dữ liệu vào các ô |
| Nhập dữ liệu sai | Kiểm tra ở SPA để người dùng sửa nhanh; API vẫn kiểm tra và trả `VALIDATION_FAILED` |

Phát triển ứng dụng web

# Khoanh vùng lỗi

| Triệu chứng | Kiểm tra trước |
| --- | --- |
| Console báo CORS | Header `Access-Control-Allow-Origin` của response và preflight; origin trong cấu hình API |
| Request API có status 404 hoặc 500 | Lỗi kỹ thuật: URL gọi sai hoặc API lỗi; xem log của API |
| Status 200 nhưng `ok: false` | Lỗi nghiệp vụ: xem `error.code` và `fields` ở tab Response |
| Status 200, `ok: true` nhưng UI sai | Tab Response, rồi state, rồi phần hiển thị |
| Reload ở `/books/2` ra 404 | Server file của SPA chưa trả `index.html` |

Phát triển ứng dụng web

# Bài tập

## Xây ứng dụng nhà hàng

#### a) REST API cho món ăn, đầu bếp và nguyên liệu,

#### b) SPA cho người dùng và quản trị, chạy trong browser.

Phát triển ứng dụng web

# Mô tả

* `api` là BE: project nền có kết nối database, ba model và dữ liệu seed
* `web` là FE: một SPA mới, chạy trong browser, không dùng render ở server; stack tự chọn
* Ba tài nguyên: món ăn, đầu bếp, nguyên liệu
* `api` và `web` chạy ở hai origin khác nhau

Phát triển ứng dụng web

# Dữ liệu

| Model | Trường |
| --- | --- |
| `Dish` (món ăn) | `name`, `description`, `price`, `category`, `available` |
| `Chef` (đầu bếp) | `name`, `specialty` |
| `Ingredient` (nguyên liệu) | `name`, `unit` |

Phát triển ứng dụng web

# REST API

| Thao tác | Request | Thành công | Lỗi nghiệp vụ |
| --- | --- | --- | --- |
| Danh sách | `GET /api/dishes` | mảng, có thể rỗng |  |
| Chi tiết | `GET /api/dishes/:id` | bản ghi | `NOT_FOUND` |
| Thêm | `POST /api/dishes` | bản ghi vừa tạo | `VALIDATION_FAILED` |
| Sửa | `PATCH /api/dishes/:id` | bản ghi đã sửa | `VALIDATION_FAILED`, `NOT_FOUND` |
| Xóa | `DELETE /api/dishes/:id` | `null` | `NOT_FOUND` |

Phát triển ứng dụng web

# Yêu cầu API

* Ba tài nguyên `/api/dishes`, `/api/chefs`, `/api/ingredients` theo bảng trên
* Kết quả do handler xử lý: status 200 kèm `ok`, `data` hoặc `error`
* Không có bản ghi, input sai: lỗi nghiệp vụ; sai URL, lỗi hệ thống: 404, 500
* CORS cho đúng origin của SPA, đọc từ cấu hình, không dùng `*`

Phát triển ứng dụng web

# Các trang của SPA

| URL | Yêu cầu |
| --- | --- |
| `/dishes` | Tìm theo tên bằng query `q` trên URL; mỗi món có link sang chi tiết |
| `/dishes/:id` | Hiện đủ các trường; không tìm thấy khi `NOT_FOUND` |
| `/admin/dishes` | Danh sách; có link sang thêm, sửa, xóa |
| `/admin/dishes/new` | Form thêm |
| `/admin/dishes/:id/edit` | Form sửa, nạp bản ghi theo id từ URL |
| `/admin/dishes/:id/delete` | Trang xác nhận; chỉ nút Xóa gọi `DELETE` |

Phát triển ứng dụng web

# Hành vi của SPA

* Mỗi trang tải dữ liệu có `loading`, `error` (kỹ thuật), `notFound`; danh sách thêm trạng thái rỗng
* `VALIDATION_FAILED`: hiện lỗi cạnh từng trường, giữ giá trị đã nhập
* Ghi thành công: điều hướng sang trang đích, không tải lại document
* Mỗi trang tự tải dữ liệu; không dùng kho trạng thái toàn cục

Phát triển ứng dụng web

# Quy trình làm bài

1. **API**: Xây REST API cho ba tài nguyên trên project nền; kiểm tra từng dòng của bảng bằng công cụ HTTP
2. **Khung SPA**: Tạo `web`, routing, lớp gọi API, CORS; một trang danh sách món ăn chạy thật
3. **Món ăn hoàn chỉnh**: Trang người dùng, trang quản trị, các trạng thái, `VALIDATION_FAILED`
4. **Đầu bếp và nguyên liệu**: Lặp lại mẫu của món ăn, rồi đối chiếu tiêu chí nghiệm thu

Phát triển ứng dụng web

# Kiểm tra mã nguồn: API

* Có route `GET` nào ghi dữ liệu không; sửa, xóa có dùng `PATCH`, `DELETE` không
* Không có bản ghi trả `NOT_FOUND` với status 200; lỗi hệ thống vẫn là 500
* Dữ liệu của request có bị đưa nguyên vào lệnh ghi không
* Chuỗi kết nối database có xuất hiện trong mã hoặc log không

Phát triển ứng dụng web

# Kiểm tra mã nguồn: SPA

* Có kiểm tra cả status HTTP lẫn trường `ok` không; URL gốc API có ở một chỗ không
* Có state danh sách hoặc bản ghi nào dùng chung giữa các trang không
* Dữ liệu từ API có được chèn vào HTML thô, không qua thoát ký tự, không
* Có biến môi trường bí mật nào được nhúng vào bundle của SPA không

Phát triển ứng dụng web

# Tiêu chí nghiệm thu: API

* Từng dòng của bảng REST API: status 200, `ok`, `data` hoặc `error.code` đúng
* URL `/api` sai trả 404; lỗi hệ thống trả 500; hai loại này không theo response shape
* `Access-Control-Allow-Origin` là origin của SPA, không phải `*`

Phát triển ứng dụng web

# Tiêu chí nghiệm thu: SPA

* Mở thẳng và Reload ở từng URL ra đúng trang; lệnh ghi không tải lại document
* `VALIDATION_FAILED` hiện lỗi cạnh trường, giữ giá trị; xóa chỉ sau trang xác nhận
* `NOT_FOUND` hiện không tìm thấy; API tắt hoặc sai URL hiện lỗi chung, không hiện trang trắng

Phát triển ứng dụng web

# Tổng kết

* REST API: URL là tài nguyên, method là thao tác, body có `ok`, `data` hoặc `error`
* Status báo lỗi kỹ thuật; `error.code` báo lỗi nghiệp vụ, status vẫn 200
* Hai origin cần CORS; `PATCH`, `DELETE` và JSON gây preflight
* Routing phía client cho mỗi trang một URL; ghi xong thì SPA điều hướng tới trang kết quả

Phát triển ứng dụng web

# Tài liệu tham khảo

* M. Haldar, "RESTful API Designing guidelines", HackerNoon, 2016: `hackernoon.com/restful-api-designing-guidelines-the-best-practices-60e1d954e7c9`
* MDN, "Cross-Origin Resource Sharing (CORS)": `developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS`
* MDN, "Using the Fetch API": `developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch`
* MDN, "History API": `developer.mozilla.org/en-US/docs/Web/API/History_API`
* RFC 9110 (PUT) và RFC 5789 (PATCH): `rfc-editor.org/rfc/rfc9110`, `rfc-editor.org/rfc/rfc5789`

Phát triển ứng dụng web

# Q & A

Phát triển ứng dụng web

Previous slidePage 41 of 55Next slideToggle fullscreenToggle overview viewOpen presenter view

Speaker note: Dành hai phút để từng nhóm đưa ra câu trả lời ban đầu, chưa cần đúng thuật ngữ. Ghi hai hoặc ba ý lên bảng để quay lại ở cuối block. Gợi ý cho cuộc thảo luận: ứng dụng tách làm hai, BE là REST API trả JSON, FE là SPA chạy trong browser. Hai phần chỉ nói chuyện với nhau qua request HTTP, nên cần thống nhất cách truyền dữ liệu và cách báo lỗi.

Speaker note: Đọc mục tiêu như các hành vi sinh viên phải chứng minh, không phải danh sách chủ đề. Sinh viên làm bài tập cùng coding agent, nên các mục tiêu này cũng là tiêu chí để kiểm tra mã agent sinh ra. Buổi học dạy nguyên lý, không dạy cú pháp của một stack: BE và FE dùng ngôn ngữ, framework nào cũng được, miễn FE là SPA chạy trong browser và BE theo đúng hợp đồng REST API. Cuối block, dùng chính bốn mục này để tự đánh giá.

Speaker note: Ứng dụng gồm hai phần chạy ở hai nơi. BE là REST API: giữ phần truy cập database và chỉ trả JSON. FE là SPA: một server file (hoặc dev server) gửi index.html và JavaScript cho browser một lần, sau đó SPA chạy trong browser, tự dựng UI và gọi BE bằng request HTTP. Chỉ vào khung Browser trên sơ đồ: browser là chương trình của người dùng, SPA là ứng dụng nhóm viết chạy bên trong nó. Hai thứ này khác nhau, và từ đây deck dùng "browser" chỉ cho chương trình, "SPA" chỉ cho ứng dụng.

Speaker note: Đi theo sơ đồ từ khung SPA: router khớp URL /books/2 và chọn trang chi tiết. Trang gọi BE bằng một request HTTP; route, handler và lớp truy cập dữ liệu của BE nhận request, truy vấn database rồi trả JSON thay vì HTML. JSON quay lại SPA với hai trường ok và data, trang lưu vào state rồi dựng UI. Hai ranh giới cần nhớ: SPA không nối database, và response JSON không có HTML. Hỏi lớp: nếu trang chi tiết hiện sai tên sách, kiểm tra ở node nào trước. Đáp án dự kiến: response JSON trong Network, rồi mới đến state và UI.

Speaker note: Chuỗi kết nối database không được rời khỏi server. SPA có thêm một cách vi phạm quy tắc này: đặt chuỗi kết nối vào biến môi trường của SPA. Mỗi công cụ build có tiền tố riêng cho biến được đưa vào mã gửi cho browser, ví dụ VITE\_ của Vite và NEXT\_PUBLIC\_ của Next.js; biến mang tiền tố đó là công khai. Yêu cầu sinh viên mở tab Sources hoặc tìm trong bundle để thấy các giá trị đó.

Speaker note: Cột giữa là cách đặt tên mà mỗi việc có một URL riêng, tên URL chứa động từ. Cột phải là cách của bài "RESTful API Designing guidelines" trên HackerNoon (2016): URL chỉ chứa tài nguyên (danh từ, số nhiều), method HTTP cho biết làm gì với tài nguyên đó. Bài viết dùng các ví dụ sai như /getAllEmployees, /addNewEmployee, /deleteEmployee; các dòng ở cột giữa là ví dụ tương tự cho sách, riêng /getBook?id=2 do giáo trình đặt theo cùng mẫu. Tác giả ghi rõ không có hướng dẫn chính thức về thiết kế API, nên đây là một guideline tham khảo, không phải chuẩn. Lợi ích nêu trong bài: số URL không tăng theo số việc làm. Bài viết còn quy định status 201, 204, 400, 404 cho kết quả của thao tác; lớp chọn cách khác cho phần đó, xem slide "Status HTTP và kết quả nghiệp vụ". Hỏi lớp: cần thêm thao tác sửa cuốn số 2 thì thêm URL nào. Đáp án: không thêm URL, dùng PATCH /books/2. Tìm kiếm không cần URL riêng: thêm điều kiện sau dấu ?, ví dụ GET /books?q=sql, sẽ gặp lại ở bảng REST API.

Speaker note: Bảng này là hợp đồng giữa BE và SPA; hai bên có thể làm song song nếu thống nhất bảng. Cả năm dòng trả status 200 khi handler chạy được, kể cả khi kết quả là lỗi nghiệp vụ; ok cho biết kết quả. Các trang như form thêm, form sửa, xác nhận xóa là trang của SPA, không phải dòng của bảng này: bảng chỉ liệt kê request tới API. Trả bản ghi vừa tạo kèm id để SPA điều hướng tới trang chi tiết. Không dạy phân trang, sắp xếp hay version ở block này.

Speaker note: Bài HackerNoon chỉ liệt kê GET, POST, PUT, DELETE nên sinh viên có thể thấy hai cách gọi khác nhau cho cùng việc sửa. Nguồn chuẩn: RFC 9110 mô tả PUT thay thế trạng thái của tài nguyên và có tính idempotent; RFC 5789 định nghĩa PATCH cho thay đổi một phần. Bài tập chọn PATCH vì mỗi lần sửa chỉ đổi một số trường. Không bàn thêm về idempotent ở đây.

Speaker note: Nghiệp vụ là các quy tắc của chính ứng dụng, ví dụ sách phải có tên, id phải tồn tại. Lỗi nghiệp vụ nghĩa là API đã nhận và hiểu request, chạy đúng, rồi trả lời rằng yêu cầu này không làm được theo quy tắc. Lỗi kỹ thuật nghĩa là có gì đó hỏng hoặc sai ở tầng chạy hệ thống nên API không xử lý được. Cách phân biệt nhanh: hỏi xem sửa mã hoặc sửa cấu hình thì hết lỗi (kỹ thuật), hay chỉ cần người dùng nhập khác đi hoặc dữ liệu có khác đi (nghiệp vụ). Cách chia này là quy ước của lớp, không phải thuật ngữ cố định của mọi tài liệu. Slide kế tiếp cho thấy mỗi loại ứng với status nào.

Speaker note: Nếu API trả 404 cho "không có sách số 999", SPA nhận cùng một status khi sai URL, nên không phân biệt được API chạy đúng nhưng không có dữ liệu với API hỏng. Quy ước của lớp: status chỉ báo API có chạy được yêu cầu hay không; kết quả nghiệp vụ nằm trong body. Đây là quy ước của lớp, không phải quy tắc chung của các API REST: bài HackerNoon dùng 201, 204, 400, 404 cho các trường hợp này. Đánh đổi: công cụ giám sát, bộ nhớ đệm và log dựa vào status không thấy lỗi nghiệp vụ, nên API ghi error.code vào log. Lỗi hệ thống thật như mất kết nối database vẫn phải trả 500, không bọc thành ok: false.

Speaker note: Response shape là cấu trúc chung của mọi response mà handler trả về, cả thành công lẫn lỗi nghiệp vụ; nó là hợp đồng như các trường của model: hai bên cùng đọc một cấu trúc, và cấu trúc này không phụ thuộc ngôn ngữ của BE. SPA kiểm tra ok trước, rồi đọc data hoặc error. code ổn định để đổi câu chữ không làm vỡ SPA; message dành cho lập trình viên và log, câu hiển thị cho người dùng do SPA quyết định. fields là bản đồ từ tên trường sang thông điệp, khóa trùng tên input để hiện lỗi cạnh đúng ô nhập. Trong JSON thật không có chú thích; chú thích ở đây chỉ để chia hai ví dụ.

Speaker note: Đây là một request và response hoàn chỉnh của dòng "Sửa" trong bảng REST API, kết hợp với response shape ở slide trước. Thông điệp HTTP ở mức giao thức không phụ thuộc thư viện: dù dùng fetch, axios hay một HTTP client khác, request gửi đi và response nhận về có cùng hình dạng. Với form HTML, browser tự mã hóa body theo urlencoded; ở đây phía gọi API tự dựng body và header. Chạy một request thiếu Content-Type và một request gửi price dạng chuỗi, đối chiếu với body mà API trả: thiếu header thì body không đọc được, price dạng chuỗi là input sai nên trả ok: false và VALIDATION\_FAILED. Mở tab Network, chọn một request ghi và đọc lại hai khối này.

Speaker note: Mã lỗi đặt theo nghĩa nghiệp vụ, không theo status. Thêm một lỗi nghiệp vụ mới là thêm một mã vào hợp đồng, không đổi status hay đổi cấu trúc body. Bài tập chỉ dùng NOT\_FOUND và VALIDATION\_FAILED. ALREADY\_EXISTS là ví dụ giả định để cho thấy hướng mở rộng; ràng buộc unique ở database nằm ngoài phạm vi block này. Mỗi API tự định nghĩa danh sách mã của mình, nên danh sách này phải nằm trong tài liệu API mà SPA đọc.

Speaker note: Bảng cho thấy thứ tự kiểm tra ở bất kỳ stack nào: lỗi kỹ thuật xuất hiện trước khi handler chạy (bước 1 và 2) hoặc khi database hỏng (bước 4); lỗi nghiệp vụ do chính handler quyết định (bước 3 và 5). Validate input chạy trước khi chạm database; NOT\_FOUND chỉ biết được sau khi truy cập database. Với danh sách và tìm kiếm, bước 5 không áp dụng vì không có bản ghi cụ thể cần thao tác. Hỏi lớp: lỗi mất kết nối database rơi vào bước nào, và vì sao không đổi thành ok: false.

Speaker note: Bốn quy tắc áp dụng cho BE viết bằng ngôn ngữ nào cũng được. Quy tắc hai là lỗi dễ mắc nhất khi bao toàn bộ handler trong một khối bắt lỗi: lỗi hạ tầng bị đổi thành ok: false và SPA hiểu nhầm là lỗi nghiệp vụ; chỉ bắt các lỗi nghiệp vụ đã biết, để lỗi còn lại đi tới bộ xử lý lỗi chung trả 500. Quy tắc ba: nhận cả body cho phép client ghi các trường không được phép. Quy tắc bốn: id như abc không có bản ghi nào, nhưng nếu đưa thẳng vào truy vấn thì database báo lỗi kiểu khác và API trả 500. JSON giữ kiểu: nếu price gửi lên là chuỗi "50000" thì coi là input sai, khác với form HTML nơi các giá trị đều là chuỗi. Đặt việc dựng response ok và lỗi vào một hàm dùng chung để các route cùng một dạng body.

Speaker note: Chọn hai lỗi có khả năng xuất hiện trong bài tập và dựng dấu hiệu quan sát. Với lỗi 404, gọi GET /api/books/999 rồi gọi GET /api/bok: nếu cả hai đều 404 thì SPA không biết nên hiện trang không tìm thấy hay thông báo hỏng. Với lỗi bao lỗi hệ thống, tắt kết nối database rồi gọi API: status phải là 500; nếu là 200 kèm ok: false thì lỗi hạ tầng đã bị che. Lỗi cuối xảy ra khi ngôn ngữ có xử lý bất đồng bộ mà quên chờ kết quả lệnh ghi. Coding agent hay sinh 404 cho bản ghi không có, vì bài HackerNoon và nhiều ví dụ khác làm như vậy; yêu cầu nhóm ghi quy ước response shape trong prompt.

Speaker note: Đây là cách khoanh vùng nhanh nhất ở kiến trúc hai phần. Nếu API trả đúng status và body mà SPA hiển thị sai, lỗi nằm ở phía SPA: gọi API, state hoặc phần hiển thị. Năm dòng đại diện năm loại kết quả: thành công, hai lỗi nghiệp vụ, hai lỗi kỹ thuật. Yêu cầu nhóm lưu các request này vào một file hoặc bộ sưu tập của công cụ họ dùng để chạy lại khi nghiệm thu.

Speaker note: Theo MDN, mã dùng fetch hoặc XMLHttpRequest chịu same-origin policy: chỉ gọi được origin khác khi response có header CORS đúng. Người chặn ở đây là browser, không phải SPA hay BE: với request đơn giản, browser vẫn gửi request và không cho mã của SPA đọc kết quả khi thiếu header; với request cần preflight, server không cho phép thì request thật không được gửi. MDN ghi rõ lỗi CORS không cho mã JavaScript biết chi tiết, nên phải mở Console. Lỗi CORS không phải lỗi của API: curl vẫn gọi được, chỉ browser chặn. Với SPA, lỗi CORS là lỗi kỹ thuật tầng một: không có response để đọc.

Speaker note: Danh sách không cần preflight lấy từ định nghĩa simple request trong tài liệu MDN về CORS; Content-Type chỉ nằm trong ba giá trị trên mới được miễn. Các lệnh ghi của bài tập đều gửi JSON hoặc dùng PATCH, DELETE, nên đều có preflight. Gợi ý quan sát: trong Network, thấy một request OPTIONS trước mỗi request ghi. Hệ quả cho SPA: không đặt Content-Type cho GET, vì header này làm GET cũng cần preflight.

Speaker note: Đi theo sơ đồ: browser, đang chạy SPA tải từ localhost:5173, gửi OPTIONS kèm Origin và method sắp dùng; BE trả 204 kèm Access-Control-Allow-Origin và Access-Control-Allow-Methods; sau đó browser mới gửi PATCH thật, và response của PATCH cũng phải có Access-Control-Allow-Origin. Thiếu header ở response thứ hai, mã của SPA vẫn không đọc được kết quả dù BE đã sửa dữ liệu. Mô hình lược bớt header Access-Control-Allow-Headers mà preflight cần khi request có Content-Type: application/json. Các header này là một phần của giao thức HTTP, không phụ thuộc ngôn ngữ hay framework của BE.

Speaker note: Cả hai cách đều dùng trong thực tế; nhắc lại rằng đây là quy tắc kinh nghiệm, không phải quy định. Bài tập yêu cầu cách thứ nhất để sinh viên gặp và giải quyết CORS, và để nghiệm thu kiểm tra được header bằng công cụ HTTP. Proxy giấu đi vấn đề trong lúc phát triển và lộ ra khi triển khai: SPA và API ở hai domain khác nhau.

Speaker note: Bốn việc này nằm ở tầng HTTP, độc lập với stack: API viết bằng ngôn ngữ nào cũng phải làm được cả bốn, thường bằng một middleware hoặc cấu hình CORS có sẵn của framework. Không dạy cú pháp của từng framework: nhóm nêu stack trong prompt, đọc tài liệu CORS chính thức của framework đó, rồi kiểm tra kết quả bằng công cụ HTTP vì coding agent có thể sinh cấu hình cho phép tất cả origin. Access-Control-Allow-Headers cần khi request có Content-Type: application/json hoặc header tự đặt. Dấu \* cho phép các origin khác đọc response; hợp lý với API công khai chỉ đọc dữ liệu công khai, còn API quản trị của bài tập chưa có xác thực nên giữ origin cụ thể. Origin không có dấu gạch chéo cuối: http://localhost:5173, không phải http://localhost:5173/. Kiểm tra preflight không phụ thuộc stack: gửi OPTIONS tới API với header Origin, Access-Control-Request-Method và Access-Control-Request-Headers rồi đọc header trong response.

Speaker note: Đi theo sơ đồ từ trái sang phải. Tầng một: SPA không nhận được response, do lỗi mạng, API không chạy hoặc browser chặn vì CORS. Tầng hai: có response nhưng status không thành công, do sai URL hoặc API lỗi hệ thống. Tầng ba: status thành công nhưng ok là false, do API từ chối theo nghiệp vụ. Sai lầm hay gặp của mã do agent sinh ra là chỉ kiểm tra status HTTP, nên lỗi nghiệp vụ hiện như thành công vì status là 200. Tầng một và hai hiển thị thông báo chung kèm nút thử lại; tầng ba tùy error.code. Nếu server file của SPA trả trang index.html với status 200 cho đường dẫn API sai (do fallback hoặc proxy sai), body không phải JSON; coi đó là lỗi kỹ thuật tầng hai. Demo: tắt API để thấy tầng một, gọi URL sai để thấy tầng hai, gọi id không có để thấy tầng ba.

Speaker note: Lớp này có thể là module, service hay client của framework FE; tên và cú pháp tùy stack. Giá trị của nó là kiểm tra ba tầng lỗi ở một chỗ: khi agent rải lời gọi HTTP trong từng component thì việc kiểm tra bị lặp và dễ thiếu ở một vài nơi. Lớp chỉ đặt Content-Type khi request có body, nên GET không bị preflight. Với coding agent, yêu cầu tạo lớp này trước khi viết trang và nêu rõ đầu ra: data hoặc một lỗi mang loại, code và fields.

Speaker note: Với trang HTML do server dựng sẵn, trạng thái của trang chỉ có một: HTML đã đầy đủ khi đến browser. Ở SPA, trang tồn tại trước khi có dữ liệu, nên phải quyết định trang trông thế nào lúc chờ (loading), lúc có dữ liệu (ok), lúc danh sách rỗng (empty), lúc không có bản ghi (notFound) và lúc lỗi kỹ thuật (error). Điểm khác với cách làm theo status: notFound xuất phát từ error.code, không từ status 404, nên sai URL không hiện thành "không tìm thấy sách". Danh sách rỗng là thành công với data là mảng rỗng, không phải lỗi. Mỗi framework FE biểu diễn các trạng thái này bằng cơ chế riêng. Gợi ý quan sát: tắt API rồi mở trang; nếu thấy trang trắng, trạng thái error chưa có.

Speaker note: Nguyên tắc: chỉ gửi id, trang đích đọc lại từ database ở mỗi request. Ở SPA, bản sao dữ liệu nằm trong bộ nhớ của SPA nên có thêm một nguồn lệch: sửa sách xong mà danh sách vẫn hiện tên cũ. Mỗi trang tự tải thì không cần kho trạng thái dùng chung cho bài này; đánh đổi là thêm request mỗi lần mở trang. Bộ nhớ đệm và cập nhật lạc quan nằm ngoài phạm vi block này. Với coding agent, đây là điểm cần soát: agent hay sinh kho trạng thái toàn cục (Redux, Pinia, Context hoặc service dùng chung) để giữ danh sách.

Speaker note: Chọn hai lỗi có khả năng xuất hiện trong bài tập và dựng dấu hiệu quan sát. Với response cũ ghi đè response mới, đổi nhanh giữa hai id khi API chậm; cách xử lý là hủy request cũ (trình duyệt có AbortController) hoặc bỏ qua kết quả của request không còn là request mới nhất. Một số framework ở chế độ phát triển chạy phần tải dữ liệu hai lần, ví dụ React với StrictMode; hai request giống nhau trong Network ở chế độ này không nhất thiết là lỗi.

Speaker note: Với trang do server dựng sẵn, bước chọn trang nằm ở server; ở SPA bước hai thuộc về SPA. Id vẫn nằm trong URL, nên mở tab mới, gửi link cho người khác, Reload hay Back đều ra đúng trang, miễn là routing đọc đúng id. Trang không nhận object sách từ trang danh sách; nó tải lại theo id.

Speaker note: Giới thiệu thuật ngữ một lần: routing phía client là việc SPA chọn trang theo URL ngay trong browser; từ đây dùng đúng cụm này, phân biệt với route của server. Theo MDN, History API cho phép mã JavaScript đổi URL trên thanh địa chỉ và lịch sử mà không tải trang mới. Chạy SPA, mở tab Network lọc Doc, bấm link giữa hai trang: không có document request mới. Nút Back vẫn hoạt động vì router ghi lịch sử. Không đi sâu vào API của từng router (React Router, Vue Router, Angular Router và các router khác); yêu cầu sinh viên ghi rõ router trong prompt.

Speaker note: Cột giữa do routing phía client của SPA quyết định, cột phải do BE quyết định. Hai cột có cùng hình dạng nhưng không phải cùng một thứ: người dùng gõ /books/2 vào thanh địa chỉ, không gõ /api/books/2 để xem trang. Các trang form và xác nhận xóa là trang của SPA; request ghi tương ứng là request tới API. Giữ từ khóa tìm kiếm q trong URL của trang để lưu được link kết quả tìm kiếm.

Speaker note: Hai cách mở cùng một URL nhưng khác nhau ở chỗ có hỏi server hay không. Bấm link trong SPA chỉ chạy router trong browser, không có request tải trang. Gõ URL hoặc Reload thì browser coi đó là một địa chỉ mới và gửi request tới server đang giữ file của SPA (thường là dev server của công cụ build, hoặc host file tĩnh khi triển khai). Server này chỉ có file index.html ở đường dẫn gốc nên không biết /books/2 là gì và trả 404, dù trang đó là hợp lệ trong SPA. Cách xử lý gọi là fallback: cấu hình server trả index.html cho các đường dẫn của SPA; sau đó SPA chạy lên và router đọc URL /books/2 để hiện trang chi tiết. Nhiều dev server đã cấu hình sẵn, nên lỗi hay lộ ra khi triển khai lên host file tĩnh. Sau Reload, SPA khởi động lại nên dữ liệu trong bộ nhớ đã mất; đây là lý do id nằm trong URL và trang tải lại dữ liệu từ API. Yêu cầu nhóm tự kiểm tra bằng cách mở thẳng một URL sâu của SPA ở tab mới.

Speaker note: Với trang do server dựng, 404 là status của chính trang HTML. Ở SPA, document là index.html với status 200 (nhờ fallback), nên status của document không cho biết trang có tồn tại hay không; trang không tìm thấy là do SPA tự hiển thị, dựa vào kết quả của router hoặc của API. Hai dòng cuối cho thấy lý do không dùng 404 cho bản ghi không có: nếu API trả 404 cho cả hai, SPA không phân biệt được bản ghi không tồn tại với sai URL. Hệ quả: công cụ chỉ nhìn status của document không phân biệt được trang đúng với trang không tìm thấy. Không nêu thêm về SEO ở block này.

Speaker note: Với form HTML gửi lên server, server thường trả 303 rồi browser tải trang đích (Post/Redirect/Get) để Reload không gửi lại form. SPA không có form submit tải trang, nên bước tương đương là SPA điều hướng tới URL của trang đích sau khi API trả ok: true. Trang đích là kết quả của một GET, nên Reload ở đó chỉ lặp lại GET. Ba nhánh của sơ đồ là ba kết quả: thành công thì điều hướng; VALIDATION\_FAILED thì hiện lỗi cạnh từng trường theo khóa của fields và giữ giá trị đã nhập trong state của form; lỗi kỹ thuật thì thông báo chung. Khóa nút khi đang gửi vì không còn cơ chế nào khác chặn bấm hai lần.

Speaker note: Form HTML mặc định gửi dữ liệu bằng cách tải một trang mới; nếu để nguyên, SPA bị tải lại từ đầu và mất trạng thái đang có, nên SPA phải chặn hành vi mặc định rồi tự gửi request tới API. Cả bốn dòng đều là việc của SPA vì API chỉ nhận request, không biết người dùng đã bấm nút mấy lần hay form đang mở ở trạng thái nào. Khóa nút khi đang gửi để tránh tạo hai bản ghi từ hai lần bấm; ràng buộc unique ở database nằm ngoài phạm vi block này. Form sửa không lấy giá trị từ trang danh sách mà gọi GET /api/books/:id, cùng nguyên tắc tải lại theo id. Request vẫn gửi được không qua SPA, ví dụ bằng công cụ HTTP, nên kiểm tra phía SPA không thay được kiểm tra của API.

Speaker note: Bảng mở rộng câu hỏi "kiểm tra ở node nào trước" ở mental model. Hai dòng giữa là điểm mới của block: status cho biết lỗi kỹ thuật hay không, rồi mới đọc body. Network lọc Fetch/XHR cho thấy các request tới API; lọc Doc cho thấy document request. Chạy request mẫu bằng công cụ HTTP ngoài browser để biết lỗi nằm ở API hay ở SPA. Nếu không thấy request nào trong Network, kiểm tra URL gọi API và xem mã gọi có chạy không. Ghi lại triệu chứng, nguyên nhân và bằng chứng sau khi sửa để dùng khi báo cáo lỗi cho agent.

Speaker note: Phát project nền giống nhau cho các nhóm để phần nghiệm thu có ý nghĩa: project này đã kết nối database, có ba model và seed, nhóm xây các route REST API trên đó. web tạo mới bằng công cụ khởi tạo của stack đã chọn. Nhóm ghi stack vào prompt, nếu không agent có thể chọn framework render ở server (ví dụ Next.js hoặc Nuxt) và biến bài thành render ở server. Xác nhận từng nhóm chạy được api và SPA khởi tạo trước khi bắt đầu tính giờ. Nếu nhóm đổi ORM, stack BE hoặc stack FE, họ vẫn giữ nguyên route, hành vi, response shape và tiêu chí nghiệm thu.

Speaker note: Các trường là gợi ý; nhóm có thể thêm trường nhưng giữ các trường này. Ba đối tượng độc lập: quan hệ giữa chúng, ví dụ món ăn do đầu bếp nào nấu hoặc dùng nguyên liệu nào, không thuộc yêu cầu của bài tập. Quy tắc validate tối thiểu: name không rỗng với cả ba model; price là số nguyên không âm với Dish (giá tính bằng đồng nên dùng số nguyên). Các quy tắc này sinh ra lỗi VALIDATION\_FAILED.

Speaker note: Áp dụng cho ba tài nguyên: /api/dishes, /api/chefs, /api/ingredients. GET /api/dishes nhận thêm query q để tìm theo tên. Cả năm dòng trả status 200 khi handler chạy được. Nhóm chuyển từng dòng thành một request mẫu và lưu lại. Giảng viên chỉ làm rõ yêu cầu, không cung cấp mã hoàn chỉnh.

Speaker note: Đây là contract chung của lớp; nhóm không thay bằng yêu cầu dễ hơn. Cho nhóm chuyển từng dòng thành một mục kiểm tra trước khi giao prompt cho agent. Validate theo từng model: name không rỗng, price là số nguyên không âm với Dish. Nhóm dùng stack API nào cũng phải cho ra cùng response shape; cấu hình CORS theo tài liệu của stack đó.

Speaker note: Trang người dùng chỉ có dishes. Ba nhóm trang quản trị lặp lại cho chefs và ingredients với cùng cấu trúc URL. Đích điều hướng sau khi ghi: sau thêm và sửa là trang chi tiết nếu có, hoặc danh sách; sau xóa là danh sách vì trang chi tiết không còn. Trang chi tiết quản trị cho chefs và ingredients là không bắt buộc, danh sách là đủ.

Speaker note: Kho trạng thái toàn cục nghĩa là Redux, Pinia, Context của React, hoặc service dùng chung giữ danh sách. Yêu cầu này theo nguyên tắc tải lại theo id và tránh lỗi dữ liệu lệch sau khi ghi. SPA phải phân biệt hai nhánh lỗi: error.code là NOT\_FOUND thì hiện trang không tìm thấy; lỗi kỹ thuật và lỗi mạng thì hiện thông báo chung. Không rải lời gọi HTTP trong từng trang: đề nghị nhóm tạo lớp gọi API trước. Cho nhóm chuyển từng dòng thành một mục kiểm tra.

Speaker note: Làm hoàn chỉnh một đối tượng trước, rồi giao agent lặp lại đúng mẫu đó cho hai đối tượng còn lại. Bước một gần như cơ học nếu project nền đã có validate; phần cần chú ý là response shape. Mỗi bước giao cho agent một yêu cầu rõ: route, method, hành vi và response shape cần có. Nhóm đọc plan hoặc diff trước khi chạy. Nếu chưa đạt tiêu chí, ưu tiên sửa luồng chính thay vì thêm tính năng ngoài phạm vi.

Speaker note: Sinh viên không cần đọc từng dòng mã, nhưng cần biết dòng nào sai thì hỏng ở đâu. Mỗi câu hỏi tương ứng một điểm trong phần lý thuyết: method, response shape, validate và chuỗi kết nối. Câu thứ hai kiểm tra cả hai chiều: không dùng 404 cho bản ghi không có, và không bọc lỗi hệ thống thành ok: false. Yêu cầu nhóm dùng danh sách này làm checklist trước khi chạy ứng dụng, và ghi lại vị trí trong mã, kể cả khi kết quả là không có lỗi.

Speaker note: Sinh viên không cần đọc từng dòng mã, nhưng cần biết dòng nào sai thì hỏng ở đâu. Mỗi câu hỏi tương ứng một điểm trong phần lý thuyết. Câu đầu là lỗi hay gặp nhất: chỉ kiểm tra status thì lỗi nghiệp vụ hiện như thành công. Câu thứ ba là rủi ro mới của SPA: mã SPA tự ghép dữ liệu vào HTML; các framework FE thường thoát ký tự đặc biệt khi hiển thị dữ liệu mặc định, nhưng các cơ chế chèn HTML thô bỏ qua bước này, ví dụ innerHTML, v-html của Vue hoặc dangerouslySetInnerHTML của React. Yêu cầu nhóm tìm từng điểm trong mã agent sinh ra và ghi lại vị trí, kể cả khi kết quả là không có lỗi.

Speaker note: Mỗi tiêu chí phải được chứng minh bằng thao tác hoặc output cụ thể. Không chấp nhận "đã code" nếu chưa chạy đúng request. Với lỗi hệ thống, có thể dừng kết nối database rồi gọi API để thấy 500. Với CORS, kiểm tra header bằng công cụ HTTP kèm Origin; kiểm tra preflight bằng Network ở slide kế tiếp. Nhóm tự đánh dấu đạt hoặc chưa đạt và giữ nguyên lỗi còn lại để báo cáo trung thực.

Speaker note: Mỗi tiêu chí phải được chứng minh bằng thao tác hoặc output cụ thể. Với CORS, kiểm tra thêm bằng Network: có request OPTIONS trước PATCH và DELETE; bật Disable cache vì browser có thể nhớ kết quả preflight. Với hai nhánh lỗi, thử id không có để thấy NOT\_FOUND, rồi sửa URL API trong cấu hình hoặc tắt API để thấy lỗi chung: hai trường hợp phải hiển thị khác nhau. Nhóm tự đánh dấu đạt hoặc chưa đạt và giữ nguyên lỗi còn lại để báo cáo trung thực.

Speaker note: Quay lại các câu trả lời đầu giờ và yêu cầu lớp sửa chúng bằng thuật ngữ vừa học, đặc biệt là phân biệt browser, SPA và BE. Mỗi nhóm viết một câu giải thích và một bằng chứng có thể tái sử dụng: một request trong Network hoặc một request mẫu chạy bằng công cụ HTTP.

Speaker note: Bài HackerNoon là guideline của một tác giả và tự ghi không có hướng dẫn chính thức về thiết kế API. Lớp theo bài này ở phần đặt tên tài nguyên và method, khác ở phần status cho kết quả nghiệp vụ. Ba nguồn còn lại là tài liệu tham chiếu của MDN và đặc tả của IETF.

```
03:31:46 query returned open=false
```