# TỔNG HỢP CONTEXT: FULL-TEXT SEARCH, FUZZY SEARCH & PHÂN TRANG (WEEK 5)

Tài liệu này tổng hợp toàn bộ ngữ cảnh hiện tại của hệ thống (AS-IS) và yêu cầu kỹ thuật/nghiệp vụ (TO-BE) dựa trên slide bài giảng *"Tìm kiếm và phân trang"* (MSc. Ngô Ngọc Đăng Khoa) và tài liệu hướng dẫn PostgreSQL Full-Text Search.

---

## 1. Mục tiêu và phạm vi
- **Mục tiêu**: Làm giàu ngữ cảnh để chuẩn bị cho bước thiết kế CSDL và kế hoạch triển khai tính năng tìm kiếm (Full-Text Search, Fuzzy Search, Basic, Advanced) cùng phân trang (Pagination) trên ứng dụng Nhà hàng Soucha (`week5/restaurant`).
- **Phạm vi**: 
  - Khảo sát hiện trạng CSDL Supabase PostgreSQL, schema Prisma, API backend và frontend SPA.
  - Phân tích chi tiết 4 chế độ tìm kiếm: `basic`, `advanced`, `fulltext`, `fuzzy`.
  - Phân tích yêu cầu phân trang, 3 kiểu hiển thị UI và đồng bộ trạng thái qua URL.
  - Xác định các ràng buộc kỹ thuật (PostgreSQL extensions, GIN indexes, Prisma raw SQL).

---

## 2. Hiện trạng hệ thống (AS-IS)

### 2.1 Kiến trúc & Công nghệ
- **Backend**: Node.js + Express (`src/app.js`, `server.js`).
- **ORM / Database Client**: Prisma ORM 6.12.0.
- **Database**: PostgreSQL lưu trên Supabase (kết nối qua AWS Session Pooler port 5432).
- **Frontend**: Single Page Application (SPA) viết bằng Vanilla JS (`web/main.js`, `web/api.js`), giao tiếp qua Axios, chạy độc lập tại origin `http://localhost:5173`.
- **API Convention**: Thống nhất response envelope `{ ok: true, data }` hoặc `{ ok: false, error: { code, message, fields } }`. Lỗi nghiệp vụ trả HTTP 200; lỗi kỹ thuật trả 404/500 không có envelope `ok`.

### 2.2 Hiện trạng CSDL (`dishes` table)
Qua kiểm tra trực tiếp trên CSDL Supabase hiện tại:
- **Số lượng bản ghi**: Hiện có **1.211 món ăn** trong bảng `dishes` (đã vượt mốc yêu cầu tối thiểu 1.000 bản ghi).
- **Cấu trúc bảng `dishes`**:
  - `id`: integer, Primary Key (tự tăng).
  - `name`: text, NOT NULL (tên món).
  - `description`: text, NULLABLE (1.200 bản ghi có mô tả, **11 bản ghi có mô tả `NULL`** -> cần hàm `coalesce` khi tạo vector).
  - `price`: integer, NOT NULL (toàn bộ 1.211 món hiện có `price > 0`, **chưa có món `price = 0`** để kiểm thử giá trị biên).
  - `category`: text, NULLABLE.
  - `available`: boolean, NOT NULL, default `true` (1.101 món `true`, **110 món `false`**).
  - `createdAt`: timestamp without time zone.
  - `image`: text, NULLABLE.
- **Quan hệ**: Liên kết với `ingredients` qua `dish_ingredients` và `chefs` qua `chef_dishes`.
- **Extensions đã bật**: `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`.
  > ⚠️ **Chưa kích hoạt extension `pg_trgm`** trong PostgreSQL!
- **Indexes hiện tại**: Chỉ duy nhất `dishes_pkey` (B-tree trên `id`).
  > ⚠️ **Chưa có GIN index** cho Full-Text Search (`tsvector`) và **chưa có Trigram index** cho Fuzzy Search.

### 2.3 Hiện trạng API `/api/dishes`
- Route: `GET /api/dishes` trong `src/app.js`:
  ```js
  const where = {
    ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    ...(category ? { category } : {})
  };
  const orderBy = sort === 'price-asc' ? { price: 'asc' }
    : sort === 'price-desc' ? { price: 'desc' }
      : sort === 'newest' ? { id: 'desc' }
        : { id: 'asc' };
  return ok(res, await model.findMany({ where, orderBy }));
  ```
- **Hạn chế hiện tại**:
  1. Chưa có phân trang server-side (`page`, `pageSize`, `total`, `items`). Trả về toàn bộ danh sách món trong mảng `data`.
  2. Chưa có tham số `mode` để phân biệt `basic`, `advanced`, `fulltext`, `fuzzy`.
  3. Tìm kiếm tên chỉ dùng `contains` (ILIKE) đơn giản, chưa xử lý escape ký tự đại diện (`!`, `%`, `_`).
  4. Chưa tìm kiếm trên trường `description`.

### 2.4 Hiện trạng Frontend SPA
- File `web/main.js` hiển thị danh sách món tại route `/dishes`.
- Gọi `api.list('dishes', params)` và nhận về mảng toàn bộ món.
- Phân loại bằng tab danh mục (`matcha`, `houjicha`) và sắp xếp theo giá tại server.
- Chưa có UI phân trang (chưa có Số trang, Load More hay Infinite Scroll).

---

## 3. Tổng hợp yêu cầu kỹ thuật & nghiệp vụ (TO-BE)

### 3.1 Quy chuẩn Response & Error Envelope
- **Response thành công khi có phân trang**:
  ```json
  {
    "ok": true,
    "data": {
      "items": [...],
      "total": 1211,
      "page": 1,
      "pageSize": 10
    },
    "error": null
  }
  ```
- **Quy tắc tính toán**:
  - `totalPages = Math.ceil(total / pageSize)`.
  - `total` là tổng số bản ghi thỏa mãn đúng bộ điều kiện tìm kiếm/lọc, **không phải** số lượng phần tử của trang hiện tại (`items.length`), cũng **không phải** tổng số dòng toàn bảng.
  - Khi `total = 0`: trả `items: []`, `total: 0`, HTTP 200.
  - Trang vượt phạm vi (ví dụ `page=999`): trả `items: []`, `total` thực tế, HTTP 200 (không xem là lỗi).
- **Lỗi nghiệp vụ (HTTP 200, `ok: false`)**:
  - Mã: `VALIDATION_FAILED` khi tham số không hợp lệ (ví dụ: `page <= 0`, `pageSize > 100`, `minPrice > maxPrice`, giá âm, `q` rỗng ở fulltext/fuzzy).
  - Trả về chi tiết trường lỗi trong `error.fields`.
- **Lỗi kỹ thuật (HTTP 404 / 500)**:
  - Route sai trả HTTP 404. Lỗi database trả HTTP 500, không bọc `{ ok }`.

---

### 3.2 Bốn chế độ tìm kiếm tại Server (`mode`)

| Chế độ (`mode`) | Phạm vi trường | Quy tắc so khớp | Điều kiện `q` rỗng | Thứ tự sắp xếp (`ORDER BY`) |
| :--- | :--- | :--- | :--- | :--- |
| **`basic`** | `name` | Literal contains (chứa chuỗi), không phân biệt hoa/thường (`ILIKE`). Có escape `%`, `_`, `!`. | Bỏ qua điều kiện tên, trả danh sách bình thường. | `id ASC` |
| **`advanced`** | `name` + thuộc tính | Kết hợp `AND`: `q` (contains trên tên), `category`, `minPrice`, `maxPrice`, `available`. | Bỏ qua điều kiện tên. | `id ASC` |
| **`fulltext`** | `name` + `description` | PostgreSQL Full-Text Search với cấu hình `simple`. | **Lỗi `VALIDATION_FAILED`** (không được để trống). | `ts_rank` giảm dần, sau đó `id ASC`. |
| **`fuzzy`** | `name` | Độ tương đồng ký tự qua extension `pg_trgm`, ngưỡng similarity `0.3`. | **Lỗi `VALIDATION_FAILED`** (không được để trống). | `similarity` giảm dần, sau đó `id ASC`. |

#### Chi tiết quy tắc nghiệp vụ từng chế độ:

1. **`mode=basic`**:
   - Sử dụng LIKE/ILIKE với parameterized query (`$1`).
   - Chuẩn hóa escape dữ liệu đầu vào:
     - Biến `!` thành `!!`
     - Biến `%` thành `!%`
     - Biến `_` thành `!_`
     - Sau đó bọc `%...%` và dùng cú pháp `ESCAPE '!'`.
   - Mục đích: Tránh việc người dùng nhập `100%` hay `SQL_` làm sai lệch ý nghĩa tìm kiếm.

2. **`mode=advanced`**:
   - Các tham số: `q`, `category`, `minPrice`, `maxPrice`, `available`.
   - Tất cả tiêu chí đang hoạt động được nối bằng `AND`.
   - **Xử lý giá trị đặc biệt**:
     - `available=false`: Là điều kiện lọc món tạm ngưng bán, **không được bỏ qua** (không coi là rỗng).
     - `minPrice=0`: Là cận dưới hợp lệ (0đ), **không được bỏ qua**.
     - Chuỗi trống / trường không truyền: chuẩn hóa thành `null` (bỏ qua predicate).
     - Validation: `minPrice > maxPrice`, số âm, hoặc `available` không phải `'true'|'false'` -> báo lỗi `VALIDATION_FAILED`.

3. **`mode=fulltext`**:
   - Tài liệu áp dụng: Hướng dẫn PostgreSQL Full Text Search (Supabase guide).
   - Document: kết hợp `name` và `description`. Cần `coalesce(description, '')` để tránh mất dữ liệu khi description là `NULL`.
   - Cấu hình text search: **Bắt buộc dùng `simple`** cho cả document (`to_tsvector('simple', ...)`) và query (`to_tsquery('simple', ...)` hoặc `websearch_to_tsquery('simple', ...)`).
     *(Lý do: tiếng Việt không dùng stemmer tiếng Anh; `simple` chuẩn hóa chữ thường và tách từ chính xác).*
   - Trọng số xếp hạng (Ranking): Có thể gán nhãn trọng số A cho `name` và B cho `description` (`setweight`), sau đó sắp xếp theo `ts_rank(...) DESC, id ASC`.

4. **`mode=fuzzy`**:
   - Cần bật extension `pg_trgm` trong PostgreSQL (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`).
   - Đo độ tương đồng giữa từ khóa `q` và `name` bằng hàm `similarity(name, $1)`.
   - **Ngưỡng quy định**: `0.3` (chỉ lấy các món có `similarity >= 0.3`).
   - Lưu ý khi dùng Connection Pooler: Thiết lập ngưỡng qua `SET LOCAL pg_trgm.similarity_threshold = 0.3` trong transaction hoặc lọc trực tiếp `WHERE similarity(name, $1) >= 0.3`.
   - Sắp xếp: `ORDER BY similarity(name, $1) DESC, id ASC`.

---

### 3.3 Yêu cầu phân trang (Pagination)
- **Tham số đầu vào**:
  - `page`: số nguyên dương >= 1 (mặc định: `1`).
  - `pageSize`: số nguyên dương, tối đa 100 (mặc định ví dụ: `10` hoặc `12`).
  - Thuật toán offset: `offset = (page - 1) * pageSize`.
- **Ba giao diện hiển thị (UI)**:
  1. **Số trang (Numbered Pagination)**: Chọn trang để thay thế danh sách đang xem.
  2. **Tải thêm (Load More)**: Nút bấm chủ động nối thêm dữ liệu vào danh sách. Khóa nút khi `pending` hoặc khi đã `end` (`page * pageSize >= total` hoặc items rỗng).
  3. **Cuộn vô tận (Infinite Scroll)**: Dùng `IntersectionObserver` quan sát một phần tử `sentinel` ở cuối danh sách để tự động nạp trang tiếp theo.
- **Đồng bộ URL & Trạng thái**:
  - Tham số tìm kiếm và phân trang được ghi nhận lên URL (ví dụ: `/dishes?mode=fulltext&q=matcha&page=2&pageSize=10`).
  - Thao tác reload trang, copy URL sang tab khác hoặc Back/Forward phải khôi phục đúng danh sách.
  - Khi người dùng **tìm kiếm từ khóa mới** hoặc **đổi bộ lọc**: bắt buộc reset về `page = 1`.

---

### 3.4 Yêu cầu về Dữ liệu Seed & Test Fixture
- Số lượng bản ghi: Tối thiểu 1.000 món (hiện CSDL đã đạt 1.211).
- Cần có script seed tái tạo được dữ liệu nhất quán.
- Cần chuẩn bị các trường hợp kiểm thử đặc biệt:
  - Món có `price = 0` và các món trùng giá.
  - Món có `available = false` và `available = true`.
  - Món có mô tả dài nhiều từ (để kiểm tra `fulltext`).
  - Món có tên dễ gõ sai (để kiểm tra `fuzzy` với ngưỡng 0.3, ví dụ: "Houjicha" gõ thành "Hojicha", "Matcha" gõ thành "Macha").
  - Món có ký tự đặc biệt `%`, `_`, `!` trong tên (để kiểm tra escape trong `basic` và `advanced`).

---

## 4. Các điểm kỹ thuật cốt lõi cần giải quyết khi thiết kế DB

1. **Kích hoạt Extension `pg_trgm`**:
   - Cần lệnh SQL: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`.
2. **Thiết kế cột FTS và Index**:
   - Cột `fts tsvector`:
     - Có thể dùng PostgreSQL Generated Column:
       `ALTER TABLE dishes ADD COLUMN fts tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B')) STORED;`
     - Tạo GIN index:
       `CREATE INDEX dishes_fts_idx ON dishes USING gin (fts);`
   - Index cho Fuzzy Search:
     - Tạo GIN index trigram trên cột `name`:
       `CREATE INDEX dishes_name_trgm_idx ON dishes USING gin (name gin_trgm_ops);`
3. **Cách tương tác với Prisma ORM**:
   - Prisma Client không tự động hỗ trợ đầy đủ cú pháp FTS của Postgres với custom weights hoặc `pg_trgm` qua API `findMany` tiêu chuẩn.
   - Giải pháp: Sử dụng `$queryRaw` hoặc `$queryRawUnsafe` (có parameter binding an toàn) cho các truy vấn tìm kiếm phức tạp kết hợp xếp hạng (`ts_rank`, `similarity`), phân trang (`LIMIT`, `OFFSET`) và đếm tổng (`COUNT(*) OVER()`).

---

## 5. Kết luận bước làm giàu Context
- Ngữ cảnh hệ thống và toàn bộ yêu cầu nghiệp vụ đã được làm rõ và đối chiếu chi tiết giữa tài liệu/slide và mã nguồn thực tế.
- Toàn bộ dữ liệu thực tế trong CSDL Supabase (1.211 dishes, các cột, index hiện có, extension) đã được xác thực chính xác.
- Sẵn sàng bước tiếp theo: Lập kế hoạch thiết kế CSDL (migration/scripts) và kiến trúc API/UI phù hợp.
