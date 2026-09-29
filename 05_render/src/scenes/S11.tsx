import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Line, Plate, Spark, Stamp} from '../kit';
import {C, SERIF, W, H, px} from '../theme';
import {useCaptions, useShot} from '../data';

/**
 * S11 下一个词 · NOW · 零素材场（plate.kind=none，整场代码画 → 整体旋转安全，
 * 不像 S01 有烘焙进底图的 158 颗星会跟代码层对不上速度）。
 *
 * 五段：光标 → 文字流 + 文字云 → 字散成星 → 旋成星河 → 收在瞳孔里的一点 ✳
 *
 * 本轮（运动密度专项）改三处：
 *  ① 成片 134–138s（本场 48–150 帧）原来是"近黑 + 一行斜字"，孤零零读作渲染 bug。
 *     三管齐下：斜字倾角 23°→8°；主句长出的同时再长 8 行候选词元成"文字云"（=下一词的概率空间），
 *     斜字一出现就有上下文；星点落进螺旋从 150 帧提前到 90 帧；并从第 0 帧起有 170 颗远景星在闪。
 *  ② 星点 260→880（×3.4）+ 三条旋臂 + 臂宽 + 银盘/核球辉光，撑住"银河"的体量。
 *     螺旋参数方程不动：r = 18 + 46t、椭圆压扁 1.35/0.62。
 *  ③ 自转改成一条真实的转速曲线：盘面模式速度 2.4°/15s + 较差旋转 ω∝1/r（内缘 +9°、外缘 +1.2°）。
 *     原 frame/260 的"沿臂流转"已删 —— 它不随 r 变，实测各环带同速转 18°/2.7s（零剪切），
 *     是 99°/15s 的刚体转，读作电风扇不读作星系。
 *  ④ 砍掉假自转后补的运动：密度波亮带（相对旋臂滑 60°/15s，只改亮度不改坐标）+ 瞳孔缓放到片尾。
 *
 * 动画一律 useCurrentFrame() + interpolate()，不用 CSS transition/animation（Remotion 官方：不渲染）。
 */
const FLOW = '在很久，很久以前——';

/** 文字云：主句周围的候选词元。x/y 是画面百分比，fs 是 1080p 基准字号（过 px()）。
 *  at 全部排在主句（14 帧起）之前 —— 淡入一结束场上就已经有一片词在浮着，
 *  斜字"出现时就有上下文"，不再是空场里孤零零的一行（这就是 134–138s 读作 bug 的根因）。
 *  qc_special：本场不得出现价格数字或品牌名 —— 这里全是无数字、无专名的虚词。 */
const CLOUD: {t: string; x: number; y: number; fs: number; o: number; at: number}[] = [
  {t: '有一个', x: 17, y: 53, fs: 27, o: 0.3, at: 2},
  {t: '很久以前', x: 29, y: 41, fs: 31, o: 0.34, at: 6},
  {t: '谁在写', x: 49, y: 56, fs: 25, o: 0.26, at: 10},
  {t: '一个名字', x: 62, y: 50, fs: 27, o: 0.28, at: 14},
  {t: '光的尽头', x: 73, y: 58, fs: 25, o: 0.24, at: 18},
  {t: '然后', x: 23, y: 32, fs: 23, o: 0.22, at: 22},
  {t: '星', x: 44, y: 26, fs: 25, o: 0.22, at: 26},
  {t: '还没有说完', x: 55, y: 36, fs: 23, o: 0.24, at: 30},
];

const rnd = (n: number) => {
  const x = Math.sin(n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const CX = W * 0.65;
const CY = H * 0.35;
const ARMS = 3;
const NSTAR = 880;
const DEG = Math.PI / 180;

const at = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, a + b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

/** 星点：沿臂均匀铺 t，再给半径/角度抖动 → 有"臂宽"的一团，而不是一条细点链 */
const STARS = Array.from({length: NSTAR}, (_, i) => {
  const arm = i % ARMS;
  const along = Math.floor(i / ARMS) / (NSTAR / ARMS);
  const t = 0.3 + along * 4.6;
  const jit = rnd(i * 1.37 + 0.11);
  const w = 6 + along * 30;
  return {
    arm,
    t,
    jit,
    dr: (rnd(i * 2.71 + 0.37) - 0.5) * 2 * w,
    da: ((rnd(i * 5.13 + 1.9) - 0.5) * 2 * w) / (18 + t * 46),
    per: 20 + rnd(i * 3.31) * 34,
    ph: rnd(i * 7.71) * 628,
    big: jit > 0.958,
  };
});

// 前景虚星：景深用的最上一层，比星野漂得慢、大而糊
const FG = (() => {
  let seed = 90210;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return Array.from({length: 11}, () => ({
    x: px(120) + rnd() * (W - px(240)),
    y: px(60) + rnd() * (H * 0.6),
    r: px(5) + rnd() * px(6),
    ph: rnd() * 6.28,
  }));
})();
/** 远景星：独立于星河，第 0 帧就在闪 + 极缓漂移，负责把"空场"填住 */
const BG = Array.from({length: 170}, (_, i) => ({
  x: rnd(i * 1.93 + 0.4) * W,
  y: rnd(i * 4.31 + 1.7) * H * 0.62,
  r: px(1.2) + rnd(i * 2.21) * px(2.6),
  per: 30 + rnd(i * 5.51) * 70,
  ph: rnd(i * 8.13) * 628,
  o: 0.06 + rnd(i * 3.71) * 0.2,
  vx: (rnd(i * 6.61) - 0.5) * 0.09,
  vy: (rnd(i * 9.23) - 0.5) * 0.05,
}));

type Glyph = {
  ch: string;
  bx: number;
  by: number;
  at: number;
  fs: number;
  op: number;
  t: number;
  arm: number;
  dly: number;
};

/** 主句 + 文字云合成一张字表：每个字都有自己的落点参数，散开时一起飞进螺旋 */
const GLYPHS: Glyph[] = (() => {
  const out: Glyph[] = [];
  [...FLOW].forEach((ch, i) => {
    out.push({
      ch,
      bx: W * 0.25 + px(33) + i * px(45),
      by: H * 0.7 - px(39) - i * px(6), // 斜度 8°（原 23°：i*13 → i*px(6)）
      at: 14 + i * 3.4,
      fs: px(51),
      op: 1,
      t: 0.5 + i * 0.34,
      arm: i % ARMS,
      dly: rnd(i * 3.11) * 26,
    });
  });
  let n = 0;
  CLOUD.forEach((ln, li) => {
    [...ln.t].forEach((ch, i) => {
      const k = n++;
      out.push({
        ch,
        bx: (W * ln.x) / 100 + i * px(ln.fs + 7),
        by: (H * ln.y) / 100 + Math.sin(i * 0.9 + li) * px(7),
        at: ln.at + i * 4,
        fs: px(ln.fs),
        op: ln.o,
        t: 0.4 + rnd(k * 7.13 + 0.7) * 3.9,
        arm: (k + li) % ARMS,
        dly: 26 + rnd(k * 2.31) * 30,
      });
    });
  });
  return out;
})();

export const S11: React.FC = () => {
  const frame = useCurrentFrame();
  const shot = useShot('S11');
  const caps = useCaptions('S11');
  const D = shot.dur_frame;

  // 分段时点（星河起形比原版提前 60 帧，压掉成片 134–138s 那 5 秒空场）
  const T_STAR = 90; // 星点开始落进螺旋
  const T_DISPERSE = 104; // 字开始散开
  const T_GALAXY = 160;
  const T_CORE = 285;

  // ③ 旋转只留一条自转曲线（两个量都是"同一个天体的转速分布"，不是两套互相打架的转法）：
  //    SPIN = 旋臂系统的模式速度，整个盘面绕核刚体转 2.4°/15s（线性，不用 ease）；
  //    WIND = 较差旋转，平坦转速曲线 → 附加角速度 ∝ 1/r，内缘再 +9°、外缘再 +1.2°。
  //    为什么删掉原来的 flow=frame/260：它加在角度上却不随 r 变，实测 f240→f320 各环带
  //    （r=20–60 一直到 240–340）同步转 18.0°、剪切为零 → 那不是"星点沿臂滑动"，
  //    而是 99°/15s 的刚体转，等于把星系当电风扇开。
  const SPIN = (frame / D) * 2.4 * DEG;
  const WIND = (frame / D) * 9 * DEG;
  const R_IN = 18 + 0.3 * 46; // 最内圈星点半径（t=0.3），较差旋转的归一化基准
  // 密度波：一条低对比亮带以 60°/15s 相对旋臂滑过盘面 —— 星点不跟着动，"亮起来的次序"在动。
  // 这是砍掉 99° 假自转后补的主运动源（螺旋星系的旋臂本来就是密度波），负责最后 5 秒不成为静图。
  const WAVE = (frame / D) * 60 * DEG;
  const grow = at(frame, T_GALAXY, 78);
  const rMul = 0.35 + grow * 0.65;
  const pulse = 0.86 + 0.14 * Math.sin(frame / 41);

  // 光标跟着书写头走（原来钉死在 25%/70%，读作贴图）
  const head = Math.max(0, Math.min(FLOW.length, Math.floor((frame - 14) / 3.4) + 1));
  const curX = W * 0.25 + px(33) + head * px(45) + px(9);
  const curY = H * 0.7 - px(39) - head * px(6);
  const curO = (Math.floor(frame / 16) % 2 === 0 ? 0.9 : 0.12) * (1 - at(frame, T_DISPERSE - 12, 24));

  /** 螺旋：与星河同一套参数方程，字和星共用 → 字落进星海里不会错位。
   *  较差旋转按 r 分配（∝1/r），所以外臂几乎不转、内圈绕得快 —— 星系该有的样子。 */
  const spiral = (t: number, arm: number, dr = 0, da = 0) => {
    const r0 = 18 + t * 46;
    const r = r0 * rMul + dr;
    const a = SPIN + WIND * (R_IN / r0) + t + (arm * 2 * Math.PI) / ARMS + da;
    return [CX + Math.cos(a) * r * 1.35, CY + Math.sin(a) * r * 0.62] as const;
  };

  return (
    <AbsoluteFill>
      <Plate id="S11" dur={D} mode="dark" scaleMax={1.02} background="#04060d" origin="65% 35%">
        {/* ① 银盘 + 核球：先有"体"再有点，否则"银河"撑不起来 */}
        <div
          style={{
            position: 'absolute',
            left: CX,
            top: CY,
            width: px(1180),
            height: px(560),
            transform: `translate(-50%,-50%) rotate(${SPIN / DEG}deg)`,
            background:
              'radial-gradient(ellipse at center, rgba(255,214,160,.15) 0%, rgba(226,150,96,.06) 34%, rgba(120,90,70,0) 70%)',
            opacity: grow * pulse,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: CX,
            top: CY,
            width: px(320),
            height: px(190),
            transform: 'translate(-50%,-50%)',
            background:
              'radial-gradient(ellipse 50% 50% at center, rgba(255,238,208,.34) 0%, rgba(255,196,132,.11) 44%, rgba(255,196,132,0) 100%)',
            opacity: grow * pulse,
          }}
        />

        {/* ⓪ 远景星 + ② 星河星点 */}
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          <defs>
            <filter id="s11dust" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
            <filter id="s11fg" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
            <radialGradient id="s11halo">
              <stop offset="0%" stopColor="rgba(255,158,116,.34)" />
              <stop offset="45%" stopColor="rgba(232,115,90,.12)" />
              <stop offset="100%" stopColor="rgba(232,115,90,0)" />
            </radialGradient>
          </defs>
          {BG.map((b, i) => {
            if (b.x < px(430) && b.y < px(240)) return null; // 让开左上铭牌
            const x = b.x + ((frame * b.vx) % 40) - 20;
            const y = b.y + ((frame * b.vy) % 26) - 13;
            const o = b.o * (0.35 + 0.65 * Math.abs(Math.sin((frame + b.ph) / b.per)));
            return <circle key={`b${i}`} cx={x} cy={y} r={b.r} fill="#ded9cf" opacity={o} />;
          })}
          {STARS.map((s, i) => {
            const [x, y] = spiral(s.t, s.arm, s.dr * (0.45 + grow * 0.55), s.da);
            if (x < -12 || x > W + 12 || y < -12 || y > H * 0.72) return null;
            const tw = 0.32 + 0.68 * Math.abs(Math.sin((frame + s.ph) / s.per));
            // 密度波：按星点当前极角取一条三重低对比亮带，带子相对旋臂缓慢滑过
            const ang = Math.atan2((y - CY) / 0.62, (x - CX) / 1.35);
            const wave = 0.85 + 0.15 * Math.cos(3 * (ang - WAVE));
            const appear = at(frame, T_STAR + s.jit * 78, 30 + s.jit * 20);
            // 边缘软衰减：外臂淡出，不要在画框上留硬边；下缘淡进字幕压暗区
            const fade =
              (1 - Math.min(1, Math.abs(x - CX) / (W * 0.55)) * 0.35) *
              (1 - interpolate(y, [H * 0.6, H * 0.72], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));
            const o = appear * tw * fade * wave * (0.5 + 0.5 * grow);
            if (o <= 0.012) return null;
            const size = (s.big ? px(4.4) : px(1.6) + s.jit * px(2.4)) * (0.82 + grow * 0.3);
            const fill = s.jit > 0.88 ? C.coral : s.jit > 0.62 ? C.gold : '#eae6dc';
            return (
              <g key={i}>
                {s.big ? <circle cx={x} cy={y} r={size * 4.4} fill="url(#s11halo)" opacity={o} /> : null}
                <circle cx={x} cy={y} r={size} fill={fill} opacity={Math.max(0, o) * 0.9} />
              </g>
            );
          })}
          {/* 暗尘带：画在星点**之后**才有体积 —— 它的作用是遮住一部分星，
              读作旋臂内侧的尘埃。只走外段（t≥0.25），不碰核球。
              与星点共用同一个 spiral()，所以跟旋转严格同轴同速，不会错位。 */}
          <g filter="url(#s11dust)">
            {Array.from({length: ARMS}, (_, arm) => {
              const pts: string[] = [];
              for (let k = 0; k <= 22; k++) {
                const t = 0.25 + (k / 22) * 0.72;
                const [x, y] = spiral(t, arm, -px(15));
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
              }
              return (
                <polyline
                  key={`dust${arm}`}
                  points={pts.join(' ')}
                  fill="none"
                  stroke="rgba(5,7,13,0.62)"
                  strokeWidth={px(24)}
                  strokeLinecap="round"
                  opacity={0.9 * grow}
                />
              );
            })}
          </g>
          {/* 景深：前景十来颗大而虚的星，漂得比星野慢 —— 一眼就有纵深 */}
          <g filter="url(#s11fg)">
            {FG.map((f, i) => (
              <circle
                key={`fg${i}`}
                cx={f.x + Math.sin(frame / 210 + f.ph) * px(9)}
                cy={f.y + Math.cos(frame / 260 + f.ph) * px(6)}
                r={f.r}
                fill="#efe9dd"
                opacity={0.16 + 0.1 * Math.abs(Math.sin((frame + f.ph * 40) / 90))}
              />
            ))}
          </g>
          {/* 中心瞳：285 帧张开到 39px，之后一路缓放到片尾（同一个珊瑚元素，不新增暖色）
              —— 最后 4 秒的"事件"，否则 ✳ 弹入落定后这一带就死住了 */}
          <circle
            cx={CX}
            cy={CY}
            r={interpolate(frame, [T_CORE, T_CORE + 40, D], [0, px(39), px(66)], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}
            fill="rgba(232,115,90,.10)"
          />
        </svg>

        {/* ② 文字流 + 文字云 → ③ 散成星点 */}
        {GLYPHS.map((g, gi) => {
          const o = at(frame, g.at, 9);
          const dis = at(frame, T_DISPERSE + g.dly, 104);
          const [tx, ty] = spiral(g.t, g.arm);
          const float = Math.sin((frame + gi * 7) / 26) * px(2.4) * (1 - dis);
          const x = g.bx + (tx - g.bx) * dis;
          const y = g.by + float + (ty - g.by) * dis;
          // 飞到后半程就该"字没了、星有了"，别在银盘里留一堆半透明残字
          const gone = (1 - dis) * (1 - dis * 0.5);
          return (
            <div
              key={gi}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                fontFamily: SERIF,
                fontSize: g.fs * (1 - dis * 0.7),
                color: C.paper,
                opacity: o * gone * g.op,
                whiteSpace: 'pre',
              }}
            >
              {g.ch}
            </div>
          );
        })}

        {/* ① 光标 */}
        {curO > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: curX,
              top: curY - px(6),
              width: px(4),
              height: px(45),
              background: C.paper,
              opacity: curO,
            }}
          />
        ) : null}

        <div
          style={{
            position: 'absolute',
            left: CX - px(39),
            top: CY - px(39),
            opacity: at(frame, T_CORE, 30),
          }}
        >
          <Spark size={px(78)} from={T_CORE} />
        </div>
      </Plate>
      <Stamp en={shot.stamp_en} cn={shot.stamp_cn} mode="dark" from={8} />
      {caps.map(c => (
        <Line key={c.n} cn={c.cn} en={c.en} mode="dark" from={c.from} to={c.to} />
      ))}
    </AbsoluteFill>
  );
};
