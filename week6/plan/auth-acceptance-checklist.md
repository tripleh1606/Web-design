# Checklist đối chiếu HTML — xác thực SSR

Cập nhật 02/11/2026. Code đã tích hợp; các ô nghiệm thu vẫn để trống vì **chưa hoàn tất kiểm chứng PostgreSQL/provider/browser thật**. Nguồn: [HTML, 66 slide](<D:/User_C_BackUp/Download/Xác thực tài khoản trên SSR.html>), gồm speaker notes. [Hợp đồng chung](auth-parallel-plan.md) chốt lựa chọn kỹ thuật và ngưỡng; số slide dưới đây đã đối chiếu section id trong HTML.

Mỗi mục khi chạy cần ghi: điều kiện đầu, thao tác/request, kết quả mong đợi/thực tế, trạng thái DB và đường dẫn bằng chứng. Test giả lập, PostgreSQL thật, browser và provider thật phải được ghi khác nhau; không dùng pass của mock để kết luận SMTP/CAPTCHA thật hoạt động.

## 1. Đăng ký và kích hoạt

Owner: [registration/OTP](auth-registration-english.md); schema/helpers do người tích hợp.

| Mã | Slide | Kiểm tra cần đạt |
| --- | --- | --- |
| [ ] R01 | 10, 49–50, 58 | Email chuẩn hóa unique; tạo user pending, password hash; body role=admin/status=active/emailVerifiedAt bị bỏ qua, role vẫn viewer |
| [ ] R02 | 10, 20, 50 + notes | Email mới/đã tồn tại: cùng 200/thông báo chung; không tạo user thứ hai; đăng ký lại pending không ghi đè passwordHash; invalid input 200 VALIDATION_FAILED |
| [ ] R03 | 21, 50, 58 | Pending nhập đúng password: không nhận authenticated session, không vào CRUD |
| [ ] R04 | 17–18, 51, 58 | OTP hợp lệ: đúng user/purpose/hạn/chưa dùng/còn lượt/hash → active + emailVerifiedAt + usedAt nguyên tử; hai request đồng thời một thắng |
| [ ] R05 | 18, 20, 51, 58 | OTP sai/hết hạn/đã dùng/unknown: cùng INVALID_OTP, không đổi status; tăng attempts theo email và đồng bộ challenge nếu có; sau 5 lần sai pending/active/unknown đều bị khóa và cùng 429 khi activate/resend/re-register |
| [ ] R06 | 19, 51, 58 | Resend: cooldown/rate limit, mã cũ hết hiệu lực, mã mới dùng được; xen resend với nhập sai không reset attempts/lockedUntil |
| [ ] R07 | 21, 51, 58 | Kích hoạt thành công không tự login; OTP không dùng làm password ở /login hoặc sid |
| [ ] R08 | 10 + notes | Giữ emailOriginal và normalized; cùng chính sách ở register/login/activate/resend/forgot/seed; thư viện validation, không tự regex đơn giản |

## 2. CAPTCHA và chống brute force

Owner: nền tảng/login và registration; source slide 11–15, 25–27, 53, 59.

| Mã | Kiểm tra cần đạt |
| --- | --- |
| [ ] C01 | Register thiếu/sai CAPTCHA: không hash password/tạo user/gửi OTP; CAPTCHA hợp lệ + dữ liệu hợp lệ mới tiếp tục |
| [ ] C02 | V2 token dùng lại/quá hạn/sai hostname bị từ chối; không tin captchaPassed/score/action từ body; provider outage fail closed. V2 không có action/score; purpose của helper chỉ là ngữ cảnh route, không chứng minh token thuộc form nào |
| [ ] C03 | Login sai đến ngưỡng, bỏ trường CAPTCHA hoặc POST trực tiếp: bị chặn trước verify password. Email không tồn tại áp cùng quy tắc |
| [ ] C04 | CAPTCHA đúng nhưng password sai: failedCount tiếp tục tăng; CAPTCHA đúng hoặc pending-password đúng không xóa counter |
| [ ] C05 | Đang khóa mà password và CAPTCHA đều đúng: 429, không authenticated session. Hết khóa nhưng cửa sổ sai còn hiệu lực vẫn cần CAPTCHA |
| [ ] C06 | Xóa cookie/tab ẩn danh/đổi IP không reset counter theo email. Giới hạn IP chặn một nguồn thử nhiều email. Test concurrent failures không vượt ngưỡng do race |
| [ ] C07 | Register/resend/forgot đều rate-limit email và IP kể cả email không tồn tại/active; re-register không vượt resend cooldown |

Dùng số lần đủ chạm ngưỡng ở môi trường thử nghiệm, không gửi hàng loạt tới Google. Adapter test phục vụ các nhánh lỗi; minh chứng provider thành công/dùng lại phải dùng token v2 thật và che giá trị. Register luôn hiện checkbox; login chỉ cần từ ngưỡng server. Lựa chọn reCAPTCHA không cần model câu đố CAPTCHA local; nếu đổi sang thư viện thì phải bổ sung challengeId/đáp án server/phiên/purpose/hạn/usedAt và test khác phiên. Với cặp v2 dùng chung, không tự đánh dấu bằng chứng sai action/cross-form purpose vì provider không cung cấp thuộc tính này.

## 3. Login, session, logout và bảo vệ CRUD

Owner: [login](auth-login-english.md) và [logout](logout-implementation-plan.md); slide 24, 28–36, 52, 54, 60.

| Mã | Kiểm tra cần đạt |
| --- | --- |
| [ ] S01 | GET /dishes, /dishes/:id và mọi /admin: list/detail/new/edit/delete confirmation, POST/PATCH/DELETE thực thể và quan hệ đều 303 /login khi không cookie, pending, expired hoặc revoked; không đọc/ghi dữ liệu CRUD |
| [ ] S02 | Login active đúng: 303, Set-Cookie sid; request kế tiếp Cookie sid nhận diện được user; HttpOnly/SameSite/Secure-production/path/domain đúng |
| [ ] S03 | Email sai/password sai cùng thông báo, giữ email bỏ password; không lộ password/hash trong HTML/log |
| [ ] S04 | sid trước/sau login khác nhau; sid cũ không trở thành authenticated; cookie chỉ có mã ngẫu nhiên, không userId/role |
| [ ] S05 | Dừng tiến trình thật, chạy lại cùng DB, cookie còn hạn vẫn dùng được; kiểm tra row Session bền vững |
| [ ] S06 | POST logout A hủy row trước clear-cookie/303; replay sid A bị 303 /login; session B của cùng user vẫn dùng được |
| [ ] S07 | CSRF thiếu/sai và form từ origin khác bị chặn; bao phủ auth POST và mọi admin mutation, kể cả method override |
| [ ] S08 | Idle/absolute expiration do server kiểm tra; cookie còn nhưng session hết hạn vẫn bị chặn; dọn row hết hạn không thay kiểm tra hạn |
| [ ] S09 | GET logout không mutate; lỗi DB delete không báo thành công; Back/cache không khôi phục quyền trên request mới |

## 4. Quên mật khẩu

Owner: [password reset](auth-password-reset-english.md); slide 39–46, 55, 61.

| Mã | Kiểm tra cần đạt |
| --- | --- |
| [ ] F01 | Forgot email có/không có: cùng 200/nội dung; kiểm tra chênh lệch thời gian rõ và rate limit 429 theo email/IP |
| [ ] F02 | Token sai/hết hạn/đã dùng/bị yêu cầu mới thay thế bị từ chối; password và session không đổi |
| [ ] F03 | GET reset với token hợp lệ chỉ hiện form: usedAt còn null, password/session không đổi; quét/mở lại link không tiêu thụ token; vượt limiter IP chung GET/HEAD/POST → 429, không tiêu thụ token |
| [ ] F04 | POST reset thành công: passwordHash đổi, usedAt có giá trị, token khác bị vô hiệu và tất cả session cũ của user bị hủy; 303 login, không auto-login |
| [ ] F05 | Reset token không được route khác chấp nhận như password/OTP/sid; link dựa trên APP_BASE_URL, production HTTPS, reset page no-referrer |
| [ ] F06 | Hai POST reset đồng thời một thắng; lỗi transaction rollback toàn bộ; concurrent login/reset không để password cũ tạo phiên sống sót |
| [ ] F07 | Reset pending không kích hoạt account; login mới vẫn cần active/password/CAPTCHA và các giới hạn hiện hành |
| [ ] F08 | Có email reset và email báo password đã đổi, không chứa password; token gốc không được trả qua response forgot/log/DB |

## 5. Mã nguồn, dữ liệu demo và bài nộp

| Mã | Slide | Bằng chứng cần có |
| --- | --- | --- |
| [ ] E01 | 16, 49 notes, 57 | Password thư viện Argon2id; OTP/reset chỉ hash; random an toàn; không plaintext secret trong code/log/DB; seed-auth env tạo ít nhất một active có emailVerifiedAt |
| [ ] E02 | 62–63 | Nhóm tự vẽ sơ đồ register+CAPTCHA+OTP, login+brute force, logout, forgot/reset và giải thích cookie/session/store/route/pending/token |
| [ ] E03 | 63 | Mỗi kịch bản có bằng chứng phù hợp: UI, Network, Application Cookies, request HTTP trực tiếp, DB hash/hạn/usedAt/attempts/session/counter. Che password/OTP/sid/reset/CAPTCHA token/key |
| [ ] E04 | 63 | Một lỗi thực tế do agent tạo ra: vị trí code, cách tái hiện, sửa, bằng chứng sau sửa. Không tự tạo lỗi giả để nộp |
| [ ] E05 | 56–57 | README đúng week6, cấu hình/env placeholder không secret, các ngưỡng công bố, file/route thay đổi và cách chạy test rõ ràng |
| [ ] E06 | 48 notes | Phạm vi đúng Restaurant SSR: mọi active user dùng CRUD, role mặc định viewer do server gán; không thêm RBAC/MFA/SPA JWT vào block |

Bằng chứng lưu tại `restaurant/evidence/auth/` khi đã chạy. Với yêu cầu chưa chạy được phải ghi “chưa kiểm chứng” cùng prerequisite; không đánh dấu đủ bài chỉ vì tài liệu/test code đã tồn tại.

## 6. Bổ sung của người dùng — reCAPTCHA v2 cho logout

Phần mở rộng này không được ghi thành yêu cầu có sẵn trong slide. Module logout đã ghép vào nền login/session; vẫn cần nghiệm thu Google v2 và persistent store thật.

- GET /logout/confirm hiện checkbox v2, không hủy phiên; GET /logout vẫn 404.
- POST requireLogin → CSRF → siteverify với key v2 riêng → delete current session → clear cookie → 303 login.
- CAPTCHA sai/dùng lại/thiếu không hủy phiên; provider/config lỗi là lỗi kỹ thuật, không bypass.
- V2 không có action/score; hostname phải khớp cấu hình origin, Google quyết định expiry/single-use.
- Kiểm tra fixture đã có trong tests/auth-logout.test.js và recaptcha-v2.test.js; vẫn cần login/helper thật, key thật, browser và PostgreSQL để hoàn thành S06–S09.
