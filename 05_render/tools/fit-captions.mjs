#!/usr/bin/env node
// 让字幕停留时间跟着旁白走 —— 一次算清，改文案后重跑即可。
// 用法: node tools/fit-captions.mjs [--go]
//
// 为什么要它：字幕的 in_frac/out_frac 是照原片节奏拍的，而每句语音时长是 TTS 实测出来的，
// 两边本来就会错开。手工一条条改，下次改文案又得重来一遍。
// 规则（尽量不动原骨架）：
//   1. 起点不动（除非装不下）；
//   2. 终点先扩到盖住语音（语音结束后留 4 帧读尾）；
//   3. 扩不过去就整条后移，让下一条让位；
//   4. 还装不下就报出来 —— 那是文案太长，得改字或者加时长，脚本不替创作做主。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const SB = path.join(PROJ, '03_storyboard', 'ep01.json');
const TL = path.join(PROJ, '03_storyboard', 'timeline.json');
const FPS = 30;
const LEAD = 6;    // 与 mix.mjs 一致：字幕先出，声音后到
const TAIL = 4;    // 语音结束后字幕多留几帧
const GAP = 6;     // 同场两条字幕之间的最小间隔（帧）
const EARLIEST = 30;  // 第一条字幕最早可提前到场起 1 秒（淡入占 15 帧，再早就成"字比画面先到"）
const go = process.argv.includes('--go');

const sb = JSON.parse(fs.readFileSync(SB, 'utf8'));
const tl = JSON.parse(fs.readFileSync(TL, 'utf8'));
const changes = [];
const stuck = [];

for (const s of sb.shots) {
  const d = s.dur_frame;
  const speechOf = c => Math.round(
    tl.scenes.find(x => x.id === s.id).captions.find(x => x.id === `${s.id}-${c.n}`).audio_ms / 1000 * FPS);
  const need = s.captions.reduce((n, c) => n + speechOf(c), 0) + s.captions.length * (LEAD + TAIL) + GAP;
  // 紧张就整场按语音重排：字幕本来就该跟着声音走，"原片节奏"的 frac 只是初值
  const tight = need > d - 2 - Math.round(s.captions[0].in_frac * d);
  let cursor = tight ? EARLIEST : Math.round(s.captions[0].in_frac * d);
  let prevTo = -GAP;
  for (const c of s.captions) {
    const rec = tl.scenes.find(x => x.id === s.id)?.captions.find(x => x.id === `${s.id}-${c.n}`);
    if (!rec) throw new Error(`timeline.json 缺 ${s.id}-${c.n}`);
    const speech = speechOf(c);
    let from = tight ? cursor : Math.round(c.in_frac * d);
    let to = tight ? Math.min(from + LEAD + speech + TAIL, d - 2) : Math.round(c.out_frac * d);
    if (!tight && to < from + LEAD + speech + TAIL) to = Math.min(from + LEAD + speech + TAIL, d - 2);
    // 上一条被语音撑长以后可能吃掉这一条的起点 —— 不补就会两条字幕同屏叠字（S06 踩过）
    if (!tight && from < prevTo + GAP) from = Math.min(prevTo + GAP, d - 2 - LEAD - speech);
    if (to - (from + LEAD + speech) < TAIL - 1) {
      stuck.push(`${s.id}-${c.n}  语音 ${speech}f 可用 ${to - from - LEAD}f 缺 ${speech + LEAD + TAIL - to + from}f`);
    }
    cursor = to + GAP; prevTo = to;   // 下一条从这条的尾后起步
    const nf = +(from / d).toFixed(4), nt = +(to / d).toFixed(4);
    // 只在真的动了（≥1.5 帧）时才记为改动 —— 否则四舍五入会把 22 条都标成"改过"，
    // 害人去重渲一批其实没变的场
    const moved = Math.abs(nf - c.in_frac) * d >= 1.5 || Math.abs(nt - c.out_frac) * d >= 1.5;
    if (moved) {
      changes.push(`${s.id}-${c.n}  in ${c.in_frac}→${nf}  out ${c.out_frac}→${nt}`);
      if (go) { c.in_frac = nf; c.out_frac = nt; }
    }

  }
}
console.log(`调整 ${changes.length} 条字幕窗口`);
const dirty = [...new Set(changes.map(c => c.split("-")[0]))];
console.log("需重渲的场：" + (dirty.join(" ") || "无"));
for (const c of changes) console.log('  ' + c);
if (stuck.length) {
  console.log('\n✗ 这些句子在本场内装不下（要么改文案、要么给这场加帧）：');
  for (const c of stuck) console.log('  ' + c);
}
if (go) {
  fs.writeFileSync(SB, JSON.stringify(sb, null, 2));
  console.log(`\n已写回 03_storyboard/ep01.json（${changes.length} 条）`);
  console.log('注意：改了 in_frac/out_frac 的场必须重渲，字幕位置是渲染进画面的。');
} else console.log('\nDRY RUN，加 --go 才写文件。');
