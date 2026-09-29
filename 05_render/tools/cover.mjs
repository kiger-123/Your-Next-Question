#!/usr/bin/env node
// 出封面 → 06_output/cover/
// 用法: node tools/cover.mjs                      → 四张老封面（底图=火堆静帧，第 45 帧）
//       node tools/cover.mjs CoverQ10:300         → 只出「S10 注意力图」封面，取第 300 帧
//       node tools/cover.mjs CoverQ06:300 CoverQ10:300
// 渲在第 45 帧：Spark 用 spring 弹入，第 0 帧尺寸还是 0。
// 场景封面必须显式给帧号：那是一场 12 秒的动画，构图在几帧之间差别很大。
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const OUT = path.resolve(ROOT, '..', '06_output', 'cover');
fs.mkdirSync(OUT, {recursive: true});
const browser = {browserExecutable: 'C:/Program Files/Google/Chrome/Application/chrome.exe'};

const specs = process.argv.slice(2).map(a => {
  const [id, f] = a.split(':');
  return {id, frame: Number(f ?? 45)};
});
const JOBS = specs.length
  ? specs
  : ['Cover16A', 'Cover16B', 'Cover16C', 'CoverSq'].map(id => ({id, frame: 45}));

const serveUrl = await bundle({
  entryPoint: path.join(ROOT, 'src', 'index.tsx'),
  publicDir: path.join(ROOT, 'public'),
});

for (const {id, frame} of JOBS) {
  if (!Number.isInteger(frame) || frame < 0) throw new Error(`${id} 帧号非法: ${frame}`);
  const composition = await selectComposition({serveUrl, id, ...browser});
  if (frame >= composition.durationInFrames) {
    throw new Error(`${id} 只有 ${composition.durationInFrames} 帧，不能取第 ${frame} 帧`);
  }
  const dst = path.join(OUT, `${id}.png`);
  const {buffer} = await renderStill({
    serveUrl,
    composition,
    frame,
    outputLocation: dst,
    imageFormat: 'png',
    ...browser,
  });
  fs.writeFileSync(dst, buffer);
  if (!fs.existsSync(dst) || fs.statSync(dst).size < 1000) throw new Error(`${id} 没落盘`);
  console.log(`  ✓ ${id}  ${composition.width}×${composition.height}  f=${frame}`);
}
console.log(`→ ${path.relative(PROJ, OUT)}/`);
