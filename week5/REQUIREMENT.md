# Yêu cầu bài tập REST API và SPA — tuần 4

Nguồn: `../REST-API-và-SPA.md`, phần Bài tập đến Tiêu chí nghiệm thu và speaker notes tương ứng. Đây là phần trích yêu cầu, không phải chép toàn bộ nội dung bài giảng.

## 1. Kiến trúc và dữ liệu

- `api`: backend có kết nối database, ba model và seed.
- `web`: SPA mới chạy trong browser, không render giao diện ở server; tự chọn stack và router.
- `api` và `web` chạy trên hai origin khác nhau; SPA gọi API trực tiếp, cấu hình CORS ở API.
- Chuỗi kết nối database chỉ nằm ở backend, không đưa vào mã/log công khai hoặc bundle SPA.
- Có thể đổi stack/ORM nhưng phải giữ route, response shape, hành vi và tiêu chí nghiệm thu.

| Model | Trường phải giữ |
| --- | --- |
| Dish | name, description, price, category, available |
| Chef | name, specialty |
| Ingredient | name, unit |

Có thể thêm trường. Ba tài nguyên độc lập; quan hệ giữa chúng không thuộc yêu cầu tuần này. Validate tối thiểu: name không rỗng với cả ba model; price là số nguyên không âm với Dish (đơn vị đồng).

## 2. REST API

Áp dụng cả ba prefix `/api/dishes`, `/api/chefs`, `/api/ingredients`:

| Thao tác | Request | Thành công | Lỗi nghiệp vụ |
| --- | --- | --- | --- |
| Danh sách | GET /api/:resource | Mảng, có thể rỗng | — |
| Chi tiết | GET /api/:resource/:id | Bản ghi | NOT_FOUND |
| Thêm | POST /api/:resource | Bản ghi vừa tạo | VALIDATION_FAILED |
| Sửa | PATCH /api/:resource/:id | Bản ghi đã sửa | VALIDATION_FAILED, NOT_FOUND |
| Xóa | DELETE /api/:resource/:id | null | NOT_FOUND |

- GET `/api/dishes?q=...` tìm theo tên.
- Handler trả HTTP 200, gồm `ok: true, data` hoặc `ok: false, error`.
- `error.code` ổn định; `fields` là lỗi tương ứng input khi validate thất bại.
- Không có bản ghi và id sai kiểu: NOT_FOUND. Id phải được kiểm tra trước khi query database.
- Input sai: VALIDATION_FAILED. JSON giữ kiểu, price dạng chuỗi là không hợp lệ.
- Sai URL/method: 404; body không đọc được: 400; lỗi hệ thống/database: 500. Các lỗi này không có `ok`.
- PATCH cập nhật các trường được gửi và đã validate; chỉ chọn trường hợp lệ, không ghi nguyên body.
- GET không ghi database; chờ lệnh ghi hoàn tất trước khi trả thành công.
- Origin cho phép lấy từ cấu hình, không dùng `*`; response có Access-Control-Allow-Origin đúng origin SPA.
- Preflight OPTIONS thành công (thường 204), có Allow-Methods và Allow-Headers cho JSON/PATCH/DELETE.
- Lưu các request mẫu để nghiệm thu từng dòng CRUD và các nhánh lỗi.

## 3. SPA

| Trang | Yêu cầu |
| --- | --- |
| /dishes | Tìm tên bằng query q trên URL; link sang chi tiết |
| /dishes/:id | Hiện đủ trường; NOT_FOUND hiện không tìm thấy |
| /admin/dishes | Danh sách, link thêm/sửa/xóa |
| /admin/dishes/new | Form thêm |
| /admin/dishes/:id/edit | Nạp bản ghi theo id URL, form sửa |
| /admin/dishes/:id/delete | Xác nhận; chỉ nút Xóa gọi DELETE |

Lặp lại các trang **quản trị** cho chefs và ingredients cùng cấu trúc URL. Trang chi tiết quản trị chefs/ingredients không bắt buộc. Trang người dùng chỉ cần dishes.

- Routing phía client; đọc path/query từ URL. Mở trực tiếp, Reload và Back phải hoạt động.
- Server file SPA trả index.html cho URL trang, gồm URL sâu.
- Link nội bộ và ghi thành công không tải lại document.
- Sau thêm/sửa tới chi tiết nếu có hoặc danh sách; sau xóa tới danh sách.
- Mỗi trang tự tải dữ liệu khi mở, trang sửa/xóa GET theo id URL; không dùng kho bản ghi/danh sách toàn cục.
- Có loading, lỗi kỹ thuật, NOT_FOUND; danh sách thêm trạng thái rỗng.
- VALIDATION_FAILED hiện lỗi cạnh từng trường và giữ giá trị người dùng.
- Form ngăn submit mặc định, validate nhanh phía client; backend vẫn validate độc lập.
- Khóa nút trong lúc gửi để tránh request trùng.
- Hủy/bỏ qua response cũ khi đổi trang/id nhanh.
- Lớp gọi API dùng chung quản lý URL gốc/header và kiểm tra đủ: mạng, status HTTP/JSON, trường ok.
- Trang nhận data hoặc lỗi có loại/code/fields; không rải lời gọi fetch trong trang.
- NOT_FOUND khác thông báo lỗi kỹ thuật; API tắt/sai URL không làm trắng trang.
- Thoát ký tự dữ liệu API khi hiển thị; không chèn dữ liệu vào HTML thô.
- Không nhúng secret backend vào frontend.

## 4. Bằng chứng nghiệm thu

- Chạy từng dòng bảng CRUD cho ba tài nguyên; đối chiếu status, ok, data/error.code.
- Sai URL API là 404; hệ thống/database lỗi là 500, không có ok.
- Header CORS đúng origin, quan sát OPTIONS trước PATCH và DELETE trong browser (tắt cache).
- Mở thẳng/Reload mỗi URL SPA; lọc Network → Doc khi ghi để xác nhận không có document request mới.
- Gửi input sai, quan sát fields và form giữ giá trị.
- Xóa chỉ xảy ra khi xác nhận.
- Thử id không có và API tắt/sai URL: hai kết quả khác nhau, không trắng trang.
- Kiểm tra mã nguồn: GET không ghi, PATCH/DELETE đúng method, whitelist body, không lộ kết nối, lớp API kiểm tra đủ lỗi, không có kho dữ liệu chung, không HTML thô.
- Tự đánh giá đạt/chưa đạt bằng thao tác/output cụ thể, không chỉ ghi “đã code”.

## 5. Yêu cầu bổ sung của người dùng sau bài gốc

- Mang chức năng từ `week3/restaurant` qua: công thức món, amount/stock, số phần, gán/gỡ món cho đầu bếp; giữ tính chất SPA và REST API tuần 4.
- Thêm nguyên liệu ngay trong form thêm món, gồm chọn nguyên liệu tồn tại và tạo mới; lưu nguyên tử cùng món.
- Khôi phục PostgreSQL/Supabase và chuyển schema/seed SQL theo tuần 3; kết nối thật sau khi người dùng điền DATABASE_URL trong api/.env.
- Sửa font chữ tiếng Việt, thống nhất family và phục vụ font cục bộ.
- Có file đối chiếu bổ sung: `DOI-CHIEU-WEEK3.md`.
