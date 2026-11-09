# So sánh filter, sort và cách tải dữ liệu

## Hai quyết định riêng

- **Xử lý ở đâu?** Server/database hay JavaScript trong browser.
- **Tải bao nhiêu?** Toàn bộ tập dữ liệu cần dùng hay từng trang/đợt.

Nhiều tiêu chí filter không bắt buộc phải xử lý ở server. Lựa chọn phụ thuộc lượng dữ liệu, độ cập nhật cần thiết và phạm vi muốn áp dụng: toàn bộ kết quả hay chỉ phần đã tải.

## Các phương án

| Phương án | Cách tải | Ưu điểm | Hạn chế / phù hợp |
| --- | --- | --- | --- |
| Server lọc + sort + phân trang | Mỗi request trả một trang kết quả | Nhẹ cho browser; đúng thứ tự và điều kiện trên toàn bộ database | Đổi điều kiện/chuyển trang thường cần request; phù hợp danh sách lớn hoặc thường thay đổi |
| Server lọc + sort, trả hết kết quả phù hợp | Tải toàn bộ kết quả của bộ điều kiện hiện tại | Đúng trên toàn bộ kết quả; client chuyển trang ngay sau khi tải xong | Kết quả lớn vẫn tải nặng; đổi bộ điều kiện thường phải tải lại |
| Client lọc + sort + phân trang | Tải đủ toàn bộ tập được phép xem một lần | Đổi điều kiện/sort/chuyển trang nhanh, ít request tiếp theo | Lần đầu tải nặng, tốn RAM; dữ liệu giữ tại browser có thể cũ; phù hợp tập nhỏ, ít thay đổi |
| Client lọc + sort trên các đợt đã tải | Chỉ tải từng đợt rồi xử lý phần đang giữ | Phản hồi cục bộ nhanh | Chỉ đúng trong phần đã tải; không được gọi là lọc/sort toàn bộ database |

**Ví dụ:** Browser mới có 10 trong 1.000 món. Món rẻ nhất nằm ở trang chưa tải. Sort 10 món tại client không thể đưa món đó lên đầu toàn bộ danh sách. Muốn sort toàn bộ: server thực hiện trước phân trang, hoặc client phải tải đủ tập cần xử lý.

## Week5 hiện đang dùng phương án nào?

**Server lọc, sort và phân trang; client tải từng đợt.** Luồng logic:

```text
Client gửi điều kiện + sort + page/pageSize
→ Server validate
→ Database lọc các điều kiện bằng AND trên toàn bộ tập
→ Sắp xếp kết quả, dùng id làm thứ tự phụ khi bằng nhau
→ Lấy trang bằng LIMIT/OFFSET
→ Trả items + total + page + pageSize
→ Client hiển thị hoặc nối thêm món
```

`total` đếm cùng bộ điều kiện, không phải số món của một trang. Số trang thay danh sách; Tải thêm/Cuộn liên tục nối danh sách. Hai kiểu nối có thể tải trước tối đa một trang để giảm chờ, **không tải hết database một lần**. Client không sort lại tập món đang giữ để giả làm sort toàn bộ kết quả.

Đổi từ khóa/filter/sort thì về trang 1, bỏ bộ đệm cũ và hủy request cũ. Giữ toàn bộ điều kiện trên URL khi chuyển trang. Lọc/sort chỉ đổi tập hiển thị, không sửa dữ liệu database.

**Lựa chọn cho week5:** giữ phương án hiện tại để giới hạn lượng tải và xử lý đúng phạm vi toàn bộ kết quả. Nếu chuyển sang client-side, cần bảo đảm tải đủ tập cần dùng và công bố chính sách cập nhật dữ liệu.

Code đối chiếu: [truy vấn server](../api/src/pagination.js), [UI và tải trước](../web/src/menu-pagination.js).
