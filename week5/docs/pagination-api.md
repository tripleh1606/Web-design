# Backend cho ba kiểu UI phân trang

Theo `slide-knowledge/doc.md` và HTML gốc “Tìm kiếm và phân trang”, số trang, Load More và Infinite Scroll có thể dùng **cùng một API**. Week5 chọn server-side offset pagination, trả JSON cho SPA. Cả ba UI đã gọi endpoint này từ `web/src/menu-pagination.js`. Đối chiếu từng yêu cầu: [doi-chieu-html-pagination.md](./doi-chieu-html-pagination.md).

## Endpoint

```http
GET /api/dishes/paged?page=1&pageSize=10
```

Route tĩnh `/paged` được đăng ký trước `/api/dishes/:id`. Endpoint cũ `/api/dishes` tiếp tục trả mảng để các màn hình hiện có và trang quản trị hoạt động; UI phân trang mới cần gọi `/api/dishes/paged`.

| Query | Mặc định | Quy tắc |
| --- | --- | --- |
| `page` | `1` | Số nguyên dương; giữ nguyên trang được yêu cầu kể cả vượt phạm vi |
| `pageSize` | `10` | Số nguyên từ 1 đến 100 |
| `q` | Không có điều kiện tên | Trim, tối đa 120 ký tự; tên chứa chuỗi, không phân biệt hoa/thường trên PostgreSQL |
| `category` | Không lọc | `coffee`, `matcha`, `houjicha` |
| `minPrice`, `maxPrice` | Không giới hạn tương ứng | Số nguyên 0–2147483647; bao gồm hai đầu; min không lớn hơn max |
| `available` | Không lọc | Chỉ `true` hoặc `false` |
| `sort` | `id-asc` | `id-asc`, `id-desc`, `name-asc`, `name-desc`, `price-asc`, `price-desc` |

Chuỗi trắng ở điều kiện tùy chọn được bỏ qua. `page=`/`pageSize=` rỗng, số thập phân, ký hiệu mũ, giá trị lặp và query parameter không hỗ trợ đều là lỗi. Offset `(page - 1) * pageSize` tối đa 2147483647. `q` là literal contains, không tự bỏ dấu, không phải full-text/fuzzy; `mode` chưa thuộc contract của endpoint phân trang này.

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 23,
    "page": 4,
    "pageSize": 10
  },
  "error": null
}
```

`total` là tổng số món thỏa **toàn bộ điều kiện**, không phải độ dài `items`. Trang vượt phạm vi trả thành công với `items: []`, không tự đổi sang trang cuối. Không có kết quả thì `total: 0`. Có thể tính `totalPages = Math.ceil(total / pageSize)` và kết thúc khi `items.length === 0 || page * pageSize >= total`, kể cả trang cuối đủ `pageSize` món.

## Cách frontend dùng chung API

| Kiểu UI | Request và cách sử dụng response |
| --- | --- |
| Số trang | Gọi page được chọn; thay danh sách bằng `data.items` |
| Load More | Bắt đầu page 1; mỗi lần bấm gọi trang kế tiếp rồi nối `data.items` |
| Infinite Scroll | Dùng cùng thao tác tải/nối của Load More; sentinel cuộn kích hoạt request |

Backend không cần một route riêng cho từng nút hay sự kiện cuộn. Frontend chặn request trùng bằng trạng thái pending, chỉ tăng trang sau thành công và giữ trang khi lỗi để thử lại. Đổi điều kiện hoặc sort thì frontend xóa danh sách tích lũy, hủy/bỏ response cũ và bắt đầu page 1. Infinite Scroll có sentinel sau danh sách, tự kiểm tra lại khi viewport chưa đầy và disconnect khi rời trang; vẫn có nút Tải thêm cho thao tác bàn phím.

URL màn hình giữ `view=pages|more|infinite`, page, pageSize và toàn bộ điều kiện. Số trang khôi phục trực tiếp trang từ URL. Load More/Infinite Scroll luôn tải từ page 1 khi Reload/Back hoặc mở lại link, giữ bộ điều kiện và pageSize; chính sách này được ghi ngay trên UI. API chỉ trả đúng trang được yêu cầu.

## Phạm vi xử lý tại database

Tải thêm/Cuộn liên tục có thể tải trước tối đa một trang kế tiếp; Network sẽ thấy request này trước thao tác bấm/cuộn. Trang đã chuẩn bị chỉ được nối khi loadNext chấp nhận, không tự tăng nextPage. Bộ đệm không dùng lại giữa hai bộ điều kiện và bị hủy khi rời trang; chế độ tiết kiệm dữ liệu/2G tắt tải trước. Chi tiết số đo: [performance-and-search-setup.md](./performance-and-search-setup.md).

Tất cả điều kiện được kết hợp bằng AND trước khi sắp xếp và phân trang. `COUNT` và phần `LIMIT/OFFSET` sử dụng cùng predicate trong một câu SQL và cùng snapshot, giảm số lượt giao tiếp Supabase. LEFT JOIN giữ total khi trang rỗng. `available=false` và giá 0 không bị coi là thiếu điều kiện. Giá/tên trùng nhau luôn có `id ASC` làm thứ tự phụ; mặc định là `id ASC`.

Giá trị request được bind qua `Prisma.sql`. SQL sắp xếp được chọn từ hằng số của server. Từ khóa có `%`, `_`, `!` được escape riêng để không trở thành wildcard. Trên Supabase/PostgreSQL, biểu thức `LOWER(name) LIKE LOWER(pattern) ESCAPE '!'` thực hiện tìm chứa chuỗi không phân biệt hoa/thường; không tải toàn bộ món về Node rồi mới cắt mảng. SQLite chỉ dùng cho local/test, hàm `LOWER` tích hợp của SQLite không hỗ trợ đầy đủ chữ hoa/thường Unicode như PostgreSQL.

Thứ tự ổn định ngăn trùng/mất món khi dataset không đổi. Offset có thể dịch khi người khác thêm/xóa hoặc đổi giá/tên giữa các request. Đây là giới hạn được công bố của offset pagination; backend không cam kết snapshot chung cho toàn bộ một phiên cuộn.

## Lỗi và kiểm tra

Query sai trả HTTP `200`, `ok: false`, `data: null`, `error.code: VALIDATION_FAILED` và `error.fields`. Lỗi hệ thống/database trả HTTP `500` với message chung; route/method không tồn tại vẫn `404` theo contract kỹ thuật hiện tại. Không trả connection string hoặc lỗi SQL thô cho browser.

```http
GET /api/dishes/paged?page=2&pageSize=10
GET /api/dishes/paged?q=Matcha&category=matcha&page=2&pageSize=10
GET /api/dishes/paged?category=coffee&minPrice=0&maxPrice=40000&available=false&sort=price-asc&page=1&pageSize=10
GET /api/dishes/paged?q=0%25&pageSize=10
GET /api/dishes/paged?page=0
```

```powershell
cd D:\WebApplication\Web-design\week5
npm test
npm run test:pagination:live
```

`npm test` dùng các database test riêng; kiểm tra trang đầu/giữa/cuối/vượt phạm vi, ID có khoảng trống, literal `%/_/!`, giá 0, `false`, lỗi query, thứ tự phụ và lỗi database. Có test thực thi chính query PostgreSQL qua PGlite.

`test:pagination:live` đọc Supabase theo `api/.env`, khởi động API trên cổng tạm, tải từng trang qua HTTP và so toàn bộ ID với database. Kiểm tra tìm/lọc/sort trên dữ liệu thật; không thêm/sửa/xóa món và không xuất credentials. Giữ dataset ổn định trong lúc kiểm tra. Frontend có thể nghiệm thu bằng Network khi được nối vào endpoint này.
