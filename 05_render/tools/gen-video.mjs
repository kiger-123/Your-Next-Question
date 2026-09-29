#!/usr/bin/env node
// 图生视频（MiniMax v2 接口，2026-09-28 实查官方文档）：
//   上传首帧  POST /v1/files/upload            multipart: file + purpose=video_generation_input
//   建任务    POST /v2/video_generation        {model, content:[text, image_url=mm_file://{id}], resolution, duration, ratio}
//   查任务    GET  /v2/video_generation/{task_id}   → task.status / content.url
// 用法: node tools/gen-video.mjs --scene S03 --plate ../05_render/public/S03.png --prompt "..." [--go]
// 默认 dry-run。Hailuo-2.3 已退役，现走 MiniMax-H3：768P ¥0.50/秒 → 10s = ¥5（manifest 已核实价）。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const HOST = 'api.minimaxi.com';           // 唯一允许主机（§15.7 防 SSRF，与生图同一条纪律）
const PRICE_PER_SEC = 0.5;                  // MiniMax-H3 768P，2026-09-26 实抓核实
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const GO = args.includes('--go');

const SCENE = arg('--scene');
const PLATE = path.resolve(ROOT, arg('--plate'));
const PROMPT = arg('--prompt');
const DUR = Number(arg('--duration', '10'));
const RES = arg('--resolution', '768P');
if (!SCENE || !fs.existsSync(PLATE) || !PROMPT) {
  console.error('用法: node tools/gen-video.mjs --scene S03 --plate public/S03.png --prompt "..." [--go]');
  process.exit(1);
}
const cost = DUR * PRICE_PER_SEC;

const key = (() => {
  const line = fs
    .readFileSync(path.join(process.env.USERPROFILE || '', '.qoder-cn', 'secrets', 'video.env'), 'utf8')
    .split('\n')
    .find(l => l.startsWith('MINIMAX_API_KEY='));
  if (!line) throw new Error('secrets 缺 MINIMAX_API_KEY');
  return line.slice('MINIMAX_API_KEY='.length).trim();
})();

const url = p => {
  const u = new URL(`https://${HOST}${p}`);      // 构造即校验：非 https / 非白名单主机直接抛
  if (u.protocol !== 'https:' || u.host !== HOST) throw new Error(`拒绝请求非白名单主机 ${u.host}`);
  return u.toString();
};

console.log(`${SCENE} · ${RES} · ${DUR}s · 预计 ¥${cost.toFixed(2)}（H3 768P ¥0.50/秒）`);
console.log(`prompt: ${PROMPT.slice(0, 120)}…`);
if (!GO) {
  console.log('DRY RUN。确认无误加 --go。');
  process.exit(0);
}

// 1. 上传首帧
const up = spawnSync('curl', [
  '-sS', '-X', 'POST', url('/v1/files/upload'),
  '-H', `Authorization: Bearer ${key}`,
  '-F', `file=@${PLATE}`, '-F', 'purpose=video_generation_input',
], {encoding: 'utf8'});
if (up.status !== 0) throw new Error(`上传失败: ${up.stderr}`);
const fileId = String(JSON.parse(up.stdout)?.file?.file_id ?? '');
if (!fileId || fileId === 'undefined') throw new Error(`上传没拿到 file_id: ${up.stdout.slice(0, 200)}`);
console.log(`① 首帧已上传 file_id=${fileId.slice(0, 8)}…`);

// 2. 建任务（或续轮询：task_id 落盘，重跑不重复建任务 = 不重复扣钱）
const STATE = path.join(PROJ, '04_assets', 'video', `${SCENE}.task.json`);
let taskId = null;
if (fs.existsSync(STATE)) {
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  if (Date.now() - st.created < 30 * 60 * 1000) {
    taskId = st.taskId;
    console.log(`② 复用未完成任务 task_id=${taskId}（不重复扣钱）`);
  }
}
const jparse = (txt, step) => {
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`${step} 响应不是 JSON，原文前 200 字: ${txt.slice(0, 200)}`);
  }
};
if (!taskId) {
  const body = {
    model: 'MiniMax-H3',
    content: [
      {type: 'text', text: PROMPT},
      // 实测：image_url 必须是嵌套对象，平铺 {type,url} 会报 2013 url is empty
      {type: 'image_url', image_url: {url: `mm_file://${fileId}`}},
    ],
    resolution: RES,
    duration: DUR,
    ratio: '16:9',
  };
  const cr = await fetch(url('/v2/video_generation'), {
    method: 'POST',
    headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const cj = jparse(await cr.text(), '建任务');
  taskId = cj.task_id;
  if (!taskId) throw new Error(`建任务失败: ${JSON.stringify(cj).slice(0, 300)}`);
  fs.mkdirSync(path.dirname(STATE), {recursive: true});
  fs.writeFileSync(STATE, JSON.stringify({taskId, created: Date.now(), scene: SCENE, cost}));
  console.log(`② 任务已建 task_id=${taskId}（已落盘，重跑会续轮询）`);
}

// 3. 轮询（H3 10s 段通常 2–6 分钟；10 分钟封顶）
// 查询路由实测（2026-09-28）：/v2/video_generation/{id} 404；正确 = /v2/query/video_generation?task_id=
// 返回 {items:[{status:"succeeded", content:{url}}]}；v1/query 也活着（回 file_id，不带直链）
let videoUrl = null;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 10000));
  const q = await fetch(url(`/v2/query/video_generation?task_id=${taskId}`), {
    headers: {Authorization: `Bearer ${key}`},
  });
  const qj = jparse(await q.text(), '查任务');
  const it = qj?.items?.[0] ?? {};
  const st = String(it.status ?? qj?.status ?? '').toLowerCase();
  process.stdout.write(`   ${i * 10}s 状态=${st}\n`);
  if (st === 'succeeded' || st === 'success') {
    videoUrl = it?.content?.url || qj?.content?.url;
    if (!videoUrl && qj?.file_id) videoUrl = url(`/v1/files/download/${qj.file_id}`);
    break;
  }
  if (st.startsWith('fail')) throw new Error(`任务失败: ${JSON.stringify(qj).slice(0, 300)}`);
}
if (!videoUrl) throw new Error('轮询 10 分钟未成功');
console.log(`\n③ 生成完成，下载中…`);

// 4. 下载
const OUTDIR = path.join(PROJ, '04_assets', 'video');
fs.mkdirSync(OUTDIR, {recursive: true});
const out = path.join(OUTDIR, `${SCENE}_raw.mp4`);
const dl = await fetch(videoUrl.startsWith('http') ? videoUrl : url(`/v1/files/download/${videoUrl}`));
if (!dl.ok) throw new Error(`下载 ${dl.status}`);
fs.writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
console.log(`④ → ${path.relative(PROJ, out)}  ${(fs.statSync(out).size / 1048576).toFixed(1)}MB`);

// 5. 记账
const mpath = path.join(PROJ, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mpath, 'utf8'));
m.budget.spent_cny = +(m.budget.spent_cny + cost).toFixed(3);
(m.budget.spend_log ||= []).push({t: new Date().toISOString(), item: `${SCENE}_i2v_H3_${RES}_${DUR}s`, cost});
fs.writeFileSync(mpath, JSON.stringify(m, null, 2) + '\n');
console.log(`⑤ 已记账 ¥${cost} · 全项目已花 ¥${m.budget.spent_cny} · 余额 ¥${(30 - m.budget.spent_cny).toFixed(2)}`);
