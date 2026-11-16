# Đối chiếu ba UI với HTML bài giảng

Nguồn đối chiếu: `D:\User_C_BackUp\Download\Tìm kiếm và phân trang.html`, tiêu đề “Tìm kiếm và phân trang”, slide 9–15, 34–35, 39–40 và speaker notes tương ứng. HTML là tài liệu yêu cầu; không thực thi script hoặc thay đổi file nguồn đó.

## Backend vừa làm có đúng không?

**Đúng cho phần phân trang.** Slide 11 ghi “Ba UI dùng cùng API phân trang”. Số trang, Load More và Infinite Scroll là ba cách hiển thị/yêu cầu phần tiếp theo, không bắt buộc ba route hay ba thuật toán backend khác nhau. Endpoint `GET /api/dishes/paged` có thể phục vụ cả ba.

| Yêu cầu HTML | Cách thực hiện |
| --- | --- |
| Slide 9: `data` có `items`, `total`, `page`, `pageSize`; `error: null` | Backend trả đúng envelope và metadata |
| Slide 10: positive integer, giới hạn pageSize, business error HTTP 200 | Server validate query; mặc định 1/10, pageSize tối đa 100 |
| Trang vượt phạm vi vẫn thành công | Giữ page được yêu cầu, trả `items: []` cùng `total` thực tế |
| Thứ tự xác định, count cùng điều kiện | Cùng predicate cho count và items; thứ tự phụ `id ASC`; một câu SQL và cùng snapshot |
| Slide 35: nhóm chọn server/client và HTML/AJAX | Chọn server pagination + AJAX trong SPA; database chạy LIMIT/OFFSET |
| Filter/sort cần đúng phạm vi công bố | Chạy trên toàn bộ tập phù hợp tại server rồi mới phân trang |

Không cần sửa thuật toán backend để có ba UI. Phần thiếu sau lần làm backend là các hành vi tại browser bên dưới; chúng đã được nối vào API mới.

## Frontend đã triển khai

| Yêu cầu HTML | Hành vi của week5 |
| --- | --- |
| Slide 34: Số trang thay danh sách | Chọn trang gửi request mới; thay toàn bộ cards; có trước/sau, trang hiện tại và dấu … |
| Slide 12: Load More giữ danh sách, pending/end/nextPage | Nối cards, khóa nút khi pending, chỉ tăng nextPage sau thành công, dừng theo metadata hoặc trang rỗng |
| Lỗi tải tiếp giữ danh sách và trang cần thử lại | Hiện lỗi và nút Thử tải lại; không xóa cards cũ và không bỏ qua trang bị lỗi |
| Slide 13: Infinite Scroll dùng sentinel cuối danh sách | IntersectionObserver với rootMargin 200px, gọi chung hàm tải với nút Tải thêm |
| Sentinel vẫn trong viewport sau khi nối | Kiểm tra lại bằng requestAnimationFrame; tải tiếp tuần tự, luôn kiểm tra pending/end |
| Rời trang phải disconnect | AbortController hủy request, disconnect observer và hủy frame đang chờ |
| Slide 14–15: URL, Reload, Back/Forward | URL giữ `view`, `page`, `pageSize`, `q`, category, giá, available và sort |
| Đổi từ khóa/filter/sort bắt đầu từ đầu | page trở về 1; route mới có closure/state mới, abort response cũ |
| Không trộn kết quả hai lần tìm | Chỉ chấp nhận response khi signal của trang hiện tại chưa bị abort |
| Công bố cách mở lại link ở UI nối danh sách | Load More/Infinite Scroll tải lại từ page 1; giữ điều kiện và kiểu xem; chính sách hiện ngay dưới thanh chọn chế độ |
| Kết thúc cả khi trang cuối đủ pageSize | Dùng `page * pageSize >= total`, không chỉ nhìn items.length |

## Cách mở ba UI

```text
http://localhost:5173/dishes?view=pages&page=2&pageSize=12
http://localhost:5173/dishes?view=more&pageSize=12
http://localhost:5173/dishes?view=infinite&pageSize=12
```

Thanh chọn kiểu xem nằm trên danh sách. Đổi kiểu xem giữ filter/sort và bắt đầu lại từ đầu. UI mặc định 12 món/lượt; có lựa chọn 12/24/36/48/96, đều chia hết cho 4 và tối thiểu 12. Kích thước tùy chỉnh hợp lệ từ URL được làm tròn lên bội số 4, tối thiểu 12, và hiển thị đúng trong select; đổi kích thước trở về trang 1, giữ điều kiện. API vẫn nhận 1–100 để giữ hợp đồng cũ. Trong Infinite Scroll vẫn có nút Tải thêm cho thao tác bàn phím hoặc trường hợp browser không có observer.

## Kiểm chứng và lỗi đã sửa

```powershell
npm test
npm run test:pagination:browser
npm run test:browser
npm run test:pagination:live
```

`pagination-browser.js` dùng database test riêng và Chrome thật để kiểm tra URL/Reload/copy link, phân trang không reload document, pending chống gửi trùng, retry cùng trang, response cũ, cuộn hết danh sách, tự lấp viewport ngắn và bố cục mobile. Ảnh và kết quả JSON nằm trong `tests/results/` (gitignored). `test:pagination:live` chỉ đọc Supabase.

Theo yêu cầu bố cục 4 cột, URL cũ có pageSize=10 được chuẩn hóa thành 12 và trở về trang 1, giữ các bộ lọc. Browser kiểm tra tất cả option đều chia hết cho 4, tối thiểu 12; đồng thời giữ được kích thước tùy chỉnh 16 từ URL. Viewport cao vẫn tự tải tuần tự nếu lượt đầu chưa lấp đầy, không gửi trùng trang.

Phạm vi chính của tài liệu này là ba UI phân trang. Week5 có `mode=fulltext` tìm trên tên + mô tả và xếp hạng; UI mặc định `mode=smart` thêm chịu lỗi gõ trong tên món. Cả hai dùng được với ba UI; xem [full-text-search.md](./full-text-search.md). Các điều kiện category/giá/available kết hợp AND với tìm kiếm. Chưa có mode advanced riêng; không tuyên bố đã hoàn thành toàn bộ các chế độ search của bài giảng.
