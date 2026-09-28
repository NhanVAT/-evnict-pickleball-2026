// Cấu hình web Firebase: công khai theo thiết kế, bảo mật nằm ở database.rules.json.
// apiKey để trống thì trang tự chạy chế độ thử (dữ liệu chỉ lưu trong trình duyệt).
export const FIREBASE_SDK = '10.12.2';
// Tài khoản BTC toàn quyền; trọng tài chỉ nhập được trận được giao (xem database.rules.json)
export const ADMIN_UID = 'vRU5cNvtbEVdBlJOzi1EBHFHwSo2';
export const firebaseConfig = {
  apiKey: 'AIzaSyDiw1_kmaSTwMf67TdLHDvH2pGsqitgVaQ',
  authDomain: 'evnict-pickleball.firebaseapp.com',
  databaseURL: 'https://evnict-pickleball-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'evnict-pickleball',
  appId: '1:416639113247:web:6f2f0b6fe7aaa117acdd2a',
};
