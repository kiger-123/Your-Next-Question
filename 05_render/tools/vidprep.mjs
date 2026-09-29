#!/usr/bin/env node
// 图生视频素材 → 该场精确帧数 @30fps 的底图。OffthreadVideo 不负责对齐时长，
// 不预处理的话装配总长就不是 180.00s，而且错得很隐蔽（只差几百毫秒，看不出来但会漂）。
//
// 用法: node tools/vidprep.mjs --in <源.mp4> --scene S03 --out S03.mp4 [--hold 1.0]
//   --hold  <秒>  末尾冻结这么多秒（默认为 0 = 全程变速铺满）
//
// 为什么默认变速而不是冻结：10s 素材铺 11s 只需放慢 10%，沙粒飘动看不出慢；
// 而冻结会在镜头里留下一段"完全不动"，正是用户抱怨 S01"像静止"的那个毛病。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};

const SRC = arg('--in');
const SCENE = arg('--scene');
const OUTNAME = arg('--out');
const HOLD = Number(arg('--hold', '0'));
if (!SRC || !SCENE || !OUTNAME) {
  console.error('用法: node tools/vidprep.mjs --in <源.mp4> --scene S03 --out S03.mp4 [--hold 1.0]');
  process.exit(1);
}
if (!fs.existsSync(SRC)) throw new Error(`源文件不存在 ${SRC}`);

const sb = JSON.parse(fs.readFileSync(path.join(PROJ, '03_storyboard', 'ep01.json'), 'utf8'));
const shot = sb.shots.find(s => s.id === SCENE);
if (!shot) throw new Error(`${SCENE} 不在 storyboard 里`);
const N = shot.dur_frame;          // 该场精确帧数
const FPS = 30;
const OUT = path.join(ROOT, 'public', OUTNAME);

const probe = f => {
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration',
    '-of', 'json', f,
  ], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`ffprobe 失败: ${r.stderr}`);
  const s = JSON.parse(r.stdout).streams[0];
  const [num, den] = String(s.r_frame_rate).split('/').map(Number);
  return {
    w: s.width, h: s.height,
    fps: num / den,
    frames: s.nb_frames ? Number(s.nb_frames) : null,
    dur: s.duration ? Number(s.duration) : null,
  };
};

const a = probe(SRC);
if (!a.dur) throw new Error('源视频没有 duration，无法算变速倍率');

// 目标：视频部分承担 (N - HOLD*FPS) 帧，其余由末帧冻结补
const bodyFrames = N - Math.round(HOLD * FPS);
if (bodyFrames <= 0) throw new Error(`--hold ${HOLD}s 超过了整场长度`);
const F = (bodyFrames / FPS) / a.dur;      // setpts 倍率：>1 变慢
const speed = 1 / F;                        // 播放速度倍率：<1 变慢
const drift = Math.abs(speed - 1);

console.log(`源: ${a.w}×${a.h} @${a.fps.toFixed(3)}fps  ${a.frames ?? '?'}帧  ${a.dur.toFixed(3)}s`);
console.log(`目标: ${SCENE} = ${N} 帧 @${FPS}fps${HOLD ? `（其中末帧冻结 ${HOLD}s = ${Math.round(HOLD * FPS)} 帧）` : ''}`);
console.log(`变速: ${F.toFixed(4)}× setpts → 播放速度 ${speed.toFixed(3)}×`);

// 变速幅度就是"看不看得出来"的尺子。10% 以内无感（沙粒/星野都吃得下）；
// 超过 18% 观众能看出慢动作或快进，宁可改成冻结 + 让代码层运动盖住。
if (drift > 0.18) {
  throw new Error(
    `变速幅度 ${(drift * 100).toFixed(1)}% 太大（>18%）—— 会看出慢动作/快进。` +
    `改两条路之一：① 买更长的素材 ② 用 --hold 冻结末段并用代码层运动盖住`,
  );
}
if (drift > 0.10) console.log(`⚠️  变速 ${(drift * 100).toFixed(1)}%，超过 10% 了，渲完必须目验慢动作感`);

// scale+crop 到 1280×720（force_original_aspect_ratio=increase 保证铺满后裁掉多余边），
// setpts 变速，tpad 克隆末帧兜住"变速后短 1-2 帧"，fps=30 用复制帧绝不做运动补偿，-frames:v 切到精确帧数。
const vf = [
  'scale=1280:720:force_original_aspect_ratio=increase',
  'crop=1280:720',
  `setpts=PTS*${F.toFixed(6)}`,
  'tpad=stop_mode=clone:stop_duration=1.0',
  `fps=${FPS}`,
].join(',');

const r = spawnSync('ffmpeg', [
  '-y', '-v', 'error', '-i', SRC,
  '-vf', vf, '-frames:v', String(N),
  '-an',                       // 底图无声：声音一律走 mix.mjs 那条总轨
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
  '-pix_fmt', 'yuv420p',       // OffthreadVideo/Chrome 只认这个
  OUT,
], {stdio: ['ignore', 'inherit', 'inherit']});
if (r.status !== 0) throw new Error('ffmpeg 失败');

const b = probe(OUT);
const ok = b.frames === N && Math.abs(b.fps - FPS) < 1e-6 && b.w === 1280 && b.h === 720;
console.log(`产出: ${b.w}×${b.h} @${b.fps.toFixed(3)}fps  ${b.frames}帧  ${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB`);
console.log(ok ? `✓ 帧数精确 = ${N}` : `✗ 规格不符！期望 ${N}帧@${FPS} → 实得 ${b.frames}帧@${b.fps}`);
if (!ok) process.exit(2);
console.log(`→ 05_render/public/${OUTNAME}`);
