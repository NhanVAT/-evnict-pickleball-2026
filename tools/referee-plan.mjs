// Phân công trọng tài theo lịch cân đối 30/09: trọng tài đứng cố định theo sân.
// TT1-3 là nữ, TT4-6 là nam: nam ưu tiên Đôi Nam, nữ bắt Đôi Nữ (3 nam cho 4 bảng Đôi Nam nên
// bảng D và tứ kết 4 do TT3 bắt). Lượt 1-10: sân → trọng tài theo COURT_REF.
// Lượt 11-15: dồn cho TT2, TT3, TT6 để số trận cân bằng 10-11 người.
//
// Chạy: node tools/referee-plan.mjs > assign.json  rồi nạp bằng
//       MSYS_NO_PATHCONV=1 npx firebase-tools database:set /assign assign.json --project evnict-pickleball

// sân → trọng tài ở lượt 1-10 (Sân thi đấu Nam A, Sân 4 Nam B, Sân 5 Nam C, Sân 6 Nam D, Sân 7 Nữ A, Sân 8 Nữ B)
const COURT_REF = { 1: 4, 2: 5, 3: 6, 4: 3, 5: 1, 6: 2 };

// [lượt][sân] → số thứ tự trọng tài (1-6)
const LATE = {
  11: { 1: 2, 2: 3, 3: 6, 4: 1 },   // TK Nam-Nữ
  12: { 1: 3, 2: 6, 3: 4 },         // CK Nữ (nữ), BK Nam 1, BK Nam 2 (nam)
  13: { 2: 2, 3: 3 },               // BK Nam-Nữ
  14: { 1: 6 },                     // CK Nam (nam)
  15: { 1: 2 },                     // CK Nam-Nữ
};

export function planAssign(t, referees) {
  const uidOf = Object.fromEntries(referees.map(r => [r.id, r.uid]));
  const plan = {};
  for (const m of t.matches) {
    const n = m.round <= 10 ? COURT_REF[m.court] : LATE[m.round]?.[m.court];
    if (!n) throw new Error(`Chưa có trọng tài cho ${m.id} (lượt ${m.round}, sân ${m.court})`);
    plan[m.id] = uidOf[n];
  }
  return plan;
}

if (process.argv[1]?.endsWith('referee-plan.mjs')) {
  const { readFileSync } = await import('node:fs');
  const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  process.stdout.write(JSON.stringify(planAssign(read('../public/data/tournament.json'), read('../public/data/referees.json'))));
}
