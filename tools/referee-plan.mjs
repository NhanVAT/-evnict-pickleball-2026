// Phân công trọng tài theo lịch cân đối 30/09: trọng tài đứng cố định theo sân.
// Lượt 1-10: sân k → TTk (bảng nào ở sân đó thì trọng tài sân đó bắt trọn bảng).
// Lượt 11-15: dồn cho TT3, TT4, TT6 để TT1, TT2, TT5 (đã bắt liền lượt 1-10) được nghỉ.
//
// Chạy: node tools/referee-plan.mjs > assign.json  rồi nạp bằng
//       npx firebase-tools database:set /assign assign.json --project evnict-pickleball

// [lượt][sân] → số thứ tự trọng tài (1-6)
const LATE = {
  11: { 1: 3, 2: 4, 3: 5, 4: 6 },   // TK Nam-Nữ
  12: { 1: 4, 2: 6, 3: 1 },         // CK Nữ, BK Nam 1, BK Nam 2
  13: { 2: 3, 3: 2 },               // BK Nam-Nữ
  14: { 1: 3 },                     // CK Nam
  15: { 1: 6 },                     // CK Nam-Nữ
};

export function planAssign(t, referees) {
  const uidOf = Object.fromEntries(referees.map(r => [r.id, r.uid]));
  const plan = {};
  for (const m of t.matches) {
    const n = m.round <= 10 ? m.court : LATE[m.round]?.[m.court];
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
