# Soucha — bản chuyển đổi Restaurant SSR

Đây là bản chuyển đổi từ app Soucha Next.js ở thư mục cha sang **Express + EJS + Prisma + Supabase PostgreSQL** theo [`restaurant_SSR/requirement.md`](../restaurant_SSR/requirement.md). App gốc ở `../soucha/` không bị sửa.

## Những gì được mang từ app gốc

- Logo, tám ảnh trong `public/beverages/`, màu xanh `#155727` và nâu `#43281a`.
- Bố cục menu: logo lớn, thanh tìm kiếm, tab Matcha/Houjicha, sắp xếp giá, lưới thẻ đồ uống và footer Soucha.
- Tám món, tên, giá, danh mục và đường dẫn ảnh từ `lib/menu.ts` / `supabase/migrations/003_products.sql`, chuyển thành seed `Dish` trong `src/soucha-menu.js`.
- Kiểu giao diện quản trị của Soucha: tiêu đề, tab, danh sách thẻ, ảnh, nút thêm/sửa/xóa.

Phần xử lý React `useState`/`fetch`/Next API của menu và quản trị được thay bằng EJS render tại server, form HTML và Prisma. Chi tiết món mở trang `/dishes/:id` thay cho sheet tùy chỉnh; quy trình giỏ hàng/đặt hàng, khuyến mãi và giờ hoạt động của app gốc nằm ngoài phạm vi bài Restaurant SSR. Ba model bài tập là `Dish`, `Chef`, `Ingredient`.

## Chạy

Yêu cầu Node.js 20 trở lên và Session pooler URL (port 5432) của Supabase.

```powershell
cd D:\WebApplication\Web-design\Soucha\restaurant-ssr
npm install
Copy-Item .env.example .env
```

Điền `DATABASE_URL` thật vào `.env` trên máy cá nhân; **không commit file này**. Nếu `.env` đã có thì giữ nguyên, không copy đè. Sau đó:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
npm start
```

Mở `http://localhost:3001/dishes`. Port 3001 tránh xung đột với app Soucha Next.js trên port 3000. Restart `npm start` nếu server đang chạy từ trước khi cập nhật code.

## Luồng SSR

- `GET /dishes`: Prisma đọc database; `q`, `category`, `sort` từ query string được dùng để lọc và sắp xếp, rồi EJS dựng HTML.
- `GET /dishes/:id`: lấy `id` từ path, kiểm tra số hợp lệ, đọc lại món từ database; `404` nếu không có.
- `GET /admin/dishes`, `/admin/chefs`, `/admin/ingredients`: danh sách quản trị; mỗi loại có form thêm, sửa, xác nhận xóa.
- `POST` tạo mới; form sửa/xóa dùng `POST` với `?_method=PATCH`/`?_method=DELETE` để `method-override` chuyển thành đúng method. Server validate `req.body`, ghi bằng Prisma, rồi trả **303 See Other**. Trình duyệt `GET` trang kết quả và render dữ liệu mới; refresh không tạo bản ghi lặp.

Client không gửi CRUD bằng `fetch`/AJAX. `.env.example` không chứa credential. Prisma Client được generate vào `generated/prisma` và thư mục này được Git bỏ qua.

## Kiểm tra

```powershell
npm test
npm run test:live
```

`npm test` dùng dữ liệu giả để kiểm tra HTTP, validation, 303, 404 và 500. `npm run test:live` là kiểm tra **chỉ đọc** trên Supabase thật và xác nhận EJS/ảnh gốc được phục vụ. Trong DevTools → Network, thử thêm/sửa/xóa để thấy request ghi → `303` → document `GET` mới. Thử tên trống hoặc giá âm để thấy `400` và form giữ giá trị đã nhập.
