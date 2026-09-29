#!/usr/bin/env node
// 预混：26 句旁白 + 一条 BGM → mix.wav（旁白优先，BGM 侧链避让）。
// 用法: node tools/mix.mjs --bgm ../04_assets/music/bgm_ref.m4a --out ../06_output/mix_ref.wav
//
// 为什么在 Remotion 外面先混成一条：
//   多轨各自为政时压限器看不到全局，旁白一响 BGM 就糊字；
//   而且 Remotion 靠 delayRender 挂音频，掉一帧就整体音画漂移。先混成一条，成片只挂一个 <Audio>。
//
// 时长口径 = 已冻结的 (a)：场景时长一律用 storyboard 的 180s 骨架。
//   timeline.json 里那套"音频驱动 dur_frame"（3583 帧）不许用，这里只取每句的 audio_ms。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BGM = path.resolve(ROOT, arg('--bgm', '../04_assets/music/bgm_ref.m4a'));
const OUT = path.resolve(ROOT, arg('--out', '../06_output/mix.wav'));
const SR = 48000;
const FPS = 30;
const TARGET = {I: -16, TP: -1.5, LRA: 11};
const LEAD_FRAMES = 6;   // 字幕浮现后再开口，别让声音比字先到

// ── 片尾淡出参数 ─────────────────────────────────────────────────────
// 素材只到 bgmDur，apad 补进去的是数字零。淡出终点一旦超过素材长度，
// 就是"淡一段不存在的音频"—— 前半段斜坡没走完素材就断了，听感是被剪断而不是收。
const FADE = {
  from: Number(arg('--fade-from', 165)),   // 乐句边界搜索区间（含）
  to: Number(arg('--fade-to', 175)),
  hop: 0.25,                               // 分窗宽度 = 步长
  fallback: Number(arg('--fade-start', 169.4)),   // 找不到谷时的固定起点，也用来强制指定
  minProm: 1.5,                            // 谷至少要突出这么多 dB，否则算"没有明显谷"
  minDur: 3,                               // 淡出短于这个就没意义，起点往前挪
  curve: arg('--fade-curve', 'tri'),       // afade 曲线：tri=幅度线性
  floorDb: -60,                            // 低于此视为数字静音（用来定位素材真实末尾）
};
const FORCE_FADE_START = args.includes('--fade-start');

const sb = JSON.parse(fs.readFileSync(path.join(PROJ, '03_storyboard', 'ep01.json'), 'utf8'));
const tl = JSON.parse(fs.readFileSync(path.join(PROJ, '03_storyboard', 'timeline.json'), 'utf8'));
const VO = path.join(PROJ, '04_assets', 'vo');

// ── 落位：每句起点 = 场景起点 + 该条字幕 in_frac + 一点提前量 ──────
const rows = [];
let acc = 0;
for (const s of sb.shots) {
  for (const c of s.captions) {
    const id = `${s.id}-${c.n}`;
    const rec = tl.scenes.find(x => x.id === s.id)?.captions.find(x => x.id === id);
    if (!rec) throw new Error(`timeline.json 缺 ${id} —— 先跑 tools/timeline.mjs`);
    const capIn = acc + Math.round(c.in_frac * s.dur_frame);
    const capOut = acc + Math.round(c.out_frac * s.dur_frame);
    const from = capIn + LEAD_FRAMES;
    const dur = Math.round(rec.audio_ms / 1000 * FPS);
    rows.push({id, file: path.join(VO, `${id}.mp3`), capIn, capOut, from, dur, ms: rec.audio_ms});
  }
  acc += s.dur_frame;   // 场景偏移：一场只加一次，写在字幕循环里会把后面的场全部推后一倍
}
const totalFrames = sb.shots.reduce((n, s) => n + s.dur_frame, 0);
const filmSec = totalFrames / FPS;

console.log(`旁白 ${rows.length} 句 · 语音合计 ${(rows.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(1)}s · 骨架 ${totalFrames} 帧 = ${filmSec}s`);
const late = rows.filter(r => r.from + r.dur > r.capOut);
if (late.length) {
  console.log('⚠ 语音比字幕停留还长（要么改文案、要么让字幕多留一会儿）：');
  for (const r of late) console.log(`   ${r.id}  语音 ${r.dur}f / 窗口 ${r.capOut - r.capIn}f  超 ${r.from + r.dur - r.capOut}f`);
}
const over = rows.filter(r => r.from + r.dur > totalFrames);
if (over.length) {
  throw new Error('有旁白出画，骨架装不下：\n  '
    + over.map(r => `${r.id} from=${r.from} dur=${r.dur} 结束=${r.from + r.dur} 上限=${totalFrames}`).join('\n  '));
}

// ── 能量分析原语 ─────────────────────────────────────────────────────
// 直接解成单声道 f32 自己算 RMS，不解析 ffmpeg 日志：窗口边界、重叠、 dB 口径全都在自己手里。
function decodeMono(file, from, dur) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', String(dur),
    '-i', file, '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_f32le', '-f', 'f32le', '-'],
  {encoding: null, maxBuffer: 1 << 28});
  if (r.status !== 0) throw new Error(`探测解码失败 ${file}\n` + (r.stderr || '').toString('utf8').slice(-500));
  const ab = r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength);
  return {off: from, sr: SR, f: new Float32Array(ab)};
}
const dbOf = (b) => 10 * Math.log10(Math.max(b, 1e-12));

// 按 hop 分窗测 RMS，窗口左边缘对齐绝对时间 t（t 从 from 起，步长 hop）
function rmsWindows(buf, from, to, hop) {
  const out = [];
  const n = Math.round(hop * buf.sr);
  for (let i = 0; ; i++) {
    const t = +(from + i * hop).toFixed(6);
    if (t + hop > to + 1e-9) break;
    const a = Math.round((t - buf.off) * buf.sr), b = a + n;
    if (a < 0 || b > buf.f.length) break;
    let s = 0;
    for (let k = a; k < b; k++) s += buf.f[k] * buf.f[k];
    out.push({t, db: dbOf(s / n)});
  }
  return out;
}

// 素材自然结束处：从后往前找最后一个不是数字静音的窗口。apad 补的是精确零，
// 但 loudnorm 内部要过一遍重采样，末尾可能留几样非零残值，所以按 10ms 窗 + −60dB 门槛量。
function contentEnd(buf, guess) {
  const n = Math.round(0.01 * buf.sr);
  if (buf.f.length < n) return guess;
  for (let a = buf.f.length - n; a >= 0; a -= n) {
    let s = 0;
    for (let k = 0; k < n; k++) s += buf.f[a + k] * buf.f[a + k];
    if (dbOf(s / n) > FADE.floorDb) return buf.off + (a + n) / buf.sr;
  }
  return guess;
}

// 局部能量谷 = 严格不比两侧高、且至少一侧更低；"最深"用突出度（prominence）衡量：
// min(左侧历史最高, 右侧历史最高) − 谷值。这样挑出来的是整段里最显著的一次塌陷，
// 而不是被噪声抖出来的小坑。
function findValleys(win) {
  const cands = [];
  for (let i = 1; i < win.length - 1; i++) {
    const [p, c, q] = [win[i - 1].db, win[i].db, win[i + 1].db];
    if (c <= p && c <= q && c < Math.max(p, q)) {
      const prom = Math.min(Math.max(...win.slice(0, i + 1).map(x => x.db)),
                            Math.max(...win.slice(i).map(x => x.db))) - c;
      cands.push({...win[i], prom});
    }
  }
  cands.sort((a, b) => b.prom - a.prom || a.db - b.db);
  return cands;
}

function showCurve(buf, center, half, label) {
  const rowsC = rmsWindows(buf, Math.max(buf.off, center - half), Math.min(buf.off + buf.f.length / buf.sr, center + half + FADE.hop), FADE.hop);
  const lo = Math.min(...rowsC.map(r => r.db)), hi = Math.max(...rowsC.map(r => r.db));
  console.log(`   ${label} 能量曲线（${FADE.hop}s 窗 RMS，${lo.toFixed(1)} ~ ${hi.toFixed(1)} dB）：`);
  for (const w of rowsC) {
    const mark = Math.abs(w.t - center) < FADE.hop / 2 ? ' <== 淡出起点' : '';
    const bar = w.db <= FADE.floorDb ? '' : '#'.repeat(Math.round((w.db - lo) / (hi - lo || 1) * 46));
    console.log(`     ${w.t.toFixed(2)}s  ${w.db.toFixed(2).padStart(7)} dB  ${bar}${mark}`);
  }
}

// 定淡出：起点在 [FADE.from, FADE.to] 里找乐句边界，终点贴素材自然结束处
function planFade(file, label) {
  // 多解 5s：一是给"起点前后各 4s"的曲线留左边距，二是万一搜索区间被素材末尾挤掉，
  // 往前挪的起点仍在已解码范围内
  const from = Math.max(0, Math.min(FADE.from, FADE.fallback) - 5);
  const buf = decodeMono(file, from, filmSec - from);
  const end = contentEnd(buf, Math.min(bgmDur, filmSec));
  const hi = Math.min(FADE.to, end - FADE.minDur);   // 起点不得晚于"末尾减最短淡出"
  const win = rmsWindows(buf, FADE.from, hi, FADE.hop);
  const cands = findValleys(win);
  let start, why;
  if (FORCE_FADE_START) {
    start = FADE.fallback; why = `主控指定 --fade-start ${start.toFixed(2)}s`;
  } else if (!cands.length || cands[0].prom < FADE.minProm) {
    start = FADE.fallback;
    why = cands.length
      ? `未找到乐句边界（最深谷突出度 ${cands[0].prom.toFixed(2)}dB < ${FADE.minProm}dB），退回固定起点`
      : `未找到乐句边界（${FADE.from.toFixed(2)}–${hi.toFixed(2)}s 内没有局部能量谷），退回固定起点`;
  } else {
    start = cands[0].t;
    why = `最深能量谷 @${start.toFixed(2)}s = ${cands[0].db.toFixed(2)}dB，突出度 ${cands[0].prom.toFixed(2)}dB`;
  }
  start = Math.min(Math.max(start, 0, from), hi);    // 保证淡出本身够长且落在已探测范围内

  console.log(`\n── 片尾淡出规划（探测源：${label}）──`);
  console.log(`   素材自然结束：实测 ${end.toFixed(3)}s（容器标称 ${bgmDur.toFixed(3)}s，差 ${((end - bgmDur) * 1000).toFixed(1)}ms）`);
  console.log(`   搜索区间 ${FADE.from.toFixed(2)}–${FADE.to.toFixed(2)}s`
    + (hi < FADE.to ? ` → 受最短淡出 ${FADE.minDur}s 约束，实到 ${hi.toFixed(2)}s` : ''));
  console.log(`   起点：${start.toFixed(2)}s → 终点 ${end.toFixed(2)}s，时长 ${(end - start).toFixed(2)}s，curve=${FADE.curve}`);
  console.log(`   ${why}`);
  if (cands.length) {
    console.log('   候选谷（按突出度排序，最多列 5 个）：'
      + cands.slice(0, 5).map(c => `${c.t.toFixed(2)}s(${c.db.toFixed(1)}dB/突出${c.prom.toFixed(1)})`).join('  '));
  }
  showCurve(buf, start, 4, '起点前后各 4s');
  return {start, end, dur: +(end - start).toFixed(3)};
}
const afadeOut = f => `afade=t=out:st=${f.start.toFixed(3)}:d=${f.dur.toFixed(3)}:curve=${FADE.curve}`;

// ── 旁白总轨：逐句 adelay 后求和（normalize=0 才不会被自动摊薄）────
// apad 到整片长是必须的：sidechaincompress 会跟着侧链一起收工，
// 侧链只有 178.2s 的话整条床就被截到最后一个字，成片末尾 1.78s 直接没了。
// 输入序号从 0 起：0..25 是 26 句旁白，26 是 BGM
//
// --bgm-only：2026-09-27 用户决定去旁白（"文字不要声音，很笨"），回到原片那种
// 纯字幕 + 音乐床结构。原片音轨实测 I=−10.3 LUFS 且峰值 +0.4 dBFS —— 它自己在削顶，
// 我们不照抄，仍守 manifest 的 −16 LUFS / TP −1.5。
const BGM_ONLY = process.argv.includes('--bgm-only');
const inputs = BGM_ONLY ? [] : rows.map(r => ['-i', r.file]).flat();
const BGMI = BGM_ONLY ? 0 : rows.length;
const parts = BGM_ONLY ? [] : rows.map((r, i) => {
  const ms = Math.round(r.from / FPS * 1000);
  return `[${i}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`;
});
const nar = BGM_ONLY ? '' :
  `${parts.join(';')};${rows.map((_, i) => `[v${i}]`).join('')}amix=inputs=${rows.length}:duration=longest:normalize=0,apad=whole_dur=${filmSec}[nar]`;

// ── BGM 床：补齐到骨架长 → 淡入 →（有旁白时）侧链让路 ────────────────
// 尾部淡出不在这里做（纯 BGM 时）：见下面 loudnorm 之后的说明。
const bgmDur = Number(spawnSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', BGM],
  {encoding: 'utf8'}).stdout.trim());
const tail = Math.max(filmSec - bgmDur, 0);
// 有旁白时床必须在进 amix 之前就淡完，否则最后一级的淡出会连旁白一起拉下去；
// 这种情况下只能在归一之前探测，能量谷的相对形状与归一后一致（linear 模式是均匀增益）。
const preFade = BGM_ONLY ? null : planFade(BGM, 'BGM 素材，旁白混音前');
const bedPrep = `[${BGMI}:a]aformat=sample_rates=${SR}:channel_layouts=stereo,`
  + `apad=pad_dur=${(tail + 6).toFixed(2)},atrim=0:${filmSec},`
  + `afade=t=in:st=0:d=2.5${preFade ? ',' + afadeOut(preFade) : ''}[bedin]`;
// 旁白要同时当"侧链"和"混进去的一路"用 —— 一个 pad 只能喂一个输入，必须先 asplit
// sidechaincompress 双输入：主路=床，侧链=旁白。threshold 0.06≈−24dB，
// release 420ms 让抬回来是"呼吸"而不是"抽吸"
const fc = BGM_ONLY
  ? `${bedPrep};[bedin]anull[mix]`
  : `${nar};[nar]asplit=2[narA][narB];${bedPrep};`
    + `[narA][bedin]sidechaincompress=threshold=0.06:ratio=10:attack=25:release=420[bed];`
    + `[bed][narB]amix=inputs=2:duration=first:normalize=0[mix]`;
fs.mkdirSync(path.dirname(OUT), {recursive: true});
console.log(`${BGM_ONLY ? '【纯 BGM，无旁白】' : '【旁白 + BGM】'} BGM ${bgmDur.toFixed(2)}s → 骨架 ${filmSec}s${tail > 0 ? `（尾部补 ${tail.toFixed(2)}s 静音，淡出贴素材末尾）` : '（裁尾）'}`);
// 第一遍落到临时文件：ffmpeg 不允许读写同一个路径
const PREMIX = OUT.replace(/\.wav$/, '.premix.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-i', BGM,
  '-filter_complex', fc, '-map', '[mix]', '-ac', '2', '-ar', SR, '-c:a', 'pcm_s16le', PREMIX],
  {stdio: 'inherit'});

// ── 两遍 loudnorm：第一遍量，第二遍线性归一（单遍是动态的，会把床推得忽大忽小）──
// 顺序要紧的地方：归一必须在淡出之前。
//   先淡再量 —— 十秒的下坡 + 末尾静音被算进积分响度，loudnorm 为了补足目标把正文整体抬
//   上去，而且 TP 余量全花在即将被淡掉的段落上；
//   先量再淡 —— 归一针对的是满密度正文，增益正确，淡出再在归一后的样本上乘比例，
//   斜坡形状不受 loudnorm 内部处理影响。177.45–180s 的全静是设计：画面停在落版上，
//   静场落在结尾的呼吸里，所以不参与响度补偿。
const probe = spawnSync('ffmpeg', ['-i', PREMIX, '-af',
  `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-'],
{encoding: 'utf8', maxBuffer: 1 << 24});
const st = JSON.parse((probe.stderr.match(/\{[\s\S]*?\n\}/g) || []).pop() ?? '{}');
if (!st.input_i) throw new Error('loudnorm 第一遍没量到数：\n' + probe.stderr.slice(-400));
// ffmpeg 9 的第一遍输出里已经没有 target_low 了（改名 target_offset，且语义是"结果"不是"输入"），
// 硬套老配方会把 offset=undefined 传进去直接报错。第二遍用 offset=0 + 实测值即可。
const NORM = OUT.replace(/\.wav$/, '.norm.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', PREMIX, '-af',
  `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}`
  + `:measured_I=${st.input_i}:measured_TP=${st.input_tp}:measured_LRA=${st.input_lra}`
  + `:measured_thresh=${st.input_thresh}:offset=0:linear=true`,
  '-ac', '2', '-ar', SR, '-c:a', 'pcm_s16le', NORM], {stdio: 'inherit'});
fs.unlinkSync(PREMIX);
console.log(`第一遍实测 I=${st.input_i} LUFS / TP=${st.input_tp} dBTP → 线性归一到 ${TARGET.I} LUFS`);

// ── 片尾淡出：归一之后、作为最后一级打在成品上 ───────────────────────
const fade = preFade ?? planFade(NORM, '归一后的成品，淡出前');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', NORM, '-af',
  // apad/atrim 一收一放把长度钉死在骨架上：afade 不改长度，但重采样取整可能差一样，
  // 长度 180.00s 是对画面的承诺，不靠"应该正好"
  `${afadeOut(fade)},apad=whole_dur=${filmSec},atrim=0:${filmSec},asetpts=PTS-STARTPTS`,
  '-ac', '2', '-ar', SR, '-c:a', 'pcm_s16le', OUT], {stdio: 'inherit'});
fs.unlinkSync(NORM);

// ── 成品自检：淡出没跑偏、响度还在目标上 ─────────────────────────────
const chk = spawnSync('ffmpeg', ['-hide_banner', '-i', OUT, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
  {encoding: 'utf8', maxBuffer: 1 << 24});
// ebur128 逐帧也往 stderr 打 "I: xx LUFS"，只能在 Summary 段里取数
const sum = chk.stderr.slice(chk.stderr.lastIndexOf('Summary:'));
const got = re => sum.match(re)?.[1] ?? '?';
const gotDur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', OUT], {encoding: 'utf8'}).stdout.trim());
console.log(`\n── 成品自检 ──`);
console.log(`   淡出 ${fade.start.toFixed(2)}s → ${fade.end.toFixed(2)}s(${fade.dur.toFixed(2)}s, ${FADE.curve})`
  + ` · ${fade.end.toFixed(2)}–${filmSec.toFixed(2)}s 设计为全静`);
console.log(`   总时长 ${gotDur.toFixed(3)}s / 骨架 ${filmSec.toFixed(3)}s${Math.abs(gotDur - filmSec) < 0.02 ? ' ✓' : ' ⚠ 对不上'}`);
console.log(`   ebur128  Integrated I=${got(/I:\s+(-?[\d.]+) LUFS/) } LUFS · LRA=${got(/LRA:\s+(-?[\d.]+) LU/) } LU · TruePeak=${got(/Peak:\s+(-?[\d.]+) dBFS/) } dBTP`
  + `（目标 I≈${TARGET.I} / TP≤${TARGET.TP}）`);
const segs = [];
for (let t = 160; t < filmSec; t += 2) {
  const b = decodeMono(OUT, t, 2).f, n = b.length;
  let s = 0;
  for (let k = 0; k < n; k++) s += b[k] * b[k];
  segs.push(`${t.toFixed(0)}s ${dbOf(s / n).toFixed(1).padStart(6)}dB`);
}
console.log(`   尾段 2s 分段 RMS：${segs.join('  ')}`);

fs.writeFileSync(OUT.replace(/\.wav$/, '.windows.json'),
  JSON.stringify({fps: FPS, totalFrames, filmSec, bgm: path.basename(BGM),
    bgmDur, fadeOut: fade, rows}, null, 2));
console.log(`→ ${path.relative(PROJ, OUT)}  +  ${path.basename(OUT).replace(/\.wav$/, '.windows.json')}`);
