# Tìm kiếm và phân trang

### MSc. Ngô Ngọc Đăng Khoa

Phát triển ứng dụng web

# Tìm kiếm và phân trang

## Nội dung buổi học

1. Pagination và các kiểu hiển thị
2. Sort/filter trên dữ liệu đã tải
3. Basic và advanced search tại server
4. Fuzzy search và tài liệu tự học full-text
5. Bài tập

Phát triển ứng dụng web

# Câu hỏi xuyên suốt

> Khi danh sách chỉ hiện một phần dữ liệu, thao tác nào tác động tới phần đang có, thao tác nào tác động tới toàn bộ tập kết quả?

Phát triển ứng dụng web

# Mục tiêu

* Phân biệt nơi phân trang, cách cập nhật và kiểu UI
* Sort/filter đúng phạm vi dữ liệu browser đã nhận
* Chọn cơ chế search và cấu hình PostgreSQL tương ứng
* Đọc query, URL và response để nghiệm thu mã của agent

Phát triển ứng dụng web

# Pagination

Phát triển ứng dụng web

# Quyết định

![](./Tìm kiếm và phân trang_files/block7-pagination-layers.svg)

Phát triển ứng dụng web

![](./Tìm kiếm và phân trang_files/block7-page-delivery.svg)

Phát triển ứng dụng web

# Offset

`-- Ví dụ giả định: page = 3, pageSize = 10
SELECT id, title, description, category, price, available
FROM books
ORDER BY id ASC
LIMIT 10 OFFSET 20;`

* `offset = (page - 1) * pageSize`
* `ORDER BY id ASC` cố định thứ tự của danh sách
* Thêm hoặc xóa dữ liệu vẫn có thể làm lệch offset

Phát triển ứng dụng web

# Response có chứa pagination

`{
"ok": true,
"data": {
"items": [],
"total": 23, "page": 4, "pageSize": 10
},
"error": null
}`

* Ví dụ giả định: trang 4 hợp lệ nhưng không có items
* `totalPages = Math.ceil(total / pageSize)` cho kết quả `3`
* `total` không phải số phần tử của trang hiện tại

Phát triển ứng dụng web

# Lưu ý

* **Ví dụ:** `page=1`, `pageSize=10`, tối đa `100`
* **Hợp lệ:** số nguyên dương, trang vượt phạm vi trả `items: []`
* **Không hợp lệ:** status `200`, `ok: false`, mã `VALIDATION_FAILED`
* **Lỗi kỹ thuật:** route sai hoặc lỗi hệ thống, dùng `404/500`

Phát triển ứng dụng web

# Ba UI dùng cùng API phân trang

![](./Tìm kiếm và phân trang_files/block7-list-interactions.svg)

Phát triển ứng dụng web

# Load More

* Giữ `nextPage`, danh sách tích lũy, `pending` và `end`
* Chặn tải tiếp khi `pending` hoặc `end` đang đúng
* Thành công: nối `data.items`, rồi tăng `nextPage`
* Hết dữ liệu: `page * pageSize >= total` hoặc items rỗng

Phát triển ứng dụng web

# Infinite Scroll

`const observer = new IntersectionObserver(entries => {
if (entries.some(entry => entry.isIntersecting)) {
loadNext();
}
}, { rootMargin: "200px 0px" });
observer.observe(sentinel);
// Khi rời trang: observer.disconnect();`

* `sentinel` đặt sau danh sách, không phải từng cuốn sách
* `loadNext()` vẫn kiểm tra `pending` và `end`

Phát triển ứng dụng web

# Mở lại đúng kết quả qua URL

`/books?q=web&page=2&pageSize=10`

| Trên URL | Giao diện cần khôi phục |
| --- | --- |
| `q=web` | Ô tìm kiếm có từ khóa `web` |
| `page=2` | Mở trang 2 của kết quả |
| `pageSize=10` | Hiển thị tối đa 10 sách mỗi trang |

Copy link sang tab khác hoặc Reload vẫn mở lại các lựa chọn này.

Phát triển ứng dụng web

# Khi tìm lại hoặc chuyển trang

* **Tìm kiếm:** áp dụng từ khóa mới, bắt đầu ở trang 1
* **Chuyển trang:** giữ từ khóa, chỉ đổi số trang trên URL
* **Xóa điều kiện:** hiện lại danh sách, bắt đầu ở trang 1
* **Reload, Back/Forward:** đọc URL để khôi phục lựa chọn

Phát triển ứng dụng web

# Sort & Filter (Client-side)

Phát triển ứng dụng web

# Filter: chỉ giữ sách thỏa điều kiện

| Sách | Thể loại | Còn hàng |
| --- | --- | --- |
| Web căn bản | Công nghệ | Có |
| SQL nhập môn | Công nghệ | Không |
| Truyện ngắn | Văn học | Có |

Ví dụ giả định: chọn **Công nghệ** và **Còn hàng**, chỉ hiện **Web căn bản**.

Phát triển ứng dụng web

# Sort: đổi thứ tự, không loại bớt sách

| Thứ tự giá tăng dần | Giá giả định |
| --- | --- |
| SQL nhập môn | 80,000 |
| Truyện ngắn | 90,000 |
| Web căn bản | 120,000 |

Phát triển ứng dụng web

# Client chỉ xử lý dữ liệu đã nhận

* Đã tải đủ danh sách: lọc và sort trên toàn bộ danh sách đó
* Mới tải một trang: chỉ lọc và sort được các sách của trang đó
* Muốn áp dụng cho toàn bộ kết quả: phải có đủ tập dữ liệu cần xử lý

Phát triển ứng dụng web

# Search (Server-side)

Phát triển ứng dụng web

# Hai chiều thông tin của chức năng search

| Chiều thiết kế | Các lựa chọn | Câu hỏi cần trả lời |
| --- | --- | --- |
| Giao diện và tiêu chí | Basic, advanced | Người dùng nhập những gì? |
| Quy tắc so khớp văn bản | Literal contains, fulltext, fuzzy | Khi nào một sách được chọn? |

* Basic không có nghĩa là tìm ở client; advanced không đồng nghĩa với `fulltext-search`
* Nhiều tiêu chí có thể kết hợp với một quy tắc so khớp văn bản

Phát triển ứng dụng web

# Server tìm trên toàn bộ collection

* SPA gửi tiêu chí: `GET /api/books?mode=advanced&q=sql&available=false`
* Server chuẩn hóa, validate, gắn tham số vào SQL rồi tìm sách
* Trả `{ items, total, page, pageSize }` trong `data` của response
* Không có kết quả là `ok: true`, `items: []`, `total: 0`

Phát triển ứng dụng web

# Fixture Books giả định

| id | title | category | price (đồng) | available |
| --- | --- | --- | --- | --- |
| 1 | PostgreSQL guide | database | 120000 | true |
| 2 | SQL for beginners | database | 80000 | false |
| 4 | Cats and rats | fiction | 60000 | true |
| 5 | Running with cats | fiction | 70000 | true |
| 6 | 100% SQL\_notes | database | 0 | false |
| 7 | Postgres guide | database | 110000 | true |

Phát triển ứng dụng web

# Basic: title chứa chuỗi nhập

`PREPARE basic_search(text) AS
SELECT id, title
FROM books
WHERE title ILIKE $1 ESCAPE '!'
ORDER BY id ASC;`

* Nhập `SQL`, server bind pattern `%SQL%`; kỳ vọng id `1, 2, 6`
* Dùng parameter binding của driver, không nối input vào câu SQL

Phát triển ứng dụng web

# Lưu ý: Ký tự đặc biệt vẫn là dữ liệu

| Người dùng nhập | Pattern được bind | Ý nghĩa |
| --- | --- | --- |
| `100%` | `%100!%%` | Chứa đúng `100%` |
| `SQL_` | `%SQL!_%` | Chứa đúng `SQL_` |
| `!` | `%!!%` | Chứa đúng `!` |

* `%` và `_` do người dùng nhập không được mở rộng phạm vi tìm kiếm
* Một chuỗi không khớp phải trả danh sách rỗng, không trả toàn bộ sách

Phát triển ứng dụng web

# Advanced: ghép nhiều tiêu chí

![](./Tìm kiếm và phân trang_files/block7-advanced-predicates.svg)

Phát triển ứng dụng web

# Phân biệt query Rỗng, false, 0

* Thiếu trường hoặc chuỗi trắng: chuẩn hóa thành không có tiêu chí
* `available=false`: chỉ sách không có sẵn, không được bỏ điều kiện
* `minPrice=0`: một cận giá hợp lệ, không phải giá trị rỗng
* Số sai định dạng, boolean lạ, hoặc `minPrice > maxPrice`: `VALIDATION_FAILED`

Phát triển ứng dụng web

# Một truy vấn advanced có tham số

`PREPARE advanced_search(text, text, numeric, numeric, boolean) AS
SELECT id, title
FROM books
WHERE ($1 IS NULL OR title ILIKE $1 ESCAPE '!')
AND ($2 IS NULL OR category = $2)
AND ($3 IS NULL OR price >= $3)
AND ($4 IS NULL OR price <= $4)
AND ($5 IS NULL OR available = $5)
ORDER BY id ASC;`
Phát triển ứng dụng web

# Search và filter

* Basic và advanced phải cho cùng kết quả khi chỉ có cùng `q`
* `total` đếm cùng predicate mà truy vấn `items` đang dùng
* Chỉ sau khi chọn tập kết quả mới áp thứ tự và phân trang

Phát triển ứng dụng web

# Full-text search: tài liệu tự học

* [Supabase: Full Text Search](https://supabase.com/docs/guides/database/full-text-search)
* [MySQL Tutorial: MySQL Full-Text Search](https://www.mysqltutorial.org/mysql-full-text-search/)

Phát triển ứng dụng web

# Fuzzy: chọn theo độ gần ký tự

![](./Tìm kiếm và phân trang_files/block7-fuzzy-threshold.svg)

Phát triển ứng dụng web

# Bài tập

## Ứng dụng nhà hàng

Phát triển ứng dụng web

# Chuẩn bị

* Lưu ít nhất **1.000 món ăn trong database Supabase**
* Có script seed để tạo lại dữ liệu; giữ chức năng CRUD

Phát triển ứng dụng web

# Phân trang món ăn: ba cách hiển thị

| Cách hiển thị | Mong muốn |
| --- | --- |
| Số trang | Chọn trang để thay danh sách đang xem |
| Load More | Bấm Tải thêm để nối món vào danh sách |
| Infinite Scroll | Cuộn gần cuối để tự nối phần tiếp theo |

Phát triển ứng dụng web

# Nhóm tự chọn giải pháp phân trang

* **Client-side:** tải đủ tập dữ liệu cần dùng rồi chia tại browser
* **Server-side:** server chọn phần dữ liệu cho mỗi yêu cầu
* **Cập nhật giao diện:** tải trang HTML mới hoặc dùng AJAX
* Giải thích lựa chọn bằng lượng dữ liệu tải và hành vi khi chuyển trang

Phát triển ứng dụng web

# Filter và sort ở chức năng phù hợp

* Danh sách món: lọc category, khoảng giá hoặc trạng thái còn bán
* Danh sách món hoặc quản trị: sắp xếp tên, giá tăng hoặc giảm
* Chọn vị trí áp dụng và nêu rõ tập dữ liệu bị tác động

Phát triển ứng dụng web

# Search tại server

| mode | Yêu cầu |
| --- | --- |
| `basic` | Tìm một phần tên, không phân biệt hoa/thường |
| `advanced` | `q`, category, minPrice, maxPrice, available; kết hợp AND |
| `fulltext` | Tìm trên tên và mô tả bằng PostgreSQL full-text |
| `fuzzy` | Tìm tên gần giống bằng `pg_trgm` |

Phát triển ứng dụng web

# Cấu hình PostgreSQL cho bài tập

* Full-text: `simple`, cùng cấu hình cho document và query
* Document gồm tên và mô tả, xử lý trường có thể `NULL`
* Fuzzy: bật `pg_trgm`, công bố ngưỡng similarity `0.3`
* Full-text/fuzzy theo điểm giảm dần, thêm `id` khi điểm bằng nhau

Phát triển ứng dụng web

# Mở lại kết quả và thay đổi điều kiện

* Số trang: copy URL hoặc Reload giữ điều kiện và trang đang xem
* Tìm lại, đổi filter hoặc sort: bắt đầu từ phần đầu của kết quả mới
* Load More, Infinite Scroll: không trộn kết quả của hai lần tìm
* Công bố khi mở lại link sẽ tải từ đầu hay khôi phục phần đã xem

Phát triển ứng dụng web

# Nghiệm thu bằng kết quả quan sát được

| Thao tác | Kết quả cần chứng minh |
| --- | --- |
| Chọn trang, Tải thêm, cuộn tiếp | Ba kiểu UI hoạt động, không mất hoặc lặp món |
| Đổi filter hoặc sort | Đúng điều kiện, thứ tự và phạm vi đã công bố |
| Chuyển trang sau khi search | Giữ đúng bộ điều kiện, không trộn kết quả |
| Xóa điều kiện, Reload, mở lại link | Khôi phục danh sách hoặc lựa chọn như thiết kế |

Phát triển ứng dụng web

# Trình bày quyết định của nhóm

* Chức năng nào dùng client paging, server paging hoặc AJAX?
* Filter và sort đặt ở đâu, áp dụng cho dữ liệu nào?
* Network cho thấy tải toàn bộ hay từng phần?
* Nhóm đã phát hiện lỗi nào và chứng minh sửa đúng ra sao?

Phát triển ứng dụng web

# Bằng chứng nộp

* Số bản ghi trong Supabase và script seed ít nhất 1.000 món
* Demo ba kiểu hiển thị phân trang và filter/sort đã chọn
* URL search, Network và query thực hiện tại PostgreSQL
* Một lỗi đã phát hiện, cách tái hiện và bằng chứng sau khi sửa

Phát triển ứng dụng web

# Q & A

Phát triển ứng dụng web

Previous slidePage 1 of 43Next slideToggle fullscreenToggle overview viewOpen presenter view

Speaker note: Block 7 tiếp tục ứng dụng đã có database, REST API và SPA. Các ví dụ giải thích dùng Books; bài tập áp dụng cho Restaurant. Trọng tâm là xác định tập dữ liệu đang xử lý, chọn cơ chế tìm kiếm và kiểm chứng mã do coding agent tạo ra.

Speaker note: Pagination phân biệt nơi chia dữ liệu, cách nhận kết quả và kiểu tương tác. Phần sort/filter chỉ thao tác tại browser trên một tập đã tải đủ. Search thực hiện tại server; advanced search kết hợp nhiều điều kiện. Phần giảng tiếp tục với fuzzy search trong PostgreSQL; full-text chuyển sang tài liệu để sinh viên tự học.

Speaker note: Cho lớp mô tả trường hợp mở trang 2 rồi chọn giá tăng dần. Nếu browser chỉ nhận 10 sách thì không thể biết sách rẻ nhất ở trang khác. Giữ câu trả lời này để đối chiếu sau phần client-side sort/filter. Không dùng ví dụ Restaurant ở phần giải thích vì sinh viên sẽ tự chuyển nguyên lý sang bài tập.

Speaker note: Không đánh giá chỉ bằng việc có nút tìm kiếm hoặc có số trang. Sinh viên phải giải thích phạm vi của thao tác, truy vấn thực sự chạy và trường hợp kết quả có thể sai. Bài học dùng SQL để quan sát hành vi; nhóm được giữ ORM, framework và lớp gọi API của các block trước.

Speaker note: Phần này tách ba quyết định thường bị gọi chung là pagination: nơi chia dữ liệu, cách cập nhật giao diện và kiểu người dùng yêu cầu phần tiếp theo. Sau đó dùng một tập Books đã tải đầy đủ để học sắp xếp và lọc ở client. Không mở thêm chức năng sắp xếp tùy chọn trên API server.

Speaker note: Đọc từng hàng, không đọc theo cột. Hàng đầu chọn nơi chia tập dữ liệu: browser chia tập đã tải đủ hoặc server chọn phần dữ liệu cần trả. Hàng thứ hai chọn cách cập nhật: điều hướng nhận document HTML mới hoặc dùng AJAX. Hàng thứ ba chọn UI: số trang, Load More hoặc Infinite Scroll. Các ô màu minh họa server pagination kết hợp AJAX và số trang. Dùng fetch không chứng minh phân trang ở client; cần xem browser đã nhận toàn bộ dữ liệu hay chỉ một phần.

Speaker note: Nhánh trên tải đầy đủ tập Books được phép trước khi chia trang bằng JavaScript. Nó không phù hợp chỉ vì dữ liệu đang có ít trang; ứng dụng phải biết tập tải về đã đủ. Hai nhánh dưới đều chọn trang tại database bằng LIMIT/OFFSET. Với điều hướng document, server dựng trang HTML chứa phần dữ liệu đó. Với SPA, API trả JSON và SPA cập nhật vùng danh sách. AJAX là kỹ thuật gửi request và cập nhật mà không điều hướng cả document, không phải một thuật toán chia dữ liệu. Network cho biết HTML hay JSON và số items; mã query hoặc log database mới chứng minh nơi thực hiện LIMIT/OFFSET.

Speaker note: OFFSET 20 bỏ qua 20 dòng đầu của kết quả đã sắp xếp, không có nghĩa bắt đầu từ id 21. Id có thể có khoảng trống do xóa dữ liệu. ORDER BY là tiền đề cho phân trang, không phải chức năng cho người dùng đổi sort trên server. Ví dụ đang dùng danh sách thường hoặc basic/advanced search, có thứ tự id ASC. Với full-text và fuzzy trong bài tập, dùng điểm phù hợp giảm dần rồi id tăng dần. Với tập dữ liệu không đổi, thứ tự xác định giúp các request chia cùng một danh sách. Khi có thêm hoặc xóa giữa hai request, offset có thể gây lặp hoặc bỏ sót; không yêu cầu triển khai cursor trong block này.

Speaker note: Chọn trang vượt phạm vi để thấy rõ metadata không được suy ra từ items.length. Trong ví dụ, database có 23 sách phù hợp, nhưng page 4 bắt đầu ở offset 30 nên items rỗng. API giữ page được yêu cầu, total thực tế và không tự sửa sang trang cuối. Nếu page 3 thì có ba items; page 1 thì có tối đa mười. Query COUNT và query lấy items phải dùng cùng điều kiện tìm kiếm. Với total bằng 0, totalPages bằng 0, UI hiển thị trạng thái rỗng và không có nút đi tiếp. Envelope giữ quy ước Block 6, không trả mảng trực tiếp ở data.

Speaker note: Các giá trị 1, 10 và 100 là cấu hình giả định của ví dụ, không phải mặc định chung của HTTP. Nhóm tự công bố kích thước trang và giới hạn phù hợp. API phải validate query, không chỉ kiểm tra trên form. Page bằng 0, không nguyên hoặc không phải số đều không hợp lệ; pageSize vượt giới hạn đã công bố cũng cần được xử lý rõ. Trang không có dữ liệu là kết quả thành công, không phải NOT\_FOUND. Với API Block 6, kiểm tra cả status HTTP lẫn trường ok; lỗi database vẫn là lỗi kỹ thuật 500.

Speaker note: Hình dùng dữ liệu và pageSize=3 giả định để thấy phần cũ và phần mới. Số trang thay danh sách khi chọn trang khác; Load More và Infinite Scroll giữ phần cũ rồi nối phần mới. Cả ba có thể dùng cùng API server-paged hoặc một tập client đã tải đủ. Numbered pagination giúp đi tới một trang cụ thể; Load More do người dùng chủ động; Infinite Scroll do vị trí cuộn kích hoạt. Lưu ý khả năng tiếp cận footer, bàn phím và khôi phục vị trí cuộn. Bài tập yêu cầu thể hiện đủ ba kiểu UI, nhóm tự chọn cơ chế lấy và chia dữ liệu.

Speaker note: Bắt đầu với nextPage=1, danh sách rỗng, pending=false và end=false. Khi tải, đặt pending=true trước khi gửi request, khóa nút và hiện trạng thái đang tải. Chỉ sau khi kiểm tra status HTTP, envelope ok và xác nhận response còn thuộc bộ điều kiện hiện tại mới nối items và tăng nextPage. Điều kiện end dùng metadata của response vừa chấp nhận, không dùng nextPage đã tăng. Một trang cuối đủ pageSize items vẫn phải dừng nếu metadata cho biết đã tới total. Items rỗng cũng dừng để tránh gọi mãi khi dữ liệu thay đổi. Khi lỗi, giữ nguyên nextPage và danh sách để nút tải lại chính phần chưa nhận; không tăng trang trong finally.

Speaker note: IntersectionObserver báo khi sentinel giao với vùng theo dõi; root mặc định là viewport. rootMargin 200px là lựa chọn minh họa để kích hoạt trước khi chạm cuối, không phải thông số bắt buộc. Callback có thể chạy nhiều lần, vì vậy kiểm tra pending/end phải nằm trong loadNext dùng chung với Load More, không chỉ ở callback. Đặt pending đồng bộ trước fetch để nhiều callback không gửi trùng cùng một page. Nếu danh sách chưa đủ cao để cuộn và sentinel vẫn nằm trong vùng nhìn, sau một lần tải thành công cần kiểm tra lại sentinel, tiếp tục tuần tự khi còn dữ liệu hoặc giữ nút Tải thêm làm lựa chọn truy cập được. Khi end=true, có thể unobserve sentinel; khi reset phải theo dõi lại.

Speaker note: Ví dụ giả định người dùng đã tìm web rồi chọn trang 2. Nếu chỉ giữ lựa chọn trong bộ nhớ của giao diện, Reload có thể đưa về danh sách mặc định. URL ghi lại yêu cầu để ứng dụng đọc và dựng lại màn hình. Đây là URL trang để người dùng mở và chia sẻ; SPA có thể gọi URL API khác để lấy dữ liệu. Chỉ ghi điều kiện đã bấm Tìm kiếm, không phải từng ký tự chưa submit. URL không đóng băng dữ liệu: nếu database thay đổi, kết quả tại cùng URL có thể đổi.

Speaker note: Nối trực tiếp với ví dụ trước: bấm trang 3 chỉ đổi page=3, vẫn giữ q=web. Nếu đổi từ khóa thành sql thì đưa page về 1 để tránh mở một trang không còn tồn tại trong tập mới. Với form nhiều tiêu chí, giữ cả bộ tiêu chí khi chuyển trang. Nhóm giao agent yêu cầu Reload và Back/Forward bằng hành vi cần đạt, không phải tự viết History API trong giờ học. Khi đổi điều kiện, response cũ không được ghi đè kết quả mới. Với Load More hoặc Infinite Scroll, nhóm công bố mở lại từ đầu hay khôi phục các phần đã nối, không hứa khôi phục chỉ từ một số trang.

Speaker note: Phần này chỉ truyền đạt ý nghĩa thao tác và phạm vi dữ liệu. Sinh viên mô tả kết quả cần có để coding agent cài đặt, không học các hàm xử lý mảng hay mã parse input. Ví dụ dùng danh sách Books mà browser đã nhận đầy đủ.

Speaker note: Filter không xóa sách khỏi database, chỉ đổi sách nào được hiển thị. Hai lựa chọn trong ví dụ kết hợp AND. Bỏ điều kiện Còn hàng thì hiện thêm SQL nhập môn; xóa hết điều kiện thì hiện lại cả ba sách. Đây là các thao tác sinh viên dùng để nghiệm thu kết quả agent tạo ra, không cần chỉ định agent phải dùng hàm JavaScript nào.

Speaker note: So sánh với filter: sort không quyết định sách có được chọn hay không, chỉ quyết định vị trí. Sinh viên mô tả các lựa chọn tên, giá tăng và giá giảm, đồng thời thống nhất thứ tự phụ khi giá bằng nhau. Không trình bày comparator, sao chép mảng hoặc cấu trúc mã nguồn. Giá trong bảng là dữ liệu giả định cho cùng ba sách của ví dụ trước.

Speaker note: Ví dụ một sách thuộc thể loại Công nghệ nằm ở trang chưa tải. Lọc riêng items của trang hiện tại không thể tìm thấy sách đó. Giao diện không được gọi thao tác trên một trang là lọc toàn bộ database. Khi search toàn database, server xử lý tiêu chí như phần tiếp theo. Trong bài tập, nhóm chọn vị trí filter/sort phù hợp với dữ liệu thực sự đã tải, không bắt buộc thêm một màn hình cục bộ riêng.

Speaker note: Chuyển từ thao tác trên tập đã tải đầy đủ sang tìm kiếm trong collection trên server. Phần này dùng Books, không tìm riêng trong items của trang hiện tại. Giữ cùng schema id, title, description, category, price, available. Các sách, mô tả và giá ở phần này đều là dữ liệu giả định để kiểm chứng.

Speaker note: Hai chiều không phải một thang từ thấp lên cao. Một ô q cũng có thể dùng fulltext hoặc fuzzy; một form nhiều trường vẫn có thể dùng literal contains. API minh họa dùng mode=basic, advanced, fulltext, fuzzy như bốn lựa chọn cụ thể để dễ kiểm chứng, không khẳng định đây là bốn loại trừ nhau về mặt lý thuyết. Basic và advanced trong ví dụ dùng cùng quy tắc q trên title; advanced thêm các điều kiện cấu trúc.

Speaker note: Collection tìm kiếm không chỉ là trang đang hiện trong SPA. Hợp đồng vẫn status 200 với ok/data/error; query không hợp lệ dùng VALIDATION\_FAILED. Không tìm thấy sách trong collection không phải NOT\_FOUND. Giữ lỗi kỹ thuật 404/500 như Block 6. Validate mode thuộc tập cho phép, page và pageSize theo hợp đồng phân trang. Với fulltext/fuzzy, q trim rỗng là VALIDATION\_FAILED, UI chờ người dùng nhập và chưa fetch. Với basic/advanced, q rỗng nghĩa là không áp dụng tiêu chí văn bản.

Speaker note: Đây là sáu dòng trích từ fixture tám sách giả lập; không phải dữ liệu thị trường. Đơn vị giá giả định là đồng. File SQL đi kèm có đủ tám dòng và description. Book 4 có description The cats are running. Book 5 có description Cats run in the garden. Book 6 có description NULL để thấy coalesce có tác dụng. Book 6 cũng giúp kiểm tra số 0 và false. Hai sách còn lại là Database practice và Garden stories. Không dùng dữ liệu này để kết luận hiệu năng.

Speaker note: PREPARE biểu diễn truy vấn tham số hóa có thể chạy trong PostgreSQL; ứng dụng dùng API bind tương đương của driver. $1 ở đây là pattern đã chuẩn bị, không phải SQL ghép bằng string. ILIKE bỏ qua hoa thường theo locale, không tự bỏ dấu hay hiểu nghĩa. Tạo pattern literal contains bằng cách thay ! thành !! trước, rồi % thành !%, rồi \_ thành !\_, sau đó mới thêm % ở hai đầu. SQL file có hàm pg\_temp.literal\_pattern thể hiện chính xác quy tắc này. Escape LIKE wildcard khác với parameter binding: binding chống biến dữ liệu thành cú pháp SQL, còn escaping giữ đúng nghĩa literal contains.

Speaker note: Hai wildcard có nghĩa riêng trong LIKE/ILIKE: % là một chuỗi bất kỳ, \_ là một ký tự bất kỳ. Ví dụ cố tình có cả hai ký tự trong title của book 6. Với ESCAPE '!', dấu ! đứng trước làm mất ý nghĩa wildcard; chính ! cũng phải được escape. Chỉ hai dấu % do server thêm ở đầu và cuối mới là wildcard mong muốn. Đây là vấn đề ngữ nghĩa ngay cả khi truy vấn đã parameterized, không phải một lý do để bỏ parameter binding.

Speaker note: Mỗi điều kiện là một predicate trả lời sách có đạt tiêu chí hay không. Form gửi q, category, minPrice, maxPrice, available. Trong ví dụ, q vẫn là literal contains trên title như basic; mọi tiêu chí đang hoạt động được nối bằng AND. Bỏ một tiêu chí rỗng là không áp điều kiện đó, không phải tìm chuỗi rỗng trong database. Với fixture, q=SQL, category=database, khoảng giá từ 0 đến 100000 và available=false có kỳ vọng ids 2 và 6.

Speaker note: Query string luôn bắt đầu là chuỗi. Không dùng if(value) sau khi parse để quyết định có lọc hay không, vì false và 0 là giá trị có nghĩa. Không dùng Boolean('false') trong JavaScript vì kết quả là true. Parse available chỉ nhận chuỗi true hoặc false; parse giá theo định dạng hợp đồng, phải hữu hạn và không âm. Min/max inclusive và category được kiểm tra theo tập cho phép. q và category trắng được trim rồi chuyển thành null tại server. Với fulltext/fuzzy, q trắng là lỗi, không được âm thầm bỏ predicate.

Speaker note: Bind theo đúng thứ tự: pattern q đã escape, category, minPrice, maxPrice, available. NULL ở đây là ký hiệu nội bộ cho tiêu chí không được gửi, không phải chuỗi 'null'. Ví dụ EXECUTE advanced\_search('%SQL%', 'database', 0, 100000, false) kỳ vọng ids 2,6. Ví dụ EXECUTE advanced\_search(NULL, NULL, 0, 0, false) chỉ có id 6. Đây là một template dễ đọc để dạy semantics; không kết luận đây là query plan tối ưu cho mọi dataset.

Speaker note: Với q=SQL và không có tiêu chí khác, basic/advanced đều kỳ vọng ids 1,2,6. Không gọi advanced là bản thay thế cao cấp hơn của filter: form chỉ kết hợp các predicate. Filter ở đây giải thích semantics chọn tập, không mở thêm chương server-side sort/filter. Phần thao tác client vẫn chỉ làm trên tập đã tải đầy đủ; không áp filter client lên một trang rồi gọi đó là tổng kết quả. Basic và advanced dùng ORDER BY id ASC. total không được lấy count toàn bộ books khi items đang tìm theo q.

Speaker note: Sinh viên tự học full-text search qua hai tài liệu này; deck không trình bày cơ chế, cú pháp SQL hoặc cách triển khai full-text. Tài liệu MySQL dùng để tham khảo cách triển khai trên hệ quản trị khác; bài tập tiếp tục dùng Supabase/PostgreSQL.

Speaker note: pg\_trgm đo độ giống dựa trên các nhóm ba ký tự. Ví dụ người dùng nhập sai Postgres gide để tìm tên sách có guide. Ngưỡng thấp giữ nhiều ứng viên hơn; ngưỡng cao có thể bỏ cả kết quả người dùng mong muốn. SVG thể hiện kỳ vọng trên fixture, không phải một benchmark hay độ chính xác đã đo. Thứ tự trong mỗi tập vẫn theo similarity giảm dần rồi id tăng dần. Dùng whole-title similarity trong ví dụ, không lẫn với word\_similarity trên một đoạn title.

Speaker note: Tiếp tục Restaurant App của Block 5, 6. Sinh viên dùng coding agent để mở rộng ứng dụng đang có, tự chọn cách phân trang và vị trí áp dụng filter/sort. Sản phẩm cần đạt các hành vi bên dưới, không bắt buộc một kiến trúc phân trang chung cho mọi nhóm. Giữ các chức năng chi tiết và quản trị đang hoạt động.

Speaker note: Bản ghi phải được lưu thật trong PostgreSQL của Supabase đang dùng, không chỉ tạo mảng trong browser hay một tệp JSON. Nhóm dùng agent viết và chạy script seed, sau đó kiểm tra số món trong database. Chuẩn bị giá trùng, giá bằng 0, cả hai trạng thái available và mô tả nhiều từ để kiểm tra các thao tác. Credential kết nối database chỉ nằm ở server.

Speaker note: Yêu cầu về UI khác với lựa chọn nơi chia dữ liệu. Không bắt buộc mỗi kiểu UI phải được cài bằng cả client và server. Với dữ liệu không đổi, xem hoặc tải hết phải tiếp cận đủ tập kết quả, không lặp và không bỏ món. Load More và Infinite Scroll cần có trạng thái đang tải, kết thúc khi hết và không gửi trùng khi thao tác lặp. Nếu browser đã tải đủ dữ liệu, tải thêm có thể là hiển thị tiếp phần đang giữ tại client.

Speaker note: Nhóm được chọn client paging, server paging với điều hướng trang hoặc server paging qua AJAX; có thể phối hợp tùy chức năng. AJAX là cách lấy dữ liệu và cập nhật giao diện, không phải một nơi chia dữ liệu thứ ba. Không bắt buộc dùng AJAX và không bắt buộc cài cả ba cơ chế. Dùng Network để chỉ ra tải toàn bộ hay từng phần, HTML hay JSON. Nếu server paging, response cần đủ thông tin để xác định phần hiện tại và còn dữ liệu hay không; nhóm thiết kế metadata phù hợp, giữ envelope ok/data/error khi dùng REST API Block 6.

Speaker note: Nhóm quyết định thao tác nào hữu ích cho người xem món và thao tác nào hữu ích cho quản trị, rồi giao agent cài đặt. Phần client-side trên lớp là tư tưởng xử lý tập đã tải, không ép mọi tính năng bài tập phải xử lý tại client. Nếu UI tuyên bố lọc hoặc sort toàn bộ kết quả, thao tác phải áp dụng cho toàn bộ tập đó, không riêng một trang đang hiển thị. Trường bỏ trống không thêm điều kiện; giá 0 và available=false vẫn có nghĩa. Xóa điều kiện hiện lại kết quả, không sửa dữ liệu trong database.

Speaker note: Giữ cả bốn chế độ tìm kiếm tại server, trên dữ liệu Supabase. q trống ở basic trả danh sách, ở advanced chỉ bỏ điều kiện tên. Full-text và fuzzy cần q không rỗng. Advanced dùng partial match cho q trong yêu cầu này; không bắt buộc kết hợp advanced với full-text/fuzzy. Nếu nhóm chọn chia trang tại client thì server vẫn thực hiện search trước, browser chỉ chia tập kết quả đã nhận đủ. Không biến local filter trên một trang thành search toàn database.

Speaker note: simple chuẩn hóa token nhưng không phải bộ phân tích ngôn ngữ tiếng Việt đầy đủ. Không yêu cầu tìm không dấu hoặc semantic search. Ngưỡng 0.3 là lựa chọn của bài tập, không bảo đảm mọi lỗi gõ đều được tìm đúng. Với connection pool, đặt ngưỡng bằng SET LOCAL trong cùng transaction của query. Duy trì thứ tự xác định khi chia trang trên một tập không đổi; nếu UI cho đổi thứ tự, nhóm phải nêu thứ tự nào được ưu tiên. Agent có thể dùng parameterized raw SQL qua ORM khi cần.

Speaker note: Không yêu cầu một cách tổ chức state hay router cụ thể. Nhóm mô tả các lựa chọn cần giữ trên URL để agent thực hiện. Numbered pagination phải mở lại được đúng yêu cầu truy vấn và trang. Với giao diện nối danh sách, nhóm chọn chính sách khôi phục rồi thể hiện nhất quán. Nếu chọn AJAX, response cũ không được ghi đè hoặc nối vào kết quả mới; lỗi tải tiếp phải cho phép thử lại mà không mất phần đã có.

Speaker note: Chuẩn bị một số món có kết quả dự đoán được trước khi chạy nghiệm thu. Chọn món phù hợp nằm ngoài trang đầu để phát hiện lọc trên dữ liệu chưa đủ. Với full-text dùng nhiều từ không liền nhau; với fuzzy chọn lỗi gõ đã kiểm tra điểm thực tế. Kiểm tra giá bằng 0, available=false, trang đầu/giữa/cuối và trường hợp không khớp. Đối chiếu trên seed không đổi, không hứa offset không bị dịch khi dữ liệu được thêm hoặc xóa giữa các request.

Speaker note: Sinh viên giải thích bằng ứng dụng đang chạy và bằng chứng, không lặp lại lời khẳng định của agent. Không có yêu cầu mọi nhóm phải chọn cùng kiến trúc; lựa chọn cần đáp ứng hành vi và phạm vi đã công bố. Những câu hỏi này là tiêu chí trình bày, không yêu cầu báo cáo chi tiết mã nguồn.

Speaker note: Có thể dùng ảnh Supabase Table Editor hoặc kết quả đếm để chứng minh số món đã lưu. Với mỗi chế độ search, giữ một truy vấn mẫu và kết quả dự kiến để chạy lại. Network cần thể hiện lựa chọn thực tế của nhóm, không nhất thiết phải là request AJAX. Không nộp credential, connection string hoặc log có dữ liệu nhạy cảm. Giữ các trang chi tiết và quản trị hoạt động sau khi đổi response danh sách.
