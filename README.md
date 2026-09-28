# Giải Pickleball EVNICT 2026: trang tỷ số trực tiếp

Trang công khai cho vận động viên xem lịch đấu, bảng xếp hạng, nhánh loại trực tiếp; Ban tổ chức nhập tỷ số ở `/admin`, người xem thấy ngay không cần tải lại.

- Trang tĩnh HTML/CSS/JS trong `public/`, không cần build.
- `public/data/tournament.json`: danh sách cặp và 62 trận, sinh từ file Excel chính thức.
- Firebase Realtime Database chỉ lưu tỷ số (`/scores`) và thứ hạng BTC chốt tay (`/overrides`). Bảng xếp hạng, nhánh đấu, kết quả chung cuộc tính ở trình duyệt (`public/js/engine.js`), khớp công thức Excel (xem `tests/excel-crosscheck.test.mjs`).

## Chạy thử trên máy

```bash
npm test            # kiểm dữ liệu, engine, đối chiếu Excel
npm run serve       # http://localhost:5173/?demo  và  http://localhost:5173/admin?demo
```

`?demo` (hoặc khi `public/js/firebase-config.js` chưa có `apiKey`) là chế độ thử: dữ liệu lưu trong trình duyệt, đăng nhập admin bằng email bất kỳ.

## Cập nhật khi danh sách thay đổi

Sửa file Excel ở thư mục cha, rồi:

```bash
npm run export      # sinh lại public/data/tournament.json
npm test
npm run deploy
```

Muốn đối chiếu lại với công thức Excel (cần Excel trên Windows):

```powershell
./tools/excel_crosscheck.ps1 -Xlsx "../Danh sách thi đấu chính thức Pickerball giải thể thao thường niên EVNICT 2026.xlsx" -ScoresJson tests/fixtures/scores-md.json -OutJson tests/fixtures/excel-md.json
```

## Cài Firebase lần đầu

1. https://console.firebase.google.com → **Add project**, tên `evnict-pickleball`, không cần Google Analytics.
2. **Build → Realtime Database → Create database**, vị trí *Singapore (asia-southeast1)*, chọn *locked mode*.
3. **Build → Authentication → Get started → Sign-in method**, bật *Email/Password*.
4. **Authentication → Users → Add user**: email và mật khẩu của BTC. Copy **User UID**.
5. **Project settings → General → Your apps → Web (`</>`)**: đăng ký app, copy khối `firebaseConfig` dán vào `public/js/firebase-config.js`.
6. Thay `__ADMIN_UID__` trong `database.rules.json` bằng UID ở bước 4; sửa `.firebaserc` nếu Project ID khác `evnict-pickleball`.
7. `npx firebase-tools login`, rồi `npm run deploy`.

Trang: `https://<project-id>.web.app`, admin: `https://<project-id>.web.app/admin`.

## Ngày thi đấu

- Trước 7h00: Firebase console → Realtime Database → xóa node `scores` và `overrides` (dữ liệu tổng duyệt).
- Admin: chọn trận → **Bắt đầu trận** → bấm **+/−** theo từng điểm → **Kết thúc trận**. Trận chỉ tính vào bảng xếp hạng sau khi bấm Kết thúc; không kết thúc được khi tỷ số đang hòa.
- Bị xử thua (vắng mặt): nhập 0–11 (vòng bảng) hoặc 0–15 (loại trực tiếp) rồi Kết thúc.
- Bảng có đội bằng điểm sẽ hiện ở mục **Xử lý bằng điểm**: kiểm theo Điều lệ III.3, sắp lại thứ tự nếu cần và bấm **Chốt thứ tự này**. Bằng mọi chỉ số thì nhánh đấu chờ tới khi BTC chốt.
- Mất mạng: badge chuyển đỏ, cứ bấm tiếp; tỷ số tự gửi khi có mạng lại.
