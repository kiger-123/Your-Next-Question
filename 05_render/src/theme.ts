// L0 风格宪法 —— 代码化。改这里之前先改 00_bible/DESIGN.md。
// 基准设计在 1080p 下标定，成片 720p30 → 全部尺寸乘 K（manifest frozen_specs 的推论）。

export const W = 1280;
export const H = 720;
export const FPS = 30;
export const K = H / 1080; // 0.6667

export const px = (v: number) => Math.round(v * K);

export const C = {
  ink: '#0a0f1e',
  paper: '#f2ece0',
  paperInk: '#2b2620',
  paperMute: '#6b6357',
  mute: '#8f8878',
  coral: '#e8735a',
  gold: '#b98b3f',
};

export const SERIF = '"Noto Serif SC", "Songti SC", serif';

/* ── 调色层 v2（K3 审查结论，零成本、全片生效）──
 * 三层由 src/index.tsx 在 Composition 根上统一叠（见 kit.tsx GradeLayers 的注释）。
 * 1) 黑位不再死黑：lighten 兜一层暗暖色，任何像素不得低于该值
 * 2) 暖琥珀当空气而不是点缀：低透明度 screen 雾层，暗部也被暖光晕染
 * 3) 铭牌/字幕对比：sub 提亮一档，字幕底部加压暗渐变托底
 * 验收口径：黑位 ≥ IRE 5（tools/qc-sheet.py 断言，实测落在 8~10）
 */
export const BLACK_FLOOR = '#121008';        // lighten 兜底，≈IRE 6
export const HAZE = 'rgba(255,176,92,0.045)'; // 暖琥珀雾：0.075 实测把黑位顶到 11.4%，超出 5–10 口径
export const HAZE_DIR = 'rgba(255,196,120,0.035)';
export const SCRIM_DARK = 'linear-gradient(to top, rgba(18,16,8,.74) 0%, rgba(18,16,8,.40) 44%, rgba(18,16,8,0) 100%)';
export const SCRIM_PAPER = 'linear-gradient(to top, rgba(247,242,231,.86) 0%, rgba(247,242,231,.45) 46%, rgba(247,242,231,0) 100%)';

/** 版式尺寸：括号内为 1080p 基准值 */
export const T = {
  captionSize: px(46), // 24 全角 × (46+5) × K = 816px，占 1280 的 64%
  captionTrack: px(5),
  captionBottom: px(96),
  enSize: px(25),
  enTrack: px(2.5),
  stampEn: px(27),
  stampEnTrack: px(6),
  stampCn: px(20),
  stampCnTrack: px(4),
  stampX: px(104),
  stampY: px(92),
  stampRuleW: px(44),
  marginX: px(104),
  marginY: px(84),
};

export type Mode = 'dark' | 'paper';

export const colorsFor = (mode: Mode) =>
  mode === 'dark'
    ? {main: C.paper, sub: 'rgba(242,236,224,.72)', shadow: '0 2px 15px rgba(0,0,0,.92)'}
    : {main: C.paperInk, sub: 'rgba(43,38,32,.62)', shadow: '0 1px 8px rgba(255,252,245,.85)'};

/** 硬规则：静图场推镜 ≤1.05、视频场 ≤1.06（image-01 与画布同为 1280×720，零头寸） */
export const PLATE_SCALE = {static: [1.0, 1.05], video: [1.0, 1.06]} as const;

export const assertScale = (kind: 'static' | 'video', s: number) => {
  const max = PLATE_SCALE[kind][1];
  if (s > max) throw new Error(`plate scale ${s} 超过 ${kind} 场上限 ${max}（见方案 §15.4）`);
};
