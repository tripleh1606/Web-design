# Kế hoạch đăng xuất SSR — week6

Cập nhật 02/11/2026. **Đã viết module và test cô lập; chờ teammate tích hợp login/session và key Google thật.** Tuân theo [hợp đồng chung](auth-parallel-plan.md), [checklist](auth-acceptance-checklist.md) và slide 34, 54, 60 trong file HTML. [English handoff](auth-logout-english.md) mô tả cùng hành vi.

## 1. Hiện trạng và điều kiện trước khi làm

App `restaurant` đã có Express/EJS/Prisma và CRUD nhà hàng nhưng chưa có session/login/CSRF/guard. Các plan trong folder mô tả công việc tương lai; [discovery](auth-discovery.md) ghi rõ kiểm tra code và test chưa chạy được do thiếu dependency.

Người tích hợp phải cung cấp User active/pending, Session bền vững trong PostgreSQL, cookie sid, CSRF và requireLogin trước khi ghép logout. Các phiên form ẩn danh có userId=null không phải tài khoản đã đăng nhập. Không tạo thêm access/refresh token cho bài này.

## 2. Hành vi cần đạt

```text
GET /logout/confirm: chỉ hiện form checkbox v2, không hủy phiên
Form POST /logout + cookie sid + CSRF + g-recaptcha-response
  → requireLogin và kiểm tra CSRF/origin
  → backend xác minh reCAPTCHA v2 với Google
  → tìm và hủy đúng session hiện tại ở PostgreSQL
  → chờ thao tác hủy hoàn tất
  → Set-Cookie làm sid hết hạn
  → 303 Location: /login

Request mới dùng sid cũ tới bất kỳ /admin route
  → 303 Location: /login, không đọc/ghi dữ liệu CRUD
```

Session ở server quyết định hiệu lực đăng nhập; xóa cookie chỉ dọn browser. Logout không xóa user hoặc dữ liệu nhà hàng. Session B của cùng user vẫn hoạt động sau logout A. Reset password có phạm vi khác: phải hủy mọi session của user.

## 3. Các bước thực hiện và lý do

Yêu cầu bổ sung của người dùng: reCAPTCHA **v2 Checkbox cho logout**, cặp key riêng; xem [setup và hợp đồng helper](../restaurant/docs/logout-integration.md). Đây là phần mở rộng ngoài slide. Mọi bước vẫn phải giữ CSRF và hủy session thật.

1. **Tái sử dụng nền tảng session.** Cookie chứa sid ngẫu nhiên, DB lưu sidHash theo contract; guard kiểm tra row/hạn/user active. Nhờ vậy sid cũ bị từ chối ở cả browser và HTTP client.
2. **Thêm form header.** Người tích hợp sửa `views/partials/header.ejs` để hiện nút Đăng xuất khi authenticated, form POST `/logout` có CSRF của phiên hiện tại. Không dùng link GET vì logout thay đổi trạng thái.
3. **Viết handler.** Feature owner tạo `src/auth/logout.js`, dùng helper chung, không tự đổi tên cookie/hash/schema. Kiểm tra CSRF và origin, hủy đúng sidHash đang được trình ra, không xóa theo userId.
4. **Xử lý kết quả store.** Await deletion trước clear-cookie/redirect. Store lỗi → 500; không báo logout thành công khi session còn tồn tại. Không ghi sid/CSRF/token vào log.
5. **Xóa cookie đúng phạm vi.** Helper Set-Cookie cùng name/path/domain với cookie đã cấp, Max-Age=0/Expires quá khứ; response 303 `/login`. Auth response no-store.
6. **Nhánh không hợp lệ.** GET `/logout` → 404 không side effect; GET `/logout/confirm` chỉ hiện form. Thiếu/pending/expired session → 303 login; CSRF/origin sai → 403. CAPTCHA thiếu/sai → form 200, Google/config lỗi → 500, giữ session. Module này chỉ hủy phiên của user đã đăng nhập. Replay sau logout không bắt buộc thành công.
7. **Tích hợp guard.** Người tích hợp bảo vệ `/dishes`, `/dishes/:id` và toàn bộ `/admin` trước handler, kể cả GET và method-override/quan hệ; thiếu/hết hạn/bị thu hồi/pending → 303 `/login`. Trang auth cần thiết và static assets vẫn truy cập được.
8. **Kiểm chứng.** Test hủy session thực sự, cookie và redirect, sid replay, lỗi DB, CSRF, session B và Back/cache; chuẩn bị bằng chứng che bí mật.

## 4. File và trách nhiệm

- Owner logout: `restaurant/src/auth/logout.js`, `recaptcha-v2.js`, `views/auth/logout.ejs`, `tests/auth-logout.test.js`, `tests/recaptcha-v2.test.js`, `docs/logout-integration.md` và biến v2 trong `.env.example`.
- Người tích hợp: schema/helper session/CSRF, app.js/router mount tại root, header và guard/test chung. Không mount tại /auth.
- Bằng chứng khi chạy: `restaurant/evidence/auth/`; không tạo bằng chứng giả trong lúc lập plan.

## 5. Checklist

- [ ] Login active tạo session thật, sid đổi; pending không có authenticated session.
- [ ] Hai cookie jars A/B của cùng user đều dùng được CRUD.
- [ ] POST logout A: row A bị hủy trước response, cookie hết hạn, 303 /login.
- [ ] Dùng sid A đã giữ từ trước để gọi GET /dishes, /dishes/:id và GET/request ghi /admin: 303 /login, không truy cập/ghi dữ liệu.
- [ ] Cookie B vẫn dùng được, kể cả sau restart server với cùng store.
- [ ] CSRF thiếu/sai hoặc Origin lạ: 403, không hủy phiên hợp lệ.
- [ ] GET /logout: 404; session không đổi.
- [ ] Giữ promise delete chưa resolve: chưa có thành công; reject: 500, không clear-cookie/redirect thành công.
- [ ] Back có thể hiển thị trang cũ nhưng request mới bị chặn; không đánh giá logout chỉ bằng UI.
- [ ] Có UI, Network, Cookies, request trực tiếp và DB trước/sau, sid/secrets được che.

Test HTTP dùng fixture riêng; test PostgreSQL thật chỉ dùng DB thử nghiệm được chọn rõ. Bộ test CRUD cũ phải được người tích hợp cập nhật vì hiện đang giả định admin truy cập công khai. Đã có kiểm tra cô lập bằng HTTP/store fixture/provider inject cho thứ tự delete/cookie, sid replay, phiên B, CSRF và lỗi CAPTCHA/DB. Các ô nghiệm thu tích hợp thật vẫn chưa đánh dấu; test fixture không chứng minh PostgreSQL/Google thật.
