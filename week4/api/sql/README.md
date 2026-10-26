# PostgreSQL / Supabase kế thừa từ tuần 3

Nguồn cấu trúc: `week3/restaurant/prisma/schema.prisma`. Nguồn dữ liệu mẫu: seed và `src/soucha-menu.js` của cùng project. Trong bản source tuần 3 hiện có không có `.env` thật hoặc SQL dump từ database đang chạy, vì vậy các file dưới đây tái tạo **schema và seed từ source**, không phải bản sao dữ liệu người dùng đã sửa trên Supabase.

## File và cách sử dụng

- `001-schema.sql`: PostgreSQL DDL cho `dishes`, `chefs`, `ingredients`, `dish_ingredients`, `chef_dishes`; giữ nguyên tên bảng/cột, khóa chính và cascade của tuần 3. Chạy cho **database mới trống**.
- `002-seed.sql`: tám món Soucha, hai đầu bếp, ba nguyên liệu, sáu dòng công thức và bốn liên kết đầu bếp–món. Chỉ chèn mẫu còn thiếu; không cập nhật giá/tồn kho hiện có.

Nếu dùng **đúng Supabase của tuần 3**, chỉ đặt `DATABASE_URL` vào `week4/api/.env`; các model trỏ đúng bảng cũ nên dữ liệu hiện có được đọc trực tiếp, không cần chạy lại file tạo bảng hay sao chép dữ liệu sang SQLite.

```powershell
cd D:\Minh\Web-design\week4
npm run db:generate --workspace @soucha/api
npm run test:live
npm run dev
```

`test:live` chỉ đếm bản ghi, không ghi hay xóa và không in chuỗi kết nối. Sau khi đổi `.env`, restart server API để nhận cấu hình mới.

Nếu database mới chưa có bảng, có thể chạy `npm run setup` (Prisma chọn PostgreSQL theo URL, đồng bộ schema và seed), hoặc chạy `001-schema.sql` rồi `002-seed.sql` trong SQL Editor của Supabase. Không cần thực hiện cả hai cách.

## Xuất lại SQL

```powershell
npm run db:sql
```

Lệnh này chỉ dùng schema và dữ liệu mẫu trong source, không kết nối database. `001-schema.sql` sinh bằng Prisma migrate diff, `002-seed.sql` sinh từ `seed-data.js` dùng chung với seed Prisma nên không có hai bộ dữ liệu mẫu lệch nhau.

## Kiểm chứng

`npm test` có ca so sánh schema với tuần 3, tạo cả hai Prisma Client độc lập, và chạy SQL trên PostgreSQL cục bộ qua PGlite. Test kiểm tra Unicode, đủ năm bảng, số bản ghi, khóa ngoại, cascade và chạy seed lại không reset stock. Kiểm tra đó không thay thế kiểm tra kết nối tới project Supabase thật; dùng `npm run test:live` sau khi điền URL để xác nhận kết nối thật.
