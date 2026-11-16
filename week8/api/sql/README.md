# PostgreSQL / Supabase kế thừa từ tuần 3

Nguồn cấu trúc: `week3/restaurant/prisma/schema.prisma`. Nguồn dữ liệu mẫu: seed và `src/soucha-menu.js` của cùng project. Trong bản source tuần 3 hiện có không có `.env` thật hoặc SQL dump từ database đang chạy, vì vậy các file dưới đây tái tạo **schema và seed từ source**, không phải bản sao dữ liệu người dùng đã sửa trên Supabase.

## File và cách sử dụng

- `001-schema.sql`: PostgreSQL DDL cho `dishes`, `chefs`, `ingredients`, `dish_ingredients`, `chef_dishes`; giữ nguyên tên bảng/cột, khóa chính và cascade của tuần 3. Chạy cho **database mới trống**.
- `002-seed.sql`: tám món Soucha, hai đầu bếp, ba nguyên liệu, sáu dòng công thức và bốn liên kết đầu bếp–món. Chỉ chèn mẫu còn thiếu; không cập nhật giá/tồn kho hiện có.
- `003-auth.sql`: tạo bảng tài khoản, phiên, OTP, giới hạn và đặt lại mật khẩu tương thích Week 6. Với database mới dùng SQL, chạy sau hai file trên. Với database Week 5 chỉ có bảng món ăn, chạy riêng file này một lần. Với database đã có đầy đủ schema tài khoản Week 6, bỏ qua file này và generate Prisma Client của Week 7.

Nếu dùng **đúng Supabase của tuần 3**, đặt `DATABASE_URL` vào `week5/api/.env`; các model trỏ đúng bảng cũ nên dữ liệu hiện có được đọc trực tiếp, không cần chạy lại file tạo bảng hay sao chép dữ liệu sang SQLite. Chạy `npm run db:search-setup` để bổ sung cột/index, extension, helper và trigger tìm kiếm cho week5.

```powershell
cd D:\WebApplication\Web-design\week5
npm run db:generate --workspace @soucha/api
npm run db:search-setup
npm run test:live
npm run dev
```

`test:live` chỉ đếm bản ghi, không ghi hay xóa và không in chuỗi kết nối. Sau khi đổi `.env`, restart server API để nhận cấu hình mới.

Nếu database mới chưa có bảng, dùng `npm run setup` hoặc chạy lần lượt `001-schema.sql`, `002-seed.sql` và `003-auth.sql` trong SQL Editor của Supabase. Với PostgreSQL đang dùng chung, áp dụng riêng SQL bổ sung đã chọn để giữ schema tìm kiếm và dữ liệu hiện có.

## Xuất lại SQL

```powershell
npm run db:sql
```

Lệnh này chỉ dùng schema và dữ liệu mẫu trong source, không kết nối database. `001-schema.sql` sinh bằng Prisma migrate diff và nối thêm SQL thiết lập tìm kiếm; `002-seed.sql` sinh từ `seed-data.js` dùng chung với seed Prisma nên không có hai bộ dữ liệu mẫu lệch nhau.

## Kiểm chứng

`npm test` có ca so sánh schema với tuần 3, tạo cả hai Prisma Client độc lập, và chạy SQL trên PostgreSQL cục bộ qua PGlite. Test kiểm tra Unicode, đủ năm bảng, số bản ghi, khóa ngoại, cascade và chạy seed lại không reset stock. Kiểm tra đó không thay thế kiểm tra kết nối tới project Supabase thật; dùng `npm run test:live` sau khi điền URL để xác nhận kết nối thật.
