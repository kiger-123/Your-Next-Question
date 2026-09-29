#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""视觉 QC：数值闸门 + 全片 contact sheet。

为什么要有这个脚本：调色审查不能靠"看起来还行"。上一版 S03/S04 有 15%~22% 的像素
是纯 0（死黑），肉眼在缩略图上完全看不出来。所以把闸门写成可跑的断言。

═══════════ 测量口径（写死，不许各测各的）═══════════
· 采样帧：tools/qc-stills.mjs 出的 4 张事件帧 first/c1/c2/last，逐帧统计后取最差那一帧
· 色彩空间：Rec.709 亮度，输入按满量程(pc)解释 —— 成片是 yuvj420p(pc)，
  所以 ffmpeg 用 scale=in_range=full:in_color_matrix=bt709,format=gray
· 数值域：0–255 的 8-bit 灰阶；下文"IRE%"= value/255×100
· 黑位：1% 分位（不是最小值 —— 单像素噪声会把它打到 0，闸门会假报警）
· 死黑：灰阶 < 3 的像素占比（阈值 0.01% —— 给 h264 编码噪声留位，PNG 上是 0）
· 过曝：灰阶 > 242（95%）的像素占比
═══════════════════════════════════════════════════

闸门按主题分开定（2026-09-27 K3 审查结论）：
· dark 场：管黑位（≥5%）+ 管死黑（0%）+ 管过曝（≤3%，纸面/屏幕一类的大块纯白是缺陷）
· paper 场：管黑位 + 死黑；宣纸白本身就该占两成画面，过曝只报不判
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # 05_render
PROJ = os.path.dirname(ROOT)                                            # 视频
QC = os.path.join(PROJ, "06_output", "qc")
SCENES = os.path.join(PROJ, "06_output", "scenes")
SHEET = os.path.join(PROJ, "06_output", "sheet_all.jpg")
SHEET_STILLS = os.path.join(PROJ, "06_output", "sheet_stills.jpg")
SB = os.path.join(PROJ, "03_storyboard", "ep01.json")

BLACK_PCT_MIN = 5.0    # 暗部不得死黑
CRUSH_MAX = 0.01       # 灰阶<3 的占比上限（%）≈ 92 像素。PNG 上是 0，
                       # 但 h264 编码会留下零星几个 —— 卡 0.0 会让闸门永远不过
HI_DARK_MAX = 3.0      # dark 场灰阶>242 的占比上限（%）；paper 场只报不判
MARKS = ("first", "c1", "c2", "last")
SHEET_MARK = "c2"      # 并排表取"第二条字幕出完"那帧：元素最全
TILE_W, TILE_H = 480, 270
COLS = 4


def storyboard():
    with open(SB, encoding="utf-8") as f:
        d = json.load(f)
    return {s["id"]: s for s in d["shots"]}


def luma(src, t):
    """任一 ffmpeg 可读的输入（mp4 或 png）→ Rec.709 满量程 8-bit 亮度矩阵。"""
    # 不能用 NamedTemporaryFile(delete=False)：Windows 下句柄未关，ffmpeg 写不进去
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "f.raw")
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(t),
             "-i", src, "-frames:v", "1",
             "-vf", "scale=in_range=full:in_color_matrix=bt709,format=gray",
             "-f", "rawvideo", out],
            check=True, capture_output=True,
        )
        return np.frombuffer(open(out, "rb").read(), dtype=np.uint8).reshape(720, 1280)


def event_frames(shot, fps=30):
    """与 tools/qc-stills.mjs 同一套时刻：first/c1/c2/last。
    两种模式（读 PNG / 读成片）必须采同一批帧，否则两边数对不上又变成各测各的。"""
    d = shot["dur_frame"]
    span = lambda c: (c["out_frac"] - c["in_frac"]) * d
    done = lambda c: c["in_frac"] * d
    c1, c2 = shot["captions"][0], shot["captions"][1]
    return {
        "first": 22,   # 与 qc-stills 一致：避开 18 帧淡变
        "c1": round(min(d - 22, done(c1) + span(c1) * 0.72 + 26)),
        "c2": round(min(d - 22, done(c2) + span(c2) * 0.72 + 26)),
        "last": d - 22,
    }


def measure(ids, shots, fps=30, stills=True):
    rows = []
    for i in ids:
        if stills:
            srcs = [(os.path.join(QC, f"{i}_{m}.png"), 0) for m in MARKS]
        else:
            mp4 = os.path.join(SCENES, f"{i}.mp4")
            ef = event_frames(shots[i], fps)
            srcs = None if not os.path.exists(mp4) else [
                (mp4, ef[m] / fps) for m in MARKS]
        srcs = [s for s in (srcs or []) if os.path.exists(s[0])]
        if not srcs:
            rows.append({"id": i, "missing": True})
            continue
        stat = np.stack([luma(p, t).astype(np.float64).ravel() for p, t in srcs])
        p1 = np.percentile(stat, 1, axis=1).min() / 255 * 100
        p10 = np.percentile(stat, 10, axis=1).min() / 255 * 100
        crush = (stat < 3).mean(axis=1).max() * 100
        hi = (stat > 242).mean(axis=1).max() * 100
        mode = shots[i]["mode"]
        ok = p1 >= BLACK_PCT_MIN and crush <= CRUSH_MAX
        if mode == "dark":
            ok = ok and hi <= HI_DARK_MAX
        rows.append({"id": i, "missing": False, "mode": mode, "p1": p1, "p10": p10,
                     "crush": crush, "hi": hi, "ok": ok,
                     "why": ("黑位 %.1f<%s" % (p1, BLACK_PCT_MIN) if p1 < BLACK_PCT_MIN else "")
                            + ("死黑%.3f%%" % crush if crush > CRUSH_MAX else "")
                            + ("过曝%.1f%%" % hi if mode == "dark" and hi > HI_DARK_MAX else "")})
    return rows


def report(rows):
    print("场    主题   黑位1%%   10%%    死黑%%   过曝%%   结论")
    print("-" * 60)
    fails = []
    for r in rows:
        if r["missing"]:
            print(f"{r['id']:<6}{'—':>7}{'—':>9}{'—':>8}{'—':>9}{'—':>9}  缺 QC 帧")
            fails.append(r["id"])
            continue
        print(f"{r['id']:<6}{r['mode']:>7}{r['p1']:>8.1f}{r['p10']:>8.1f}"
              f"{r['crush']:>9.3f}{r['hi']:>9.1f}  {'OK' if r['ok'] else '打回 ' + r['why']}")
        if not r["ok"]:
            fails.append(r["id"])
    print("-" * 60)
    print(f"闸门：黑位≥{BLACK_PCT_MIN}% / 死黑≤{CRUSH_MAX}% / dark 场过曝≤{HI_DARK_MAX}%"
          f"  →  {len(rows) - len(fails)}/{len(rows)} 通过"
          + (f"  不合格：{', '.join(fails)}" if fails else ""))
    return fails


def sheet(ids, shots, from_stills=True):
    """from_stills=True 时用事件帧拼表 —— 改调色不必等 10 分钟整场渲染。"""
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/msyhbd.ttc", 22)
    except OSError:
        font = ImageFont.load_default()
    pad, cap = 10, 30
    canvas = Image.new("RGB", (COLS * TILE_W + (COLS + 1) * pad,
                              ((len(ids) + COLS - 1) // COLS) * (TILE_H + cap)
                              + ((len(ids) + COLS - 1) // COLS + 1) * pad), (16, 16, 18))
    dr = ImageDraw.Draw(canvas)
    with tempfile.TemporaryDirectory() as td:
        for k, i in enumerate(ids):
            still = os.path.join(QC, f"{i}_{SHEET_MARK}.png")
            mp4 = os.path.join(SCENES, f"{i}.mp4")
            cx = pad + (k % COLS) * (TILE_W + pad)
            cy = pad + (k // COLS) * (TILE_H + cap + pad)
            if from_stills and os.path.exists(still):
                p = still
            elif os.path.exists(mp4):
                p = os.path.join(td, f"{i}.png")
                tf = event_frames(shots[i])[SHEET_MARK] / 30
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                                "-ss", str(tf), "-i", mp4, "-frames:v", "1", p],
                               check=True, capture_output=True)
            else:
                dr.rectangle([cx, cy, cx + TILE_W, cy + TILE_H + cap], fill=(60, 0, 60))
                dr.text((cx + 8, cy + 4), f"{i} 缺文件", font=font, fill=(255, 255, 255))
                continue
            im = Image.open(p).convert("RGB").resize((TILE_W, TILE_H), Image.LANCZOS)
            canvas.paste(im, (cx, cy + cap))
            dr.text((cx + 2, cy + 2), f"{i}  {SHEET_MARK}", font=font, fill=(240, 240, 240))
    dst = SHEET_STILLS if from_stills else SHEET
    canvas.save(dst, quality=90)
    print(f"contact sheet → {dst}")


def main():
    # Git Bash 是 UTF-8 而 Windows 控制台默认 GBK，不重配就是一屏乱码
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    shots = storyboard()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    stills = "--stills" in sys.argv
    ids = args or list(shots)
    rows = measure(ids, shots, stills=stills)
    fails = report(rows)
    if len(ids) == len(shots):
        sheet(ids, shots, from_stills=stills)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
