#!/usr/bin/env node
// P3 素材批：读 03_storyboard/ep01.json 的 plate.prompt，调 MiniMax image-01 出底图。
// 用法: node tools/gen-plates.mjs [--go] [--only S01 S12] [--rolls 3]
// 默认 dry-run：只打印将发什么、花多少，不发任何付费请求。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROJ = path.resolve(ROOT, '..');
const HOST = 'api.minimaxi.com'; // 唯一允许主机（§15.7 防 SSRF）
const PRICE = 0.025;
const SECRETS = path.join(process.env.USERPROFILE || '', '.qoder-cn', 'secrets', 'video.env');

const args = process.argv.slice(2);
const go = args.includes('--go');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args.slice(onlyIdx + 1).filter(a => /^S\d\d[a-z]?$/.test(a)) : null;
const rollsIdx = args.indexOf('--rolls');
const ROLLS = rollsIdx >= 0 ? Number(args[rollsIdx + 1]) : 3;

const key = (() => {
  const line = fs
    .readFileSync(SECRETS, 'utf8')
    .split('\n')
    .find(l => l.startsWith('MINIMAX_API_KEY='));
  if (!line) throw new Error('secrets 缺 MINIMAX_API_KEY');
  return line.slice('MINIMAX_API_KEY='.length).trim();
})();

// 统一风格前缀 —— 成套的关键。dark 与 paper 各一套，避免浅色场被压成暗调。
const STYLE = {
  dark:
    'Cinematic documentary film still. Unified palette: deep ink blue-black shadows, warm amber midtones, one single coral-red accent light. Heavy 35mm film grain, strong vignette, shallow depth of field, restrained low-key lighting, no other saturated colours.',
  paper:
    'Aged warm rice-paper surface, traditional Chinese ink-wash aesthetic. Palette: off-white paper, black ink, one single vermilion/coral-red accent. Restrained Song-dynasty minimalism, generous negative space, subtle paper fibre.',
  // 亮星空变体：S01 专用。全片统一前缀写的是 low-key lighting，正是 S01 底图 mean 只有 11.3 的根因
  // —— 我自己要求模型拍暗的。这个变体保留颗粒/暗角/单一暖色纪律，只把曝光拉上来。
  darkBright:
    'Cinematic documentary film still, long-exposure astrophotography. Unified palette: brilliant dense starfield with hundreds of clearly visible stars, a luminous Milky Way core with colour and structure, deep blue-black sky that is richly detailed rather than muddy, warm amber campfire glow low in frame, one single coral-red accent. Heavy 35mm film grain, shallow vignette, generous highlight detail, correctly exposed for a night sky, not underexposed, no crushed blacks.',
  // 冷调变体：颗粒/暗角/单一暖色强调的纪律不变，只把琥珀中间调换成中性冷灰。
  // 为什么需要：珊瑚 ✳ 是全片唯一暖色，底图整幅偏橙就把它稀释了（S04 实测踩到）。
  darkCool:
    'Cinematic documentary film still. Unified palette: deep neutral blue-black shadows, cold grey midtones, one single coral-red accent light. Heavy 35mm film grain, strong vignette, shallow depth of field, restrained low-key lighting, no amber or orange cast anywhere, no other saturated colours.',
  // 火光夜景变体（S03 专用）：纪律不变，但主体由火光照亮且曝光充足。
  // 为什么单开一条：统一前缀的 low-key lighting 会把"被火照亮的沙"也压成泥，
  // 用户 2026-09-28 的原话是"很暗 看不到沙子"—— 暗的是主体，不是氛围。
  warmNight:
    'Cinematic documentary film still. Unified palette: warm amber firelight as the key light on the subject, deep blue-black night sky, one single coral-red accent. Heavy 35mm film grain, shallow vignette, the lit subject generously exposed and clearly readable, darkness only in the sky and at the frame edges, no crushed shadows on the subject.',
};
const TAIL =
  ' Absolutely no text, no letters, no digits, no captions, no logo, no watermark, no signature, no border.';

const sb = JSON.parse(
  fs.readFileSync(path.join(PROJ, '03_storyboard', 'ep01.json'), 'utf8'),
);

const jobs = [];
for (const s of sb.shots) {
  const plates = [s.plate, s.plate_b].filter(p => p && p.kind === 'image');
  for (const [k, p] of plates.entries()) {
    // S13b 这种带后缀的 id 只点第二张；写 S13 才是两张都要（S13a 等价于 S13 的第一张）
    const jid = s.id + (k === 0 ? '' : 'b');
    const jidA = s.id + (k === 0 ? 'a' : 'b');
    if (only && !only.includes(jid) && !only.includes(jidA) && !only.includes(s.id)) continue;
    jobs.push({
      shot: s.id,
      suffix: k === 0 ? '' : 'b',
      src: p.src,
      // negative_note 是这场专属的禁令（S04 不得自发光、S05 画面内无纸无字）。
      // 只拼全局 TAIL 会把逐场禁令丢掉 —— 上一版出图翻车翻的就是这个。
      prompt: `${STYLE[p.style] ?? STYLE[s.mode] ?? STYLE.dark} ${p.prompt}${p.negative_note ?? ''}${TAIL}`,
    });
  }
}

const total = jobs.length * ROLLS;
const cost = total * PRICE;
// MiniMax image-01 硬上限 1500 字符，超了整批 2013 报错 —— 白跑一轮，先在本地卡住
const tooLong = jobs.filter(j => j.prompt.length >= 1500);
if (tooLong.length) {
  throw new Error(
    tooLong.map(j => `${j.shot}${j.suffix} prompt ${j.prompt.length} 字符 ≥1500`).join('\n'),
  );
}
const manifest = JSON.parse(fs.readFileSync(path.join(PROJ, 'manifest.json'), 'utf8'));
const spent = manifest.budget.spent_cny ?? 10;
const cap = manifest.budget.caps.still_images;
// 静图这一行已经花掉多少：按单价从流水里加，而不是猜
const stillsSpent = (manifest.budget.spend_log ?? [])
  .filter(e => Math.abs(e.cost - PRICE) < 1e-9)
  .reduce((a, e) => a + e.cost, 0);
const headroom = +(cap - stillsSpent).toFixed(3);
console.log(
  `场 ${jobs.length} × ${ROLLS} 抽 = ${total} 张 · 预计 ¥${cost.toFixed(2)} · 静图额度 ¥${cap} 已用 ¥${stillsSpent.toFixed(2)} 余 ¥${headroom.toFixed(2)} · 全项目已花 ¥${spent}`,
);
if (cost > headroom) {
  throw new Error(`预计 ¥${cost.toFixed(2)} 超静图余额 ¥${headroom} —— 停，先找 K3 加预算`);
}
if (!go) {
  console.log('\nDRY RUN。将生成的任务：');
  for (const j of jobs) console.log(`  ${j.shot}${j.suffix} → ${j.src}  (${j.prompt.length} 字符 prompt)`);
  console.log('\n确认无误后加 --go。');
  process.exit(0);
}

const OUT = path.join(PROJ, '04_assets', 'images');
fs.mkdirSync(OUT, {recursive: true});

async function gen(prompt) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://${HOST}/v1/image_generation`, {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + key, 'Content-Type': 'application/json'},
        body: JSON.stringify({model: 'image-01', prompt, aspect_ratio: '16:9', response_format: 'url'}),
      });
      const j = await r.json();
      if (j.base_resp?.status_code !== 0) throw new Error(JSON.stringify(j.base_resp));
      const u = j.data?.image_urls?.[0];
      if (!u) throw new Error('no url');
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      return buf;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
}

let done = 0;
const log = [];
for (const j of jobs) {
  const base = path.basename(j.src, '.png');
  // 抽号接着磁盘上已有的往下编：从 1 覆盖会把上一批已付费的图直接抹掉
  let start = 0;
  while (fs.existsSync(path.join(OUT, `${base}_r${start + 1}.png`))) start++;
  for (let r = start + 1; r <= start + ROLLS; r++) {
    const out = path.join(OUT, `${base}_r${r}.png`);
    try {
      const buf = await gen(j.prompt);
      fs.writeFileSync(out, buf);
      done++;
      console.log(`  ✓ ${base}_r${r}  ${(buf.length / 1024).toFixed(0)}KB`);
      log.push({t: new Date().toISOString(), item: `${base}_r${r}`, cost: PRICE});
    } catch (e) {
      console.log(`  ✗ ${base}_r${r}  ${String(e.message).slice(0, 90)}`);
    }
  }
}

manifest.budget.spent_cny = +(spent + done * PRICE).toFixed(3);
manifest.budget.spend_log = [...(manifest.budget.spend_log || []), ...log];
manifest.budget.remaining_cny = +(manifest.budget.total_cny - manifest.budget.spent_cny).toFixed(2);
fs.writeFileSync(path.join(PROJ, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(
  `\n生成 ${done}/${total} 张，实扣约 ¥${(done * PRICE).toFixed(2)}；已写进 manifest。余额 ¥${manifest.budget.remaining_cny}`,
);
