import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame} from 'remotion';
import {Line, Plate, Spark, Stamp} from '../kit';
import {C, colorsFor, H, px, SERIF, W} from '../theme';
import {useCaptions, useShot} from '../data';

/**
 * S06 比特 · 1948 · 零素材场：storyboard 里 plate.kind='none'，没有任何底图，
 * 宣纸底与全部图形由代码画。
 *
 * 上一版逐帧实测的四个毛病，以及这版怎么治：
 *  1. 开场 4 秒空白宣纸（f110 才开始出主体）→ 0/1 改为 f0 起 spring 收拢，
 *     14 帧内落位；雨从 f0 就是满密度。first 帧（f22）不再是一张白纸。
 *  2. 0/1 分居 x≈25%/75%，中间一大片空，✳ 悬在空里读作"没对齐"
 *     → 两者收拢进中央带（x≈39%/61%），中间那条缝用一根桥线连起来，
 *       ✳ 正压在桥的中点上，和两个数字共享同一条光学中线。
 *       ✳ 因此是"把两态连成一物"的接头，不是装饰。
 *  3. 雨看不出在下落（每颗字独立取 y，没有拖尾，还会两两撞在一起）
 *     → 改成真正的"列"：每列一串等距字元整体下滑，头部最亮、往上衰减。
 *       前后两层不同字号/速度/浓度，列速错开。底边在字幕区之前淡到 0。
 *  4. 左侧 ASCII 表（01000011 = C）太淡太碎、f200 才出现
 *     → 删掉，换成居中的「A → 7 个比特格」。它直接演出本场论点
 *       （一个符号被量成一串二态），比八行小字可读，且能逐格填上。
 *
 * 硬约束：动画只用 useCurrentFrame + interpolate/spring（Remotion 明确不支持
 * CSS transition/animation/Tailwind 动画类）；尺寸一律 px()，颜色一律 C/colorsFor；
 * 字幕只从 useCaptions 来，代码里不许硬写文案。
 */

const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** 由 theme 的 hex 派生带透明度的色，避免在场景里重抄一遍 #2b2620 */
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const INK = colorsFor('paper').main;
const ink = (a: number) => rgba(INK, a);
const paper = (a: number) => rgba(C.paper, a);
const mute = (a: number) => rgba(C.paperMute, a);
const coral = (a: number) => rgba(C.coral, a);

/* ── 版面：位置用 W/H 比例（随画幅走），凡尺寸一律 px()（1080p 基准 → 720p）── */
const HERO_Y = H * 0.4; // 0 / ✳ / 1 共用的光学中线（实测数字墨迹中心 = 行盒中心 + px(17)）
const X0 = W * 0.39; // 落位
const X1 = W * 0.61;
const X0_WIDE = W * 0.13; // 起始（画外两侧）
const X1_WIDE = W * 0.87;
const GLYPH = px(222);
const SPARK = px(96);
const RULE_W = px(304); // 桥长：刚好是两字内缘之间的距离
const STRIP_Y = H * 0.6;
/** 雨的下边界压在字幕区上沿之前；实测 f22 底部 40% 空掉就是被这里卡死的 */
const RAIN_BOTTOM = H * 0.74;
const RAIN_TOP_FADE = px(90);
const RAIN_BOT_FADE = H * 0.5;

/**
 * 一列雨 = 一串等距字元整体下滑，头部（最下）最亮、往上衰减。
 * 每列固定字序（不逐帧重随机）→ 不闪，读作"在下落"而不是"在闪烁"。
 * 头部行程要越过下边界再多走一整条串长（cycle = 底 + 2×串长），
 * 否则"屏幕上某点被覆盖"只发生在头部 ∈ [y, y+串长]，底部必然稀疏 —— 实测密度差 5 倍。
 */
const Rain: React.FC<{
  cols: number;
  trail: number;
  cell: number;
  size: number;
  lo: number;
  hi: number;
  alpha: number;
  seed: number;
}> = ({cols, trail, cell, size, lo, hi, alpha, seed}) => {
  const frame = useCurrentFrame();
  const span = trail * cell;
  const cycle = RAIN_BOTTOM + 2 * span;
  const cells: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    const x = ((c + 0.5) / cols) * W;
    const speed = lo + rnd(seed + c * 1.7) * (hi - lo);
    const phase = rnd(seed + c * 3.3 + 11) * cycle;
    const depth = 0.5 + rnd(seed + c * 5.1 + 23) * 0.5;
    const lead = ((frame * speed + phase) % cycle) - span;
    for (let k = 0; k < trail; k++) {
      const y = lead - k * cell;
      if (y < -cell || y > RAIN_BOTTOM) continue;
      // 上下边缘淡出：字元不从画外"啪"地切入，也不压进字幕区
      const edge =
        Math.min(1, Math.max(0, y / RAIN_TOP_FADE)) *
        Math.min(1, Math.max(0, (RAIN_BOTTOM - y) / (RAIN_BOTTOM - RAIN_BOT_FADE)));
      const a = alpha * depth * Math.pow(1 - k / trail, 1.6) * edge;
      if (a < 0.025) continue;
      cells.push(
        <div
          key={`${c}-${k}`}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%,-50%)',
            fontFamily: SERIF,
            fontSize: size,
            lineHeight: 1,
            color: ink(a),
          }}
        >
          {rnd(seed + c * 13.7 + k * 2.9) > 0.5 ? '1' : '0'}
        </div>,
      );
    }
  }
  return <AbsoluteFill style={{pointerEvents: 'none'}}>{cells}</AbsoluteFill>;
};

/** 中央带后面那块纸色"净面"：让 0 ✳ 1 从雨里脱出来。
 *  宽度只兜住主体（实测画到 W*0.78 会把中场整片雨抹掉，能量掉一半） */
const Clearing: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: W * 0.5,
        top: HERO_Y,
        width: W * 0.54,
        height: H * 0.44,
        transform: 'translate(-50%,-50%)',
        opacity: interpolate(frame, [2, 22], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
        background: `radial-gradient(ellipse at 50% 50%, ${paper(0.84)} 0%, ${paper(0.5)} 44%, ${paper(0)} 76%)`,
      }}
    />
  );
};

/** 0 与 1：f0 起从画两侧收拢进中央带，14 帧内落位 */
const Glyphs: React.FC = () => {
  const frame = useCurrentFrame();
  const cfg = {damping: 17, stiffness: 210, mass: 0.9};
  const s0 = spring({frame, fps: 30, config: cfg});
  const s1 = spring({frame: frame - 2, fps: 30, config: cfg});
  const cell = (v: string, s: number, from: number, to: number) => (
    <div
      style={{
        position: 'absolute',
        left: from + (to - from) * s,
        // Noto Serif SC 的行盒很高：墨迹中心比行盒中心低 px(17)（实测）。
        // 不补偿的话 0/1 会比 ✳ 和桥线低 20px，正好毁掉"对齐"这个设计意图。
        top: HERO_Y - px(17),
        transform: `translate(-50%,calc(-50% + ${(1 - s) * px(34)}px))`,
        fontFamily: SERIF,
        fontSize: GLYPH,
        lineHeight: 1,
        color: INK,
        opacity: Math.min(1, Math.max(0, s * 1.5)),
        textShadow: colorsFor('paper').shadow,
        whiteSpace: 'pre',
      }}
    >
      {v}
    </div>
  );
  return (
    <>
      {cell('0', s0, X0_WIDE, X0)}
      {cell('1', s1, X1_WIDE, X1)}
    </>
  );
};

/**
 * 桥：一条细线把两个态连起来，✳ 压在正中点上，一颗比特沿线来回走。
 * 这根线就是"0 和 1 不是两块地方，是同一把尺子的两端"。
 */
const Bridge: React.FC = () => {
  const frame = useCurrentFrame();
  const grow = spring({frame: frame - 14, fps: 30, config: {damping: 19, stiffness: 150}});
  const P = 136; // 来回一次 ~4.5s
  const q = frame < 34 ? 0 : (((frame - 34) % P) / P);
  const tri = q < 0.5 ? q * 2 : 2 - q * 2;
  const dotX = interpolate(tri, [0, 1], [W * 0.5 - RULE_W / 2, W * 0.5 + RULE_W / 2]);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: W * 0.5,
          top: HERO_Y,
          width: RULE_W,
          height: px(2),
          transform: `translate(-50%,-50%) scaleX(${Math.max(0, grow)})`,
          background: `linear-gradient(90deg, ${ink(0)} 0%, ${ink(0.36)} 20%, ${ink(0.36)} 80%, ${ink(0)} 100%)`,
        }}
      />
      {frame >= 34 ? (
        <div
          style={{
            position: 'absolute',
            left: dotX,
            top: HERO_Y,
            width: px(11),
            height: px(11),
            transform: 'translate(-50%,-50%)',
            borderRadius: px(8),
            background: C.coral,
            boxShadow: `0 0 ${px(18)}px ${coral(0.8)}`,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: W * 0.5,
          top: HERO_Y,
          transform: 'translate(-50%,-50%)',
        }}
      >
        <Spark size={SPARK} from={8} />
      </div>
    </>
  );
};

/** 「A → ▮▯▯▯▯」：一个符号被量成一串二态，替掉原来那三行看不清的 ASCII */
const CHAR = 'A';
const BITS = '1000001'; // 65 → 七位
const BitStrip: React.FC = () => {
  const frame = useCurrentFrame();
  const cw = px(36);
  const ch = px(50);
  const head = interpolate(frame, [6, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const arrow = interpolate(frame, [10, 20], [0, 0.75], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scan = frame > 40 ? Math.floor((frame - 40) / 8) % BITS.length : -1;
  return (
    <>
      {/* 自己的一小块净面：实测有雨列正好从第 5、6 格之间穿过去，把格子糊掉。
          必须是兄弟节点而不是 flex 子项 —— 定位元素会画在普通流内容之上。 */}
      <div
        style={{
          position: 'absolute',
          left: W * 0.5,
          top: STRIP_Y,
          width: px(700),
          height: px(230),
          transform: 'translate(-50%,-50%)',
          opacity: head,
          background: `radial-gradient(ellipse at 50% 50%, ${paper(0.9)} 0%, ${paper(0.62)} 46%, ${paper(0)} 76%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: W * 0.5,
          top: STRIP_Y,
          transform: 'translate(-50%,-50%)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontSize: px(46),
            lineHeight: 1,
            color: ink(0.88),
            opacity: head,
          }}
        >
          {CHAR}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: px(30),
            lineHeight: 1,
            color: mute(0.9),
            margin: `0 ${px(16)}px`,
            opacity: arrow,
          }}
        >
          →
        </div>
        {BITS.split('').map((b, i) => {
          const at = 14 + i * 4;
          const p = interpolate(frame, [at, at + 9], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const hot = i === scan;
          const one = b === '1';
          return (
            <div
              key={i}
              style={{
                width: cw,
                height: ch,
                marginLeft: i ? px(11) : 0,
                boxSizing: 'border-box',
                border: `${px(2)}px solid ${hot ? coral(0.9) : ink(0.34)}`,
                background: one ? ink(hot ? 0.94 : 0.86 * p) : 'transparent',
                opacity: p,
                transform: `translateY(${(1 - p) * px(10)}px)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: hot ? `0 0 ${px(16)}px ${coral(0.55)}` : 'none',
              }}
            >
              <span
                style={{
                  fontFamily: SERIF,
                  fontSize: px(24),
                  lineHeight: 1,
                  color: one ? paper(0.95) : ink(0.5),
                }}
              >
                {b}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};

export const S06: React.FC = () => {
  const shot = useShot('S06');
  const caps = useCaptions('S06');
  return (
    <AbsoluteFill>
      <Plate id="S06" dur={shot.dur_frame} mode="paper" scaleMax={1.04} background={C.paper} origin="50% 42%">
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(175deg, #f6f1e6 0%, #efe7d8 55%, #e7dcc9 100%)',
          }}
        />
        {/* 竖纹：稿纸感，密度按 1080p 基准走 px() */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `repeating-linear-gradient(90deg, ${mute(0.07)} 0 ${px(2)}px, transparent ${px(2)}px ${px(93)}px)`,
          }}
        />
        {/* 后层：小、慢、淡；前层：大、快、重。两层错开才有"在下落"的纵深 */}
        <Rain cols={14} trail={6} cell={px(42)} size={px(26)} lo={px(5)} hi={px(9)} alpha={0.2} seed={3} />
        <Rain cols={12} trail={9} cell={px(38)} size={px(38)} lo={px(11)} hi={px(22)} alpha={0.72} seed={71} />
        <Clearing />
        <Glyphs />
        <Bridge />
        <BitStrip />
      </Plate>
      <Stamp en={shot.stamp_en} cn={shot.stamp_cn} mode="paper" from={6} />
      {caps.map(c => (
        <Line key={c.n} cn={c.cn} en={c.en} mode="paper" from={c.from} to={c.to} />
      ))}
    </AbsoluteFill>
  );
};
