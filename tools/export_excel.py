"""Sinh public/data/tournament.json từ file Excel danh sách thi đấu chính thức.

Cách chạy: python tools/export_excel.py <file.xlsx> <out.json>
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROUND_TIMES = {1: "07:00", 2: "07:18", 3: "07:36", 4: "07:54", 5: "08:12", 6: "08:30",
               7: "08:53", 8: "09:11", 9: "09:29",
               10: "09:52", 11: "10:17", 12: "10:42", 13: "11:07", 14: "11:32"}
EVENTS = [("MD", "Đôi Nam", "Đôi Nam"), ("XD", "Đôi Nam - Nữ", "Đôi Nam-Nữ"), ("WD", "Đôi Nữ", "Đôi Nữ")]


def g(group, rank):
    return {"group": group, "rank": rank}


def w(match_id):
    return {"winner": match_id}


def four_group_knockout(ev, qf_round, sf_round, f_round, f_court):
    return [
        (f"{ev}-QF1", "QF", "Tứ kết 1", qf_round, 1, g("A", 1), g("B", 2)),
        (f"{ev}-QF2", "QF", "Tứ kết 2", qf_round, 2, g("C", 1), g("D", 2)),
        (f"{ev}-QF3", "QF", "Tứ kết 3", qf_round, 3, g("B", 1), g("A", 2)),
        (f"{ev}-QF4", "QF", "Tứ kết 4", qf_round, 4, g("D", 1), g("C", 2)),
        (f"{ev}-SF1", "SF", "Bán kết 1", sf_round, 1, w(f"{ev}-QF1"), w(f"{ev}-QF2")),
        (f"{ev}-SF2", "SF", "Bán kết 2", sf_round, 2, w(f"{ev}-QF3"), w(f"{ev}-QF4")),
        (f"{ev}-F", "F", "Chung kết", f_round, f_court, w(f"{ev}-SF1"), w(f"{ev}-SF2")),
    ]


# Lượt và sân theo Điều lệ v7, Mục IV.3; cặp đấu theo công thức sheet Excel.
KNOCKOUT = {
    "MD": four_group_knockout("MD", 10, 11, 13, 3),
    "XD": four_group_knockout("XD", 12, 13, 14, 1),
    "WD": [
        ("WD-SF1", "SF", "Bán kết 1", 10, 5, g("A", 1), g("B", 2)),
        ("WD-SF2", "SF", "Bán kết 2", 10, 6, g("B", 1), g("A", 2)),
        ("WD-F", "F", "Chung kết", 11, 3, w("WD-SF1"), w("WD-SF2")),
    ],
}


def read_event(ws, ev_id, name):
    teams, groups, matches = {}, {}, []
    in_schedule = False
    for row in ws.iter_rows(values_only=True):
        a = row[0]
        if not in_schedule and isinstance(a, str) and re.fullmatch(r"[A-D][1-4]", a) and row[2] and row[3]:
            teams[a] = [row[2].strip(), row[3].strip()]
            groups.setdefault(row[1], []).append(a)
        elif a == "Lượt" and row[1] == "Sân":
            in_schedule = True
        elif in_schedule and isinstance(a, (int, float)):
            matches.append({
                "id": f"{ev_id}-G{len(matches) + 1:02d}", "event": ev_id, "stage": "G",
                "label": f"Bảng {row[2]}", "group": row[2], "round": int(a),
                "court": int(str(row[1]).replace("Sân", "").strip()), "t1": row[3], "t2": row[8],
            })
        elif in_schedule and matches and a is None:
            break  # hết khối lịch vòng bảng
    for mid, stage, label, rnd, court, s1, s2 in KNOCKOUT[ev_id]:
        matches.append({"id": mid, "event": ev_id, "stage": stage, "label": label,
                        "round": rnd, "court": court, "src1": s1, "src2": s2})
    return {"id": ev_id, "name": name, "groups": groups, "teams": teams}, matches


def main(src, out):
    wb = openpyxl.load_workbook(src)
    events, matches = [], []
    for ev_id, name, sheet in EVENTS:
        ev, ms = read_event(wb[sheet], ev_id, name)
        events.append(ev)
        matches += ms
    data = {
        "title": "Giải Pickleball EVNICT 2026", "subtitle": "Giải thể thao thường niên EVNICT 2026",
        "date": "2026-10-04", "dateText": "Chủ nhật, 04/10/2026", "venue": "Hà Nội",
        "hours": "7h00 – 12h00", "courts": 6, "endTime": "11:57",
        "rounds": {str(k): v for k, v in ROUND_TIMES.items()},
        "events": events, "matches": matches,
    }
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(matches)} trận, {sum(len(e['teams']) for e in events)} cặp -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
