# Week 8 — Soucha: MFA trên REST API + SPA

MFA TOTP và Access Control được tích hợp trên API/SPA hiện có. Xem [cài đặt MFA](./docs/MFA.md) và [đối chiếu bài giảng, kiểm thử và giới hạn SSR](./docs/WEEK8-VERIFICATION.md). Chạy `npm run db:generate --workspace @soucha/api`, bổ sung `api/sql/005-dish-status.sql` theo [hướng dẫn SQL](./api/sql/README.md), rồi `npm run setup:mfa` trước khi dùng phiên bản này với PostgreSQL hiện có. Phần dưới là hướng dẫn nền tảng API/SPA kế thừa Week 7.

Ứng dụng Week 8 chạy từ hai workspace `api/` và `web/`. Bản `restaurant/` là ứng dụng tham khảo cũ. Nền tảng kế thừa tìm kiếm, phân trang và luồng tài khoản API JSON + CSR của các tuần trước.

## Tài khoản và reCAPTCHA v2

1. Cấu hình `JWT_ACCESS_SECRET` trong `api/.env`. Để dùng đăng ký và OTP, cấu hình SMTP và cặp `RECAPTCHA_V2_SITE_KEY` / `RECAPTCHA_V2_SECRET_KEY`. Cặp Google phải thuộc loại **reCAPTCHA v2 Checkbox** và cho phép hostname của `SPA_ORIGIN`. Nếu chưa đặt cặp này, Week 7 vẫn nhận cặp biến `LOGOUT_RECAPTCHA_V2_SITE_KEY` / `LOGOUT_RECAPTCHA_V2_SECRET_KEY` cũ của Week 6 cho đăng ký và đăng nhập.
2. Dùng `npm run setup` cho cơ sở dữ liệu mới hoặc SQLite cục bộ. Với PostgreSQL đã có dữ liệu, xem [hướng dẫn SQL](./api/sql/README.md) để chọn đúng bước bổ sung bảng tài khoản. Nếu dùng chính cơ sở dữ liệu đã có schema tài khoản Week 6, Week 7 đọc các tài khoản đó trực tiếp.
3. Chạy `npm run dev` từ thư mục `week8`, mở <http://localhost:5173/login> và chọn **Tạo tài khoản**. Mã OTP đến qua SMTP. Checkbox bắt buộc khi đăng ký và hiện sau lần đăng nhập sai thứ ba. Link quên mật khẩu trỏ về SPA và dùng một lần.

Tạo secret riêng cho bản demo và lưu kết quả vào `JWT_ACCESS_SECRET` trong `api/.env`:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

`POST /api/auth/login` trả `data.accessToken` có hạn **60 giây** khi tài khoản chưa bật MFA; tài khoản đã bật chỉ nhận challenge rồi dùng `POST /api/auth/mfa` để lấy JWT. SPA giữ JWT trong bộ nhớ và `sessionStorage`, gửi `Authorization: Bearer <accessToken>` khi gọi API. Tải lại trang khôi phục token còn hạn qua `/api/auth/me`. Token hết hạn yêu cầu đăng nhập lại. API xác minh HS256 bằng secret đã nạp, sau đó kiểm tra trạng thái và phiên bản MFA trong database để chặn token cũ. Đăng ký và xác minh OTP chưa cấp access token.

### Demo phát lại JWT sau đăng xuất

1. Đăng nhập với tài khoản demo. Trong DevTools → Network, xem phản hồi `POST /api/auth/login` và sao chép `data.accessToken`.
2. Bấm **Đăng xuất** rồi xác nhận. Bước này chỉ yêu cầu access token còn hạn.
3. Trong PowerShell, dán bản sao vào biến `$token`, rồi chạy lệnh dưới đây. Bản sao trả HTTP `200` nếu vẫn còn trong 60 giây kể từ lúc cấp. Chạy lại sau khi token hết hạn sẽ trả `401`, giống như khi thiếu token hoặc chữ ký bị sửa.

```powershell
$token = Read-Host "Dán access token demo"
curl.exe -i -H "Authorization: Bearer $token" http://localhost:3001/api/dishes
```

Đăng xuất vẫn bỏ JWT ở client. Đổi mật khẩu hoặc bật/tắt MFA làm tăng phiên bản xác thực và thu hồi JWT cũ ngay. JWT Week 7 bị từ chối vì issuer/audience riêng của Week 8.

Để tạo tài khoản demo đã kích hoạt trên DB test, đặt `AUTH_SEED_EMAIL` và `AUTH_SEED_PASSWORD` trong `api/.env`, rồi chạy `npm run db:seed:auth --workspace @soucha/api`. Bộ kiểm thử giao diện tài khoản chạy bằng `npm run test:auth:browser` với Google và SMTP giả lập.

Quản trị viên có thể mở **Quản trị → Phân quyền**, tìm chính xác email tài khoản, chọn một trong năm vai trò và xác nhận lưu. Tab **Tài khoản** vẫn quản lý danh sách và liên kết đầu bếp. API `GET /api/users?email=...` chỉ dành cho quản trị viên, trả danh sách phân trang lọc theo email; API đổi vai trò vẫn bảo vệ quản trị viên đang hoạt động cuối cùng. Email được chuẩn hóa như khi đăng nhập (bỏ khoảng trắng và chuyển phần tên miền thành chữ thường).

## Chạy nhanh

Yêu cầu Node.js 20+ và npm. Ví dụ chạy từ thư mục `week8`:

```powershell
cd week8
npm install
npm run setup # DB mới hoặc SQLite cục bộ
npm run setup:mfa # PostgreSQL: thêm bảng MFA; không cần bước này cho SQLite đã db:push
npm run dev
```

- SPA: <http://localhost:5173/dishes>
- Quản trị: <http://localhost:5173/admin/dishes>
- API: <http://localhost:3001/api/dishes>

`setup` chỉ tạo `.env` nếu chưa có, generate hai Prisma Client riêng, đồng bộ schema theo `DATABASE_URL` và thêm seed còn thiếu. File `.env.example` hiện dùng PostgreSQL/Supabase giống tuần 3; điền URL thật trước khi setup. Seed không xóa hay ghi đè các bản ghi đã có. Ctrl+C dừng hai server. Nếu tuần 3 đang chạy ở cổng 3001, dừng nó trước hoặc đổi cấu hình.

Có thể chạy riêng bằng hai terminal:

```powershell
npm start --workspace @soucha/api
npm start --workspace @soucha/web
```

## Cấu hình

`api/.env`:

```dotenv
DATABASE_URL="postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
PORT=3001
SPA_ORIGIN="http://localhost:5173"
```

`web/.env`:

```dotenv
WEB_PORT=5173
API_BASE_URL="http://localhost:3001/api"
```

Origin phải trùng chính xác (giao thức, hostname, port), không có `/` cuối. `localhost` và `127.0.0.1` là hai hostname khác nhau. Khi đổi port, cập nhật cả `SPA_ORIGIN` và `API_BASE_URL` nếu liên quan. Không có proxy API; browser gọi trực tiếp origin của API để thực hành CORS.

`schema.prisma` dùng PostgreSQL, kế thừa model/bảng/quan hệ của `week3/restaurant` và bổ sung cột `fts` cùng các index phục vụ tìm kiếm. Dùng cùng `DATABASE_URL` thì week5 đọc trực tiếp dữ liệu Supabase hiện có. Không cần chạy SQL tạo bảng lại trên database cũ. Sau khi điền URL, chạy `npm run db:generate --workspace @soucha/api`, `npm run db:search-setup`, `npm run test:live`, rồi restart API. Không in hoặc gửi URL có mật khẩu lên chat.

Hai file [SQL PostgreSQL](./api/sql/README.md) nằm tại `api/sql/001-schema.sql` và `002-seed.sql`, kế thừa schema/seed tuần 3 và bổ sung phần tìm kiếm của week5. Đã kiểm thử SQL bằng PostgreSQL cục bộ qua PGlite; kết nối Supabase thật cần URL trên máy bạn.

Có thể tiếp tục chạy SQLite độc lập bằng `DATABASE_URL="file:./soucha.db"`. File `api/.env.sqlite.example` có sẵn cấu hình local. Runtime tự chọn client và schema đúng provider, không cần sửa source và không ghi đè `.env`. Dữ liệu SQLite cũ vẫn tại `api/prisma/soucha.db`; đổi URL sang Supabase không tự chép các bản ghi local lên server.

## Week 5: dữ liệu giả lập để thử tìm kiếm

Dataset `soucha-demo-beverages-v1` có **1.200 món/biến thể**, chia đều 400 `coffee`, 400 `matcha`, 400 `houjicha`. Tên phân biệt công thức, loại sữa, nóng/đá, cỡ M/L và mức đường; giá 28.000–59.000 VND. Đây là món giả lập, không phải đơn hàng hoặc dữ liệu crawl. Mô tả có tag `[soucha-demo-beverages-v1]` để nhận biết; ảnh matcha/houjicha dùng ảnh có sẵn làm minh họa, coffee dùng placeholder của web.

Chạy từ `D:\WebApplication\Web-design\week5`:

```powershell
npm run db:seed:beverages -- --preview
npm run db:seed:beverages
npm run db:seed:beverages -- --apply
```

`--preview` xem mẫu không cần database. Lệnh không có cờ chỉ kiểm tra số món sẽ thêm, không ghi. Chỉ `--apply` mới nhập vào database theo `api/.env`. Script chạy trong transaction, chỉ thêm tên chưa có, chạy lại không tạo trùng và không xóa/sửa món cũ hay quan hệ hiện tại. Nếu trùng tên với món không thuộc dataset, script dừng thay vì ghi đè. Bộ lọc giao diện có thêm Coffee; thử `/dishes?category=coffee`, tìm `Cà phê sữa`, `Matcha`, `Houjicha` hoặc sắp xếp theo giá. Dữ liệu mới không tự thêm công thức, gán đầu bếp hay thay đổi tồn kho.

Week4 và week5 hiện dùng chung database Supabase theo cấu hình đã chọn; dữ liệu nhập từ week5 cũng xuất hiện khi chạy week4.

## Tối ưu tải món, FTS và danh sách Chef

API phân trang lấy items và total trong một câu SQL. Tải thêm/Cuộn liên tục chuẩn bị trước tối đa một trang, dùng lại request đang chạy và hủy khi đổi điều kiện. Ảnh/font được cache 24 giờ; dữ liệu API/config/source vẫn được tải mới. Xem số đo và chi tiết tại [performance-and-search-setup.md](./docs/performance-and-search-setup.md).

FTS dùng cột `tsvector` khớp Prisma và trigger tự cập nhật từ name/description. Chạy `npm run db:search-setup` để đồng bộ database hiện có; `npm run db:push --workspace @soucha/api` tự chạy setup trước/sau. Helper thực thi nguyên file SQL; giữ cả function/DO block và comment.

Danh sách 28 Chef đã chuyển sang thứ tự tên Việt Nam, chuyên môn Pha chế, được thêm không trùng bằng `npm run db:seed:chefs -- --apply`. Xem trước tên bằng `npm run db:seed:chefs -- --preview`. Người đã có không bị ghi đè.

## Cấu trúc

```text
week5/
  api/
    prisma/schema.prisma     PostgreSQL, quan hệ kế thừa và cột/index tìm kiếm
    prisma/search-setup.sql  Extension, helper và trigger cập nhật FTS
    prisma/schema.sqlite.prisma  Database local/test độc lập
    prisma/seed.js           Tám món Soucha, đầu bếp, nguyên liệu, liên kết mẫu
    src/app.js              Route, response, CORS, lỗi kỹ thuật
    src/validation.js       Validate JSON, whitelist, partial PATCH, parse id
    src/relations.js        Công thức, gán đầu bếp, giao dịch nguyên tử
    src/database.js         Chọn Prisma Client từ DATABASE_URL
    sql/                    Schema và seed PostgreSQL
    src/soucha-menu.js      Dữ liệu món kế thừa
    server.js              Chạy Express + Prisma
  web/
    index.html             Document duy nhất của SPA
    server.js              Static server, fallback index.html, cấu hình public
    src/app.js             History router và các trang
    src/api.js             Lớp fetch, ba tầng lỗi
    src/menu-pagination.js Ba UI phân trang, tìm kiếm và lọc thực đơn
    src/resources.js       Cấu hình form và validate phía client
    src/dom.js             Dựng DOM an toàn bằng textContent/DOM properties
    src/recipe-editor.js   Nguyên liệu có sẵn/tạo mới trong form món
    src/search-select.js   Dropdown gõ tìm kiếm cho nguyên liệu và món đầu bếp
    src/relations.js       Công thức, sửa lượng, xác nhận gỡ, gán đầu bếp
    public/                Logo, ảnh và CSS
  tests/                   Kiểm tra API, fallback và browser
  docs/requests.http       Request mẫu để trình diễn
  REQUIREMENT.md           Yêu cầu bài tập đã trích
  BAO-CAO-DOI-CHIEU.md      Phần đã làm và đối chiếu nghiệm thu
```

Frontend dùng JavaScript ES modules thuần và router tự viết bằng History API (`pushState`, `popstate`). Không có SSR, framework server render, kho dữ liệu toàn cục hay bước build. `web/server.js` chỉ phục vụ file và cấu hình URL API công khai; không đọc model hoặc database. Font Kodchasan được lưu cục bộ ở `web/public/fonts`, dùng thống nhất cho chữ tiếng Việt, không tải font bên ngoài khi mở trang.

## Các trang

| Đường dẫn | Chức năng |
| --- | --- |
| `/dishes?q=matcha` | Danh sách người dùng, tìm theo tên, lưu query trong URL |
| `/dishes/:id` | Chi tiết đầy đủ các trường món |
| `/admin/dishes` | Danh sách quản trị món |
| `/admin/chefs` | Danh sách đầu bếp |
| `/admin/ingredients` | Danh sách nguyên liệu |
| `/admin/:resource/new` | Thêm bản ghi |
| `/admin/:resource/:id/edit` | Đọc theo id rồi sửa |
| `/admin/:resource/:id/delete` | Đọc theo id, xác nhận rồi mới xóa |
| `/admin/dishes/:id` | Công thức, tồn kho, số phần làm được, đầu bếp |
| `/admin/dishes/:id/ingredients/new` | Thêm nguyên liệu có sẵn hoặc tạo mới vào công thức |
| `/admin/dishes/:id/ingredients/:ingredientId/edit` | Sửa lượng dùng cho một phần |
| `/admin/dishes/:id/ingredients/:ingredientId/delete` | Xác nhận gỡ nguyên liệu, giữ nguyên liệu trong kho |
| `/admin/chefs/:id` | Danh sách món phụ trách và form gán món |
| `/admin/chefs/:id/dishes/:dishId/delete` | Xác nhận gỡ món khỏi đầu bếp |

`:resource` là `dishes`, `chefs` hoặc `ingredients`. Sau thêm/sửa món, chuyển tới chi tiết; sau thêm/sửa đầu bếp và nguyên liệu, chuyển tới danh sách. Sau xóa luôn chuyển danh sách. Trang đích tự GET dữ liệu mới.

Ngay trong form thêm/sửa món, bấm **Thêm dòng nguyên liệu**, chọn nguồn **Chọn từ kho** hoặc **Tạo nguyên liệu mới**, rồi nhập lượng dùng. Có thể thêm nhiều dòng. Món, nguyên liệu mới và các dòng công thức được lưu trong cùng transaction; nếu một dòng sai thì không ghi dữ liệu dang dở. Gỡ dòng trong form chỉ có hiệu lực khi lưu. Số phần = giá trị nhỏ nhất của `floor(stock / amount)`; công thức trống = 0; thêm công thức không tự trừ kho.

Ô **Nguyên liệu** khi chọn từ kho và ô **Món ăn** khi gán cho đầu bếp đều có tìm kiếm ngay trong danh sách xổ xuống. Bấm ô để mở, gõ tên để lọc tức thì, chấp nhận cả không dấu và không phân biệt hoa/thường (ví dụ `sua`, `duong`, `TRA DAO`). Chọn bằng chuột hoặc phím mũi tên + Enter; Esc hoặc chuyển ra ngoài để đóng. Phải chọn một kết quả hợp lệ, chỉ nhập từ khóa không được coi là đã chọn; đổi từ khóa sẽ bỏ ID cũ để tránh lưu nhầm. Món đã gán cho đầu bếp không xuất hiện trong danh sách để gán thêm.

## Ba UI phân trang (week5)

Trang thực đơn có thanh chọn **Số trang / Tải thêm / Cuộn liên tục**. Cả ba lấy từng phần dữ liệu qua `/api/dishes/paged`; số trang thay danh sách, hai kiểu còn lại nối thêm. Có chọn số món mỗi lượt, lọc category/trạng thái/khoảng giá và sort tên/giá trên toàn bộ tập phù hợp tại server.

- `/dishes?view=pages&page=2&pageSize=12`: Reload/copy link/Back giữ đúng trang và điều kiện.
- `/dishes?view=more&pageSize=12`: Tải thêm theo nút; khi mở lại link bắt đầu từ page 1.
- `/dishes?view=infinite&pageSize=12`: Cuộn gần cuối để tải tiếp; khi mở lại link bắt đầu từ page 1; có nút Tải thêm dự phòng.

UI mặc định 12 món/lượt, chọn 12 / 24 / 36 / 48 / 96 để khớp 4 món/hàng. Liên kết cũ có kích thước chưa phù hợp được làm tròn lên bội số 4, tối thiểu 12 và khởi động lại từ trang 1; filter/sort được giữ nguyên. API vẫn nhận 1–100 theo hợp đồng cũ.

Ở kiểu Số trang, bấm dấu `…` để mở hộp nhập số trang cần đến. Số trang phải là số nguyên trong phạm vi hiện có; chuyển trang giữ nguyên từ khóa, bộ lọc, sắp xếp và số món mỗi lượt.

Đổi điều kiện hoặc kiểu xem bắt đầu lại từ đầu, không trộn response cũ. Tải tiếp lỗi giữ cards cũ và thử lại đúng trang. [Đối chiếu HTML bài giảng](./docs/doi-chieu-html-pagination.md). Kiểm tra riêng UI bằng `npm run test:pagination:browser`; ảnh và báo cáo tạo trong `tests/results/`.

## UI và chuyển động

Hero dùng logo Soucha. Đổi bộ lọc giữ vị trí và focus, đổi trang số đưa tới vùng kết quả, và hero được tái sử dụng khi chỉ đổi query. Back/Forward khôi phục vị trí trong nội dung hiện có. Hai kiểu nối thêm vẫn bắt đầu lại từ trang 1.

Kiểm tra vòng đời, vị trí cuộn, bàn phím và fallback bằng `npm run test:ui:browser`. Ảnh/checklist kết quả nằm trong `tests/results/` và được gitignore. Kế hoạch: [UI-REDESIGN-PLAN.md](./UI-REDESIGN-PLAN.md).

## API contract

**Tìm kiếm thông minh tự động:** `mode=smart` kết hợp full-text với bỏ dấu tiếng Việt, Levenshtein và trigram trên từng từ. UI không có ô Cách tìm. `houjicha whisk`, `houcha` và `houjcha whsik` tìm được **Houjicha Cold Whisk**; `kswh` là gợi ý ký tự yếu khi không có kết quả tốt hơn. Các ca `báh bì → Bánh bò` được kiểm tra trên database test riêng. Ô Sắp xếp chỉ cho chọn tên/giá/mới nhất; nếu chưa chọn thì hệ thống tự sắp xếp phù hợp. Cả ba kiểu phân trang giữ từ khóa và điều kiện. [Cách sử dụng, điểm tương đồng và giới hạn](./docs/full-text-search.md). Sau khi pull code, chạy `npm run db:search-setup` để cài extension/helper rồi restart `npm run dev`. `npm run test:fulltext:browser` kiểm tra UI bằng PostgreSQL cục bộ.

Week5 có thêm **`GET /api/dishes/paged?page=1&pageSize=10`** dùng chung cho UI số trang, Load More và Infinite Scroll. API phân trang tại database, trả `{ ok: true, data: { items, total, page, pageSize }, error: null }`; tối đa 100 món/trang. Hỗ trợ `q`, `category`, `minPrice`, `maxPrice`, `available`, `sort`, áp dụng trước phân trang. Contract và hướng dẫn tích hợp: [docs/pagination-api.md](./docs/pagination-api.md). Chạy `npm run test:pagination:live` để xác nhận từng trang trên Supabase mà không sửa dữ liệu.

Cho mỗi resource trong ba tên trên:

| Method | URL | Kết quả thành công |
| --- | --- | --- |
| GET | `/api/:resource?q=...` | `{ "ok": true, "data": [] }` hoặc mảng bản ghi |
| GET | `/api/:resource/:id` | Bản ghi |
| POST | `/api/:resource` | Bản ghi đã tạo |
| PATCH | `/api/:resource/:id` | Bản ghi sau cập nhật từng phần |
| DELETE | `/api/:resource/:id` | `{ "ok": true, "data": null }` |

Handler thành công hoặc lỗi nghiệp vụ đều trả **200** theo quy ước đề. Lỗi nghiệp vụ: `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "..." } }`, hoặc `VALIDATION_FAILED` với `fields`. URL/method sai trả **404**, JSON không đọc được **400**, database/hệ thống lỗi **500**; các lỗi kỹ thuật không có `ok`. Preflight OPTIONS trả **204**. Origin không được phép trả **403** và không có header cho phép origin đó.

API kiểm tra kiểu JSON: `price`/`stock` là số nguyên không âm, `available` là boolean, không tự đổi chuỗi số thành số. `name` bắt buộc cả ba model; `specialty` và `unit` cũng bắt buộc theo form tuần 3. Trường tùy chọn có giới hạn độ dài; đường dẫn ảnh chỉ cho phép `/beverages/...`. Id sai định dạng trả `NOT_FOUND` trước khi query database. PATCH bỏ qua trường không thuộc whitelist; body không có trường cập nhật hợp lệ trả lỗi `_form`.

GET món hỗ trợ thêm `category`, `sort=price-asc|price-desc` như tuần 3. GET chi tiết món trả thêm `ingredients`, `chefs`, `servings`. POST/PATCH món có thể nhận:

```json
{
  "name": "Matcha mới",
  "price": 35000,
  "ingredients": [
    { "ingredientId": 1, "amount": 10 },
    { "ingredient": { "name": "Sữa mới", "unit": "ml", "stock": 1000 }, "amount": 200 }
  ]
}
```

`ingredients` vắng mặt khi PATCH thì giữ công thức; gửi mảng thay thế toàn bộ công thức; gửi `[]` để gỡ hết liên kết. Nguyên liệu gỡ ra vẫn ở trong kho. Không chấp nhận dòng trùng, lượng không phải integer ≥ 1 hoặc id không tồn tại. Lỗi từng dòng có khóa như `ingredients.0.amount` để form hiển thị đúng vị trí.

API quan hệ: GET/POST `/api/dishes/:id/ingredients`; GET/PATCH/DELETE `/api/dishes/:id/ingredients/:ingredientId`; GET/POST `/api/chefs/:id/dishes`; GET/DELETE `/api/chefs/:id/dishes/:dishId`. Đều giữ contract 200 + ok/data/error như các API chính.
### Authorization and account roles

The API uses role-based action grants with resource scopes based on the authenticated account and persisted data. Authorization is deny-by-default; hiding a link or button in the SPA is only a usability measure and does not protect an API route. A customer's dish list and detail are limited to available dishes. Chefs can browse the full menu and recipes, including before their account is linked to a Chef profile. A linked chef can add existing dishes to, or remove them from, their own cooking list. These actions change only ChefDish links; they do not create or delete menu dishes. Ingredient inventory lists remain scoped to assigned recipes. Managers can manage operational resources but cannot manage accounts or identity links.

| Action | admin | manager | chef | staff | customer |
| --- | --- | --- | --- | --- | --- |
| Read dishes | All | All | All | All | Available only |
| Create/edit/delete dishes (including price) | Yes | Yes | No | No | No |
| Change availability | Yes | Yes | Assigned draft dishes only | No | No |
| Read recipes | All | All | All | No | No |
| Edit recipes | Yes | Yes | No | No | No |
| Read ingredients/stock | All | All | Ingredients in assigned recipes | No | No |
| Write ingredients/stock | Yes | Yes | No | No | No |
| Read chef directory and assignments | Yes | Yes | Own only | No | No |
| Edit chef profiles or other chefs' assignments | Yes | Yes | No | No | No |
| Add/remove existing dishes in own cooking list | Yes | Yes | Linked profile only | No | No |
| List accounts, change roles, link Chef accounts | Yes | No | No | No | No |

Existing `viewer` accounts are migrated to `customer`, removing their former broad authenticated CRUD access. Review existing accounts and explicitly assign operational roles before rollout; do not infer privileges from names, email addresses, or ChefDish assignments. Canonical roles are `admin`, `manager`, `chef`, `staff`, and `customer`; account signup cannot set a role. A chef account requires a unique nullable Chef link, and an unlinked chef has no chef-scoped access. ChefDish remains a business assignment and does not establish login identity.

For either PostgreSQL or SQLite upgrades, first back up the database and stop all application writers. Set `DATABASE_URL` in `api/.env`, then run `node scripts/database.js generate` followed by `node scripts/database.js push` from the repository root. The push path runs `migrate-identity` before Prisma `db push`: it maps known `viewer` roles to `customer`, refuses unknown role values without changing them, then adds the nullable unique Chef link from the Prisma schema. Resolve unknown roles explicitly before retrying. Prisma `db push` behavior depends on provider/version; review any failure with an operator and do not use `--accept-data-loss`. Restore from backup if needed.

Before cutover, inventory existing viewer accounts and identify legitimate operators; mapping viewer to customer intentionally removes broad authenticated CRUD access. After the schema upgrade, activate an existing account, then run `node api/prisma/bootstrap-admin.js <email>` as a trusted operator. This promotes that existing account only when no active admin exists; it does not create credentials. Restart application writers afterward and use the admin API to assign operational roles and Chef links. Keep the backup until rollout is confirmed. Never bootstrap through public signup, a default credential, or a first-registration rule.

After bearer-token signature/expiry verification, protected requests use the current database account role, status, and Chef link. Inactive or missing accounts are rejected. The MFA guard checks the token's authentication version and second-factor proof. Resetting a password or enabling/disabling MFA increments the version and revokes older tokens. Logout discards the client's token. Copies with the current version remain usable until expiry.

Dish editing state is `draft` or `published`, separate from serving availability. The existing ChefDish assignments identify the responsible chefs. A chef can change availability only for an assigned draft dish. The conditional SQL write checks the current assignment, active chef account and dish state again. Admin and manager retain the existing operational write rights, including editing state. Unassigned or published dish availability writes return `403`; missing records return `404`.

Authenticated authorization endpoints:

| Method | Path | Access / contract |
| --- | --- | --- |
| GET | `/api/auth/me` | Authenticated; `{ ok: true, data: { user: { id, role, chefId }, capabilities: [...] } }` |
| GET | `/api/users?page=1&pageSize=10` | Admin only; `{ ok:true, data:{ items:[{id,email,role,status,chefId}], total, page, pageSize } }`; excludes secrets |
| PATCH | `/api/users/:id/role` | Admin only; body `{ "role": "admin|manager|chef|staff|customer" }`; returns safe account fields |
| PATCH | `/api/users/:id/chef` | Admin only; body `{ "chefId": 12 }` or `{ "chefId": null }`; returns safe account fields |
| PATCH | `/api/dishes/:id/availability` | Admin/manager, or chef assigned to a draft dish; exact body `{ "available": true }` |

Khi admin gán role `chef`, API tự tạo và liên kết hồ sơ nếu tài khoản chưa có `chefId`, trong cùng transaction. Tên mặc định lấy từ phần trước `@` của email, chuyên môn mặc định là “Chế biến món ăn”; admin có thể sửa hồ sơ sau đó. Gán lại `chef` cho tài khoản đã liên kết giữ nguyên hồ sơ. Với tài khoản chef cũ chưa có hồ sơ, admin tìm email trong trang Phân quyền rồi bấm “Lưu vai trò” để bổ sung liên kết.

Capabilities are action names (`dish.read`, `dish.write`, `dish.availability.update`, `recipe.read`, `recipe.write`, `ingredient.read`, `ingredient.write`, `chef.read`, `chef.write`, `assignment.read`, `assignment.write`, `assignment.self.write`, `user.role.update`). They are coarse UI hints; a capability does not imply access to every resource instance. `assignment.self.write` permits only POST/DELETE links for the authenticated account's linked Chef profile; the server rejects a different profile ID or attempts to supply chefId/role in the POST body. The server enforces row scopes on collection, detail, nested relation, and write routes. Treat out-of-scope resources as not found, forbidden actions as denied, and never trust role/user identifiers supplied by the browser.

Đầu bếp mở tab **Đầu bếp** sẽ vào thẳng **Món tôi có thể chế biến**, dùng **+ Thêm món có thể chế biến** và ô **Tìm món trong thực đơn** để chọn món có sẵn. Món đã thêm không xuất hiện trong danh sách chọn. **Gỡ khỏi danh sách** mở bước xác nhận và chỉ xóa liên kết với đầu bếp. Nếu tài khoản chưa liên kết hồ sơ, trang hướng dẫn nhờ admin tạo và liên kết tại trang Tài khoản; đầu bếp vẫn xem được thực đơn. Chạy `npm run test:chef:browser` để kiểm tra luồng này bằng database riêng. Với Supabase cũ chưa có `dishes.status`, chạy `npm run db:status-setup`; migration có thể chạy lại và không thay thế món hay phân công hiện có.

For authorization coverage, test each role through direct HTTP requests, not just the SPA: customer available filtering and hidden details; chef full-menu reads, own assignment add/remove, cross-profile denial, scoped inventory and exact availability-only mutation; manager account-management denial; admin role/link changes and last-admin protection; invalid, inactive, and demoted users including a still-valid issued token. Verify rejected mixed availability fields do not mutate data. Bruno runner and current case inventory: [Bruno API reference](./bruno/restaurant-api/API-REFERENCE.md) and [test matrix](./bruno/restaurant-api/TEST-MATRIX.md).


## Kiểm tra

```powershell
npm test
npm run test:browser
npm run test:live
```

### Bruno (contract trên API đang chạy)

API phải listen `PORT` (mặc định 3001), ví dụ `npm start --workspace @soucha/api`.

```powershell
npm run test:bruno
```

Collection: `bruno/restaurant-api`.
Báo cáo: `bruno/restaurant-api/TEST-PLAN.md`.
Ma trận: `bruno/restaurant-api/TEST-MATRIX.md`.


Browser test mặc định dùng Google Chrome đã cài. Có thể chỉ định Chromium/Edge bằng `BROWSER_EXECUTABLE` nếu máy không có Chrome:

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

`npm test` và browser test tự chạy server trên cổng ngẫu nhiên, tạo SQLite riêng trong `tests/.tmp`; không dùng hay sửa database demo. Ngoài CRUD, JSON, CORS, 404/500 và fallback, có kiểm tra giao dịch công thức, đầu bếp, schema tuần 3 và chạy SQL trên PostgreSQL cục bộ. Browser test kiểm tra form nguyên liệu, gỡ có xác nhận, glyph tiếng Việt, navigation và preflight. Ảnh và báo cáo JSON tạo tại `tests/results/`, được gitignore. Test 500 chỉ làm hỏng bảng trong database test riêng.

`npm run test:live` là lệnh riêng, chỉ đọc số bản ghi từ database thật theo `api/.env`; không ghi/xóa và không in URL. Nếu kết quả vẫn có `provider: sqlite` thì `.env` chưa đổi sang PostgreSQL.

Request HTTP để chạy lại nằm ở `docs/requests.http`. Báo cáo phần mở rộng week5 xem [BAO-CAO-DOI-CHIEU.md](./BAO-CAO-DOI-CHIEU.md); đối chiếu lộ trình từ restaurant tuần 3 đến tuần 5 xem [DOI-CHIEU-WEEK4.md](./DOI-CHIEU-WEEK4.md).
