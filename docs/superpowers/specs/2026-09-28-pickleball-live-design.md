# Spec: Trang web trực tiếp Giải Pickleball EVNICT 2026

Ngày viết: 28/09/2026 · Hạn chạy thật: sáng Chủ nhật 04/10/2026, 7h00

## 1. Mục tiêu

Thay Google Sheets bằng một trang web công khai, đẹp, xem tốt trên điện thoại, để:

- VĐV xem lịch thi đấu, bảng xếp hạng, sơ đồ nhánh loại trực tiếp.
- Admin (BTC) nhập tỷ số trong lúc thi đấu; người xem thấy cập nhật ngay (≈1 giây), không cần tải lại trang.

Tiêu chí thành công:

1. Truy cập được tại `https://evnict-pickleball.web.app` từ mạng 4G bất kỳ.
2. Admin nhập tỷ số trên điện thoại, trang người xem ở máy khác cập nhật trong ≤ 3 giây.
3. Bảng xếp hạng và nhánh đấu cho kết quả giống hệt file Excel chính thức với cùng bộ tỷ số.
4. Người không đăng nhập không thể ghi dữ liệu (kiểm bằng luật bảo mật Firebase).

Ngoài phạm vi (YAGNI): nhiều tài khoản admin phân quyền, thông báo đẩy, lịch sử chỉnh sửa, đa giải, đa ngôn ngữ, tự sắp xếp lại lịch khi trễ giờ.

## 2. Dữ liệu nguồn

Nguồn: `Danh sách thi đấu chính thức Pickerball giải thể thao thường niên EVNICT 2026.xlsx` (bản 28/09) và Điều lệ v7.

| Nội dung | Mã | Số cặp | Bảng | Trận vòng bảng | Loại trực tiếp |
|---|---|---|---|---|---|
| Đôi Nam | `MD` | 14 | A(4) B(4) C(3) D(3) | 18 | TK1–4, BK1–2, CK |
| Đôi Nam - Nữ | `XD` | 14 | A(4) B(4) C(3) D(3) | 18 | TK1–4, BK1–2, CK |
| Đôi Nữ | `WD` | 7 | A(4) B(3) | 9 | BK1–2, CK |

Tổng 62 trận: 45 vòng bảng (chạm 11) + 17 loại trực tiếp (chạm 15). Chạm 9 nếu áp dụng điều khoản dự phòng sau 10h00; web không cần biết số chạm, chỉ ghi tỷ số.

Ghép cặp loại trực tiếp (theo công thức Excel):

- 4 bảng: TK1 = Nhất A – Nhì B, TK2 = Nhất C – Nhì D, TK3 = Nhất B – Nhì A, TK4 = Nhất D – Nhì C; BK1 = thắng TK1 – thắng TK2; BK2 = thắng TK3 – thắng TK4; CK = thắng BK1 – thắng BK2.
- Đôi Nữ: BK1 = Nhất A – Nhì B, BK2 = Nhất B – Nhì A; CK = thắng BK1 – thắng BK2.
- Kết quả chung cuộc: Vô địch, Hạng nhì, Đồng hạng ba (2 đội thua bán kết).

Giờ dự kiến theo lượt (Điều lệ v7): lượt 1–6 bắt đầu 7h00 + 18 phút/lượt (7h00, 7h18, 7h36, 7h54, 8h12, 8h30); lượt 7–9: 8h53, 9h11, 9h29; lượt 10–14 (25 phút/lượt): 9h52, 10h17, 10h42, 11h07, 11h32; kết thúc dự kiến 11h57.

Sân các trận loại trực tiếp: lượt 10 — TK Đôi Nam sân 1–4, BK Đôi Nữ sân 5–6; lượt 11 — BK Đôi Nam sân 1–2, CK Đôi Nữ sân 3; lượt 12 — TK Nam-Nữ sân 1–4; lượt 13 — BK Nam-Nữ sân 1–2, CK Đôi Nam sân 3; lượt 14 — CK Nam-Nữ sân 1.

## 3. Kiến trúc

```
GitHub repo (web/)  --push-->  GitHub Actions  --deploy-->  Firebase Hosting (evnict-pickleball.web.app)
                                                                 |
Trình duyệt người xem / admin  <---- realtime ---->  Firebase Realtime Database (chỉ lưu tỷ số)
```

- Trang tĩnh HTML/CSS/JS thuần (ES modules), không bước build. Firebase JS SDK v10+ nạp qua CDN `gstatic.com`.
- **Dữ liệu cố định** (`public/data/tournament.json`) sinh một lần từ Excel bằng `tools/export_excel.py`: các cặp (mã, bảng, tên 2 VĐV), các trận (id, nội dung, vòng, bảng, lượt, sân, giờ, mã đội 1/2 hoặc nguồn "nhất bảng A"/"thắng TK1").
- **Dữ liệu động** trên Realtime Database — chỉ tỷ số và ghi đè thứ hạng:

```
/scores/{matchId}      = { s1: number, s2: number, status: "live" | "done", updatedAt: timestamp }
/overrides/{event}/{group} = ["A2", "A1", ...]   // thứ tự hạng BTC chọn tay khi hòa chỉ số
```

  Trận không có bản ghi = chưa đấu. `matchId` dạng `MD-G-01`, `MD-QF1`, `WD-SF2`, `XD-F`.

- **Mọi thứ còn lại tính ở trình duyệt** bằng module thuần `public/js/engine.js`: bảng xếp hạng, đội vào vòng loại trực tiếp, nhánh đấu, kết quả chung cuộc. Chỉ trận `status = "done"` mới tính.

### Luật xếp hạng (khớp Excel)

Mỗi đội: Trận, Thắng, Thua, Điểm (thắng ×3), Ghi, Thủng, Hiệu số. Sắp xếp giảm dần theo Điểm → Hiệu số → Ghi. Nếu còn hòa hoàn toàn và có `overrides` cho bảng đó, dùng thứ tự override; nếu không, giữ thứ tự mã vị trí và đánh dấu "cần BTC xử" trên trang admin.

Một bảng được coi là **xong** khi mọi trận của bảng có `status = "done"`. Chỉ khi bảng xong (và không hòa hoàn toàn chỉ số chưa được BTC chốt) mới điền đội vào vòng loại trực tiếp; trước đó ô hiển thị nguồn, ví dụ "Nhất bảng A", "Thắng Tứ kết 1".

Trang admin liệt kê các bảng đã xong có đội **bằng điểm** ở ranh giới nhất/nhì hoặc nhì/ba để BTC kiểm lại theo Điều lệ III.3 (hiệu số trong nhóm, đối đầu) và chốt tay nếu thứ tự khác với cách tính của Excel; chỉ trường hợp hòa hoàn toàn chỉ số mới chặn nhánh đấu.

Tỷ số hòa không hợp lệ: admin không bấm được "Kết thúc" khi s1 = s2.

## 4. Giao diện

Thiết kế cho điện thoại trước (360px), vẫn đẹp trên màn hình lớn; hỗ trợ sáng/tối theo hệ thống. Một trang (`index.html`) với các tab:

1. **Trang chủ** — tên giải, ngày 04/10/2026, Hà Nội, 6 sân, 7h00–12h00; khối **Đang diễn ra** (trận `live`, tỷ số nhảy realtime, sân); khối **Lượt tiếp theo**; khi xong CK hiện bục vinh quang 3 nội dung.
2. **Lịch thi đấu** — nhóm theo lượt, kèm giờ và sân; lọc theo nội dung; ô **tìm tên VĐV** (bỏ dấu khi so khớp) để tô các trận của người đó.
3. **Bảng xếp hạng** — chọn nội dung → các bảng; hai đội đầu bảng tô nổi; ghi "Bảng đã xong" / "Còn N trận".
4. **Nhánh đấu** — sơ đồ TK → BK → CK từng nội dung; đội thắng in đậm; kết quả chung cuộc bên dưới.

Trang **admin** (`admin.html`):

- Đăng nhập Firebase Auth email/mật khẩu (một tài khoản chung BTC).
- Danh sách trận theo lượt, lọc nội dung/lượt; mỗi trận có nút **+ / −** to cho từng đội, nút **Bắt đầu** (status → live), **Kết thúc** (status → done), **Mở lại** (done → live), **Xóa tỷ số**.
- Khu **Xử hòa**: bảng nào đã xong mà hòa hoàn toàn thì hiện cho BTC kéo/chọn thứ tự hạng → ghi `/overrides`.
- Hiển thị trạng thái kết nối (Firebase `.info/connected`) để admin biết khi mất mạng; ghi offline được Firebase tự đồng bộ lại.

## 5. Bảo mật

Luật Realtime Database:

```json
{
  "rules": {
    ".read": true,
    "scores":    { "$m": { ".write": "auth != null && auth.uid === '<ADMIN_UID>'" } },
    "overrides": { ".write": "auth != null && auth.uid === '<ADMIN_UID>'" }
  }
}
```

Thêm kiểm tra kiểu dữ liệu (`s1`, `s2` là số 0–99, `status` thuộc tập cho phép). Firebase web config (apiKey…) là công khai theo thiết kế, được commit vào repo; bảo mật nằm ở luật trên. Mật khẩu admin không bao giờ vào repo. Trang có `<meta name="robots" content="noindex">` để không lên Google.

Repo chỉ chứa thư mục `web/`; không đưa file docx/xlsx gốc, thư mục "Thanh toán" hay tài liệu nội bộ nào khác lên GitHub.

## 6. Triển khai

- Firebase Hosting, thư mục `public/`; `firebase.json` + `database.rules.json` trong repo.
- Deploy bằng Firebase CLI từ máy (`npm run deploy`, deploy cả hosting lẫn luật database). GitHub giữ mã nguồn. (Đã bỏ GitHub Actions: cần service account key và thêm bước cấu hình, không đáng với 6 ngày còn lại; có thể thêm sau giải.)
- Việc người dùng tự làm (cần đăng nhập tài khoản của họ): tạo project Firebase `evnict-pickleball`, bật Realtime Database + Auth email, tạo tài khoản admin, `firebase login`, tạo repo GitHub trống. Có hướng dẫn từng bước trong `README.md`.

## 7. Kiểm thử

- `node --test`: kiểm `engine.js` — xếp hạng, xác định bảng xong, điền nhánh, kết quả chung cuộc; ít nhất một bộ tỷ số giả được đối chiếu với kết quả Excel tính ra (điền cùng tỷ số vào bản sao Excel, tính lại bằng LibreOffice/Excel, so sánh).
- Kiểm `tournament.json`: đủ 62 trận, 35 cặp, mỗi cặp vòng bảng gặp đủ đối thủ trong bảng, không VĐV nào đấu 2 trận cùng lượt.
- Kiểm luật bảo mật: ghi khi chưa đăng nhập phải bị từ chối.
- Chạy thử đầu-cuối trên trình duyệt: admin nhập vài trận, trang người xem ở tab khác cập nhật; kiểm giao diện ở 360px.
- Tổng duyệt trước ngày thi đấu, xóa sạch `/scores` và `/overrides` trước 7h00 ngày 04/10.
