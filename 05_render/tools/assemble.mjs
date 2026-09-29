#!/usr/bin/env node
// 装配：concat demuxer 拼场 + 挂预混总轨（方案 §6.1 / §14.6「每场独立 Composition + concat」）。
// 前置：06_output/scenes/<id>.mp4 已由 render-scene.mjs 产出；
//       04_assets/mix.wav 已用 ffmpeg 两遍法预混到 -16 LUFS / TP -1.5 dBTP。
// 顺序一律读 03_storyboard/timeline.json，不在这里手填。
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const SCENES = path.join(PROJ, '06_output', 'scenes');
const tlPath = path.join(PROJ, '03_storyboard', 'timeline.json');

if (!fs.existsSync(tlPath)) {
  console.error('缺 03_storyboard/timeline.json —— 先跑 tools/timeline.mjs');
  process.exit(1);
}
const order = JSON.parse(fs.readFileSync(tlPath, 'utf8')).scenes.map(s => s.id);
const missing = order.filter(i => !fs.existsSync(path.join(SCENES, `${i}.mp4`)));
if (missing.length) {
  console.error('以下场还没渲：' + missing.join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(SCENES, 'concat.txt'), order.map(i => `file '${i}.mp4'`).join('\n'));

// 总轨必须存在：原来写成"不在就悄悄出一支无声片还报成功"，那是又一个空转检查
const mixArg = process.argv.indexOf('--mix');
const mix = path.resolve(ROOT, mixArg >= 0 ? process.argv[mixArg + 1] : '../04_assets/mix.wav');
if (!fs.existsSync(mix)) throw new Error(`找不到总轨 ${mix} —— 先跑 tools/mix.mjs，不要出无声片`);
const out = path.join(PROJ, '06_output', 'ep01-draft.mp4');
const args = ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(SCENES, 'concat.txt'), '-i', mix];
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18');
args.push('-c:a', 'aac', '-b:a', '192k', '-map', '0:v:0', '-map', '1:a:0', '-shortest');
args.push(out);

console.log('装配顺序: ' + order.join(' → '));
console.log('总轨: ' + path.relative(PROJ, mix));
execFileSync('ffmpeg', args, {stdio: 'inherit'});
const want = order.reduce((n, id) => {
  const d = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', path.join(SCENES, id + '.mp4')], {encoding: 'utf8'}).trim());
  return n + d;
}, 0);
const got = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', out], {encoding: 'utf8'}).trim());
console.log(`装配后 ${got.toFixed(2)}s / 分段合计 ${want.toFixed(2)}s`);
if (Math.abs(got - want) > 0.1) {
  throw new Error(`成片比各段之和短 ${(want - got).toFixed(2)}s —— 音频或 concat 把结尾吃了，不许交`);
}
console.log('→ 06_output/ep01-draft.mp4');
