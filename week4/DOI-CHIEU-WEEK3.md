# Đối chiếu restaurant tuần 3 và bản REST API + SPA tuần 4

Cập nhật ngày 19/10/2026 theo yêu cầu: thêm nguyên liệu trực tiếp cho món, mang chức năng và SQL của restaurant tuần 3 sang tuần 4, sửa font tiếng Việt.

## 1. Đã sửa

- Form **Thêm món ăn** và **Sửa món ăn** có phần **Nguyên liệu cho món**. Mỗi dòng chọn từ kho hoặc tạo nguyên liệu mới ngay trong form, nhập lượng dùng cho một phần, bỏ dòng chưa lưu nếu cần.
- Ô chọn nguyên liệu từ kho và ô chọn món gán cho đầu bếp có dropdown tìm kiếm khi gõ: hỗ trợ không dấu/hoa thường, chuột/bàn phím, thông báo không có kết quả; khi đổi từ khóa sẽ bỏ ID cũ, tránh ghi nhầm lựa chọn trước đó.
- Tạo món, tạo nguyên liệu mới và gắn công thức trong **một transaction**. Nếu bất kỳ dòng nào không hợp lệ, không tạo món hoặc nguyên liệu dang dở. Lỗi được hiển thị cạnh đúng input, giữ giá trị đang nhập.
- Trang **Công thức** có tồn kho, lượng mỗi phần, số phần làm được, thêm nguyên liệu, sửa lượng và gỡ sau xác nhận. Gỡ chỉ xóa liên kết, giữ nguyên liệu trong kho.
- Trang chi tiết **Đầu bếp** có danh sách món, form gán món và trang xác nhận gỡ món; giữ nguyên cả món và đầu bếp khi gỡ.
- Mang lại lọc danh mục và sắp xếp giá từ menu tuần 3; q/category/sort nằm trong URL.
- Khôi phục **PostgreSQL/Supabase** trong schema chính; giữ schema/client SQLite riêng cho local/test. Runtime chọn theo DATABASE_URL, không cần sửa provider thủ công.
- Xuất SQL cấu trúc và dữ liệu mẫu từ source tuần 3, kiểm thử trên PostgreSQL cục bộ.
- Lưu Kodchasan trực tiếp trong dự án, dùng một family có đủ dấu tiếng Việt cho tiêu đề/nội dung/form; bỏ việc trộn Georgia/Times với sans-serif và không cần tải Google Fonts khi mở trang.

## 2. Bảng đối chiếu với source tuần 3

| Có trong `week3/restaurant` | Vị trí/luồng ở tuần 4 | Đối chiếu |
| --- | --- | --- |
| Prisma PostgreSQL, bảng dishes/chefs/ingredients | `api/prisma/schema.prisma`, `api/src/database.js` | Giữ nguyên trường và tên bảng; test so schema tự động |
| DishIngredient, amount, khóa kép, cascade | Schema PostgreSQL và `api/src/relations.js` | Giữ nguyên mô hình và khóa ngoại |
| ChefDish, khóa kép, cascade | Schema PostgreSQL và API quan hệ chefs/dishes | Giữ nguyên mô hình |
| Ingredient.stock | Form nguyên liệu, inline create, bảng công thức | Validate integer ≥ 0, không bị trừ khi chỉ tạo công thức |
| Seed tám món Soucha | `api/prisma/seed-data.js`, `src/soucha-menu.js` | Giữ tên/giá/danh mục/ảnh |
| Seed công thức và đầu bếp–món | Prisma seed và `api/sql/002-seed.sql` | Cùng một nguồn seed, không reset stock đã chỉnh |
| Logo và ảnh menu | `web/public/` | Tái sử dụng asset |
| Tìm món bằng q | `/dishes?q=...` và GET API | Giữ hành vi, không reload document |
| Lọc danh mục | `/dishes?category=matcha` | Đã mang qua |
| Sort giá | `/dishes?sort=price-asc` hoặc price-desc | Đã mang qua, phối hợp với q/category |
| Chi tiết món người dùng | `/dishes/:id` | Hiện đủ trường, bổ sung nguyên liệu và số phần |
| CRUD ba tài nguyên | Các URL `/admin/dishes`, `/admin/chefs`, `/admin/ingredients` | Giữ luồng thêm/sửa/xác nhận xóa |
| `/admin/dishes/:id` — công thức | Cùng URL phía SPA | Đã mang qua, mỗi lần mở đọc dữ liệu mới |
| Thêm nguyên liệu vào công thức | `/admin/dishes/:id/ingredients/new`, POST API | Chọn có sẵn hoặc tạo mới |
| Sửa lượng từng nguyên liệu | `/admin/dishes/:id/ingredients/:ingredientId/edit`, PATCH API | Validate integer ≥ 1; giữ input khi lỗi |
| Gỡ nguyên liệu sau xác nhận | `/admin/dishes/:id/ingredients/:ingredientId/delete`, DELETE API | Chỉ xóa sau nút xác nhận; kho vẫn còn nguyên liệu |
| Tính số phần với tồn kho | `api/src/recipe.js`, trường servings | Mang hàm tuần 3; min floor(stock/amount); trống = 0 |
| `/admin/chefs/:id` | Cùng URL phía SPA | Đã mang danh sách món và form gán |
| Chống gán món trùng | Transaction + khóa kép + validation | Đã mang qua |
| Gỡ món khỏi đầu bếp sau xác nhận | `/admin/chefs/:id/dishes/:dishId/delete` | Chỉ gỡ liên kết, không xóa món |
| Kodchasan | `web/public/fonts`, style.css | Giữ family, tự phục vụ đủ bốn weight và glyph tiếng Việt |
| EJS render, method-override, 303 | SPA + fetch đúng POST/PATCH/DELETE + History API | Chuyển theo đề REST API/SPA; không giữ cơ chế SSR |
| 404 cho bản ghi thiếu, 400 validation trong SSR | API trả 200 + NOT_FOUND/VALIDATION_FAILED | Thay theo contract buổi REST API/SPA |

Tuần 4 có thêm chức năng so với form tuần 3: tạo đồng thời nhiều nguyên liệu mới ngay trong lúc thêm món và lưu toàn bộ bằng transaction. Tuần 3 tách tạo món rồi vào trang công thức để gắn nguyên liệu.

## 3. SQL và dữ liệu Supabase

Các file:

- [Schema PostgreSQL](./api/sql/001-schema.sql)
- [Dữ liệu mẫu PostgreSQL](./api/sql/002-seed.sql)
- [Cách dùng SQL/Supabase](./api/sql/README.md)
- [Schema Prisma chính](./api/prisma/schema.prisma)

Trong source tuần 3 hiện tại chỉ có `.env.example`, không có URL thật hoặc SQL dump. Vì vậy đã chuyển **schema và seed trong source**; chưa tuyên bố đã sao chép các bản ghi thật trên Supabase. Nếu điền cùng URL của tuần 3 vào `week4/api/.env`, tuần 4 đọc trực tiếp đúng các bảng cũ; không phải copy dữ liệu sang SQLite.

Sau khi điền URL, chạy từ `week4`:

```powershell
npm run db:generate --workspace @soucha/api
npm run test:live
npm run dev
```

`test:live` chỉ đếm bản ghi và báo provider, không in mật khẩu/URL và không ghi dữ liệu. Nếu database mới trống, dùng `npm run setup` để đồng bộ schema/seed. File SQL tạo bảng dành cho database mới; database tuần 3 đã có bảng thì không cần chạy lại DDL.

Hiện phần nghiệm thu tự động dùng database riêng: SQLite cho các request API/Chrome; PostgreSQL cục bộ qua PGlite để thực thi hai file SQL. Kết nối Supabase thật chờ URL của người dùng; các kiểm thử trên không dùng thông tin đăng nhập giả để khẳng định kết nối thật.

## 4. Font tiếng Việt

Tuần 3 dùng Kodchasan từ Google Fonts; bản đầu tuần 4 trộn font serif ở tiêu đề với sans-serif của phần nhập liệu. Đã thống nhất Kodchasan, giữ UTF-8, lưu font Regular/Medium/SemiBold/Bold trong dự án và preload bản Regular.

Browser test không chỉ đọc CSS: Chrome báo font thực tế dùng để vẽ chuỗi có các dấu `Ắ Ằ Ẳ Ẵ Ặ Ế Ề Ể Ễ Ệ Ố Ồ Ổ Ỗ Ộ Ơ Ư Ứ Ừ Ử Ữ Ự` là Kodchasan và không có font fallback. Các input, label và h1 cùng dùng family này. Xem [nguồn font và giấy phép](./web/public/fonts/README.md).

## 5. Kết quả kiểm tra

- `npm test`: **16/16 nhóm đạt**, gồm CRUD, contract, CORS, lỗi kỹ thuật, giao dịch công thức, quan hệ, stock, lọc/sort, so schema tuần 3 và chạy SQL PostgreSQL.
- `npm run test:browser`: **20/20 nhóm đạt**, gồm tạo nguyên liệu ngay trong form, sửa/gỡ công thức, số phần, gán/gỡ món, validation giữ input, glyph tiếng Việt, tìm kiếm trong hai dropdown và các luồng SPA gốc.
- Kiểm tra mở trực tiếp + Reload **21 URL**: 14 URL bài gốc, 6 URL quan hệ và 1 URL không tồn tại. Luồng thêm/sửa/gỡ không tạo thêm document request.
- Không thay source tuần 3 và không tự ghi đè `.env` tuần 4.

Ảnh được tạo khi chạy browser test, trong thư mục được gitignore `tests/results`:

- [Form tạo món kèm nguyên liệu](./tests/results/recipe-form-desktop.png)
- [Trang công thức desktop](./tests/results/recipe-detail-desktop.png)
- [Trang công thức mobile](./tests/results/recipe-detail-mobile.png)
- [Món đầu bếp phụ trách](./tests/results/chef-assignments.png)
- [Menu dùng font mới](./tests/results/menu-desktop.png)
- [Báo cáo browser và request](./tests/results/browser-report.json)

Đối chiếu với riêng yêu cầu của bài giảng REST API/SPA vẫn nằm ở [BAO-CAO-DOI-CHIEU.md](./BAO-CAO-DOI-CHIEU.md).
