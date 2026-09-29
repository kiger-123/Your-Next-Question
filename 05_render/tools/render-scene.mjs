#!/usr/bin/env node
// 单场渲染 + 首末帧崩帧预检（方案 §5 P5 的廉价前置检查）。
// 用法: node tools/render-scene.mjs S06 [S07 ...]
// 走程序化 API 而不是 npx：Node 24 禁止无 shell 启动 .cmd，且 bundle 一次可多场复用（省每次 ~7s 重复打包）。
// 为什么要首末帧 still：interpolate 的 inputRange 在每场局部第 0 帧可能重复而整帧崩，
// 全片渲染时才炸会白烧十几分钟 —— 本项目真实踩过这个坑。
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {assertPlates} from './_preflight.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.resolve(ROOT, '..', '06_output', 'scenes');
fs.mkdirSync(OUT_DIR, {recursive: true});

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(CHROME)) {
  throw new Error('找不到系统 Chrome —— 绕开 headless-shell 下载卡死的前提是它存在');
}
const browser = {browserExecutable: CHROME};

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('用法: node tools/render-scene.mjs S06 [S07 ...]');
  process.exit(1);
}

// 时长唯一事实源 = 03_storyboard/ep01.json（不在代码里手填）
const sb = JSON.parse(fs.readFileSync(path.resolve(ROOT, '..', '03_storyboard', 'ep01.json'), 'utf8'));
const durOf = Object.fromEntries(sb.shots.map(s => [s.id, s.dur_frame]));

assertPlates(ROOT);
console.log('bundle…');
const t0 = Date.now();
const serveUrl = await bundle({
  entryPoint: path.join(ROOT, 'src', 'index.tsx'),
  publicDir: path.join(ROOT, 'public'),
});
console.log(`bundle 完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

for (const id of ids) {
  const d = durOf[id];
  if (!d) {
    console.error(`${id} 不在 storyboard 里，或尚未写场景组件`);
    process.exit(1);
  }
  const composition = await selectComposition({serveUrl, id, ...browser});
  console.log(`\n=== ${id} · ${composition.durationInFrames} 帧 · ${composition.width}×${composition.height}@${composition.fps} ===`);

  for (const f of [0, 1, d - 2, d - 1]) {
    const dst = path.join(OUT_DIR, `${id}_f${f}.png`);
    // 4.0.529 实测：renderStill 忽略 outputLocation，只回 buffer。
    // 之前这里"预检 OK"其实一张图都没落盘 —— 断言存在，别让检查再次变成空转。
    const {buffer} = await renderStill({
      serveUrl,
      composition,
      frame: f,
      outputLocation: dst,
      imageFormat: 'png',
      ...browser,
    });
    fs.writeFileSync(dst, buffer);
    if (!fs.existsSync(dst) || fs.statSync(dst).size < 1000) {
      throw new Error(`${id} 预检帧 ${f} 没有真正写出图片`);
    }
    console.log(`  预检帧 ${f} OK`);
  }

  const t1 = Date.now();
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: path.join(OUT_DIR, `${id}.mp4`),
    // 默认 50%；崩了就 RENDER_CONCURRENCY=2 重跑单场。
    // "Visited localhost:3000 but got no response" 是开页面池时挂的，降并发是本轮实测有效的绕法。
    // 必须转成数字：环境变量取出来是字符串 '2'，Remotion 只认 number 或 '50%' 这种百分号串，
    // 传 '2' 会在内部算池子大小时炸出 "Invalid array length"。
    concurrency: (() => {
      const c = process.env.RENDER_CONCURRENCY;
      if (!c) return '50%';
      if (c.endsWith('%')) return c;
      const n = Number(c);
      if (!Number.isInteger(n) || n < 1) throw new Error(`RENDER_CONCURRENCY=${c} 不合法`);
      return n;
    })(),
    onProgress: p => {
      if (p % 10 < 1) process.stdout.write(`  ${p}%\r`);
    },
    ...browser,
  });
  console.log(`  ${id} 渲染 ${((Date.now() - t1) / 1000).toFixed(1)}s → 06_output/scenes/${id}.mp4`);
}
