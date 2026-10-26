# Báo cáo kiểm thử API — Week 4 Bruno

**Dự án:** `source-code/Web-design/week4` (Soucha REST API + SPA)
**Công cụ:** Bruno CLI — `npm run test:bruno`
**Môi trường:** API `http://localhost:3001`, DB đã seed (`npm run setup`), env Bruno `local`

---

## 1. Kết quả tổng hợp

| Metric | Kết quả |
|--------|---------|
| Status | PASS |
| Requests | 67 / 67 Passed |
| Tests | 67 / 67 |
| Duration | ~0.1–11 s (SQLite local / network DB) |

Lệnh:

```sh
cd source-code/Web-design/week4
npm start --workspace @soucha/api   # terminal 1
npm run test:bruno                  # terminal 2
```

---

## 2. Mục tiêu kiểm thử

API week4 trả **hai lớp lỗi** khác nhau.
SPA (`web/src/api.js`) dựa vào lớp đó, không chỉ nhìn HTTP status.

| Loại | Khi nào | Kỳ vọng |
|------|---------|---------|
| Lỗi kỹ thuật | Route/method sai, JSON hỏng, body quá lớn, Origin lạ | HTTP 404 / 400 / 413 / 403, JSON `{ message }`, **không** có `ok` |
| Lỗi nghiệp vụ | Thiếu/sai field, id không tồn tại, trùng quan hệ | HTTP **200**, `{ ok: false, error.code }` (`NOT_FOUND` / `VALIDATION_FAILED`) |
| Thành công | Data hợp lệ | HTTP 200, `{ ok: true, data }` |

**Vì sao:** Đề REST-API-và-SPA yêu cầu business luôn 200 + envelope `ok`.
Technical errors không dùng envelope đó để SPA tách nhánh xử lý.

---

## 3. Nội dung đã test và lý do

### 3.1 Chuẩn bị env (`00-env`)

**Test gì:** Discover id seed (Matcha Latte, Nguyễn Minh An, Bột matcha).

**Vì sao:** Happy path cần id thật trên DB, không giả định cứng `id=1`.

### 3.2 Lỗi kỹ thuật + CORS (`01-technical`)

| Test | Vì sao |
|------|--------|
| GET `/api/bok` → 404 + `{ message }` | URL sai không được bọc `ok: false` |
| POST `{bad` → 400 | JSON parse fail là lỗi kỹ thuật |
| OPTIONS + Origin SPA → 204 | Browser preflight PATCH/DELETE |
| POST + Origin lạ → **403** | Allowlist `SPA_ORIGIN` (khác bản restaurant cũ: không silent bỏ ACAO) |
| POST > 32kb → 413 | Giới hạn body Express |

### 3.3 CRUD dishes / chefs / ingredients (`02`–`04`)

**Test gì:** List/get ok; id `abc`/`0`/`999999` → `NOT_FOUND`; POST thiếu/sai kiểu → `VALIDATION_FAILED`; image sai path; PATCH thiếu id / giá trị âm; PATCH `{}` → `VALIDATION_FAILED` + `_form` (week4 bắt buộc ít nhất một field); dishes search/sort.

**Vì sao:** Đây là hợp đồng CRUD chính mà SPA admin dùng.
PATCH rỗng phải fail theo validation week4 (khác bản restaurant trả nguyên bản ghi).

### 3.4 Công thức (`05-recipe`)

**Test gì:** GET `/api/dishes/:id/ingredients`; POST amount 0 / thiếu field / ingredient không tồn tại / dish thiếu; PATCH/DELETE link thiếu; amount invalid.

**Vì sao:** Quan hệ dish–ingredient; week4 dùng path `/ingredients` (không có `/recipe`).

### 3.5 Gán đầu bếp (`06-chef-dishes`)

**Test gì:** GET mảng `chef.dishes`; chef thiếu; dishId invalid/thiếu/không tồn tại; DELETE assignment thiếu.

**Vì sao:** Cùng contract business 200; response là mảng liên kết, không phải object trang chi tiết cũ.

### 3.6 Flow ghi (`99-flows`)

**Test gì:** Tạo `bruno-contract-*` → link/assign → duplicate `VALIDATION_FAILED` → PATCH amount → unassign/unlink → DELETE ok rồi DELETE lần 2 `NOT_FOUND` → teardown.

**Vì sao:** Duplicate và xóa hai lần chỉ kiểm được với bản ghi thật; teardown tránh rác DB.

---

## 4. Kết luận kỳ vọng sau khi PASS

- Technical: 404 / 400 / 413 / 403 không có `ok`
- Business thiếu/sai data: HTTP 200 + `NOT_FOUND` / `VALIDATION_FAILED`
- Quan hệ recipe & chef–dish đúng mã; duplicate bị từ chối
- Không còn bản ghi `bruno-contract-*` sau run

**Không cover trong Bruno:** HTTP 500 (mock DB) — đã có trong `npm test` (`tests/api.test.js`).

Chi tiết case: [TEST-MATRIX.md](TEST-MATRIX.md).
Endpoint: [API-REFERENCE.md](API-REFERENCE.md).
