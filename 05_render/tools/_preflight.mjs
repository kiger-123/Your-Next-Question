// 渲染前闸门：storyboard 说有底图，public/ 里就必须真有这张图。
// 为什么放在工具侧而不是 src 里：浏览器包里没有 fs，只能在 Node 这边查。
// 踩过的坑：S12 的 <Plate> 漏传 src，占位纯色和兜底背景同色，整场没图却看不出来。
import fs from 'node:fs';
import path from 'node:path';

export function assertPlates(root) {
  const sbPath = path.resolve(root, '..', '03_storyboard', 'ep01.json');
  const pub = path.join(root, 'public');
  const have = new Set(fs.readdirSync(pub));
  const sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
  const bad = [];
  for (const s of sb.shots) {
    const p = s.plate ?? {};
    if (p.kind === 'none' || !p.kind) continue;
    for (const key of ['src', 'alt_src']) {
      if (!p[key]) {
        if (key === 'src') bad.push(`${s.id} plate.kind=${p.kind} 但没有 src`);
        continue;
      }
      const file = p[key].split('/').pop();
      if (!have.has(file)) bad.push(`${s.id} 缺素材 ${file}`);
    }
  }
  if (bad.length) {
    throw new Error(`素材预检未通过：\n  ${bad.join('\n  ')}`);
  }
  const n = sb.shots.filter(s => s.plate?.kind !== 'none').length;
  console.log(`素材预检通过：${n} 个图场的底图都在 public/`);
}
