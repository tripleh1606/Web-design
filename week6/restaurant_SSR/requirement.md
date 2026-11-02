# REQUIREMENTS — RESTAURANT SSR WITH DATABASE AND ORM

## 1. Nguồn yêu cầu

Tài liệu này được tổng hợp từ bài giảng **“SSR với database và ORM”**, tập trung vào phần bài tập, quy trình thực hiện, kiểm tra mã nguồn và tiêu chí nghiệm thu (các slide 32–40).

## 2. Mục tiêu bài học

Xây dựng một ứng dụng nhà hàng server-rendered để hiểu và thực hành:

- Kết nối ứng dụng Express với database Supabase.
- Truy cập database thông qua ORM và model thay cho việc ghép chuỗi SQL thủ công.
- Phân biệt và sử dụng đúng `req.params`, `req.query` và `req.body`.
- Dùng `GET` để đọc hoặc hiển thị dữ liệu.
- Dùng `POST`, `PATCH` và `DELETE` để ghi dữ liệu.
- Áp dụng **Post/Redirect/Get**: sau thao tác ghi thành công, server trả redirect để trình duyệt tải trang kết quả bằng `GET`.
- Đảm bảo HTML được render từ dữ liệu mới nhất trong database ở mỗi request.

## 3. Phạm vi ứng dụng

Ứng dụng phải có hai khu vực:

1. **Trang người dùng:** xem, tìm kiếm và xem chi tiết món ăn.
2. **Trang quản trị:** quản lý đầy đủ CRUD cho món ăn, đầu bếp và nguyên liệu.

## 4. Công nghệ và kiến trúc

- Sử dụng project khởi đầu **Node.js + Express + EJS**.
- Render HTML ở server bằng EJS (SSR).
- Sử dụng một project **Supabase** cho mỗi nhóm.
- Kết nối tới PostgreSQL của Supabase qua `DATABASE_URL`.
- Truy cập database thông qua ORM. Bài giảng minh họa quy trình code-first bằng **Prisma**, `prisma db push` và các model Prisma.
- Không dùng `fetch`, AJAX hoặc JavaScript phía client để gửi dữ liệu CRUD.
- Sử dụng `method-override` để form HTML có thể thực hiện `PATCH` và `DELETE` thông qua request `POST` kèm `_method`.

## 5. Cấu hình database và bảo mật

- Tạo project Supabase và đặt mật khẩu database.
- Lấy chuỗi kết nối bằng **Session pooler**, cổng `5432`.
- Lưu chuỗi kết nối trong biến `DATABASE_URL` của file `.env`.
- Có file `.env.example` nhưng không chứa thông tin bí mật thật.
- Thêm `.env` vào `.gitignore`; không commit `.env`.
- `DATABASE_URL` chỉ tồn tại ở server; không đưa chuỗi kết nối vào source code, log, template hoặc response gửi về client.
- Không truyền `process.env` hoặc ORM client vào `res.render()`.
- Không nối trực tiếp giá trị người dùng nhập vào raw SQL.
- Không truyền nguyên `req.body` vào thao tác `create` hoặc `update`. Chỉ truyền object dữ liệu đã được chọn trường, chuyển kiểu và validate.

## 6. Mô hình dữ liệu

Ứng dụng phải có ba model và script seed chứa dữ liệu cho cả ba model.

### 6.1. `Dish` — món ăn

Các trường được bài giảng gợi ý:

- `name`
- `description`
- `price`
- `category`
- `available`

Model mẫu trong bài giảng còn có:

- `id`: số nguyên, khóa chính, tự tăng.
- `createdAt`: thời điểm tạo, mặc định là thời điểm hiện tại.

### 6.2. `Chef` — đầu bếp

Các trường được bài giảng gợi ý:

- `name`
- `specialty`

### 6.3. `Ingredient` — nguyên liệu

Các trường được bài giảng gợi ý:

- `name`
- `unit`

## 7. Quy tắc truyền dữ liệu giữa các trang

- **Path parameter** dùng để xác định bản ghi, ví dụ `/dishes/2` cung cấp `req.params.id`.
- **Query parameter** dùng cho điều kiện hiển thị hoặc tìm kiếm, ví dụ `/dishes?q=pho` cung cấp `req.query.q`.
- **Request body** chứa dữ liệu cần ghi từ form, ví dụ `name=...&price=...` cung cấp `req.body`.
- Giữa các trang chỉ truyền `id` trong URL; trang đích phải dùng `id` để đọc lại bản ghi từ database.
- `req.params.id` là chuỗi nên phải được chuyển thành số và kiểm tra hợp lệ trước khi query.
- Giá trị nhận từ form là chuỗi, kể cả input có `type="number"`; server phải chuyển kiểu trước khi ghi.
- Input cần có thuộc tính `name` để xuất hiện trong request body.

## 8. Functional requirements — trang người dùng

### 8.1. Danh sách món ăn

- Route: `GET /dishes`.
- Đọc danh sách món ăn từ database và render bằng EJS.
- Hỗ trợ tìm món theo tên bằng query parameter `q`, ví dụ `/dishes?q=pho`.
- Mỗi món có link tới trang chi tiết theo dạng `/dishes/:id`.

### 8.2. Chi tiết món ăn

- Route: `GET /dishes/:id`.
- Đọc món ăn theo `id` từ database.
- Hiển thị đầy đủ các trường của món ăn.
- Trả trang lỗi `404` nếu `id` không hợp lệ hoặc bản ghi không tồn tại.

## 9. Functional requirements — trang quản trị

Ba khu vực sau đều phải có đầy đủ chức năng danh sách, thêm, sửa và xóa:

- `/admin/dishes`
- `/admin/chefs`
- `/admin/ingredients`

Mỗi tài nguyên áp dụng cùng mẫu route CRUD sau:

| Chức năng | HTTP method | Route mẫu | Kết quả |
|---|---|---|---|
| Danh sách | `GET` | `/admin/<resource>` | `200` |
| Mở form thêm | `GET` | `/admin/<resource>/new` | `200` |
| Thêm bản ghi | `POST` | `/admin/<resource>` | `303` khi thành công hoặc `400` khi input sai |
| Mở form sửa | `GET` | `/admin/<resource>/:id/edit` | `200` hoặc `404` |
| Sửa bản ghi | `PATCH` | `/admin/<resource>/:id` | `303`, `400` hoặc `404` |
| Mở trang xác nhận xóa | `GET` | `/admin/<resource>/:id/delete` | `200` hoặc `404` |
| Xóa bản ghi | `DELETE` | `/admin/<resource>/:id` | `303` hoặc `404` |

Trong bảng trên, `<resource>` lần lượt là `dishes`, `chefs` và `ingredients`.

## 10. Quy tắc HTTP và redirect

- `GET` chỉ dùng để đọc hoặc hiển thị; không dùng route/link `GET` để sửa hoặc xóa dữ liệu.
- Thêm bản ghi phải dùng `POST`.
- Sửa bản ghi phải dùng `PATCH`.
- Xóa bản ghi phải dùng `DELETE`.
- Do form HTML chỉ hỗ trợ trực tiếp `GET` và `POST`, sử dụng `method-override` với `_method=PATCH` hoặc `_method=DELETE`.
- Sau thao tác ghi thành công, server phải `await` thao tác ORM hoàn tất rồi trả redirect với status **`303 See Other`**.
- Sau redirect, trang đích thực hiện `GET`, đọc lại database và render HTML mới.
- Reload trang kết quả không được lặp lại thao tác thêm, sửa hoặc xóa.

## 11. Validation và xử lý lỗi

### 11.1. Input không hợp lệ

- Trả status `400`.
- Không ghi dữ liệu không hợp lệ vào database.
- Render lại form cùng thông báo lỗi.
- Giữ lại các giá trị hợp lệ mà người dùng đã nhập.

Ví dụ dữ liệu cần kiểm tra gồm tên trống, giá không phải số hoặc giá âm.

### 11.2. Không tìm thấy bản ghi

- Trả status `404` nếu `id` sai định dạng hoặc bản ghi không tồn tại.
- Trang `404` phải có đường dẫn để người dùng quay lại.

### 11.3. Lỗi hệ thống

- Trả status `500` khi xảy ra lỗi hệ thống, chẳng hạn mất kết nối database.
- Ghi chi tiết kỹ thuật vào log phía server.
- Chỉ hiển thị trang lỗi chung cho người dùng; không hiển thị trực tiếp message của database.

## 12. Quy tắc xóa dữ liệu

- Người dùng phải mở trang xác nhận xóa bằng `GET` trước.
- Việc xóa chỉ được thực hiện khi form xác nhận gửi request `DELETE`.
- Không được xóa dữ liệu bằng link hoặc route `GET`.

## 13. Trình tự thực hiện được yêu cầu

1. Đặt `DATABASE_URL`, khai báo ba model, chạy `db push` và seed dữ liệu.
2. Làm trang người dùng: danh sách món ăn, tìm kiếm, chi tiết và `404`.
3. Hoàn thành CRUD món ăn: form, validation, method override và redirect sau khi ghi.
4. Áp dụng cùng mẫu CRUD cho đầu bếp và nguyên liệu.
5. Đối chiếu toàn bộ mã nguồn với tiêu chí nghiệm thu.

## 14. Acceptance criteria

Bài làm đạt yêu cầu khi thỏa mãn tất cả điều kiện sau:

- Trang người dùng có danh sách và chi tiết món ăn.
- Tìm kiếm món ăn theo tên hoạt động qua query parameter `q`.
- `id` sai hoặc không tồn tại trả status `404`.
- Món ăn, đầu bếp và nguyên liệu đều có danh sách, thêm, sửa và xóa trong khu vực `/admin`.
- Thêm dùng `POST`, sửa dùng `PATCH`, xóa dùng `DELETE`.
- Không có `fetch` hoặc AJAX dùng để gửi dữ liệu CRUD.
- Không có route hoặc link `GET` làm thay đổi dữ liệu.
- Input sai trả `400`, không ghi database và giữ lại giá trị đã nhập.
- Thao tác ghi thành công trả redirect `303` sau khi ORM hoàn tất.
- Xóa chỉ xảy ra sau trang xác nhận.
- Reload sau redirect không lặp lại thao tác ghi.
- Dữ liệu hiển thị được đọc lại từ database ở mỗi request.
- Có `.env.example`, `.gitignore` loại trừ `.env`, ba model và script seed cho cả ba bảng.
- Không để lộ chuỗi kết nối hoặc lỗi database cho client.
- Không truyền trực tiếp `req.body` vào ORM và không ghép input vào raw SQL.

## 15. Ngoài phạm vi yêu cầu

Các nội dung sau không được bài giảng yêu cầu cho bài tập này:

- CSR cho thao tác CRUD.
- Gửi form bằng `fetch` hoặc AJAX.
- Client-side state làm nguồn dữ liệu chính.
- API JSON riêng cho giao diện.
- Authentication hoặc authorization cho trang quản trị.

