# Đối chiếu restaurant tuần 3 với Soucha tuần 5

Cập nhật: **26/10/2026**. Baseline là **week3/restaurant**, ứng dụng Express + EJS + Prisma; không phải app Next.js ở week3/soucha. Bản đang báo cáo là **week5/api + week5/web**, được khởi động bằng npm run dev tại week5.

Chi tiết phần mở rộng riêng so với tuần 4: [BAO-CAO-DOI-CHIEU.md](./BAO-CAO-DOI-CHIEU.md).

## 1. Lộ trình kiến trúc tuần 3 → tuần 4 → tuần 5

| Thành phần | Tuần 3 | Tuần 4 | Tuần 5 |
| --- | --- | --- | --- |
| Backend | Express + Prisma, trả HTML EJS | Express + Prisma, REST JSON | Kế thừa API, thêm truy vấn tìm/lọc/phân trang |
| Frontend | Template EJS, form HTML | SPA JavaScript ES modules | Giữ SPA, bổ sung menu phân trang và tìm tự động |
| Rendering | SSR tại server | Browser dựng DOM từ JSON | Tiếp tục CSR/SPA |
| Tìm món | Prisma contains trên name, kết hợp category | API lấy mảng rồi lọc tên trong Node.js | SQL full-text, fuzzy và nhận diện từ khóa trên toàn DB |
| Sort | Id hoặc giá tại DB | Giá tại DB, trả toàn mảng | Thêm tên, mới nhất, rank; sort trước LIMIT/OFFSET |
| Đọc danh sách | HTML chứa toàn bộ kết quả | JSON mảng, SPA render danh sách | JSON một trang + total/page/pageSize |
| Phân trang | Chưa có ba UI mới | Chưa có ba UI mới | Số trang, Tải thêm, Cuộn liên tục |
| Lỗi bản ghi thiếu | HTML lỗi HTTP 404 | JSON HTTP 200 + NOT_FOUND | Giữ contract tuần 4 |
| Validation | Form SSR HTTP 400, kèm giá trị/lỗi | JSON HTTP 200 + VALIDATION_FAILED/fields | Giữ contract; thêm validation query phân trang/tìm |
| Ghi dữ liệu | Form POST, method-override, redirect 303 | fetch POST/PATCH/DELETE, điều hướng client | Giữ cơ chế tuần 4 |
| Origin | UI và backend cùng origin | SPA 5173, API 3001, có CORS | Giữ hai origin và cấu hình CORS |

~~~text
Tuần 3:
Browser → request → Express → Prisma → PostgreSQL
        ← HTML do EJS render tại server ←

Tuần 5:
Browser tải HTML/JS ban đầu
→ JavaScript gọi API bằng fetch
→ Express → Prisma/SQL → PostgreSQL
→ JSON → JavaScript cập nhật DOM
~~~

Backend vẫn kiểm tra và lưu dữ liệu. CSR chỉ chuyển trách nhiệm dựng giao diện sang browser; browser không kết nối PostgreSQL trực tiếp. Mở link sâu hoặc Reload vẫn tải document ban đầu; điều hướng nội bộ/thao tác SPA mới tránh việc tải lại toàn trang.

## 2. Database: kế thừa gì, bổ sung gì?

### 2.1. Mô hình nghiệp vụ không thay đổi

| Thành phần tuần 3 | Trạng thái tại tuần 5 |
| --- | --- |
| Dish: id, name, description, price, category, image, available, createdAt | Giữ các trường; thêm fts và các index tìm kiếm |
| Chef: id, name, specialty, createdAt | Giữ model; có script nhập thêm tên |
| Ingredient: id, name, unit, stock, createdAt | Giữ model và tồn kho |
| DishIngredient: dishId + ingredientId, amount | Giữ khóa kép, khóa ngoại và cascade |
| ChefDish: chefId + dishId | Giữ khóa kép và quan hệ nhiều–nhiều |
| Seed món, nguyên liệu và quan hệ ban đầu | Kế thừa dữ liệu nguồn; seed tránh thêm trùng/reset tồn kho |

Prisma schema PostgreSQL của tuần 5 vẫn khớp mô hình nghiệp vụ tuần 3 sau khi loại khác biệt đường dẫn generate client và phần mở rộng tìm kiếm. Điều này được kiểm tra tại [database.test.js](./tests/database.test.js).

Không bổ sung bảng Order/OrderItem hoặc chuyển 1.200 biến thể đồ uống thành đơn hàng. Dữ liệu mở rộng là bản ghi Dish; 28 tên bổ sung là bản ghi Chef có chuyên môn Pha chế.

### 2.2. Phần mở rộng chỉ có ở tuần 5

- **fts: tsvector**, lưu document tên trọng số A và mô tả trọng số B, dùng simple và coalesce cho NULL.
- **GIN fts**, **GIN name gin_trgm_ops**, **index category/available/price**.
- Extension **pg_trgm**, **unaccent**, **fuzzystrmatch**.
- Hàm chuẩn hóa tên **soucha_normalize_search** và chấm từ **soucha_word_score**.
- Trigger **dishes_fts_refresh**, gọi **soucha_refresh_dish_fts**, cập nhật document khi dữ liệu thay đổi.

fts là **cột thường + trigger**, không phải generated column. Prisma dùng Unsupported("tsvector")? để mô tả kiểu PostgreSQL; truy vấn tìm kiếm được viết bằng SQL bind tham số qua Prisma.

Nguồn: [schema tuần 3](../week3/restaurant/prisma/schema.prisma), [schema tuần 5](./api/prisma/schema.prisma), [SQL setup tuần 5](./api/prisma/search-setup.sql).

### 2.3. Database dùng chung

Week4 và week5 hiện trỏ cùng đích Supabase theo kiểm tra cấu hình. Dùng chung database không làm code tuần 3/4 tự có API, index metadata hay UI mới. Bản ghi mới có thể được các phiên bản cùng DB nhìn thấy, còn cách tìm và hiển thị do source từng phiên bản quyết định.

Khi thiết lập database mới, dùng [001-schema.sql](./api/sql/001-schema.sql) và [002-seed.sql](./api/sql/002-seed.sql) theo hướng dẫn. Với DB đang có dữ liệu, dùng schema và search setup của tuần 5 để giữ phần mở rộng. Không cần chép dữ liệu thật qua SQLite để chạy PostgreSQL.

## 3. Khác biệt trong cách tìm kiếm

### 3.1. Tuần 3: tìm chuỗi trong tên

Route GET /dishes dựng điều kiện Prisma:

~~~js
{
  name: { contains: q, mode: "insensitive" }
}
~~~

Kết hợp category và sắp xếp giá/id, sau đó render EJS. Quy tắc này không tự hiểu từ sai chính tả hoặc các từ bị ngăn bởi một từ khác trong tên.

### 3.2. Tuần 5: tìm toàn tập, trả từng trang

Endpoint **GET /api/dishes/paged** hỗ trợ:

| Mode hiện có | Nội dung |
| --- | --- |
| basic | Tìm nguyên chuỗi con trong tên, tương thích hành vi cơ bản |
| fulltext | plainto_tsquery/simple trên document tên + mô tả; rank giảm dần, id ASC khi bằng điểm |
| smart | Kết hợp full-text, bỏ dấu, Levenshtein, trigram, nhận diện từ và gợi ý ký tự |

**Full-text không đồng nghĩa chịu mọi lỗi chính tả.** Trường hợp houjicha whisk khớp Houjicha Cold Whisk do các từ không cần liền nhau. Các trường hợp houcha hoặc báh bì cần thêm fuzzy/chuẩn hóa.

Smart được triển khai theo các bước:

1. Chuẩn hóa NFC, chuyển chữ thường, bỏ dấu khi so tên.
2. Tạo bộ từ vựng tên món toàn cục, không phụ thuộc trang hoặc bộ lọc hiện tại.
3. Nhận diện một token chưa tồn tại dài 5–12 ký tự thành ứng viên hoán vị đầy đủ duy nhất, nếu có.
4. Chạy full-text với từ gốc/từ nhận diện và tính fuzzy từng từ, không bỏ qua từ không khớp.
5. Kết hợp category, giá, available; xếp hạng; đếm và lấy trang trong cùng một câu SQL.

Các giới hạn fuzzy: từ 2–4 ký tự cho phép 1 thao tác Levenshtein, từ dài hơn cho phép 2; từ hai ký tự cần ngữ cảnh query nhiều từ; trigram có ngưỡng 0.3. Xáo trộn ký tự một phần như kswh chỉ được dùng làm gợi ý yếu, có nhãn riêng, khi không có kết quả tốt hơn. Đây là các quy tắc điểm, không phải xác suất AI.

### 3.3. Ví dụ sửa lỗi thiếu kết quả

Trước khi thêm bước nhận diện, **chatma** có điểm tốt với các từ như “chất/chai”, làm nhánh Matcha bị loại. Hiện tại:

~~~text
q gốc: chatma
→ nhận diện matcha
→ tìm toàn bộ món theo matcha
→ tổng kết quả và thứ tự đầy đủ
→ trả trang người dùng yêu cầu
~~~

API trả correctedQuery để UI thông báo “Hiển thị kết quả cho matcha”, không âm thầm thay nội dung trong ô tìm. Kiểm tra chỉ đọc ngày 26/10/2026 cho thấy chatma và matcha cùng **667 kết quả**, cùng thứ tự/ID qua mọi trang, không lặp; con số có thể thay đổi khi dữ liệu thay đổi.

Hai món **Bánh bò/Cơm bò** chỉ được tạo trong database test riêng để kiểm tra báh bì chọn Bánh bò; không được nhập vào thực đơn Supabase khi kiểm thử.

## 4. Backend và frontend đã chuyển những gì?

| Chức năng | Tuần 3 | Tuần 5 hiện tại |
| --- | --- | --- |
| Danh sách/chi tiết món | Handler render EJS | API JSON và trang SPA dựng DOM |
| Form tạo/sửa | HTML form + redirect 303 | Fetch, validate cả client/server, giữ input khi lỗi |
| Xóa dữ liệu | Trang xác nhận, method-override rồi redirect | Trang xác nhận SPA, DELETE sau khi xác nhận |
| Công thức và amount | Handler/template SSR | API quan hệ và trang công thức SPA |
| Ingredient.stock và servings | Logic nghiệp vụ trên server | Giữ cách tính min floor(stock/amount), công thức trống = 0 |
| Gán/gỡ món Chef | Handler/template SSR | API quan hệ + SPA, giữ khóa kép chống trùng |
| Tạo món kèm nguyên liệu mới | Không nằm trong form tạo món ban đầu | Có từ bước tuần 4, lưu cùng transaction; tuần 5 kế thừa |
| Xử lý lỗi | HTML 400/404/500 | Tách lỗi nghiệp vụ JSON và lỗi kỹ thuật; UI trạng thái riêng |
| Chống phản hồi cũ | Tải document theo request | AbortController theo route, pending và kiểm tra response |
| Cấu hình | DATABASE_URL phía server | Giữ secret phía API; web chỉ nhận API_BASE_URL công khai |

File cần review ở tuần 5:

- [api/src/app.js](./api/src/app.js): route, contract JSON, CORS, CRUD.
- [api/src/pagination.js](./api/src/pagination.js): tìm/lọc/sort/count/phân trang và nhận diện từ.
- [api/prisma/search-setup.sql](./api/prisma/search-setup.sql): extension, hàm và trigger.
- [web/src/app.js](./web/src/app.js): History router và các trang.
- [web/src/menu-pagination.js](./web/src/menu-pagination.js): danh sách/tìm kiếm/bộ lọc và ba UI phân trang.
- [web/src/page-buffer.js](./web/src/page-buffer.js): dùng lại request trang kế tiếp.
- [web/src/api.js](./web/src/api.js): ranh giới gọi API và kiểm tra response.

Quản lý công thức, tồn kho, tính servings, dropdown tìm nguyên liệu và các transaction không phải đều được viết mới ở tuần 5: phần lớn đã được mang từ SSR sang SPA trong tuần 4.

## 5. Phần UI hiện tại và phần sẽ cập nhật sau

### Đã có trong code

- Logo mèo, màu kem/xanh matcha/nâu và ảnh đồ uống của Soucha; Kodchasan được tự phục vụ ở SPA.
- Thẻ món responsive, hover nhẹ và hiệu ứng xuất hiện ngắn; tên/giá/hành động rõ ràng.
- Tìm kiếm thông minh tự động, không có ô chọn Cách tìm.
- Năm bộ lọc: Danh mục, Trạng thái, Sắp xếp, Giá từ, Đến.
- Dropdown sort chỉ còn tên/giá/mới nhất; không có Mặc định/Liên quan nhất. Khi chưa chọn, server tự dùng thứ tự phù hợp.
- Số trang/Tải thêm/Cuộn liên tục; mặc định 12 món, lựa chọn 12/24/36/48/96, giữ bộ lọc trên URL.
- Link cũ có kích thước không phù hợp được làm tròn lên bội số 4, tối thiểu 12, bắt đầu lại từ trang đầu.
- Loading/empty/error/end, tổng kết quả, thanh tiến độ, thông báo correctedQuery và gợi ý yếu.

### Dự kiến, chưa được tính là hoàn thành

Hướng đang trao đổi là **playful 3D + spring motion**: ly đồ uống 3D ở hero, chuyển động nhấp nhô/nảy, mascot và thẻ món phản ứng khi tương tác. Chưa triển khai hoặc nghiệm thu các hiệu ứng này. Khi người dùng duyệt bản UI mới, cần viết lại mục này theo hành vi thật, không dùng ý tưởng thay cho bằng chứng.

Tài liệu có thể tham chiếu khi triển khai: [AI implementation guideline](../../folder_UI_Training/AI_implementation_guideline.md), [Cinematic scroll guideline](../../folder_UI_Training/CINEMATIC_SCROLL_UI_GUIDELINE.md). Đây là tài liệu thiết kế, không phải bằng chứng rằng 3D đã có.

## 6. Kiểm chứng và những phần còn thiếu

### Kết quả hiện có

- **31/31 nhóm npm test**, chạy lại trong lượt viết báo cáo: CRUD, contract, CORS, quan hệ, transaction, schema PostgreSQL, tìm kiếm và phân trang.
- Kết quả browser gần nhất trong cùng phiên: **20/20** luồng SPA/quản trị, **9/9** phân trang, **8/8** tìm kiếm — tổng **37 nhóm**, không có page error.
- Xác minh Supabase chỉ đọc: fts là cột tsvector thường; có ba index tìm/lọc; chatma/matcha trả cùng tập kết quả.
- Database test riêng được phép thêm/sửa/xóa để kiểm tra logic; lượt kiểm chứng Supabase cho báo cáo không thực hiện CRUD ghi.

Có thể tạo lại bằng chứng bằng:

~~~powershell
npm test
npm run test:browser
npm run test:pagination:browser
npm run test:fulltext:browser
~~~

### Chưa nên kết luận đã hoàn thành mọi yêu cầu bài tìm kiếm

Slide hiện yêu cầu bốn mode basic, advanced, fulltext, fuzzy. API tuần 5 hiện nhận **basic, fulltext, smart**; các bộ lọc nâng cao/fuzzy có trong pipeline nhưng **chưa tách hai mode advanced/fuzzy đúng hợp đồng slide**. Cần phân biệt mức hoàn thiện chức năng sản phẩm với việc đáp ứng tên mode và quy tắc nghiệm thu của đề.

Ngoài ra: tìm gần đúng có trường hợp mơ hồ; offset có thể dịch khi dữ liệu thay đổi; index có sẵn không bảo đảm mọi phép chấm Smart dùng được index; chưa có giỏ hàng/checkout và cảnh 3D mới trong ứng dụng này.

## 7. Checklist review

- [ ] Đọc schema tuần 3 và tuần 5: năm bảng nghiệp vụ giữ nguyên, phần mới là tìm kiếm.
- [ ] Theo dõi một lần thêm món: SSR HTML/303 ở tuần 3 so với API JSON/SPA ở tuần 5.
- [ ] Thử tìm thiếu từ, sai chính tả, không dấu và đảo chữ.
- [ ] So chatma với matcha qua toàn bộ trang, không chỉ trang đầu.
- [ ] Kiểm tra minPrice=0, available=false, trang vượt phạm vi và retry trang tiếp theo.
- [ ] Xem lại UI thực tế trước khi cập nhật phần 3D dự kiến.
- [ ] Nếu nộp theo slide, đối chiếu riêng các mode API còn thiếu; không dùng báo cáo này để khẳng định đã đạt tất cả.

Đối chiếu tuần 4 chi tiết: [BAO-CAO-DOI-CHIEU.md](./BAO-CAO-DOI-CHIEU.md). Hợp đồng kỹ thuật: [pagination-api.md](./docs/pagination-api.md), [full-text-search.md](./docs/full-text-search.md).
