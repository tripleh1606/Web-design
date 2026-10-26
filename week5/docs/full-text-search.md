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
| `houcha` | Không | Không | Có (thiếu hai ký tự) |
| `kswh` | Không | Không | Gợi ý theo ký tự nếu không có kết quả tốt hơn |
| `chatma` | Không | Không | Nhận diện `matcha`, tìm toàn bộ tập kết quả theo từ đó |
| `houjicha zzzzz` | Không | Không | Không |

Smart chuẩn hóa Unicode NFC, bỏ dấu bằng `unaccent`, chuyển chữ thường rồi so từng từ bằng helper SQL `soucha_word_score`. Mọi từ khóa đều phải được xét; không âm thầm bỏ từ không khớp.

**Nhận diện từ trước khi tìm món:** nếu một token không tồn tại trong từ vựng tên món, dài 5–12 ký tự và chỉ có đúng một từ khác cùng toàn bộ ký tự/số lần lặp, Smart dùng từ đó để tìm. Ví dụ `chatma → matcha`. Sau đó chạy full-text với từ đã nhận diện trên tên + mô tả và chấm fuzzy theo từ này, lấy toàn bộ kết quả rồi mới đếm/phân trang. Từ vựng dùng toàn database, nên category/giá/trạng thái không làm thay đổi cách diễn giải từ khóa. Nếu token đã tồn tại hoặc có nhiều ứng viên hoán vị, không tự thay từ.

API trả thêm `correctedQuery` khi có bước nhận diện; UI hiện “Hiển thị kết quả cho …”, giữ nguyên từ người dùng nhập trong ô tìm và URL. Metadata vẫn có khi trang vượt phạm vi hoặc bộ lọc không còn kết quả. `matchType: corrected` chỉ các món khớp full-text với từ đã nhận diện.

Điều này sửa lỗi trả thiếu với `chatma`: trước đây các từ như “chất”/“chai” có điểm cao hơn phép hoán vị `matcha`, khiến bộ lọc bỏ gần hết nhóm Matcha. Kiểm tra hồi quy có nhiều món Matcha, một món “Matcha 100% nguyên chất” và một món “Cà phê đóng chai”, so toàn bộ ID qua nhiều trang với truy vấn `matcha`.

- **Edit distance (Levenshtein):** đếm số lần thêm/xóa/thay ký tự. Từ 2–4 ký tự cho phép 1 thao tác, từ 5 ký tự trở lên cho phép 2; chênh lệch độ dài không vượt ngân sách này. Từ hai ký tự chỉ được sửa khi query có ít nhất hai từ. Từ một ký tự phải đúng hoàn toàn. Điểm là `1 - distance / max(length)`.
- **Trigram similarity:** giữ ngưỡng 0.3 ở nhánh so từng từ có từ ba ký tự, nhưng chỉ chấm khi chênh lệch độ dài nằm trong ngân sách; chuyển điểm vào khoảng 0.5–0.99 để phân biệt với gợi ý yếu. Một lần đảo hai chữ liền kề vẫn được nhận diện riêng, điểm 0.8. Đây không phải triển khai toàn bộ thuật toán Damerau–Levenshtein.
- **Character multiset / anagram-like matching:** với từ dài 4–12 ký tự, chênh độ dài tối đa 1, yêu cầu ít nhất 80% ký tự giống nhau, có tính số lần lặp. Vì bỏ qua thứ tự, bằng chứng này yếu: điểm 0.35 và chỉ trả dưới dạng gợi ý khi toàn bộ tập kết quả sau bộ lọc không có khớp full-text hoặc fuzzy thông thường. Ví dụ `kswh` có thể gợi ý `Whisk`; không coi đó là phép sửa chính tả chắc chắn.

Điểm fuzzy là trung bình điểm tốt nhất của từng từ; mỗi từ phải đạt ít nhất 0.5. Khi phải dùng nhánh ký tự yếu, mỗi từ đạt ít nhất 0.35 và điểm cuối giảm một nửa. Đây là độ tương đồng theo quy tắc, không phải xác suất hay mô hình AI. Các hàm và ngưỡng được định nghĩa tại `api/prisma/search-setup.sql`.

Với hai món `Bánh bò` và `Cơm bò`, `báh bì` được chuẩn hóa thành `bah bi`: `bah → banh` là thêm một chữ, `bi → bo` là thay một chữ. Kết quả chọn `Bánh bò`; từ `com` không đủ gần `bah`. Các món này chỉ được thêm trong database test riêng, không được nhập vào thực đơn Supabase.

Trong Smart, khớp full-text với từ gốc được điểm `2 + ts_rank(..., 32)`, khớp full-text với từ nhận diện được `1 + ts_rank(..., 32)`, sau đó đến fuzzy. Khi bằng điểm dùng id tăng dần. Full-text thuần giữ cách tính `ts_rank` cũ. Có thể chọn giá/tên để ghi đè thứ tự mặc định của Smart. API trả `rank` và `matchType: fulltext|corrected|fuzzy|suggestion`; UI phân biệt “Tên gần với từ khóa” với “Gợi ý theo ký tự · khớp yếu”. Không cam kết tìm ra mọi kiểu viết sai hay nhận diện từ đồng nghĩa.

Smart thực hiện nhận diện từ, lọc, tính điểm, đếm và phân trang tại PostgreSQL trong một câu SQL. CTE materialized chia sẻ tập kết quả cho COUNT và trang; không tải hết dữ liệu về client/Node để tìm. Tên được chuẩn hóa một lần, gom thành bộ từ vựng toàn cục không trùng và chấm mỗi cặp từ khóa–từ vựng một lần, rồi dùng lại điểm cho mọi món sau bộ lọc. GIN full-text/trigram đã có nhưng không được coi là bảo đảm tăng tốc cho phép chấm điểm này. Với dữ liệu lớn hơn cần đo lại và cân nhắc bảng từ vựng có index hoặc công cụ tìm kiếm chuyên dụng.

## Dùng trên UI

1. Mở `/dishes`, giữ **Thông minh · gần đúng** để có cả full-text và chịu lỗi gõ.
2. Nhập `houjicha whisk`, `houjcha whsk` hoặc `houjcha whsik` rồi bấm **Tìm món**. Smart chưa có từ khóa vẫn hiển thị danh sách bình thường. Chế độ Full-text riêng chờ nhập nếu chưa có từ khóa.
3. Dùng Số trang, Tải thêm hoặc Cuộn liên tục như cũ. URL và request giữ `mode`, q và mọi điều kiện.

Full-text cố định thứ tự **Liên quan nhất**; ô sort bị khóa để không hiển thị một lựa chọn giá/tên không được áp dụng. Smart có từ khóa mặc định **Liên quan nhất**, cho phép chọn thứ tự khác; không có từ khóa mặc định id tăng dần. Đổi chế độ/từ khóa/filter bắt đầu lại từ trang 1 và hủy bộ đệm cũ. Xóa bộ lọc khôi phục danh sách mặc định, chế độ Smart. Nếu URL cũ có `mode=basic`, đổi Cách tìm sang Thông minh hoặc mở lại `/dishes`.

## Giới hạn được công bố

- Full-text thuần dùng cấu hình `simple`, không tự bỏ dấu hay sửa lỗi chính tả. Smart bỏ dấu khi so tên, có ngân sách lỗi gõ hữu hạn; không bảo đảm mọi chuỗi sai đều tìm đúng món người dùng nghĩ tới.
- q rỗng ở API fulltext trả `VALIDATION_FAILED`; chuỗi không tạo được token như `!!!` trả thành công với kết quả rỗng.
- Không ghép `sort=price-asc` hoặc sort tên vào fulltext: API báo lỗi thay vì bỏ qua tham số đó.
- Full-text/Smart có từ khóa cần PostgreSQL/Supabase. Setup cài `pg_trgm`, `unaccent`, `fuzzystrmatch` và hai helper SQL. Sau khi pull code, chạy `npm run db:search-setup` một lần rồi restart API. SQLite báo `FULLTEXT_REQUIRES_POSTGRESQL`; có thể dùng Theo tên cho SQLite. Không thay tìm gần đúng bằng LIKE.

## Tự kiểm tra

```powershell
npm test
npm run test:fulltext:browser
```

Unit/integration test thực thi câu SQL trên PostgreSQL cục bộ (PGlite), kiểm tra mô tả NULL, tên/mô tả, AND nhiều từ, lỗi gõ/đảo chữ, chống khớp từ không liên quan, rank/tie-break, các cận giá 0/available=false và trang vượt phạm vi. Browser test dùng cùng PostgreSQL để kiểm tra UI mặc định, chuyển mode và ba kiểu phân trang; không ghi vào Supabase.

Trên dữ liệu mẫu, thử `giả lập` với hai chế độ: cụm này có trong mô tả của các món mẫu, không có trong tên. Full-text sẽ tìm được các món đó.

Tham khảo cơ chế PostgreSQL: [Full Text Search](https://supabase.com/docs/guides/database/full-text-search), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html#PGTRGM-TEXT-SEARCH), [Levenshtein](https://www.postgresql.org/docs/current/fuzzystrmatch.html#FUZZYSTRMATCH-LEVENSHTEIN), [unaccent](https://www.postgresql.org/docs/current/unaccent.html).
