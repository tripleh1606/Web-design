# Tối ưu tải món, đồng bộ FTS và nhập Chef

## Tải dữ liệu nhanh hơn

API phân trang gộp COUNT và trang kết quả vào **một câu SELECT**, thay cho transaction gồm BEGIN, cấu hình isolation, COUNT, SELECT và COMMIT. Hai nhánh dùng cùng predicate, cùng snapshot của một statement. LEFT JOIN giữ được total khi trang vượt phạm vi; thứ tự phụ id và contract không đổi.

Số đo trên cùng Supabase, 5 request lấy 10 món; request đầu là cold connection, bốn request tiếp theo dùng kết nối đã nóng:

| | Trước | Sau |
| --- | --- | --- |
| Số lệnh database/request | 5 | 1 |
| Bốn request warm | 1185 / 1199 / 1152 / 1644 ms | 275 / 238 / 259 / 256 ms |

Đây là số đo tại thời điểm kiểm tra, phụ thuộc mạng và tải database; không phải cam kết thời gian cố định. Cold connection vẫn có chi phí kết nối Supabase.

Tải thêm/Cuộn liên tục giữ tối đa **một trang kế tiếp** trong bộ đệm của riêng màn hình. Request đang chạy được dùng lại nếu người dùng bấm tải; tải trước không tăng nextPage, không nối cards và không thay đổi URL. Lỗi tải trước được bỏ khỏi bộ đệm để thao tác thật có thể thử lại. Rời trang/đổi điều kiện abort request và hủy bộ đệm. Không tải trước khi bật Save Data hoặc trên kết nối 2G.

Cards được ghép trong DocumentFragment rồi nối một lần. Nút tải không bị xóa/tạo lại khi chuyển trạng thái, ảnh decode bất đồng bộ; animation vào ngắn hơn và vẫn tôn trọng reduced motion. Ảnh/font cache 24 giờ; HTML, JS, config và dữ liệu API vẫn không cache để cập nhật source/dữ liệu được phản ánh ngay. Không đổi bố cục, màu hay nội dung của các thẻ.

Browser test giả lập 500ms trễ cho trang 2; khi dữ liệu đã tải trước, thao tác hiển thị thêm được đo khoảng 62ms. Test cũng xác nhận trang 2 chỉ có một request và nút tải vẫn là cùng DOM node.

## Một cách quản lý FTS thống nhất

Prisma 6 không mô tả đầy đủ PostgreSQL generated columns. Cấu hình mới dùng:

- Prisma: `fts Unsupported("tsvector")?`, cùng ba index khai báo rõ trong schema.
- PostgreSQL: trigger `dishes_fts_refresh` tự tính `fts` trước INSERT hoặc khi đổi name/description/fts; cấu hình `simple`, trọng số tên A và mô tả B, coalesce trường NULL.
- Script SQL chuyển cột generated cũ bằng `DROP EXPRESSION`, giữ nguyên cột, giá trị và index; sau đó gắn trigger và backfill những giá trị chưa khớp. Không xóa món hoặc quan hệ.

Nguồn SQL chuẩn là `api/prisma/search-setup.sql`; bản legacy `restaurant/prisma/search-setup.sql` được kiểm tra phải giống hệt. Helper legacy gọi helper chung, giữ đúng `.env` của app legacy. Toàn bộ SQL được gửi qua Prisma CLI `db execute --file`, không split theo dấu `;` hoặc loại bỏ đoạn bắt đầu bằng comment. Toàn bộ setup nằm trong transaction và chạy lặp lại được.

```powershell
# App chính ở week5/api + week5/web
npm run db:search-setup
npm run db:push --workspace @soucha/api
```

Wrapper db:push PostgreSQL chạy search setup trước (extension/chuyển generated cũ) và sau push (trigger/backfill/index). Trước khi có bảng, setup chỉ chuẩn bị extension/function; lần sau hoàn tất phần còn lại. SQLite không chạy phần PostgreSQL này. Dùng npm script thay vì gọi trực tiếp `prisma db push` để luôn chạy wrapper. SQL xuất bằng `npm run db:sql` cũng đã bao gồm search setup.

Test schema giờ so sánh business models với week3 và kiểm tra riêng phần mở rộng FTS/index của week5. Test PostgreSQL xác nhận cả database mới, cột thường, cột generated cũ, tự cập nhật khi đổi tên/mô tả và chạy setup nhiều lần.

## Danh sách 28 Chef

Danh sách nguồn được lưu ở `api/prisma/chef-roster.js`. Với riêng danh sách này, chuyển token tên đang đứng đầu xuống cuối: `Hải Đinh Viết` → `Đinh Viết Hải`, `Quang Lê Trần Lam` → `Lê Trần Lam Quang`. Giữ nguyên dấu và cách viết do người dùng cung cấp, chuyên môn mặc định Pha chế.

```powershell
npm run db:seed:chefs -- --preview
npm run db:seed:chefs
npm run db:seed:chefs -- --apply
```

Preview xem toàn bộ tên; không có cờ chỉ dry-run. Apply thêm người chưa có, không ghi đè chuyên môn người đã tồn tại, không tạo trùng khi chạy lại. Đã nhập 28 người mới; Chef tăng từ 3 lên 31. Có thể xem tại `/admin/chefs`.
