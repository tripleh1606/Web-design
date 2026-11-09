# Backend cho ba kiểu UI phân trang

Theo `slide-knowledge/doc.md` và HTML gốc “Tìm kiếm và phân trang”, số trang, Load More và Infinite Scroll có thể dùng **cùng một API**. Week5 chọn server-side offset pagination, trả JSON cho SPA. Cả ba UI đã gọi endpoint này từ `web/src/menu-pagination.js`. Đối chiếu từng yêu cầu: [doi-chieu-html-pagination.md](./doi-chieu-html-pagination.md).

## Endpoint

```http
GET /api/dishes/paged?page=1&pageSize=10
```

Route tĩnh `/paged` được đăng ký trước `/api/dishes/:id`. Endpoint cũ `/api/dishes` tiếp tục trả mảng để các màn hình hiện có và trang quản trị hoạt động; UI phân trang mới cần gọi `/api/dishes/paged`.

UI mặc định **12 món/lượt**, các lựa chọn **12 / 24 / 36 / 48 / 96** để khớp 4 cột. Kích thước tùy chỉnh hợp lệ từ URL được làm tròn lên bội số 4, tối thiểu 12 (ví dụ 10 → 12, 50 → 52); thay kích thước thì trở về trang 1 và giữ các bộ lọc. API tiếp tục nhận 1–100 và mặc định 10 khi không gửi tham số để giữ tương thích; frontend luôn gửi kích thước đã chọn.

| Query | Mặc định | Quy tắc |
| --- | --- | --- |
| `page` | `1` | Số nguyên dương; giữ nguyên trang được yêu cầu kể cả vượt phạm vi |
| `pageSize` | `10` | Số nguyên từ 1 đến 100 |
| `mode` | `basic` ở API; UI gửi `smart` mặc định | `basic` tìm chuỗi trong tên; `fulltext` tìm các từ trên tên + mô tả; `smart` kết hợp full-text và tên gần đúng |
| `q` | Không có điều kiện tên ở basic | Trim, tối đa 120 ký tự; fulltext bắt buộc có q |
| `category` | Không lọc | `coffee`, `matcha`, `houjicha` |
| `minPrice`, `maxPrice` | Không giới hạn tương ứng | Số nguyên 0–2147483647; bao gồm hai đầu; min không lớn hơn max |
| `available` | Không lọc | Chỉ `true` hoặc `false` |
| `sort` | `id-asc` khi không tìm thông minh; `relevance` ở fulltext hoặc smart có q | Basic: id/tên/giá tăng giảm. Fulltext chỉ nhận relevance. Smart có q cho phép relevance hoặc id/tên/giá, thêm id ASC khi bằng điểm |

Chuỗi trắng ở điều kiện tùy chọn được bỏ qua. `page=`/`pageSize=` rỗng, số thập phân, ký hiệu mũ, giá trị lặp và query parameter không hỗ trợ đều là lỗi. Offset `(page - 1) * pageSize` tối đa 2147483647. Fulltext dùng PostgreSQL `simple`; Smart bỏ dấu, so từng từ bằng Levenshtein/trigram và chỉ dùng gợi ý xáo trộn ký tự khi không có kết quả tốt hơn. Chi tiết và giới hạn: [full-text-search.md](./full-text-search.md).

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

Ở Smart, `data.correctedQuery` là từ khóa được nhận diện khi token chưa tồn tại có một ứng viên hoán vị đầy đủ duy nhất (5–12 ký tự), ví dụ `chatma → matcha`. Backend tìm toàn bộ tập theo từ đã nhận diện trước khi COUNT/LIMIT; UI công bố việc này và vẫn giữ q gốc. Từ vựng nhận diện toàn cục, độc lập bộ lọc. Không tự thay token đã tồn tại hoặc có nhiều ứng viên. `matchType: corrected` phân biệt khớp này với full-text nguyên bản, fuzzy và gợi ý yếu.

## Cách frontend dùng chung API

| Kiểu UI | Request và cách sử dụng response |
| --- | --- |
| Số trang | Gọi page được chọn; thay danh sách bằng `data.items` |
| Load More | Bắt đầu page 1; mỗi lần bấm gọi trang kế tiếp rồi nối `data.items` |
| Infinite Scroll | Dùng cùng thao tác tải/nối của Load More; sentinel cuộn kích hoạt request |

Ở Số trang, dấu **…** là nút mở hộp thoại **Đến trang**. Người dùng nhập số rồi bấm **Đi tới** hoặc Enter; chỉ nhận số nguyên từ 1 đến tổng số trang. Dữ liệu không hợp lệ hiện lỗi tại ô nhập và không gửi request. Hủy, nút đóng hoặc Escape đóng hộp thoại. Chuyển trang giữ từ khóa, bộ lọc, sort và pageSize, điều hướng bằng SPA; có thể dùng bàn phím và mobile.

Backend không cần một route riêng cho từng nút hay sự kiện cuộn. Frontend chặn request trùng bằng trạng thái pending, chỉ tăng trang sau thành công và giữ trang khi lỗi để thử lại. Đổi điều kiện hoặc sort thì frontend xóa danh sách tích lũy, hủy/bỏ response cũ và bắt đầu page 1. Infinite Scroll có sentinel sau danh sách, tự kiểm tra lại khi viewport chưa đầy và disconnect khi rời trang; vẫn có nút Tải thêm cho thao tác bàn phím.

URL màn hình giữ `view=pages|more|infinite`, page, pageSize và toàn bộ điều kiện. Số trang khôi phục trực tiếp trang từ URL. Load More/Infinite Scroll luôn tải từ page 1 khi Reload/Back hoặc mở lại link, giữ bộ điều kiện và pageSize; chính sách này được ghi ngay trên UI. API chỉ trả đúng trang được yêu cầu.

## Phạm vi xử lý tại database

Tải thêm/Cuộn liên tục có thể tải trước tối đa một trang kế tiếp; Network sẽ thấy request này trước thao tác bấm/cuộn. Trang đã chuẩn bị chỉ được nối khi loadNext chấp nhận, không tự tăng nextPage. Bộ đệm không dùng lại giữa hai bộ điều kiện và bị hủy khi rời trang; chế độ tiết kiệm dữ liệu/2G tắt tải trước. Chi tiết số đo: [performance-and-search-setup.md](./performance-and-search-setup.md).

Tất cả điều kiện được kết hợp bằng AND trước khi sắp xếp và phân trang. `COUNT` và phần `LIMIT/OFFSET` sử dụng cùng predicate trong một câu SQL và cùng snapshot, giảm số lượt giao tiếp Supabase. LEFT JOIN giữ total khi trang rỗng. `available=false` và giá 0 không bị coi là thiếu điều kiện. Giá/tên trùng nhau luôn có `id ASC` làm thứ tự phụ; mặc định là `id ASC`.

Giá trị request được bind qua `Prisma.sql`. Basic dùng `LOWER(name) LIKE LOWER(pattern) ESCAPE '!'`, escape `%`, `_`, `!` theo nghĩa literal. Fulltext dùng `fts @@ plainto_tsquery('simple', q)` và `ts_rank` giảm dần, có GIN index. Smart xếp khớp full-text trước, sau đó tên gần đúng với từng từ khóa (bỏ dấu, Levenshtein 1–2 thao tác hoặc trigram >= 0.3). Gợi ý ký tự yếu bị loại nếu còn khớp thông thường trong tập sau bộ lọc; COUNT và page cùng dùng tập cuối này. Cả ba được phân trang tại database, không tải toàn bộ món về Node để cắt mảng. SQLite dùng cho local/test basic; fulltext và smart có q yêu cầu PostgreSQL và sẽ báo rõ nếu provider không hỗ trợ.

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
