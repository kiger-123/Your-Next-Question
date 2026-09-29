#!/usr/bin/env node
// 全片预览：每场只渲 1–2 帧 still，用来快速检查构图/叠字/缺图，不必渲完整场。
// 用法: node tools/preview.mjs            → 每场 1 帧（字幕2 已完成处）
//       node tools/preview.mjs --two      → 再加一帧（字幕1 进行中处）
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const OUT = path.join(PROJ, '06_output', 'preview');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) throw new Error('找不到系统 Chrome');
fs.mkdirSync(OUT, {recursive: true});

const sb = JSON.parse(fs.readFileSync(path.join(PROJ, '03_storyboard', 'ep01.json'), 'utf8'));
const two = process.argv.includes('--two');

console.log('bundle…');
const serveUrl = await bundle({
  entryPoint: path.join(ROOT, 'src', 'index.tsx'),
  publicDir: path.join(ROOT, 'public'),
});

for (const shot of sb.shots) {
  const D = shot.dur_frame;
  const frames = [Math.round(D * 0.72)];
  if (two) frames.push(Math.round(D * 0.35));
  let composition;
  for (const f of frames) {
    try {
      composition ??= await selectComposition({serveUrl, id: shot.id, browserExecutable: CHROME});
      const out = path.join(OUT, `${shot.id}_f${f}.png`);
      await renderStill({serveUrl, composition, frame: f, outputLocation: out, browserExecutable: CHROME});
      console.log(`  ✓ ${shot.id} @${f}`);
    } catch (e) {
      console.log(`  ✗ ${shot.id} @${f}  ${String(e.message).slice(0, 110)}`);
    }
  }
}
console.log(`\n→ 06_output/preview/`);
