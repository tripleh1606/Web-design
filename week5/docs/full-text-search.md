# Full-text và tìm kiếm gần đúng trong week5

## Đã áp dụng ở đâu?

Database có cột `fts`, GIN index và trigger tự cập nhật từ tên (weight A) + mô tả (weight B). API `/api/dishes/paged` hỗ trợ full-text và tìm gần đúng. Giao diện mặc định **Thông minh · gần đúng**, gửi `mode=smart`; hai chế độ Theo tên và Full-text vẫn có thể chọn riêng. API không gửi mode vẫn dùng `basic` để giữ tương thích.

```http
GET /api/dishes/paged?mode=fulltext&q=matcha%20vani&page=1&pageSize=10
```

Query dùng `fts @@ plainto_tsquery('simple', q)`, kết hợp các điều kiện khác bằng AND, sắp xếp `ts_rank` giảm dần rồi `id ASC`. `items` có thêm `rank`; `total` vẫn đếm toàn bộ kết quả phù hợp trước phân trang. COUNT và trang vẫn được lấy trong một câu SQL. Toàn bộ giá trị người dùng được bind tham số.

| Chế độ | Cách khớp | Phạm vi |
| --- | --- | --- |
| `smart` (mặc định trên UI) | Full-text hoặc từng từ gần giống từ trong tên; xếp khớp đúng trước khớp gần đúng | Tên + mô tả khi khớp đúng; tên khi gần đúng |
| `basic` (mặc định API nếu không gửi mode) | Tên chứa nguyên chuỗi, không phân biệt hoa/thường | Chỉ tên |
| `fulltext` | Các từ của q đều xuất hiện, có thể không đứng cạnh nhau hoặc nằm ở hai trường khác nhau | Tên và mô tả |

Ví dụ tên `Latte dịu`, mô tả `Matcha có hương thơm của vani`: tìm `vani matcha` bằng Full-text tìm được, còn tìm chuỗi theo tên không thấy. Khớp trong tên được trọng số cao hơn khớp trong mô tả.

## Tìm tên thiếu từ hoặc sai chính tả

Món **Houjicha Cold Whisk**:

| Từ khóa | Theo tên | Full-text | Thông minh |
| --- | --- | --- | --- |
| `houjicha whisk` | Không (không liền nhau) | Có | Có |
| `houjcha whsk` | Không | Không | Có |
| `houjcha whsik` | Không | Không | Có (đảo hai chữ liền kề) |
| `houjicha zzzzz` | Không | Không | Không |

Smart kết hợp full-text với `pg_trgm.similarity` trên từng từ trong tên, không xét cả tên thành một chuỗi duy nhất. Mỗi từ khóa phải tìm được ít nhất một từ trong tên với điểm >= 0.3. Từ dưới 3 ký tự phải khớp đúng; chênh lệch độ dài bị giới hạn `max(1, floor(length/4))`. Một lần đảo hai ký tự liền kề được nhận diện riêng, điểm 0.8; từ giống hệt có điểm 1. Điểm fuzzy là trung bình điểm tốt nhất của từng từ. Đây là độ tương đồng theo quy tắc, không phải xác suất hay mô hình AI.

Khớp full-text được điểm `1 + ts_rank(..., 32)`, luôn xếp trước fuzzy. Khi bằng điểm dùng id tăng dần. Có thể chọn giá/tên để ghi đè thứ tự mặc định của Smart. API trả `rank` và `matchType: fulltext|fuzzy`; UI ghi “Tên gần với từ khóa” cho kết quả fuzzy. Không cam kết tìm ra mọi kiểu viết sai hay nhận diện từ đồng nghĩa.

Smart thực hiện lọc, tính điểm, đếm và phân trang tại PostgreSQL trong một câu SQL. CTE materialized chia sẻ tập kết quả cho COUNT và trang; không tải hết dữ liệu về client/Node để tìm. Nhánh fuzzy chấm điểm từng từ của các tên sau bộ lọc; GIN full-text/trigram đã có nhưng không được coi là bảo đảm tăng tốc cho phép chấm điểm này. Với dữ liệu lớn hơn cần đo lại và cân nhắc bảng từ vựng có index hoặc công cụ tìm kiếm chuyên dụng.

## Dùng trên UI

1. Mở `/dishes`, giữ **Thông minh · gần đúng** để có cả full-text và chịu lỗi gõ.
2. Nhập `houjicha whisk`, `houjcha whsk` hoặc `houjcha whsik` rồi bấm **Tìm món**. Smart chưa có từ khóa vẫn hiển thị danh sách bình thường. Chế độ Full-text riêng chờ nhập nếu chưa có từ khóa.
3. Dùng Số trang, Tải thêm hoặc Cuộn liên tục như cũ. URL và request giữ `mode`, q và mọi điều kiện.

Full-text cố định thứ tự **Liên quan nhất**; ô sort bị khóa để không hiển thị một lựa chọn giá/tên không được áp dụng. Smart có từ khóa mặc định **Liên quan nhất**, cho phép chọn thứ tự khác; không có từ khóa mặc định id tăng dần. Đổi chế độ/từ khóa/filter bắt đầu lại từ trang 1 và hủy bộ đệm cũ. Xóa bộ lọc khôi phục danh sách mặc định, chế độ Smart. Nếu URL cũ có `mode=basic`, đổi Cách tìm sang Thông minh hoặc mở lại `/dishes`.

## Giới hạn được công bố

- Full-text thuần dùng cấu hình `simple`, không tự bỏ dấu hay sửa lỗi chính tả. Smart chịu một số lỗi gõ nhưng không có bước bỏ dấu riêng; không bảo đảm mọi tên tiếng Việt viết không dấu đều khớp.
- q rỗng ở API fulltext trả `VALIDATION_FAILED`; chuỗi không tạo được token như `!!!` trả thành công với kết quả rỗng.
- Không ghép `sort=price-asc` hoặc sort tên vào fulltext: API báo lỗi thay vì bỏ qua tham số đó.
- Full-text/Smart có từ khóa cần PostgreSQL/Supabase và extension `pg_trgm` đã có trong setup. SQLite báo `FULLTEXT_REQUIRES_POSTGRESQL`; có thể dùng Theo tên cho SQLite. Không thay tìm gần đúng bằng LIKE.

## Tự kiểm tra

```powershell
npm test
npm run test:fulltext:browser
```

Unit/integration test thực thi câu SQL trên PostgreSQL cục bộ (PGlite), kiểm tra mô tả NULL, tên/mô tả, AND nhiều từ, lỗi gõ/đảo chữ, chống khớp từ không liên quan, rank/tie-break, các cận giá 0/available=false và trang vượt phạm vi. Browser test dùng cùng PostgreSQL để kiểm tra UI mặc định, chuyển mode và ba kiểu phân trang; không ghi vào Supabase.

Trên dữ liệu mẫu, thử `giả lập` với hai chế độ: cụm này có trong mô tả của các món mẫu, không có trong tên. Full-text sẽ tìm được các món đó.

Tham khảo cơ chế PostgreSQL: [Supabase Full Text Search](https://supabase.com/docs/guides/database/full-text-search), [PostgreSQL pg_trgm và tích hợp với full-text](https://www.postgresql.org/docs/current/pgtrgm.html#PGTRGM-TEXT-SEARCH).
