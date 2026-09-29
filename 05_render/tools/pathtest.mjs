#!/usr/bin/env node
// P0 视频通路等价测试。四步：
//   1. 用 S01.png 造一条"像 Hailuo 输出"的假源：10s @25fps（故意不是 30fps）
//   2. 过 vidprep 变速铺满 S03 的 330 帧 @30fps
//   3. 渲两条 composition 的同一帧：ImagePathTest(<Img>) / VideoPathTest(<OffthreadVideo>)
//   4. 落盘等 python 逐像素比（真正判据在 pathtest.py）
// 用法: node tools/pathtest.mjs
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const TMP = path.join(process.env.TEMP || '/tmp', 'vidpathtest');
const OUT = path.join(PROJ, '06_output', 'review');
fs.mkdirSync(TMP, {recursive: true});
fs.mkdirSync(OUT, {recursive: true});
const browser = {browserExecutable: 'C:/Program Files/Google/Chrome/Application/chrome.exe'};

// 1. 假源：静图 → 10s @25fps
const fake = path.join(TMP, 'fake_hailuo.mp4');
const g = spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-loop', '1', '-i', path.join(ROOT, 'public', 'S01.png'),
  '-t', '10', '-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
  '-pix_fmt', 'yuv420p', fake,
], {stdio: ['ignore', 'inherit', 'inherit']});
if (g.status !== 0) throw new Error('造假源失败');
console.log(`① 假源已造：10s @25fps → ${fake}`);

// 2. vidprep（借 S03 的 330 帧，顺便验"10s 铺 11s"那条变速路）
const v = spawnSync('node', [
  path.join(ROOT, 'tools', 'vidprep.mjs'),
  '--in', fake, '--scene', 'S03', '--out', '_pathtest.mp4',
], {stdio: 'inherit', cwd: ROOT});
if (v.status !== 0) throw new Error(`② vidprep 失败（退出码 ${v.status}）`);
console.log('② vidprep 通过');

// 3. 渲两条通路的同一帧
const serveUrl = await bundle({
  entryPoint: path.join(ROOT, 'src', 'index.tsx'),
  publicDir: path.join(ROOT, 'public'),
});
const FRAME = 20;
for (const id of ['ImagePathTest', 'VideoPathTest']) {
  const composition = await selectComposition({serveUrl, id, ...browser});
  const dst = path.join(OUT, `pathtest_${id}.png`);
  const {buffer} = await renderStill({
    serveUrl, composition, frame: FRAME, outputLocation: dst, imageFormat: 'png', ...browser,
  });
  fs.writeFileSync(dst, buffer);
  if (!fs.existsSync(dst) || fs.statSync(dst).size < 1000) throw new Error(`${id} 没落盘`);
  console.log(`③ ${id} @f${FRAME} 已落盘`);
}
console.log(`→ 判据交给 pathtest.py（逐像素差）`);
