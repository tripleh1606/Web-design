# Báo cáo tuần 5 — Đối chiếu với tuần 4

Cập nhật: **26/10/2026**. Báo cáo mô tả mã nguồn hiện có trong **week5**, không phải một kế hoạch triển khai. Bản đối chiếu SSR tuần 3 nằm tại [DOI-CHIEU-WEEK3.md](./DOI-CHIEU-WEEK3.md).

Phạm vi ứng dụng được chạy bằng `npm run dev` tại thư mục này: **api/** là Express + Prisma, **web/** là SPA JavaScript ES modules. Thư mục `restaurant/` còn lưu một bản ứng dụng khác; không dùng bản đó để mô tả entrypoint của báo cáo này.

## 1. Tổng quan thay đổi so với tuần 4

Tuần 4 đã có REST API và SPA. Tuần 5 tiếp tục kiến trúc đó, bổ sung tìm kiếm trên toàn database, xếp hạng, lọc và phân trang tại server.

| Hạng mục | Tuần 4 | Tuần 5 hiện tại |
| --- | --- | --- |
| Kiến trúc | Express API + SPA JavaScript thuần | Giữ nguyên kiến trúc |
| ORM/database | Prisma, PostgreSQL/Supabase; SQLite cho local/test | Giữ nguyên, bổ sung thành phần tìm kiếm PostgreSQL |
| Mô hình nghiệp vụ | Dish, Chef, Ingredient và hai bảng liên kết | Giữ nguyên bảng, khóa chính, khóa ngoại và quan hệ |
| Danh sách món công khai | GET /api/dishes trả toàn bộ mảng | Thêm GET /api/dishes/paged trả một trang và metadata |
| Tìm theo tên | API đọc findMany rồi lọc chuỗi trong Node.js | Endpoint phân trang thực hiện tìm kiếm trong SQL |
| Full-text search | Chưa có trong source API đang đối chiếu | Tên + mô tả, cấu hình simple, có xếp hạng |
| Sai chính tả/không dấu | Tìm tên dạng chứa chuỗi, không có pipeline sửa lỗi | Smart kết hợp chuẩn hóa dấu, edit distance, trigram và gợi ý ký tự |
| Nhận diện từ bị đảo | Chưa có | Ví dụ chatma → matcha, sau đó lấy đầy đủ tập kết quả |
| Bộ lọc | q, category, sắp xếp giá | Thêm khoảng giá và available; kết hợp AND trước phân trang |
| Phân trang UI | Chưa có ba cách xem mới | Số trang, Tải thêm, Cuộn liên tục dùng chung API |
| Hiệu năng tải tiếp | Chưa có bộ đệm trang kế tiếp | Tải trước tối đa một trang, dùng lại request và hủy khi đổi điều kiện |
| Dữ liệu bổ sung | Seed nghiệp vụ ban đầu | Script tạo 1.200 biến thể đồ uống và nhập 28 tên Chef |
| CRUD/công thức/đầu bếp | Đã có | Kế thừa; không coi là tính năng mới của tuần 5 |

## 2. Database được thiết kế lại như thế nào?

### 2.1. Giữ mô hình nghiệp vụ, mở rộng cho tìm kiếm

Không tạo database nghiệp vụ mới hoặc các bảng đơn hàng. Năm bảng hiện tại là:

| Bảng | Nội dung và ràng buộc chính |
| --- | --- |
| dishes | id, name, description, price, category, image, available, createdAt; bổ sung fts |
| chefs | id, name, specialty, createdAt |
| ingredients | id, name, unit, stock, createdAt |
| dish_ingredients | Khóa chính kép dishId + ingredientId; amount là lượng dùng cho một phần |
| chef_dishes | Khóa chính kép chefId + dishId |

Khóa ngoại và hành vi cascade được giữ. Xóa một liên kết công thức hoặc gán món không đồng nghĩa xóa hai bản ghi cha.

~~~mermaid
erDiagram
    dishes ||--o{ dish_ingredients : "có công thức"
    ingredients ||--o{ dish_ingredients : "được sử dụng"
    chefs ||--o{ chef_dishes : "phụ trách"
    dishes ||--o{ chef_dishes : "được gán"
~~~

### 2.2. Các thành phần mới cho tìm kiếm

| Thành phần | Cách triển khai | Mục đích |
| --- | --- | --- |
| dishes.fts | Cột tsvector nullable, Prisma khai báo Unsupported("tsvector")? | Lưu document tìm kiếm từ tên và mô tả |
| dishes_fts_idx | GIN trên fts | Hỗ trợ truy vấn full-text |
| dishes_name_trgm_idx | GIN trên name với gin_trgm_ops | Chuẩn bị index cho truy vấn trigram tương thích |
| dishes_adv_filter_idx | Index trên category, available, price | Hỗ trợ các điều kiện lọc cấu trúc |
| pg_trgm | PostgreSQL extension | Tính độ tương đồng trigram |
| unaccent | PostgreSQL extension | Bỏ dấu khi so tên trong Smart |
| fuzzystrmatch | PostgreSQL extension | Levenshtein với ngân sách lỗi hữu hạn |
| soucha_normalize_search | Hàm SQL: chuẩn hóa NFC, bỏ dấu, chuyển chữ thường | So sánh các cách viết có/không dấu |
| soucha_word_score | Hàm PL/pgSQL chấm từng cặp từ | Kết hợp lỗi gõ, trigram và gợi ý ký tự |
| soucha_refresh_dish_fts + dishes_fts_refresh | Hàm và trigger trước INSERT/UPDATE của name, description, fts | Tự đồng bộ document tìm kiếm |

**fts hiện là cột thường được trigger duy trì, không phải generated column.** Kiểm tra trực tiếp Supabase xác nhận kiểu tsvector và is_generated = NEVER.

Document có trọng số:

~~~sql
setweight(to_tsvector('simple', coalesce(name, '')), 'A')
||
setweight(to_tsvector('simple', coalesce(description, '')), 'B')
~~~

Tên có trọng số A, mô tả có trọng số B; NULL được thay bằng chuỗi rỗng. Giữ cùng cấu hình **simple** cho document và query.

Nguồn triển khai: [schema.prisma](./api/prisma/schema.prisma), [search-setup.sql](./api/prisma/search-setup.sql).

### 2.3. Đồng bộ schema và dữ liệu

- Prisma quản lý model, cột và khai báo index. SQL setup quản lý extension, function, trigger và backfill fts.
- Helper [setup-search.js](./scripts/setup-search.js) thực thi **nguyên file SQL**, giữ comment, function và DO block; không tách SQL theo dấu chấm phẩy.
- Lệnh db:push của workspace API chạy setup trước và sau Prisma push để tránh tình trạng cột đã tồn tại nhưng không được tự cập nhật.
- Setup có thể chuyển cột generated cũ sang cột thường bằng DROP EXPRESSION, sau đó gắn trigger; không xóa bảng nghiệp vụ.
- [001-schema.sql](./api/sql/001-schema.sql) dành cho database mới. Database đang có dữ liệu dùng quy trình đồng bộ tương ứng, không chạy lại DDL tạo mới một cách tùy tiện.
- Week4 và week5 đang dùng chung đích database theo cấu hình đã kiểm tra. Vì vậy dữ liệu nhập từ week5 cũng có thể xuất hiện ở week4; source week4 không tự có tính năng tìm kiếm mới chỉ vì dùng chung DB. Khi đồng bộ schema tìm kiếm, dùng schema/setup của week5.

Các script seed bổ sung tạo **món/biến thể đồ uống**, không phải 1.200 Order. Nhập Chef chỉ thêm bản ghi tên theo thứ tự Việt Nam và specialty Pha chế, không thêm một model thành viên riêng. Các script có chế độ xem trước và tránh thêm trùng.

## 3. Full-text và fuzzy được làm như thế nào?

### 3.1. Các mode API thực sự đang có

| mode | Quy tắc hiện tại |
| --- | --- |
| basic | Chuỗi nằm trong tên, không phân biệt hoa/thường; escape %, _ và ! theo nghĩa literal |
| fulltext | Tất cả từ trong q được tìm trên tên + mô tả bằng PostgreSQL full-text |
| smart | Tìm kiếm kết hợp: full-text, tên gần đúng và nhận diện từ khóa; mặc định của UI |

API không gửi mode vẫn dùng basic để giữ tương thích. Fulltext yêu cầu q không rỗng; Smart không có q thì hiển thị danh sách thường. Full-text/Smart có từ khóa cần PostgreSQL; SQLite không giả lập hai chức năng này bằng LIKE.

### 3.2. Full-text thuần

~~~sql
WHERE fts @@ plainto_tsquery('simple', $1)
ORDER BY ts_rank(fts, plainto_tsquery('simple', $1)) DESC, id ASC
~~~

Ví dụ **Houjicha Cold Whisk** khớp với **houjicha whisk**, vì hai từ không cần đứng liền nhau. Full-text thuần không tự sửa mọi lỗi chính tả, không tự bỏ dấu tiếng Việt và không phải tìm kiếm ngữ nghĩa bằng AI.

### 3.3. Smart: tìm gần đúng theo từng từ

1. Chuẩn hóa Unicode NFC, bỏ dấu bằng unaccent và chuyển chữ thường.
2. Lấy bộ từ vựng không trùng từ tên món trên toàn database.
3. Nếu một token chưa tồn tại, dài 5–12 ký tự và có đúng một từ cùng toàn bộ ký tự/số lần lặp, nhận diện token đó thành từ ứng viên. Ví dụ **chatma → matcha**. Không thay từ đã tồn tại hoặc có nhiều ứng viên hoán vị.
4. Tìm full-text theo từ gốc và từ đã nhận diện; đồng thời tính điểm từng cặp từ khóa–từ vựng một lần.
5. Với tên gần đúng, mọi từ khóa phải có một từ trong tên đáp ứng ngưỡng; không bỏ qua từ sai ở cuối query.
6. Kết hợp bộ lọc category/giá/available, tính điểm các món trong tập đó và áp dụng quy tắc gợi ý, rồi đếm và phân trang tại PostgreSQL.

| Kỹ thuật | Quy tắc trong code |
| --- | --- |
| Levenshtein | Từ 2–4 ký tự cho phép 1 lần thêm/xóa/thay; từ 5 ký tự trở lên cho phép 2 lần |
| Từ ngắn | Từ một ký tự phải đúng; lỗi ở từ hai ký tự chỉ được xét khi query có ít nhất hai từ |
| Trigram | So từng từ với ngưỡng 0.3, có chặn chênh lệch độ dài; điểm được ánh xạ vào nhánh fuzzy |
| Đảo hai chữ liền kề | Có nhánh nhận diện riêng, điểm 0.8; không tuyên bố là toàn bộ thuật toán Damerau–Levenshtein |
| Ký tự bị xáo trộn | Từ dài 4–12 ký tự, chênh độ dài tối đa 1, trùng ít nhất 80% ký tự có tính số lần lặp; điểm yếu 0.35 |

Nhánh gợi ý ký tự yếu chỉ xuất hiện khi tập sau bộ lọc không có khớp thông thường. Phép nhận diện hoán vị đầy đủ được thực hiện trước bước này để một món chứa chữ “chất/chai” không làm ẩn toàn bộ nhóm Matcha.

Thứ tự Smart khi chưa chọn sort riêng: full-text từ gốc → full-text từ nhận diện → fuzzy → gợi ý yếu; thêm id ASC khi bằng điểm. Điểm là quy tắc xếp hạng, **không phải xác suất hoặc mô hình học máy**.

Response có thể có rank, matchType và correctedQuery. UI công bố việc nhận diện từ khóa, giữ nguyên q người dùng đã nhập.

| Ca kiểm tra | Kết quả cần đạt |
| --- | --- |
| houjicha whisk | Tìm được Houjicha Cold Whisk dù bỏ từ ở giữa |
| houcha | Tìm gần đúng Houjicha |
| houjcha whsik | Chịu lỗi thiếu chữ và đảo chữ |
| kswh | Có thể gợi ý Whisk, có nhãn khớp yếu |
| chatma | Nhận diện matcha và lấy đủ tập kết quả, không chỉ một món |
| báh bì, khi có Bánh bò và Cơm bò | Chọn Bánh bò trong database test riêng |
| houjicha zzzzz | Kết quả rỗng; không bỏ qua từ không khớp |

Chi tiết: [full-text-search.md](./docs/full-text-search.md).

## 4. Backend đã sửa gì?

| File | Trách nhiệm/chênh lệch chính |
| --- | --- |
| api/src/app.js | Đăng ký GET /api/dishes/paged trước route /api/dishes/:id; kiểm tra provider; giữ các route CRUD cũ |
| api/src/pagination.js | Parse/validate query; xây SQL tìm/lọc/rank/count/LIMIT/OFFSET; nhận diện từ và trả metadata |
| api/server.js | Truyền provider thực tế vào createApp |
| api/prisma/schema.prisma | Thêm fts và khai báo ba index tìm kiếm/lọc |
| api/prisma/search-setup.sql | Cài extension, function, trigger và đồng bộ fts |
| scripts/database.js, scripts/setup-search.js | Đồng bộ schema và chạy toàn bộ SQL đúng cách |
| scripts/seed-beverages.js, scripts/seed-chefs.js | Nhập dữ liệu bổ sung có kiểm soát |
| api/sql/ | SQL cấu trúc mới và seed gốc để tái lập môi trường |

Endpoint mới:

~~~http
GET /api/dishes/paged?mode=smart&q=chatma&page=1&pageSize=12
~~~

Kết quả có cấu trúc:

~~~json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 12,
    "correctedQuery": "matcha"
  },
  "error": null
}
~~~

Đây là **ví dụ cấu trúc**, không phải số kết quả thực tế của query trên. correctedQuery chỉ có khi có nhận diện từ khóa; items còn có thể chứa rank và matchType.

- API nhận pageSize 1–100, mặc định 10 để giữ hợp đồng cũ; UI luôn gửi kích thước riêng.
- q, category, khoảng giá và available kết hợp AND. Giá 0 và available=false là giá trị hợp lệ.
- COUNT và trang dùng cùng tập kết quả trong một câu SQL, cùng snapshot. Trang vượt phạm vi vẫn trả total đúng và items rỗng.
- PostgreSQL xử lý tập kết quả; JSON chỉ mang trang được yêu cầu. Không tải toàn bộ món về browser để tìm hoặc phân trang.
- Giá trị người dùng được bind bằng Prisma.sql. Biểu thức sort là hằng server, không ghép trực tiếp query string vào SQL.
- Lỗi query trả HTTP 200 + VALIDATION_FAILED theo hợp đồng bài học; lỗi kỹ thuật/database vẫn 404/500 tương ứng.
- GET /api/dishes dạng mảng vẫn được giữ cho các màn hình cũ/quản trị; không phải mọi endpoint danh sách đã chuyển sang phân trang.

Các file validation, relations, recipe, database và seed-data trong API vẫn giống tuần 4 sau khi bỏ khác biệt xuống dòng. Vì vậy validate CRUD, transaction công thức, tồn kho, tính servings và gán/gỡ món cho Chef là phần kế thừa.

## 5. Frontend và UI hiện tại

### 5.1. Luồng dữ liệu mới

~~~text
Người dùng nhập từ khóa/chọn bộ lọc
→ router cập nhật URL, về đầu tập mới
→ api.js gửi GET /api/dishes/paged
→ PostgreSQL nhận diện/tìm/lọc/xếp hạng/đếm/phân trang
→ API trả JSON
→ menu-pagination.js cập nhật các thẻ món và thanh điều hướng
~~~

- [app.js](./web/src/app.js) tiếp tục quản lý route/lifecycle; danh sách công khai giao cho [menu-pagination.js](./web/src/menu-pagination.js).
- [api.js](./web/src/api.js) bổ sung tham số và kiểm tra response phân trang.
- [page-buffer.js](./web/src/page-buffer.js) chuẩn bị tối đa một trang tiếp theo; dùng lại promise, không tự nối thẻ hoặc tự tăng trang.
- Khi đổi query/filter/sort hoặc rời route, hủy request cũ và xóa bộ đệm; response đến muộn không trộn vào tập mới.
- Tải tiếp thất bại giữ danh sách đang có, cho phép thử đúng trang đó.
- Ảnh/font được cache theo cấu hình web server; HTML, JS, API config và API response không dùng cache cũ cho dữ liệu động.

### 5.2. Ba cách xem và số món

| UI | Hành vi |
| --- | --- |
| Số trang | Thay danh sách bằng trang được chọn; URL/Reload/Back khôi phục trang và điều kiện |
| Tải thêm | Nối trang kế tiếp sau khi thành công; không gửi trùng lúc đang tải |
| Cuộn liên tục | Sentinel kích hoạt cùng thao tác nối trang; có nút Tải thêm dự phòng |

Mở lại liên kết Tải thêm/Cuộn liên tục bắt đầu từ trang 1 với cùng điều kiện, không cam kết khôi phục toàn bộ số món đã cuộn trước đó.

UI mặc định **12 món**, các mức **12 / 24 / 36 / 48 / 96**, phù hợp 4 món/hàng trên desktop. Kích thước hợp lệ từ link cũ được làm tròn lên bội số 4, tối thiểu 12; ví dụ 10 → 12. Khi đổi kích thước, về trang đầu và giữ các bộ lọc. Trang cuối hiển thị số món thực còn lại.

### 5.3. Phần trình bày đã có

- Giữ nhận diện Soucha: nền kem, xanh matcha, chữ nâu, logo mèo, ảnh đồ uống và font Kodchasan tự phục vụ.
- Giữ hero giới thiệu, thẻ món responsive, hover ảnh/thẻ và hiệu ứng xuất hiện ngắn.
- Bỏ ô **Cách tìm**; trang công khai mặc định dùng Smart. API và liên kết kỹ thuật cũ vẫn giữ các mode tương thích.
- Năm bộ lọc gồm Danh mục, Trạng thái, Sắp xếp, Giá từ, Đến.
- Sắp xếp chỉ còn Mới nhất, Tên A → Z, Tên Z → A, Giá tăng dần, Giá giảm dần. “Chọn thứ tự” là placeholder, không phải một cách sort.
- Độ phù hợp tự áp dụng trong tìm kiếm khi chưa chọn sort; không còn hai mục Mặc định/Liên quan nhất trên dropdown.
- Có tổng kết quả, tiến độ, trạng thái tải/rỗng/lỗi/kết thúc, thông báo từ khóa đã nhận diện và nhãn gợi ý yếu.
- Bảo toàn nhập liệu, CRUD, công thức, dropdown nguyên liệu/đầu bếp, điều hướng và hỗ trợ bàn phím.

**UI 3D/playful đang là hướng dự kiến, chưa triển khai:** ly matcha 3D ở hero, chuyển động nổi/nảy, mascot phản ứng và hover có chiều sâu. Chưa tính các hiệu ứng này là kết quả hoàn thành; mục UI sẽ được cập nhật sau khi có bản code mới và được người dùng duyệt.

## 6. Kiểm chứng và giới hạn

### 6.1. Kết quả đã có ngày 26/10/2026

| Kiểm tra | Kết quả/phạm vi |
| --- | --- |
| npm test | Chạy lại khi viết báo cáo: 31/31 nhóm đạt; database test riêng |
| npm run test:browser | Kết quả lượt chỉnh UI gần nhất: 20/20 nhóm, không có page error |
| npm run test:pagination:browser | 9/9 nhóm: URL, size 12+, ba UI, retry, hủy response cũ, tải trước, mobile |
| npm run test:fulltext:browser | 8/8 nhóm với PostgreSQL test: tìm tự động, sort mới, tiếng Việt, chatma và ba UI |
| Supabase chỉ đọc | Xác nhận fts là cột thường tsvector, ba index tìm/lọc và đích DB chung week4/week5 |
| Supabase chỉ đọc: chatma so với matcha | 667 kết quả tại thời điểm kiểm tra; toàn bộ ID và thứ tự bằng nhau qua các trang, không lặp |

31 là số nhóm node:test; 37 là tổng nhóm kiểm tra browser, không phải tổng số assertion. Dữ liệu thật có thể được người dùng thêm/sửa, nên 667 là số đo tại thời điểm đối chiếu, không phải hằng số ứng dụng. Báo cáo không tuyên bố đã chạy CRUD ghi trên Supabase trong lượt xác minh này.

Kết quả browser ở [browser-report.json](./tests/results/browser-report.json), [pagination-browser.json](./tests/results/pagination-browser.json), [fulltext-browser.json](./tests/results/fulltext-browser.json). Các file tests/results bị gitignore; clone chỉ có source thì chạy lại lệnh để tạo bằng chứng.

### 6.2. Những điểm chưa nên ghi là hoàn thành

- Slide [doc.md](./slide-knowledge/doc.md) nêu các mode basic, advanced, fulltext, fuzzy. Parser hiện nhận **basic, fulltext, smart**: có bộ lọc nâng cao và fuzzy trong Smart, nhưng **chưa tách mode=advanced và mode=fuzzy đúng tên hợp đồng slide**. Nhánh trigram trong Smart chấm từng từ, không đồng nghĩa endpoint fuzzy thuần trên toàn tên. Vì vậy không kết luận đã đạt toàn bộ hợp đồng tìm kiếm của slide.
- Index tồn tại không chứng minh mọi nhánh Smart dùng index để tăng tốc. Từ vựng toàn cục vẫn được tính trong query; cần đo lại khi dữ liệu lớn.
- Offset pagination có thể dịch nếu dữ liệu thay đổi giữa các lượt tải; thứ tự ổn định chỉ đảm bảo khi dataset ổn định.
- Tìm gần đúng có ngưỡng và trường hợp mơ hồ; không bảo đảm mọi chuỗi gõ sai đều ra đúng món người dùng nghĩ tới.
- Chưa có cảnh 3D mới, giỏ hàng hoặc checkout trong app được báo cáo.

## 7. Cách chạy và tự đối chiếu

Với môi trường đã có DATABASE_URL trong api/.env, từ **D:/WebApplication/Web-design/week5**:

~~~powershell
npm ci
npm run db:generate --workspace @soucha/api
npm run db:search-setup
npm run dev
~~~

SPA mặc định **http://localhost:5173/dishes**, API **http://localhost:3001/api**. web/.env chỉ chứa cấu hình công khai; không đưa thông tin kết nối database lên frontend hoặc báo cáo. Sau khi đổi backend, dừng tiến trình cũ trước khi chạy lại.

Checklist review:

- [ ] Chạy ba kiểu phân trang với 12/24 món; quan sát Network chỉ nhận đúng trang.
- [ ] Tìm houjicha whisk, houcha, kswh, chatma và một từ không khớp.
- [ ] So tổng kết quả chatma và matcha, kiểm tra sang trang và Tải thêm không thiếu món.
- [ ] Kiểm tra giá 0, available=false, đổi bộ lọc và quay lại trang đầu.
- [ ] Kiểm tra nhập/sửa công thức và gán/gỡ món không mất bản ghi cha.
- [ ] Xác nhận không có ô Cách tìm hoặc hai mục sort đã bỏ.
- [ ] Đánh giá bản UI 3D sau khi được triển khai, rồi cập nhật riêng mục 5.3.

Nguồn code/đối chiếu chính: [week4/api/src/app.js](../week4/api/src/app.js), [week4/web/src/app.js](../week4/web/src/app.js), [pagination.js](./api/src/pagination.js), [search-setup.sql](./api/prisma/search-setup.sql), [menu-pagination.js](./web/src/menu-pagination.js), [pagination-api.md](./docs/pagination-api.md), [full-text-search.md](./docs/full-text-search.md).
