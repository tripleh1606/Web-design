# Week 4 — Soucha REST API và SPA

Bài tiếp nối `week3/restaurant`, theo đề `../REST-API-và-SPA.md`, bao gồm cả speaker notes. Giữ giao diện, logo, ảnh, seed và model từ tuần 3; tách phần backend trả JSON và frontend chạy trong browser.

## Chạy nhanh

Yêu cầu Node.js 20+ và npm. Từ thư mục `week4`:

```powershell
cd D:\Minh\Web-design\week4
npm install
npm run setup
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

`schema.prisma` dùng PostgreSQL, giữ nguyên model/bảng/quan hệ của `week3/restaurant`. Dùng cùng `DATABASE_URL` thì tuần 4 đọc trực tiếp các bảng và dữ liệu Supabase của tuần 3. Không cần chạy SQL tạo bảng lại trên database cũ. Sau khi điền URL, chạy `npm run db:generate --workspace @soucha/api`, `npm run test:live`, rồi restart API. Không in hoặc gửi URL có mật khẩu lên chat.

Hai file [SQL PostgreSQL](./api/sql/README.md) nằm tại `api/sql/001-schema.sql` và `002-seed.sql`, sinh từ schema/seed của tuần 3. Đã kiểm thử SQL bằng PostgreSQL cục bộ qua PGlite; kết nối Supabase thật cần URL trên máy bạn.

Có thể tiếp tục chạy SQLite độc lập bằng `DATABASE_URL="file:./soucha.db"`. File `api/.env.sqlite.example` có sẵn cấu hình local. Runtime tự chọn client và schema đúng provider, không cần sửa source và không ghi đè `.env`. Dữ liệu SQLite cũ vẫn tại `api/prisma/soucha.db`; đổi URL sang Supabase không tự chép các bản ghi local lên server.

## Cấu trúc

```text
week4/
  api/
    prisma/schema.prisma     PostgreSQL, model và quan hệ kế thừa tuần 3
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

## API contract

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

## Kiểm tra

```powershell
npm test
npm run test:browser
npm run test:live
```

Browser test mặc định dùng Google Chrome đã cài. Có thể chỉ định Chromium/Edge bằng `BROWSER_EXECUTABLE` nếu máy không có Chrome:

```powershell
$env:BROWSER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

`npm test` và browser test tự chạy server trên cổng ngẫu nhiên, tạo SQLite riêng trong `tests/.tmp`; không dùng hay sửa database demo. Ngoài CRUD, JSON, CORS, 404/500 và fallback, có kiểm tra giao dịch công thức, đầu bếp, schema tuần 3 và chạy SQL trên PostgreSQL cục bộ. Browser test kiểm tra form nguyên liệu, gỡ có xác nhận, glyph tiếng Việt, navigation và preflight. Ảnh và báo cáo JSON tạo tại `tests/results/`, được gitignore. Test 500 chỉ làm hỏng bảng trong database test riêng.

`npm run test:live` là lệnh riêng, chỉ đọc số bản ghi từ database thật theo `api/.env`; không ghi/xóa và không in URL. Nếu kết quả vẫn có `provider: sqlite` thì `.env` chưa đổi sang PostgreSQL.

Request HTTP để chạy lại nằm ở `docs/requests.http`. Báo cáo đề gốc xem `BAO-CAO-DOI-CHIEU.md`; đối chiếu đầy đủ bản restaurant tuần 3, SQL và font xem [DOI-CHIEU-WEEK3.md](./DOI-CHIEU-WEEK3.md).
