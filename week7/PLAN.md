# KẾ HOẠCH TRIỂN KHAI & KIỂM THỬ (IMPLEMENTATION & TEST PLAN) — WEEK 5

Tài liệu này cụ thể hóa kế hoạch triển khai và kế hoạch kiểm thử dựa trên [week5/context.md](file:///Users/tuananh86/Documents/web-dev/code/week5/context.md). Không thực hiện viết code trong giai đoạn này.

---

## PHẦN 1: KẾ HOẠCH TRIỂN KHAI (IMPLEMENTATION PLAN)

### Giai đoạn 1: Thiết kế & Cấu hình Database (PostgreSQL / Supabase)

#### 1.1 Kích hoạt Extension cho Fuzzy Search
- Tạo file migration/setup SQL (`week5/restaurant/prisma/search-setup.sql`) thực thi các lệnh:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  ```
- **Mục đích**: Cung cấp hàm `similarity(text, text)`, toán tử `%`, cấu hình `pg_trgm.similarity_threshold` và operator class `gin_trgm_ops`.

#### 1.2 Thiết kế cột Full-Text Search (`fts`) và GIN Indexes
- **Yêu cầu cấu hình**:
  - Ngôn ngữ: Bắt buộc dùng **`simple`** cho cả lúc tạo vector (`to_tsvector`) và lúc truy vấn (`websearch_to_tsquery` / `plainto_tsquery`).
  - Trường dữ liệu: Kết hợp `name` và `description`, xử lý `description` có thể `NULL` bằng `coalesce(description, '')`.
  - Trọng số (Weighted Ranking): Gán nhãn `A` cho `name` và `B` cho `description` để kết quả khớp tên món được ưu tiên cao hơn khớp mô tả, hoặc nối trực tiếp với khoảng trắng.
- **DDL SQL cho bảng `dishes`**:
  ```sql
  -- 1. Cột generated tsvector lưu sẵn document từ name và description
  ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) STORED;

  -- 2. GIN Index cho Full-Text Search
  CREATE INDEX IF NOT EXISTS dishes_fts_idx
  ON dishes USING gin (fts);

  -- 3. GIN Index (pg_trgm) cho Fuzzy Search trên cột name
  CREATE INDEX IF NOT EXISTS dishes_name_trgm_idx
  ON dishes USING gin (name gin_trgm_ops);

  -- 4. B-Tree Index hỗ trợ lọc Advanced Search (category, available, price)
  CREATE INDEX IF NOT EXISTS dishes_adv_filter_idx
  ON dishes (category, available, price);
  ```

#### 1.3 Tương thích với Prisma Schema (`prisma/schema.prisma`)
- Khai báo trường `fts` trong model `Dish` dưới dạng:
  ```prisma
  fts Unsupported("tsvector")? @ignore
  ```
  *(Giúp `prisma db push` nhận diện cột `fts` đã tồn tại trong DB mà không xóa cột hoặc index khi đồng bộ schema, đồng thời không làm ảnh hưởng các hàm `prisma.dish.create` / `update` hiện có).*
- Bổ sung script trong `package.json`: `"db:search-setup": "prisma db execute --file prisma/search-setup.sql --schema prisma/schema.prisma"` để có thể chạy tự động trên mọi môi trường.

#### 1.4 Cập nhật Script Seed (`prisma/seed.js`)
- Đảm bảo tính tái lập (idempotent) và duy trì **>= 1.000 món ăn** (cụ thể ~1.215 món):
  1. Giữ nguyên 8 món Soucha gốc (`Matcha Latte`, `Houjicha Latte`, ...), `chefs`, `ingredients`, `dish_ingredients`, `chef_dishes`.
  2. Sinh tự động 1.200 món theo tổ hợp danh mục (`matcha`, `houjicha`, `coffee`), nền sữa, nhiệt độ (nóng/đá), kích cỡ (`M`/`L`), mức đường (`0%`, `50%`, `100%`).
  3. **Bổ sung bộ Fixture đặc biệt phục vụ kiểm thử biên (Predictable Test Fixtures)**:
     - Món có `price = 0` (ví dụ: `"Trà dùng thử 0đ"`, `available: true`, `price: 0`).
     - Các món có cùng mức giá (`price: 30000`) để kiểm tra tie-breaker `id ASC`.
     - Món có `available = false` và `available = true`.
     - Món có `description = null` (để kiểm chứng `coalesce`).
     - Món có ký tự đặc biệt `%`, `_`, `!` trong tên:
       - `"Matcha 100% nguyên chất"`
       - `"Hồng trà _ đặc biệt"`
       - `"Trà Ô Long Tuyết Sơn!"`
     - Món có mô tả nhiều từ đặc trưng để kiểm thử `fulltext` (khớp từ rời nhau hoặc khớp cụm từ).

---

### Giai đoạn 2: Thiết kế Backend API (`src/app.js` & module tìm kiếm)

#### 2.1 Hợp đồng Response Phân trang (Pagination Envelope)
- Endpoint: `GET /api/dishes`
- **Response thành công (`HTTP 200`)**:
  ```json
  {
    "ok": true,
    "data": {
      "items": [ ... ],
      "total": 1211,
      "page": 1,
      "pageSize": 12
    },
    "error": null
  }
  ```
- **Lưu ý phạm vi ảnh hưởng**:
  - Giữ nguyên response của `GET /api/chefs` và `GET /api/ingredients` (`{ ok: true, data: [...] }`) để không ảnh hưởng các picker quản trị.
  - Cập nhật nơi đọc `api.list('dishes')` ở SPA (`web/main.js`) để đọc `res.items` và metadata `{ total, page, pageSize }`.

#### 2.2 Quy tắc Chuẩn hóa & Validate Query Parameters
Mọi lỗi validate đều trả về **HTTP 200** với `{ ok: false, error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', fields: { ... } } }`:

| Tham số | Mặc định | Quy tắc Chuẩn hóa & Validate | Khi vi phạm |
| :--- | :--- | :--- | :--- |
| `mode` | `'basic'` | Chỉ nhận 1 trong 4 giá trị: `'basic'`, `'advanced'`, `'fulltext'`, `'fuzzy'`. | `VALIDATION_FAILED` (`fields.mode`) |
| `page` | `1` | Chuỗi số nguyên dương `/^[1-9]\d*$/`, `1 <= page <= 2147483647`. | `VALIDATION_FAILED` (`fields.page`) |
| `pageSize` | `12` | Chuỗi số nguyên dương `/^[1-9]\d*$/`, `1 <= pageSize <= 100`. | `VALIDATION_FAILED` (`fields.pageSize`) |
| `q` | `''` | `.trim()`. Tối đa 120 ký tự.<br>- Với `basic`/`advanced`: rỗng &rarr; `null` (bỏ điều kiện).<br>- Với `fulltext`/`fuzzy`: rỗng &rarr; **Bắt buộc báo lỗi**. | Quá 120 ký tự hoặc rỗng ở `fulltext`/`fuzzy` &rarr; `VALIDATION_FAILED` (`fields.q`) |
| `category` | `null` | `.trim()`. Rỗng &rarr; `null`. Tối đa 120 ký tự. | Quá dài &rarr; `VALIDATION_FAILED` (`fields.category`) |
| `minPrice` | `null` | Rỗng/không gửi &rarr; `null`. Chuỗi `'0'` &rarr; số `0` (hợp lệ!). Phải khớp `/^(0\|[1-9]\d*)$/` và `<= 2147483647`. | Số âm, số thập phân, chữ &rarr; `VALIDATION_FAILED` (`fields.minPrice`) |
| `maxPrice` | `null` | Tương tự `minPrice`. Nếu cả `minPrice` và `maxPrice` khác `null` mà `minPrice > maxPrice` &rarr; lỗi. | `minPrice > maxPrice` &rarr; `VALIDATION_FAILED` (`fields.maxPrice`) |
| `available` | `null` | Rỗng/không gửi &rarr; `null`. Chỉ nhận `'true'` (&rarr; `true`) hoặc `'false'` (&rarr; `false`). | Chuỗi khác (`'1'`, `'yes'`, `'abc'`) &rarr; `VALIDATION_FAILED` (`fields.available`) |

#### 2.3 Thiết kế Truy vấn SQL cho 4 Chế độ (`mode`)

1. **Hàm Escape Ký tự đặc biệt cho `ILIKE` (`basic` & `advanced`)**:
   - Quy tắc: Thay `!` &rarr; `!!`, sau đó `%` &rarr; `!%`, sau đó `_` &rarr; `!_`, cuối cùng nối `%` ở hai đầu:
     ```js
     function toLiteralPattern(q) {
       return `%${q.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')}%`;
     }
     ```
2. **`mode=basic`**:
   - Parameterized SQL (`$1 = pattern | null`, `$2 = pageSize`, `$3 = offset`):
     ```sql
     SELECT id, name, description, price, category, image, available, "createdAt"
     FROM dishes
     WHERE ($1::text IS NULL OR name ILIKE $1 ESCAPE '!')
     ORDER BY id ASC
     LIMIT $2 OFFSET $3;
     ```
   - `total` query:
     ```sql
     SELECT COUNT(*)::int AS total
     FROM dishes
     WHERE ($1::text IS NULL OR name ILIKE $1 ESCAPE '!');
     ```
3. **`mode=advanced`**:
   - Parameterized SQL (`$1 = pattern | null`, `$2 = category | null`, `$3 = minPrice | null`, `$4 = maxPrice | null`, `$5 = available | null`, `$6 = pageSize`, `$7 = offset`):
     ```sql
     SELECT id, name, description, price, category, image, available, "createdAt"
     FROM dishes
     WHERE ($1::text IS NULL OR name ILIKE $1 ESCAPE '!')
       AND ($2::text IS NULL OR category = $2)
       AND ($3::int IS NULL OR price >= $3)
       AND ($4::int IS NULL OR price <= $4)
       AND ($5::boolean IS NULL OR available = $5)
     ORDER BY id ASC
     LIMIT $6 OFFSET $7;
     ```
   - `total` query: Dùng đúng 5 predicate trên.
   - Đảm bảo: Khi chỉ truyền `q` (các tham số khác `null`), kết quả `basic` và `advanced` trùng khớp 100%.
4. **`mode=fulltext`**:
   - Sử dụng `websearch_to_tsquery('simple', $1)` để hỗ trợ cả từ khóa đơn, nhiều từ rời nhau (AND), cụm từ trong ngoặc kép `"..."`, toán tử `or`, và loại trừ `-từ`.
   - Kiểm tra nếu `tsquery` rỗng (ví dụ chuỗi chỉ chứa ký tự đặc biệt bị bộ phân tích loại bỏ): trả `VALIDATION_FAILED` hoặc danh sách rỗng an toàn.
   - Parameterized SQL:
     ```sql
     WITH search_q AS (
       SELECT websearch_to_tsquery('simple', $1) AS query
     )
     SELECT d.id, d.name, d.description, d.price, d.category, d.image, d.available, d."createdAt",
            ts_rank(d.fts, search_q.query) AS rank
     FROM dishes d, search_q
     WHERE search_q.query <> ''::tsquery AND d.fts @@ search_q.query
     ORDER BY rank DESC, d.id ASC
     LIMIT $2 OFFSET $3;
     ```
   - `total` query: Cùng điều kiện `WHERE search_q.query <> ''::tsquery AND d.fts @@ search_q.query`.
5. **`mode=fuzzy`**:
   - Sử dụng `pg_trgm` với ngưỡng công bố **`0.3`**.
   - Để an toàn tuyệt đối với **Supabase Connection Pooler**, thực thi trong `prisma.$transaction`:
     1. `await tx.$executeRaw\`SET LOCAL pg_trgm.similarity_threshold = 0.3\`;`
     2. Chạy query lấy `items` và `total` có cả `name % $1` (kích hoạt GIN index) và `similarity(name, $1) >= 0.3`:
        ```sql
        SELECT id, name, description, price, category, image, available, "createdAt",
               similarity(name, $1) AS sim
        FROM dishes
        WHERE name % $1 AND similarity(name, $1) >= 0.3
        ORDER BY sim DESC, id ASC
        LIMIT $2 OFFSET $3;
        ```
   - Thứ tự sắp xếp: `sim DESC, id ASC` (điểm bằng nhau thì `id` tăng dần).

---

### Giai đoạn 3: Thiết kế Giao diện SPA, Phân trang & Client Filter/Sort (`web/main.js`)

#### 3.1 Phân định rõ Kiến trúc Dữ liệu (Trả lời câu hỏi xuyên suốt của bài học)

| Khu vực / Thao tác | Nơi xử lý | Phạm vi dữ liệu tác động | Cách cập nhật UI |
| :--- | :--- | :--- | :--- |
| **Search (`basic`, `advanced`, `fulltext`, `fuzzy`) tại `/dishes`** | **Server-side** (PostgreSQL) | Toàn bộ collection (**1.211+ món** trong DB) | AJAX (Axios JSON) |
| **Phân trang tại `/dishes` (Số trang, Load More, Infinite Scroll)** | **Server-side** (`LIMIT` / `OFFSET`) | Từng trang (`pageSize` món mỗi lần gọi) trên tập kết quả search | AJAX (Thay thế hoặc nối tiếp DOM) |
| **Client-side Filter & Sort** | **Client-side** (Browser JS) | Tập dữ liệu **đã tải đầy đủ** tại trang Quản trị món (`/admin/dishes`) *(hoặc tập đã tải tại browser)* | Cập nhật DOM tức thời không gọi lại mạng |

> **Giải thích thiết kế**:
> - Trên trang `/dishes`, vì mỗi lần chỉ tải 1 trang (`pageSize = 12`), nếu sort/filter bằng JS ở client thì chỉ tác động lên 12 món đang hiển thị (sai ngữ nghĩa nếu gọi là lọc/sắp xếp toàn thực đơn). Do đó, tìm kiếm và lọc toàn bộ thực đơn trên `/dishes` được thực hiện tại **Server** qua 4 chế độ `mode`.
> - Trên trang Quản trị `/admin/dishes` (hoặc chế độ tải đủ danh sách để thao tác cục bộ), ứng dụng tải tập dữ liệu về browser rồi cung cấp bộ **Client-side Filter** (theo `category`, `available`, khoảng giá) và **Client-side Sort** (`Tên A-Z`, `Giá tăng dần`, `Giá giảm dần` với thứ tự phụ `id ASC`) tác động trên toàn bộ tập dữ liệu đã nhận.

#### 3.2 Thiết kế 3 Kiểu UI Phân trang trên `/dishes`
1. **Thanh chuyển kiểu hiển thị (`ui=pages` | `ui=load-more` | `ui=infinite`)**:
   - Người dùng/giảng viên có thể chuyển qua lại 3 kiểu UI ngay trên màn hình Thực đơn.
2. **Kiểu 1: Số trang (`Numbered Pagination`)**:
   - Hiển thị tổng số kết quả (`total` món), trang hiện tại `page / totalPages`, các nút trang (`Đầu`, `Trước`, `1`, `2`, ..., `Sau`, `Cuối`).
   - Khi bấm số trang: chỉ đổi `page` trên URL, giữ nguyên `mode`, `q`, và các bộ lọc `advanced`. Thay thế danh sách bằng `items` của trang mới.
3. **Kiểu 2: Tải thêm (`Load More`)**:
   - Quản lý state: `items` (mảng tích lũy), `nextPage`, `pending`, `end`.
   - Trước khi gửi request: đặt `pending = true` đồng bộ, disable nút và hiện `"Đang tải..."`.
   - Khi thành công và đúng `requestToken` hiện tại: nối `data.items` vào danh sách, tăng `nextPage += 1`, kiểm tra `end = (page * pageSize >= total) || data.items.length === 0`.
   - Khi lỗi mạng/server: giữ nguyên `nextPage` và danh sách đã có, hiển thị thông báo lỗi kèm nút `"Thử tải lại"` để nạp lại đúng trang bị lỗi.
4. **Kiểu 3: Cuộn vô tận (`Infinite Scroll`)**:
   - Đặt phần tử `<div id="scroll-sentinel" class="scroll-sentinel"></div>` ngay dưới danh sách món.
   - Khởi tạo `IntersectionObserver` với `{ rootMargin: '200px 0px' }` gọi hàm dùng chung `loadNext()`.
   - Nếu sau khi tải xong 1 trang mà danh sách vẫn ngắn (sentinel vẫn nằm trong viewport) và `!end`, tự động kiểm tra tiếp hoặc hiển thị nút dự phòng để đảm bảo khả năng tiếp cận (accessibility).
   - Khi rời khỏi view hoặc đổi điều kiện tìm kiếm hoặc `end = true`: gọi `observer.disconnect()`.

#### 3.3 Đồng bộ URL, Khôi phục trạng thái & Chống trộn kết quả
- **URL chuẩn hóa**:
  - Ví dụ: `/dishes?mode=advanced&q=cà+phê&category=coffee&minPrice=0&maxPrice=35000&available=false&page=2&pageSize=12&ui=pages`
- **Hành vi khi thao tác**:
  - **Submit form tìm kiếm**: Đưa `page` về `1`. Nếu ở `fulltext`/`fuzzy` mà `q` trống: báo lỗi ngay trên form và không gọi fetch.
  - **Chuyển trang (Số trang)**: Giữ nguyên mọi tham số tìm kiếm trên URL, chỉ cập nhật `page`.
  - **Nút "Xóa điều kiện"**: Đưa URL về `/dishes` (mặc định `mode=basic`, `page=1`), hiển thị lại danh sách đầu.
  - **Reload / Mở link ở tab mới / Back-Forward**:
    - Đọc `location.search` để điền lại đúng giá trị vào các ô input (`mode`, `q`, `category`, `minPrice`, `maxPrice`, `available`, `pageSize`, `ui`).
    - Với `ui=pages`: tải đúng trang `page` trên URL.
    - Với `ui=load-more` và `ui=infinite`: công bố rõ trên UI là mở lại từ đầu (`page=1`) của bộ điều kiện trên URL.
  - **Chống Race Condition**: Mỗi lần thay đổi điều kiện tìm kiếm sẽ tăng `token`. Mọi response cũ về trễ sẽ bị loại bỏ, tuyệt đối không nối nhầm kết quả của lần tìm trước vào lần tìm sau.

---

## PHẦN 2: KẾ HOẠCH KIỂM THỬ (TEST PLAN)

### 1. Mục tiêu Kiểm thử
1. Chứng minh CSDL PostgreSQL trên Supabase đã lưu `>= 1.000` món, đã bật `pg_trgm`, có cột `fts` (`simple`) và các GIN indexes hoạt động đúng.
2. Chứng minh API `/api/dishes` tuân thủ nghiêm ngặt hợp đồng Response Envelope (`{ ok, data: { items, total, page, pageSize }, error }`), phân biệt đúng lỗi nghiệp vụ (`HTTP 200`, `VALIDATION_FAILED`) và lỗi kỹ thuật (`404/500`).
3. Chứng minh 4 chế độ tìm kiếm (`basic`, `advanced`, `fulltext`, `fuzzy`) xử lý đúng ngữ nghĩa đối với ký tự đặc biệt (`%`, `_`, `!`), giá trị biên (`0`, `false`, `NULL`), và thứ tự sắp xếp (`score DESC, id ASC`).
4. Chứng minh 3 kiểu UI phân trang và Client-side Filter/Sort hoạt động chính xác, không lặp/mất món, đồng bộ đúng với URL.

---

### 2. Ma trận Test Cases Chi tiết (Test Matrix)

#### Nhóm A: Kiểm thử Database & Seed (`db-verify`)

| Mã TC | Nội dung kiểm tra | Câu lệnh / Thao tác | Kết quả kỳ vọng |
| :--- | :--- | :--- | :--- |
| **DB-01** | Số lượng bản ghi trong Supabase | `SELECT COUNT(*) FROM dishes;` | `>= 1000` (cụ thể `>= 1211` món). |
| **DB-02** | Extension `pg_trgm` đã bật | `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';` | Trả về 1 dòng `'pg_trgm'`. |
| **DB-03** | Cột `fts` và GIN Indexes tồn tại | Kiểm tra `information_schema.columns` và `pg_indexes` trên bảng `dishes` | Có cột `fts` (`tsvector`), index `dishes_fts_idx` (`USING gin`) và `dishes_name_trgm_idx` (`USING gin`). |
| **DB-04** | Xử lý `description IS NULL` trong `fts` | Kiểm tra món có `description = NULL` (ví dụ `Matcha Latte`) | Cột `fts` vẫn có giá trị `tsvector` từ `name`, không bị `NULL`. |
| **DB-05** | Tính tái lập của Seed (`npm run db:seed`) | Chạy `npm run db:seed` 2 lần liên tiếp | Không tạo bản ghi trùng lặp, giữ nguyên các quan hệ `chef_dishes` và `dish_ingredients`. |

---

#### Nhóm B: Kiểm thử Hợp đồng Phân trang Server-side (`Pagination Contract`)

| Mã TC | Nội dung kiểm tra | Request mẫu | Kết quả kỳ vọng |
| :--- | :--- | :--- | :--- |
| **PG-01** | Mặc định khi không truyền `page`, `pageSize` | `GET /api/dishes` | `HTTP 200`, `ok: true`, `data: { items: [12 món], total: >=1000, page: 1, pageSize: 12 }`, thứ tự `id ASC`. |
| **PG-02** | Chuyển sang trang 2, không trùng trang 1 | `GET /api/dishes?page=1&pageSize=10` và `page=2&pageSize=10` | Mảng `items` của trang 1 và trang 2 đều có 10 phần tử, không có `id` nào trùng nhau, `id` tăng dần liên tục. |
| **PG-03** | Trang vượt quá phạm vi (`page > totalPages`) | `GET /api/dishes?page=9999&pageSize=10` | `HTTP 200`, `ok: true`, `data.items = []`, `data.total = <tổng thực tế>`, `data.page = 9999` (không báo lỗi `NOT_FOUND`). |
| **PG-04** | Validate `page` không hợp lệ | `GET /api/dishes?page=0`, `page=-1`, `page=abc`, `page=1.5` | `HTTP 200`, `ok: false`, `error.code = 'VALIDATION_FAILED'`, có `error.fields.page`. |
| **PG-05** | Validate `pageSize` không hợp lệ / vượt ngưỡng | `GET /api/dishes?pageSize=0`, `pageSize=101`, `pageSize=abc` | `HTTP 200`, `ok: false`, `error.code = 'VALIDATION_FAILED'`, có `error.fields.pageSize`. |

---

#### Nhóm C: Kiểm thử 4 Chế độ Tìm kiếm tại Server (`Search Modes`)

| Mã TC | Chế độ | Nội dung kiểm tra | Request mẫu | Kết quả kỳ vọng |
| :--- | :--- | :--- | :--- | :--- |
| **SR-01** | `basic` | Tìm chuỗi con không phân biệt hoa/thường | `GET /api/dishes?mode=basic&q=MATCHA` | Trả về các món có tên chứa `"matcha"`, sắp xếp `id ASC`, `total` khớp số lượng thực tế. |
| **SR-02** | `basic` | Escape ký tự wildcard `%` | `GET /api/dishes?mode=basic&q=100%25` (`q=100%`) | Chỉ trả về món có chữ `"100%"` thật trong tên (ví dụ `"100% đường"`), **không** trả về mọi món có số `100`. |
| **SR-03** | `basic` | Escape ký tự wildcard `_` và `!` | `GET /api/dishes?mode=basic&q=_` và `q=!` | Chỉ trả về món chứa đúng ký tự `_` hoặc `!`, không khớp ký tự bất kỳ. |
| **SR-04** | `basic` | Từ khóa không khớp món nào | `GET /api/dishes?mode=basic&q=khong_ton_tai_xyz` | `HTTP 200`, `ok: true`, `items: []`, `total: 0`. |
| **SR-05** | `advanced` | Đồng nhất với `basic` khi chỉ có `q` | So sánh `mode=basic&q=Latte` và `mode=advanced&q=Latte` | Cùng `total` và cùng danh sách `items` (`id ASC`). |
| **SR-06** | `advanced` | Kết hợp `AND` đủ 5 tiêu chí | `GET /api/dishes?mode=advanced&q=Cà phê&category=coffee&minPrice=20000&maxPrice=30000&available=false` | Mọi phần tử trả về đều thỏa mãn cả 5 điều kiện; `total` đếm đúng tập này. |
| **SR-07** | `advanced` | Phân biệt `available=false` với rỗng | `GET /api/dishes?mode=advanced&available=false` | Chỉ trả về các món có `available === false` (không được bỏ qua điều kiện này). |
| **SR-08** | `advanced` | Phân biệt `minPrice=0` và `maxPrice=0` với rỗng | `GET /api/dishes?mode=advanced&minPrice=0&maxPrice=0` | Chỉ trả về các món có `price === 0`. |
| **SR-09** | `advanced` | Validate `minPrice > maxPrice`, giá âm, boolean lạ | `minPrice=50000&maxPrice=10000`, `minPrice=-5`, `available=yes` | `HTTP 200`, `ok: false`, `error.code = 'VALIDATION_FAILED'`, chỉ rõ trường lỗi trong `fields`. |
| **SR-10** | `fulltext` | Tìm trên cả `name` và `description` (nhiều từ rời nhau) | `GET /api/dishes?mode=fulltext&q=sữa tươi nóng` | Tìm thấy món có từ trong `name` hoặc `description` dù các từ không nằm liền kề nhau. |
| **SR-11** | `fulltext` | Tìm cụm từ chính xác và loại trừ (`websearch`) | `GET /api/dishes?mode=fulltext&q="Cà phê sữa" -đá` | Khớp cụm `"Cà phê sữa"` và loại trừ món có từ `"đá"`. |
| **SR-12** | `fulltext` | Thứ tự xếp hạng (`rank DESC, id ASC`) | Tìm từ khóa xuất hiện ở `name` (weight A) so với chỉ ở `description` (weight B) | Món khớp ở `name` đứng trước món chỉ khớp ở `description`; khi cùng điểm `rank` thì `id` nhỏ đứng trước. |
| **SR-13** | `fulltext` | Validate `q` rỗng hoặc toàn khoảng trắng | `GET /api/dishes?mode=fulltext&q=%20%20` | `HTTP 200`, `ok: false`, `error.code = 'VALIDATION_FAILED'`, có `fields.q`. |
| **SR-14** | `fuzzy` | Tìm tên gần giống khi gõ sai chính tả (`pg_trgm >= 0.3`) | `GET /api/dishes?mode=fuzzy&q=Hojicha Late` (gõ thiếu chữ `u` và `t`) | Trả về `"Houjicha Latte"` và các món có similarity `>= 0.3`, sắp xếp `similarity DESC, id ASC`. |
| **SR-15** | `fuzzy` | Loại bỏ kết quả dưới ngưỡng `0.3` | `GET /api/dishes?mode=fuzzy&q=zzzzxxxx` | `items: []`, `total: 0` (không trả về các món có similarity `< 0.3`). |
| **SR-16** | `fuzzy` | Validate `q` rỗng | `GET /api/dishes?mode=fuzzy&q=` | `HTTP 200`, `ok: false`, `error.code = 'VALIDATION_FAILED'`, có `fields.q`. |
| **SR-17** | `mode` | Validate `mode` không hợp lệ | `GET /api/dishes?mode=semantic&q=matcha` | `HTTP 200`, `ok: false`, `error.code = 'VALIDATION_FAILED'`, có `fields.mode`. |

---

#### Nhóm D: Kiểm thử UI, Phân trang, Client Filter/Sort & URL State (Nghiệm thu E2E)

| Mã TC | Thao tác trên Giao diện | Kết quả cần chứng minh |
| :--- | :--- | :--- |
| **UI-01** | Chuyển đổi 3 kiểu phân trang (**Số trang**, **Load More**, **Infinite Scroll**) | Cả 3 kiểu hoạt động mượt mà trên cùng API, hiển thị đúng số món, không bị lặp hoặc sót món khi đi qua các trang. |
| **UI-02** | Ở chế độ **Load More** / **Infinite Scroll**: bấm/cuộn liên tục hoặc khi hết dữ liệu | Khi `pending = true` không gửi request trùng. Khi `items.length >= total` thì khóa nút / ngắt observer và hiện thông báo đã tải hết. |
| **UI-03** | Đang ở trang 3 của kết quả search `q=matcha`, nhập từ khóa mới `q=coffee` rồi bấm Tìm | Tự động đưa về `page = 1` của kết quả `coffee`; danh sách cũ của `matcha` bị xóa sạch, không bị trộn lẫn. |
| **UI-04** | Sau khi search `mode=advanced`, bấm chuyển sang trang 2 | URL đổi `page=2` nhưng giữ nguyên toàn bộ tiêu chí `mode`, `q`, `category`, `minPrice`, `maxPrice`, `available`. |
| **UI-05** | Copy URL `/dishes?mode=fulltext&q=matcha&page=2` sang tab mới hoặc bấm Reload / Back / Forward | Ô tìm kiếm, chế độ `mode`, và trang số 2 được khôi phục đúng như trước khi reload. |
| **UI-06** | Bấm nút **"Xóa điều kiện"** | Xóa các bộ lọc trên form, URL trở về `/dishes`, danh sách hiển thị lại từ trang 1. |
| **UI-07** | Thực hiện **Filter & Sort Client-side** (tại trang Quản trị `/admin/dishes`) | Lọc theo category, trạng thái còn bán (`available`) và sắp xếp theo giá tăng/giảm, tên A-Z ngay trên tập dữ liệu browser đã nhận mà không phát sinh request mới; xóa filter khôi phục đủ danh sách. |
| **UI-08** | Kiểm tra các chức năng CRUD cũ (Chi tiết món, Thêm/Sửa/Xóa món, Công thức, Đầu bếp) | Tất cả hoạt động bình thường sau khi nâng cấp API `/api/dishes`. |

---

### 3. Công cụ & Lệnh Chạy Kiểm thử

1. **Unit & Integration Tests (`node:test`)**:
   - Mở rộng `tests/app.test.js` để test toàn bộ logic validate tham số (`mode`, `page`, `pageSize`, `minPrice`, `maxPrice`, `available`, `literalPattern` escape) và cấu trúc envelope `{ items, total, page, pageSize }`.
   - Lệnh chạy: `npm test`
2. **Live Database & Search Smoke Test (`tests/live-smoke.js`)**:
   - Mở rộng `tests/live-smoke.js` để chạy thật trên PostgreSQL của Supabase:
     - Kiểm tra tổng số bản ghi `>= 1000`.
     - Chạy thử cả 4 mode (`basic` với ký tự `%`, `advanced` với `available=false` và `minPrice=0`, `fulltext` với cấu hình `simple`, `fuzzy` với `pg_trgm` ngưỡng `0.3`).
     - Kiểm tra thứ tự sắp xếp và phân trang trang 1, trang 2.
   - Lệnh chạy: `npm run test:live`
3. **Bruno API Contract Collection (`bruno/restaurant-api`)**:
   - Cập nhật các bài test trong `00-env` và `02-dishes` tương thích với `data.items`, bổ sung các request kiểm thử `mode=basic|advanced|fulltext|fuzzy` và pagination validation.
   - Lệnh chạy: `npm run test:bruno`

---

### 4. Thứ tự Thực hiện khi Bắt đầu Code (Execution Roadmap)
1. **Bước 1**: Tạo `prisma/search-setup.sql`, cập nhật `prisma/schema.prisma` và `prisma/seed.js`, chạy migration & seed lên Supabase, xác nhận `> 1.000` bản ghi cùng indexes.
2. **Bước 2**: Xây dựng tầng xử lý search & pagination trong `src/app.js` (4 chế độ `basic`, `advanced`, `fulltext`, `fuzzy` + validation).
3. **Bước 3**: Cập nhật SPA `web/main.js` và `public/style.css` (form 4 chế độ search, 3 kiểu UI phân trang, đồng bộ URL, và client-side filter/sort tại trang quản trị).
4. **Bước 4**: Cập nhật và chạy toàn bộ bộ test (`npm test`, `npm run test:live`, `npm run test:bruno`), thu thập bằng chứng nghiệm thu.
