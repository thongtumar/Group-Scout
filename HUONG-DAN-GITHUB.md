# Đưa GroupScout lên GitHub

## 1. Tải mã nguồn lên

1. Giải nén `groupscout-source.zip`.
2. Vào GitHub → **New repository**, đặt tên (ví dụ `groupscout`), chọn **Private** nếu muốn chỉ mình bạn truy cập source.
3. Mở repository → **Add file → Upload files**.
4. Kéo nội dung bên trong thư mục `groupscout-source` lên (không tải nguyên file ZIP). Đảm bảo thấy `dist/`, `tests/`, `package.json`, `README.md` ở cấp đầu của repository.
5. Chọn **Commit changes**. Nếu giao diện kéo thả bỏ qua `.gitignore`, bạn có thể tạo riêng bằng **Add file → Create new file**.

Việc tải source lên repository không tự xuất bản website. Web app đang dùng trên Sites vẫn giữ nguyên.

## 2. Chạy trên máy tính

Cần Python 3 để chạy máy chủ tĩnh:

```sh
cd groupscout-source
python -m http.server 4173 --directory dist
```

Trên Windows có thể thay `python` bằng `py`. Mở `http://localhost:4173` trong trình duyệt. Dừng máy chủ bằng Ctrl+C.

Không cần cài thư viện JavaScript hoặc chạy build. Thư mục chứa website là `dist/`.

## 3. Kiểm thử

Cài Node.js 20 trở lên rồi chạy:

```sh
npm test
```

Các bài kiểm thử trình duyệt trong `tests/browser_*.py` được dùng trong môi trường Linux, yêu cầu Python Playwright, Chromium tại `/usr/bin/chromium` và cần điều chỉnh đường dẫn `/workspace/sites/group-scout` nếu chạy trên máy khác. Kiểm thử logic bằng `npm test` không có các yêu cầu này.

## 4. Dữ liệu của bạn

Source không chứa các nhóm hay phản hồi bạn đã nhập trong trình duyệt. Để chuyển dữ liệu sang địa chỉ web mới:

1. Trong app cũ, vào **Kế hoạch 500 mẫu → Xuất bản sao JSON**.
2. Mở app ở địa chỉ mới → **Nhập bản sao** và chọn tệp đó.

Bản nháp trên tab nằm riêng với dữ liệu đã xác nhận; hãy lưu các biểu mẫu đang sửa và sao chép bài đang soạn trước khi chuyển.

## 5. Cấu hình hosting

Tệp `.openai/hosting.example.json` chỉ là mẫu cấu hình phục vụ thư mục `dist`. Mã định danh của Site hiện tại và lịch sử Git không được đưa vào ZIP. Không đổi cấu hình Site đang chạy chỉ để đưa source lên GitHub.

Trên Netlify, tệp `netlify.toml` khai báo thư mục xuất bản là `dist` nên trang chủ hiển thị đúng thay vì lỗi 404. Mỗi lần đẩy thay đổi lên nhánh `main`, Netlify tự deploy lại. Nếu một lần deploy bị bỏ qua (ví dụ do tài khoản hết credit), sau khi khắc phục hãy vào **Deploys → Trigger deploy → Deploy project** để xuất bản lại.

Tham khảo `README.md` để biết cấu trúc, tính năng và giới hạn dữ liệu.
