#!/usr/bin/env node
// 出 QC 帧：每场 4 张，事件驱动而不是等分采样。
// 用法: node tools/qc-stills.mjs [S08 S10 ...]   不给参数 = 全 13 场
//
// 为什么改成事件驱动（2026-09-27 K3 审查结论）：
// 原来取 0.35/0.55/0.75 等分点，而判据全长在字幕上 —— 英文回声、✳分隔符、逐字浮现的
// 完成态都在"字幕刚出完"那一瞬，等分点正好从两条字幕中间穿过去，等于漏检。
//
// 四个时刻：
//   first  淡入刚结束（Fade 用 0→15 帧）
//   c1     第一条字幕逐字完成
//   c2     第二条字幕逐字完成
//   last   淡出开始前最后一帧
// kit.tsx Line 的逐字节奏是 span*0.72 出完，所以"完成"取 from + 0.75*span，留一点余量。
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import {assertPlates} from './_preflight.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.resolve(ROOT, '..', '06_output', 'qc');
fs.mkdirSync(OUT, {recursive: true});
const browser = {browserExecutable: 'C:/Program Files/Google/Chrome/Application/chrome.exe'};

const sb = JSON.parse(fs.readFileSync(path.resolve(ROOT, '..', '03_storyboard', 'ep01.json'), 'utf8'));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : sb.shots.map(s => s.id);

const framesOf = s => {
  const d = s.dur_frame;
  const done = c => Math.round(c.from ?? s.dur_frame * c.in_frac);
  const span = c => (c.out_frac - c.in_frac) * d;
  const c1 = s.captions[0];
  const c2 = s.captions[1];
  return {
    first: 22,   // 必须落在 18 帧淡变之外，否则测的是转场不是画面
    // 回声在 from + 0.72*span + 4 才开始淡入、再 18 帧到满；旧的 0.75*span 比它早约 20 帧，
    // 所以 c1 帧上永远看不到英文回声（GLM 任务书 C 第一轮实测指出）
    c1: Math.round(Math.min(d - 22, done(c1) + span(c1) * 0.72 + 26)),
    c2: Math.round(Math.min(d - 22, done(c2) + span(c2) * 0.72 + 26)),
    last: d - 22,
  };
};

assertPlates(ROOT);
// QC_EXTRA=138,150 → 在四个事件点之外再补帧。用在"某个动效只在某几帧存在"的场合
// （S01 的流星只活 138–162 帧，四个事件点一张都抓不到它）。
const EXTRA = (process.env.QC_EXTRA || '').split(',').map(s => parseInt(s, 10)).filter(Number.isFinite);
const serveUrl = await bundle({
  entryPoint: path.join(ROOT, 'src', 'index.tsx'),
  publicDir: path.join(ROOT, 'public'),
});

for (const id of ids) {
  const shot = sb.shots.find(s => s.id === id);
  const composition = await selectComposition({serveUrl, id, ...browser});
  const marks = framesOf(shot);
  for (const f of EXTRA) if (f < shot.dur_frame) marks[`x${f}`] = f;
  for (const [name, frame] of Object.entries(marks)) {
    const dst = path.join(OUT, `${id}_${name}.png`);
    // 4.0.529 的 renderStill 只回 buffer、不认 outputLocation（实测），得自己落盘
    const {buffer} = await renderStill({serveUrl, composition, frame, outputLocation: dst, imageFormat: 'png', ...browser});
    fs.writeFileSync(dst, buffer);
    if (!fs.existsSync(dst) || fs.statSync(dst).size < 1000) {
      throw new Error(`${id}_${name}@${frame} 没落盘，QC 帧是空的`);
    }
  }
  console.log(`${id} QC帧 ${Object.keys(marks).length} 张  f=${Object.values(marks).join(',')}`);
}
console.log(`→ 06_output/qc/`);
