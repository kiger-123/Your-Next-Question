#!/usr/bin/env node
// 句级时间轴生成器（方案 §15.3）。默认 --dry 不花钱；加 --go 才调 TTS。
// 用法: node tools/timeline.mjs [--go]   文本默认从 03_storyboard/ep01.json 派生；--in 只在喂外部文案时用
// 机制：按句合成 → 取每句 audio_length(ms) → 累加成句级 in/out → 写 timeline.json。
// 时长一律由音频算出，禁止手填。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Buffer} from 'node:buffer';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const SECRETS = path.join(process.env.USERPROFILE || '', '.qoder-cn', 'secrets', 'video.env');
const HOST = 'api.minimaxi.com'; // §15.7：唯一允许的主机，防 SSRF
const LEAD = 300;
const GAP = 350;
const TAIL = 400;
const PRICE_PER_10K = 2.0; // speech-2.6-turbo 名义价；实扣以控制台为准

const args = process.argv.slice(2);
const go = args.includes('--go');
const inArg = args.indexOf('--in');
const inPath = path.join(PROJ, inArg >= 0 ? args[inArg + 1] : '03_storyboard/captions.json');

const readKey = () => {
  if (!fs.existsSync(SECRETS)) throw new Error('缺 ~/.qoder-cn/secrets/video.env');
  const line = fs
    .readFileSync(SECRETS, 'utf8')
    .split('\n')
    .find(l => l.startsWith('MINIMAX_API_KEY='));
  if (!line) throw new Error('secrets 里没有 MINIMAX_API_KEY');
  return line.slice('MINIMAX_API_KEY='.length).trim();
};

// 计费口径：CJK 与全角标点按 2 字符，其余按 1（阿里云/MiniMax 同规则）
const CJK = new RegExp("[\u2E80-\u9FFF\uFF00-\uFFEF]");
const charsOf = s => [...s].reduce((n, ch) => n + (CJK.test(ch) ? 2 : 1), 0);

const manifest = JSON.parse(fs.readFileSync(path.join(PROJ, 'manifest.json'), 'utf8'));
const capTts = manifest.budget.caps.tts;
// 旁白文本 = 字幕文本（本项目 1 句 = 1 条字幕），所以直接从 storyboard 派生。
// 原来这里读 03_storyboard/captions.json —— 那个文件从来没有人产出过，工具一跑就 ENOENT，
// 等于"关键路径上埋了个只在最后一天才会炸的空引用"。事实源只留 ep01.json 一份。
const inp = (() => {
  if (inArg >= 0) return JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const sb = JSON.parse(fs.readFileSync(path.join(PROJ, '03_storyboard', 'ep01.json'), 'utf8'));
  return {
    fps: sb.fps ?? 30,
    scenes: sb.shots.map(s => ({id: s.id, captions: s.captions.map(c => ({cn: c.cn, en: c.en}))})),
  };
})();

const nSent = inp.scenes.reduce((n, s) => n + s.captions.length, 0);
const totalChars = inp.scenes.reduce(
  (n, s) => n + s.captions.reduce((m, c) => m + charsOf(c.cn), 0),
  0,
);
const projected = (totalChars / 10000) * PRICE_PER_10K;
console.log(
  `场 ${inp.scenes.length} · 句 ${nSent} · 计费字符 ${totalChars} · 预计 ¥${projected.toFixed(3)} · TTS 上限 ¥${capTts}`,
);
if (projected > capTts)
  throw new Error(`预计 ¥${projected.toFixed(2)} 超 TTS 上限 ¥${capTts} —— 停，先找 K3`);
if (!go) {
  console.log('DRY RUN：未调用任何付费接口。确认无误后加 --go。');
  process.exit(0);
}

const key = readKey();
fs.mkdirSync(path.join(PROJ, '04_assets', 'vo'), {recursive: true});
const VO = path.join(PROJ, '04_assets', 'vo');
const TL = path.join(PROJ, '03_storyboard', 'timeline.json');

async function synth(text) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://${HOST}/v1/t2a_v2`, {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'speech-2.6-turbo',
        text,
        stream: false,
        voice_setting: {voice_id: 'male-qn-qingse', speed: 1.0, vol: 1.0, pitch: 0},
        audio_setting: {sample_rate: 32000, format: 'mp3'},
      }),
    });
    const j = await r.json();
    const code = j.base_resp?.status_code;
    if (code === 0) return j;
    // 1002 = RPM 限流。第一次跑就在第 11 句炸掉，11 句音频白拿、timeline.json 一个字没写。
    // 限流是可恢复的，退避重试而不是让整批作废。
    if (code === 1002 && attempt < 5) {
      const wait = 8000 * (attempt + 1);
      console.log(`  限流，等 ${wait / 1000}s 后重试 ${attempt + 1}/5`);
      await new Promise(r2 => setTimeout(r2, wait));
      continue;
    }
    throw new Error('TTS 失败: ' + JSON.stringify(j.base_resp));
  }
}

/** 时长一律量文件，不用 API 回的数字 —— 断点续跑时没有 API 响应，两条路必须给同一个数 */
const durMs = f => {
  const out = execFileSync('ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
    {encoding: 'utf8'}).trim();
  return Math.round(parseFloat(out) * 1000);
};

const fps = inp.fps || 30;
let t = 0;
const out = {fps, scenes: []};
const billed = [];
// 账按"文件在不在账本里"记，不按"这次有没有调 API"记 ——
// 上一轮炸掉的 11 句是真金白银买回来的，不补记就等于账实不符。
const manifest0 = JSON.parse(fs.readFileSync(path.join(PROJ, 'manifest.json'), 'utf8'));
const ledger = new Set((manifest0.budget.spend_log || []).map(e => e.item));
for (const s of inp.scenes) {
  const startT = t;
  const caps = [];
  for (let i = 0; i < s.captions.length; i++) {
    const c = s.captions[i];
    const id = `${s.id}-${i + 1}`;
    const dst = path.join(VO, `${id}.mp3`);
    let ms;
    if (fs.existsSync(dst) && fs.statSync(dst).size > 1000) {
      ms = durMs(dst);
      if (!ledger.has(`tts_${id}`)) {
        billed.push({t: new Date().toISOString(), item: `tts_${id}`, cost: +(charsOf(c.cn) / 10000 * PRICE_PER_10K).toFixed(4)});
        console.log(`  ${id}  已存在但没记账 → 补记`);
      } else console.log(`  ${id}  已存在，跳过调用`);
    } else {
      const j = await synth(c.cn);
      fs.writeFileSync(dst, Buffer.from(j.data.audio, 'hex'));
      ms = durMs(dst);
      billed.push({t: new Date().toISOString(), item: `tts_${id}`, cost: +(charsOf(c.cn) / 10000 * PRICE_PER_10K).toFixed(4)});
      await new Promise(r => setTimeout(r, 1500)); // 主动压 RPM，别等它拒
    }
    const inMs = t + (i === 0 ? LEAD : GAP);
    const outMs = inMs + ms;
    caps.push({
      id,
      text: c.cn,
      en: c.en || '',
      audio_ms: ms,
      in_ms: inMs,
      out_ms: outMs,
      in_frame: Math.round((inMs / 1000) * fps),
      out_frame: Math.round((outMs / 1000) * fps),
    });
    t = outMs;
    console.log(`  ${id}  ${ms}ms  → 帧 ${caps[i].in_frame}-${caps[i].out_frame}`);
  }
  t += TAIL;
  out.scenes.push({
    id: s.id,
    from_frame: Math.round((startT / 1000) * fps),
    dur_frame: Math.round(((t - startT) / 1000) * fps),
    captions: caps,
  });
  // 每场一存：中途炸掉也不丢已经花钱买回来的东西
  out.total_ms = t;
  out.total_frames = Math.round((t / 1000) * fps);
  fs.writeFileSync(TL, JSON.stringify(out, null, 2));
}
if (billed.length) {
  const m = JSON.parse(fs.readFileSync(path.join(PROJ, 'manifest.json'), 'utf8'));
  m.budget.spent_cny = +(m.budget.spent_cny + billed.reduce((a, e) => a + e.cost, 0)).toFixed(3);
  m.budget.remaining_cny = +(m.budget.total_cny - m.budget.spent_cny).toFixed(2);
  m.budget.spend_log = [...(m.budget.spend_log || []), ...billed];
  fs.writeFileSync(path.join(PROJ, 'manifest.json'), JSON.stringify(m, null, 2));
  console.log(`记账 ${billed.length} 次调用 ¥${billed.reduce((a, e) => a + e.cost, 0).toFixed(3)} → manifest`);
}
console.log(
  `→ 03_storyboard/timeline.json   总时长 ${(t / 1000).toFixed(1)}s / ${out.total_frames} 帧`,
);
