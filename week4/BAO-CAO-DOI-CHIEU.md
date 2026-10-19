# Báo cáo tuần 4 — REST API và SPA

Ngày thực hiện: 19/10/2026. Đề đối chiếu: `../REST-API-và-SPA.md`, gồm phần bài tập, tiêu chí nghiệm thu và speaker notes. Yêu cầu đã trích riêng tại [REQUIREMENT.md](./REQUIREMENT.md).

## 1. Kết quả

Đã hoàn thiện bài tập trong `week4/`: backend REST API cho món ăn, đầu bếp, nguyên liệu; frontend SPA cho người dùng và quản trị. Các yêu cầu bắt buộc trong đề đã có code và được kiểm tra với Prisma + SQLite và Google Chrome.

- `npm test`: **16/16 nhóm kiểm thử đạt**, chạy HTTP thật, SQLite riêng và SQL trên PostgreSQL cục bộ.
- `npm run test:browser`: **20/20 nhóm kiểm thử đạt**, chạy Chrome với API và SPA ở hai origin khác nhau.
- Đã xem lại ảnh desktop và mobile, kiểm tra menu, danh sách quản trị và form.
- Đã bổ sung công thức, tạo nguyên liệu ngay trong form món, tính số phần, gán món cho đầu bếp và lọc/sắp xếp theo restaurant tuần 3. Chi tiết xem [DOI-CHIEU-WEEK3.md](./DOI-CHIEU-WEEK3.md).
- Schema/SQL PostgreSQL đã được kiểm thử cục bộ. Kết nối project Supabase thật còn cần DATABASE_URL do người dùng điền vào api/.env; không khẳng định đã kết nối khi chưa có URL thật.

## 2. Đã kế thừa và thay đổi gì so với tuần 3?

| Thành phần | Tuần 3 | Tuần 4 |
| --- | --- | --- |
| Nền tảng | Express + EJS + Prisma | Giữ Express + Prisma; tạo SPA JavaScript ES modules |
| Dựng UI | EJS tại server | Browser dựng DOM từ JSON |
| Dữ liệu | Supabase PostgreSQL | PostgreSQL/Supabase theo URL; SQLite riêng cho local/test, hai client độc lập |
| Model | Dish, Chef, Ingredient và các bảng liên kết | Giữ schema, trường bổ sung image/stock/createdAt và bảng liên kết |
| Seed | Tám đồ uống Soucha, đầu bếp, nguyên liệu, công thức | Kế thừa seed; chạy lại chỉ thêm mục thiếu, không reset stock đã sửa |
| Nhận diện | Logo, ảnh đồ uống, xanh/nâu Soucha | Sao chép asset, giữ phong cách và viết CSS responsive |
| Đọc dữ liệu | Server đọc DB và render HTML | Mỗi trang SPA gọi GET và tự giữ dữ liệu cục bộ |
| Ghi dữ liệu | Form HTML + method-override, redirect 303 | fetch POST/PATCH/DELETE, JSON, router điều hướng khi ok true |
| Bản ghi không tồn tại | Trang SSR trả 404 | API trả 200 + NOT_FOUND; SPA hiện trạng thái riêng |
| Validation | Trả form SSR với status 400 | API trả 200 + VALIDATION_FAILED + fields; SPA giữ input và hiện lỗi |
| Origin | UI và server chung origin | SPA 5173, API 3001; CORS allowlist từ cấu hình |

Không chỉnh mã ở `week3`. Không phụ thuộc vào source hoặc `node_modules` tuần 3 khi chạy tuần 4. README gốc chỉ được bổ sung đường dẫn và lệnh chạy tuần 4.

`DATABASE_URL` chỉ có ở backend. Schema PostgreSQL giữ nguyên các bảng và quan hệ cũ; SQLite được giữ riêng cho local/test. Theo yêu cầu bổ sung, đã mang quản lý công thức và đầu bếp sang SPA, thêm chức năng chọn/tạo nguyên liệu ngay khi tạo món. Giỏ hàng, đặt hàng, khuyến mãi và giờ mở cửa của app Soucha Next.js không thuộc project restaurant đang đối chiếu.

## 3. Đối chiếu yêu cầu API

“Đạt” dưới đây có nghĩa là đã chạy kiểm tra hoặc kiểm tra mã nguồn theo bằng chứng được ghi, không chỉ mới khai báo route.

| Yêu cầu của đề | Đã thực hiện | Bằng chứng | Kết quả |
| --- | --- | --- | --- |
| Backend có DB, ba model, seed | Prisma PostgreSQL, schema SQLite cho test; seed tám món, hai đầu bếp, ba nguyên liệu, liên kết mẫu | `api/prisma/`, `api/sql/`, kiểm thử schema/seed PostgreSQL cục bộ | Đạt |
| Giữ đủ trường Dish/Chef/Ingredient | Giữ toàn bộ trường bắt buộc; bổ sung id/image/stock/createdAt như tuần 3 | `api/prisma/schema.prisma` | Đạt |
| GET danh sách cả ba tài nguyên | Trả array, kể cả `[]` | Ba nhóm CRUD trong `tests/api.test.js` | Đạt |
| GET chi tiết cả ba tài nguyên | Trả bản ghi theo id | Ba nhóm CRUD: tạo → GET → so dữ liệu thật | Đạt |
| POST cả ba tài nguyên | Validate rồi ghi; trả bản ghi vừa tạo | Ba nhóm CRUD và Chrome tạo qua form | Đạt |
| PATCH cả ba tài nguyên | Chỉ cập nhật trường gửi lên; giữ trường khác | Test sửa chỉ name, đối chiếu trường còn lại; Chrome sửa thật | Đạt |
| DELETE cả ba tài nguyên | Chờ xóa xong, trả data null | Test DELETE và GET lại NOT_FOUND | Đạt |
| Tìm món theo tên bằng q | API nhận q, tìm không phân biệt hoa/thường, hỗ trợ Unicode | Test “Trà ĐÀO” với “đào”; Chrome “hOuJiChA” | Đạt |
| Handler thành công trả 200 + ok/data | Dùng một helper success chung | Test cả năm thao tác cho ba tài nguyên | Đạt |
| Input sai trả 200 + VALIDATION_FAILED + fields | Validate JSON độc lập trên API | Test tên trống, price âm/lẻ/chuỗi/null/boolean, available sai kiểu | Đạt |
| Validate tối thiểu: name và price | Name không rỗng, price integer ≥ 0; thêm kiểm tra specialty/unit/stock | Giá 0 hợp lệ; name trắng và price sai bị từ chối | Đạt |
| Id không có/sai kiểu là NOT_FOUND, status 200 | parseId trước query; bắt riêng Prisma P2025 khi sửa/xóa | GET/PATCH/DELETE với abc, 0, -1, overflow và id thiếu | Đạt |
| Sai URL/method là lỗi kỹ thuật 404 | Handler cuối trả JSON message, không có ok | GET /api/bok, GET /api, PUT /api/dishes | Đạt |
| JSON không đọc được là 400 | Middleware lỗi JSON riêng | Gửi `{bad`, kiểm tra 400 và không có ok | Đạt |
| Database lỗi là 500, không bọc lỗi nghiệp vụ | Middleware hệ thống, không trả ok false | Chủ động DROP bảng dishes trong DB test riêng; GET trả 500 không có ok | Đạt |
| Không đưa nguyên body vào ORM | Dựng object data từ whitelist, validate từng trường | Test cố gửi id/createdAt/unrelated; code `api/src/validation.js` | Đạt |
| GET không ghi dữ liệu | GET chỉ findMany/findUnique; seed chạy qua CLI riêng | Soát `api/src/app.js` | Đạt |
| Không lộ kết nối trong response/log | Chỉ log error.name và error.code; không log message/stack/body/url | Test lỗi DB: response và log không chứa đường dẫn DB test; soát logger | Đạt |
| CORS đúng origin từ cấu hình, không * | SPA_ORIGIN ở api/.env; middleware allowlist | Test header bằng HTTP, origin lạ trả 403 | Đạt |
| OPTIONS cho JSON/PATCH/DELETE | 204, Allow-Origin/Methods/Headers | HTTP test và CDP Network trên Chrome xác nhận preflight trước PATCH/DELETE | Đạt |
| Request mẫu nghiệm thu | Đủ GET list/detail, POST, PATCH, DELETE cho ba tài nguyên; kèm lỗi và preflight | `docs/requests.http` | Đạt |

Quy ước HTTP 200 cho lỗi nghiệp vụ được giữ đúng theo đề, dù nhiều API thông thường chọn status khác.

## 4. Đối chiếu yêu cầu SPA

| Yêu cầu của đề | Đã thực hiện | Bằng chứng | Kết quả |
| --- | --- | --- | --- |
| SPA mới chạy trong browser | index.html + ES modules; web server chỉ phục vụ file | `web/index.html`, `web/server.js`, `web/src/` | Đạt |
| API và SPA hai origin; gọi API trực tiếp | Mặc định localhost:3001 và localhost:5173; không proxy | Chrome thực hiện CRUD cross origin, CDP ghi preflight | Đạt |
| /dishes, q nằm trên URL, link chi tiết | Form tìm kiếm dùng router, đọc query URL | Chrome tìm “hOuJiChA” thấy hai món; Back/Forward đúng kết quả | Đạt |
| /dishes/:id đủ trường | Name, description, price, category, available; thêm id, ảnh, createdAt | Chi tiết render các trường từ GET theo id | Đạt |
| Quản trị dishes đủ list/new/edit/delete | Bốn dạng URL, link trong danh sách | Chrome tạo/sửa/hủy xóa/xác nhận xóa | Đạt |
| Lặp quản trị chefs và ingredients | Dùng cùng luồng generic theo resource | Chrome chạy trọn CRUD cho cả hai | Đạt |
| Mở trực tiếp và Reload mỗi URL | Static server fallback index.html, router đọc URL | Chrome kiểm tra 14 URL bắt buộc + 6 URL quan hệ + 1 URL không hợp lệ; mỗi URL đều reload | Đạt |
| Route không khớp có trang không tìm thấy | Catch-all trong router | /abc, /unknown-page; document 200, UI notFound | Đạt |
| Mỗi trang tự GET, không kho state toàn cục | Dữ liệu trong closure từng trang; chỉ lifecycle điều hướng dùng chung | `web/src/app.js`; Chrome thấy form sửa nạp theo id và danh sách mới sau ghi | Đạt |
| Loading/error/notFound/empty | Panel riêng và nhánh xử lý theo error.code/kind | Test loading có request chờ; search rỗng; id thiếu; các lỗi kỹ thuật | Đạt |
| Ba tầng lỗi, URL gốc một chỗ, trang không fetch trực tiếp | request trong api.js; API_BASE_URL từ /config.js | Soát code chỉ api.js có fetch; Chrome thử network/404/JSON sai/shape sai | Đạt |
| Form chặn submit mặc định | event.preventDefault, gọi lớp API | Chrome đếm document request không tăng khi ghi | Đạt |
| Validate ở SPA và API | validateForm cho nhập liệu; backend kiểm tra JSON riêng | Client bắt tên rỗng; POST trực tiếp bắt input sai | Đạt |
| VALIDATION_FAILED giữ input và lỗi cạnh trường | Map fields vào error span; không dựng lại form khi lỗi | Chrome giữ tên và giá đã nhập khi API thật trả lỗi price | Đạt |
| Khóa nút, tránh submit trùng | Cờ submitting + disable nút và fieldset | Chrome giữ request đang chờ, submit thêm, chỉ có 1 POST | Đạt |
| Ghi thành công điều hướng bằng client | Món tới chi tiết, chefs/ingredients tới list; xóa về list | Chrome kiểm tra URL, nội dung mới và số document request | Đạt |
| Trang xác nhận mới được xóa | GET khi mở trang; chỉ click nút xác nhận gọi DELETE | Chrome mở rồi Hủy: không có DELETE, bản ghi còn; xác nhận: bản ghi mất | Đạt |
| Bản ghi không có khác lỗi kỹ thuật | NOT_FOUND → notFound; lỗi mạng/status/JSON → error | Chrome so các nhánh và thử nút Thử lại | Đạt |
| API tắt không trắng trang | Giữ shell SPA, panel lỗi kỹ thuật | Test dừng API thật trong khi web server còn chạy rồi mở /dishes | Đạt |
| Response cũ không ghi đè trang mới | AbortController cho mỗi route, kiểm tra signal trước render | Chrome giữ GET chi tiết, chuyển sang admin rồi giải phóng response cũ | Đạt |
| Dữ liệu API được thoát ký tự | DOM properties/textContent, không innerHTML | Chrome tạo tên có img/onerror và mô tả script: hiện chữ, không thực thi | Đạt |
| Secret chỉ nằm backend | Web chỉ có API_BASE_URL; không import Prisma/env backend | Soát web/src và config.js; web server không phục vụ .env | Đạt |

## 5. Kiểm thử và bằng chứng

Chạy từ `week4` sau `npm install` và `npm run setup`:

```powershell
npm test
npm run test:browser
```

Mười sáu nhóm test API/server/database: tám nhóm CRUD, kiểu JSON, lỗi kỹ thuật, CORS, fallback; sáu nhóm về công thức/giao dịch/tồn kho/đầu bếp/lọc và sort; hai nhóm về schema PostgreSQL và thực thi SQL. Mỗi nhóm chứa nhiều request và assertion.

Hai mươi nhóm test Chrome: các luồng SPA gốc, lọc/sắp xếp; tạo nguyên liệu trong form món và sửa/gỡ công thức; lỗi validation từng dòng; gán/gỡ đầu bếp; glyph font tiếng Việt; hai nhóm dropdown tìm kiếm nguyên liệu và món đầu bếp. Các ca tìm kiếm kiểm tra không dấu/hoa thường, bàn phím, kết quả rỗng, bỏ ID cũ khi đổi từ khóa và lưu đúng ID sau khi chọn. Báo cáo JSON có tên đầy đủ từng nhóm.

Các ca lỗi network/404/JSON/shape có dùng Playwright để điều khiển response. Ca validation sửa payload gửi tới API thật để chắc chắn đi qua nhánh server validation; input trong browser không đổi. Ca tắt API thật đóng HTTP server của fixture. CRUD và lỗi DB dùng Prisma + SQLite thật, không mock ORM.

Ảnh và log sau khi chạy:

- [Menu desktop](./tests/results/menu-desktop.png)
- [Menu mobile](./tests/results/menu-mobile.png)
- [Quản trị desktop](./tests/results/admin-desktop.png)
- [Quản trị mobile](./tests/results/admin-mobile.png)
- [Form mobile](./tests/results/form-mobile.png)
- [Kết quả và request CORS của browser](./tests/results/browser-report.json)

`tests/results` và `tests/.tmp` được gitignore; chạy lại test để tạo bằng chứng trên máy khác. Database test được tạo riêng cho mỗi lần chạy, không sửa database demo. Trong lần nghiệm thu đã quan sát ảnh: menu bốn cột desktop/hai cột mobile, form và danh sách không tràn ngang ở viewport 390px.

## 6. Cách chạy và tự trình diễn

```powershell
cd D:\Minh\Web-design\week4
npm install
npm run setup
npm run dev
```

Mở <http://localhost:5173/dishes>. Tìm món, mở chi tiết và Reload. Vào Quản trị, chạy thêm/sửa/xóa ở từng tab. Thử tên trống hoặc giá âm để thấy lỗi cạnh input. Mở `/dishes/999999` để thấy không tìm thấy; chạy riêng API/web rồi dừng API để thử lỗi mạng.

Trong DevTools → Network, bật Disable cache. Lọc Fetch/XHR để xem body ok/data/error; lọc All để quan sát OPTIONS. Lọc Doc để xác nhận việc thêm/sửa/xóa và bấm link nội bộ không tạo document request. Mở `docs/requests.http` nếu muốn kiểm tra độc lập từng endpoint.

Chi tiết cấu hình, đổi port, lựa chọn SQLite và cấu trúc mã nguồn xem [README.md](./README.md).
