# Báo cáo kiểm thử API — Restaurant (Bruno)

**Dự án:** Soucha restaurant backend (`Web-design/week5/restaurant`)
**Công cụ:** Bruno CLI — `npm run test:bruno`
**Môi trường:** API `http://localhost:3001`, DB đã seed, env `local`

---

## 1. Kết quả tổng hợp

| Metric | Kết quả |
|--------|---------|
| Status | PASS |
| Requests | 67 / 67 Passed |
| Tests | 67 / 67 |
| Duration | ~10.7 s |

Lệnh chạy:

```sh
npm run start:be    # terminal 1 — API phải đang listen
npm run test:bruno  # terminal 2
```

---

## 2. Mục tiêu kiểm thử

Backend trả hai kiểu lỗi khác nhau.
Cần chứng minh client/SPA phân biệt đúng.

| Loại | Khi nào | Kỳ vọng |
|------|---------|---------|
| Lỗi kỹ thuật | Route sai, JSON hỏng, body quá lớn | HTTP 404 / 400 / 413, body plain text, **không** có `{ ok }` |
| Lỗi nghiệp vụ | Thiếu field, sai kiểu, id không tồn tại, trùng quan hệ | HTTP **200**, `{ ok: false, error.code }` (`NOT_FOUND` hoặc `VALIDATION_FAILED`) |
| Thành công | Data hợp lệ | HTTP 200, `{ ok: true, data }` |

**Vì sao test như vậy:** SPA dựa vào `ok` / `error.code`, không chỉ dựa vào HTTP status.
Nếu validation trả 4xx hoặc NOT_FOUND trả 404 thì frontend dễ xử lý sai.

---

## 3. Nội dung đã test và lý do

### 3.1 Chuẩn bị env (`00-env`) — 3 tests

**Test gì:** Lấy id thật của dish / chef / ingredient từ seed (ví dụ Matcha Latte).

**Vì sao:** Các case GET/PATCH happy cần id tồn tại trên DB, không hard-code giả định id = 1.

**Kết quả:** Pass (200 OK).

### 3.2 Lỗi kỹ thuật + CORS (`01-technical`) — 5 tests

| Test | Vì sao | Kết quả |
|------|--------|---------|
| GET `/api/bok` → 404 plain | Route không tồn tại không được bọc `{ ok: false }` | Pass (404) |
| POST JSON `{bad` → 400 plain | Body parse fail là lỗi kỹ thuật | Pass (400) |
| OPTIONS + Origin SPA → 204 + CORS | Preflight browser phải được phép | Pass (204) |
| GET + Origin lạ → không có ACAO | Origin sai không được phép CORS | Pass (200, không ACAO) |
| POST > 32kb → 413 plain | Giới hạn body của Express | Pass (413) |

### 3.3 CRUD dishes / chefs / ingredients (`02`–`04`) — 28 tests

**Test gì (mỗi resource):**

- List / get seed → `ok: true`
- Id `abc` / `0` / `999999` → `NOT_FOUND` (vẫn HTTP 200)
- POST thiếu field hoặc sai kiểu → `VALIDATION_FAILED` + `fields`
- Dishes: `image` sai path → `VALIDATION_FAILED`
- PATCH id thiếu → `NOT_FOUND`; giá trị âm → `VALIDATION_FAILED`; body `{}` → ok, không đổi
- Dishes: search `q` + `category` + `sort`

**Vì sao:** Đây là hợp đồng chính của API CRUD.
Client phải nhận đúng mã nghiệp vụ khi user nhập thiếu/sai, và khi bản ghi không có.

**Kết quả:** Toàn bộ Pass (200 với envelope đúng kỳ vọng).

### 3.4 Công thức món (`05-recipe`) — 9 tests

**Test gì:** GET recipe (ok + NOT_FOUND); POST thiếu field / amount 0 / ingredient không tồn tại / dish không tồn tại; PATCH/DELETE link không có; amount invalid.

**Vì sao:** Quan hệ dish–ingredient dễ lỗi FK và trùng link.
Cần tách `NOT_FOUND` (dish/link) và `VALIDATION_FAILED` (payload / ingredient thiếu).

**Kết quả:** Pass.

### 3.5 Gán món cho đầu bếp (`06-chef-dishes`) — 7 tests

**Test gì:** GET ok / chef thiếu; POST dishId invalid / thiếu / dish không tồn tại / chef thiếu; DELETE assignment không có.

**Vì sao:** Cùng pattern quan hệ many-to-many như recipe, nhưng field là `dishId`.

**Kết quả:** Pass.

### 3.6 Flow ghi end-to-end (`99-flows`) — 15 tests

**Test gì:**

1. Tạo ingredient, dish, chef tên `bruno-contract-*`
2. PATCH dish; gắn nguyên liệu; gắn trùng → `VALIDATION_FAILED`; PATCH amount
3. Gán dish cho chef; gán trùng → `VALIDATION_FAILED`; unassign; unlink
4. DELETE dish → ok; DELETE lần 2 → `NOT_FOUND`; xóa chef và ingredient

**Vì sao:** Các case trùng quan hệ và DELETE hai lần chỉ kiểm được khi có bản ghi thật.
Teardown tránh để rác trên DB dev.

**Kết quả:** Pass; entity test được tạo rồi xóa sạch trong cùng lần chạy.

---

## 4. Log chạy (tóm tắt theo folder)

| Folder | Requests | Outcome |
|--------|----------|---------|
| `00-env` | 3 | Pass |
| `01-technical` | 5 | Pass (404, 400, 204, 200, 413) |
| `02-dishes` | 12 | Pass |
| `03-chefs` | 8 | Pass |
| `04-ingredients` | 8 | Pass |
| `05-recipe` | 9 | Pass |
| `06-chef-dishes` | 7 | Pass |
| `99-flows` | 15 | Pass |

Chi tiết từng request: xem output `npm run test:bruno` (mọi dòng đều `✓`).

---

## 5. Kết luận

API khớp hợp đồng đã thiết kế:

- Lỗi kỹ thuật → mã HTTP + plain text
- Lỗi thiếu/sai data → HTTP 200 + `ok: false` + `NOT_FOUND` / `VALIDATION_FAILED`
- Happy path và quan hệ (recipe, chef–dish) hoạt động; duplicate bị từ chối đúng mã
- Flow ghi không để lại bản ghi `bruno-contract-*`

**Không cover trong Bruno:** HTTP 500 (cần mock DB) — giữ ở `tests/app.test.js`.

**Chạy lại:** `npm run test:bruno` (API đang listen trên `PORT`).
