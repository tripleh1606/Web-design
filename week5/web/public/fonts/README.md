# Font dùng trong Soucha

Kodchasan được lấy từ [Google Fonts — ofl/kodchasan](https://github.com/google/fonts/tree/main/ofl/kodchasan), cùng font đã dùng trong `week3/restaurant/public/style.css`.

Project giữ các file Regular (400), Medium (500), SemiBold (600), Bold (700), bao gồm bộ ký tự tiếng Việt; [metadata chính thức](https://github.com/google/fonts/blob/main/ofl/kodchasan/METADATA.pb) khai báo subset `vietnamese`. Giấy phép SIL Open Font License nằm ở `OFL.txt`.

Các file được phục vụ từ `/fonts/` trên cùng origin với SPA, không gọi Google Fonts khi mở trang. Tiêu đề, nội dung, form và select dùng chung family Kodchasan để tránh rơi sang font serif khác cho dấu tiếng Việt. `web/index.html` khai báo UTF-8 và web server gửi charset UTF-8 cho nội dung text.

Browser test kiểm tra font thật được Chrome dùng để vẽ một chuỗi ký tự tiếng Việt bằng `CSS.getPlatformFontsForNode`, không chỉ kiểm tra tên trong CSS.
