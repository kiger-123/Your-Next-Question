import React from 'react';
import {AbsoluteFill, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {Line, Plate, Spark, Stamp} from '../kit';
import {C, SERIF, W, H, px} from '../theme';
import {useCaptions, useShot} from '../data';

/**
 * 8 个图场的组件包。每场 = Plate(底图+颗粒+暗角+暖调) + 一个非文字运动层 + 铭牌 + 2 条字幕。
 * ★坐标为初值，须逐场抽帧目视标定到真实底图（S12 的教训：不标定就叠字/悬空）。
 */

const Shell: React.FC<{
  id: string;
  origin?: string;
  scaleMin?: number;
  scaleMax?: number;
  mode?: 'dark' | 'paper';
  sky?: {ground: string; deg: number};
  /** 贴在地面之上的东西（火、火星）：不随天空转，也不被底图的 scale 拉扯 */
  over?: React.ReactNode;
  children?: React.ReactNode;
}> = ({id, origin = '50% 50%', scaleMin, scaleMax = 1.04, mode = 'dark', sky, over, children}) => {
  const shot = useShot(id);
  const caps = useCaptions(id);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Plate
        id={id}
        dur={shot.dur_frame}
        mode={mode}
        scaleMin={scaleMin}
        scaleMax={scaleMax}
        origin={origin}
        sky={sky}
      >
        {children}
      </Plate>
      {over}
      <Stamp en={shot.stamp_en} cn={shot.stamp_cn} mode={mode} from={8} />
      {caps.map(c => (
        <Line key={c.n} cn={c.cn} en={c.en} mode={mode} from={c.from} to={c.to} />
      ))}
      {frame < 0 ? <span /> : null}
    </AbsoluteFill>
  );
};

const CoolGrade: React.FC<{strength?: number}> = ({strength = 0.34}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: `rgba(58,120,168,${strength})`,
      mixBlendMode: 'color',
    }}
  />
);

const at = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, a + b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── S01 仰望：底图是图生视频（真星野缓旋 + 火堆从余烬烧起），代码只补火星/火光/流星 ──
const METEOR = {x0: 46, y0: 4, x1: 62, y1: 21, from: 138, span: 24};
const FIRE = {x: 47.2, y: 89.0};                 // 实测火堆暖像素中心

export const S01: React.FC = () => {
  const frame = useCurrentFrame();
  // 三频不可通约：单频会被看出"呼吸节奏"，两个频比是有理数就会周期性重合成一个样
  const flick =
    0.52 +
    0.48 *
      Math.abs(
        Math.sin(frame / 4.7) * Math.cos(frame / 2.9) * Math.sin(frame / 11.3 + 1.2),
      );
  // 视频里那堆火自己会烧：实测火核亮度 21→87→60（f1/f106/f299），
  // 代码光晕必须跟着这条包络走，否则余烬阶段会被罩出一圈不存在的大火光照。
  const grow = interpolate(frame, [1, 61, 106, 300], [0.24, 0.62, 1.0, 0.71], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const hit =
    frame < METEOR.from + METEOR.span
      ? 0
      : spring({frame: frame - METEOR.from - METEOR.span, fps: 30, config: {damping: 11, stiffness: 150, mass: 0.5}});
  const bump = Math.max(0, hit - 1);
  const mp = clamp01((frame - METEOR.from) / METEOR.span);
  const mAlpha = mp <= 0 || mp >= 1 ? 0 : Math.sin(Math.PI * mp) ** 0.6;
  return (
    <Shell
      id="S01"
      scaleMin={1.02}
      scaleMax={1.05}
      over={
        <>
          {/* L5 火光：两层同心，外层大范围暖光 + 内层火核。
              幅度 = flick（抖动）× grow（视频里那堆火自己的燃烧包络） */}
          <div
            style={{
              position: 'absolute',
              left: `${FIRE.x}%`,
              top: `${FIRE.y}%`,
              width: px(760),
              height: px(520),
              transform: 'translate(-50%,-50%)',
              background: `radial-gradient(ellipse at 50% 50%, rgba(255,158,62,${0.2 * flick * grow}) 0%, rgba(255,140,50,${0.07 * flick * grow}) 34%, transparent 68%)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${FIRE.x}%`,
              top: `${FIRE.y}%`,
              width: px(230),
              height: px(150),
              transform: 'translate(-50%,-50%)',
              background: `radial-gradient(ellipse at 50% 50%, rgba(255,206,140,${0.3 * flick * grow}) 0%, transparent 62%)`,
            }}
          />
          {/* L4 火星：从火堆升起、侧飘、熄灭，周期互质所以不会齐步 */}
          {Array.from({length: 9}, (_, i) => {
            const per = 62 + i * 13;
            const p = ((frame + i * 23) % per) / per;
            const drift = Math.sin(p * Math.PI * 1.6 + i) * (14 + i * 3);
            // 火还没烧旺之前不许冒火星，否则余烬上飘出一串和画面无关的光点
            const live = grow * (0.35 + 0.65 * flick);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${FIRE.x + (i - 4) * 0.55}%`,
                  top: `${FIRE.y - p * 21}%`,
                  width: i % 3 === 0 ? 3 : 2,
                  height: i % 3 === 0 ? 3 : 2,
                  borderRadius: 2,
                  transform: `translate(-50%,-50%) translateX(${drift}px)`,
                  background: `rgba(255,${168 - i * 6},${70 + i * 4},${(1 - p) * live})`,
                  boxShadow: `0 0 ${4 + i % 3}px rgba(255,150,60,${(1 - p) * 0.5 * grow})`,
                }}
              />
            );
          })}
        </>
      }
    >
      {/* 星空不用代码补：底图视频自带密星且自己在缓旋，叠一层位置固定的代码星点反而会被看出"只有它不动"。 */}
      {/* L3 流星：从左上划到 ✳，落点就是 ✳ —— 因果是"流星落下点亮第一块屏幕" */}
      {mAlpha > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: `${METEOR.x0 + (METEOR.x1 - METEOR.x0) * mp}%`,
            top: `${METEOR.y0 + (METEOR.y1 - METEOR.y0) * mp}%`,
            width: px(150),
            height: 2,
            transform: `translate(-100%,-50%) rotate(${Math.atan2(
              (METEOR.y1 - METEOR.y0) * H,
              (METEOR.x1 - METEOR.x0) * W,
            )}rad)`,
            transformOrigin: '100% 50%',
            background: `linear-gradient(to right, transparent 0%, rgba(226,232,240,${mAlpha * 0.35}) 62%, rgba(244,246,250,${mAlpha}) 100%)`,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: '62%',
          top: '21%',
          transform: `translate(-50%,-50%) scale(${1 + 0.45 * bump})`,
          opacity: clamp01(at(frame, 55, 26) * (1 + 0.6 * bump)),
        }}
      >
        <Spark size={34} from={55} />
      </div>
    </Shell>
  );
};

// ── S02 甲骨：裂纹物理化 ─────────────────────────────────────
// 立意：裂开 = 火光从壳里透出来（"灼烧的龟甲"的字面真相）。
// 七条：微段突进+随机停顿 / 段尖 2 帧亮闪 / 整壳 2px 震 3 帧衰减 / 裂下琥珀透光 1.2s 由亮转暗 /
//       3-5 粒碎屑重力弹落 / 火光与裂开同步爆亮 / 朱砂 2s 慢渗、渗满那刻 ✳ 亮。
// 时间轴对齐字幕：cap1「提问，灼烧，裂。」f76-250 蓄热；cap2「灼烧的龟甲裂开…」f270 起 → 裂 f270、渗 f360-420、✳ f420。
const CRACK_O = {x: 640, y: 520};
const CRACK_ARMS: Array<Array<[number, number]>> = (() => {
  let seed = 1300;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const ends: Array<[number, number]> = [[640, 300], [560, 320], [720, 320], [575, 425], [705, 425]];
  return ends.map(([ex, ey]) => {
    const pts: Array<[number, number]> = [[CRACK_O.x, CRACK_O.y]];
    const dx = -(ey - CRACK_O.y), dy = ex - CRACK_O.x;
    const L = Math.hypot(dx, dy) || 1;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const j = i === 10 ? 0 : (rnd() - 0.5) * 9;   // 端点不抖，保住"卜"形走向
      pts.push([CRACK_O.x + (ex - CRACK_O.x) * t + (dx / L) * j,
                CRACK_O.y + (ey - CRACK_O.y) * t + (dy / L) * j]);
    }
    return pts;
  });
})();
const ARM_T0 = [270, 278, 284, 296, 302];
const CRACK_SEG_T: number[][] = CRACK_ARMS.map((arm, a) => {
  let seed = 77 + a * 13;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let t = ARM_T0[a];
  return arm.slice(1).map(() => (t += 3 + Math.round(rnd() * 4)));   // 3-7 帧/段 = 突进 + 停顿
});
const CRACK_DONE = CRACK_SEG_T.flat().sort((a, b) => a - b);
const DEBRIS = [0, 1, 2, 3].map(i => ({
  vx: [-2.2, 1.6, -0.9, 2.6][i],
  up: [4.2, 3.1, 5.0, 2.6][i],
  r: [2, 1.5, 2.5, 1.5][i],
}));
export const S02: React.FC = () => {
  const frame = useCurrentFrame();
  const heat = at(frame, 60, 190);
  const seep = at(frame, 360, 60);
  // 整壳微震：每个段完成时刻给一次 2px 冲量，3 帧衰减
  let sx = 0, sy = 0;
  for (const c of CRACK_DONE) {
    const d = frame - c;
    if (d >= 0 && d < 3) {
      const k = (1 - d / 3) * 2;
      sx += Math.sin(c * 12.9898) * k;
      sy += Math.cos(c * 78.233) * k;
    }
  }
  const armSegs = (a: number) => {
    const pts = CRACK_ARMS[a], T = CRACK_SEG_T[a];
    const out: Array<{x1: number; y1: number; x2: number; y2: number; end: number; grow: boolean}> = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const s = i === 0 ? ARM_T0[a] : T[i - 1];
      const e = T[i];
      if (frame <= s) break;
      const t = Math.min(1, (frame - s) / (e - s));
      out.push({
        x1: pts[i][0], y1: pts[i][1],
        x2: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        y2: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
        end: e, grow: t < 1,
      });
    }
    return out;
  };
  const fireFlash = frame >= 270 && frame < 288 ? (1 - (frame - 270) / 18) * 0.55 : 0;
  return (
    <Shell id="S02" origin="50% 58%" scaleMax={1.05}>
      {/* 蓄热：琥珀光从壳底漫上来（cap1 的"灼烧"） */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '58%', width: px(760), height: px(420),
          transform: 'translate(-50%,-50%)',
          background: `radial-gradient(ellipse at 50% 62%, rgba(255,146,52,${0.30 * heat}) 0%, rgba(255,120,40,${0.10 * heat}) 42%, transparent 70%)`,
          filter: 'blur(2px)',
        }}
      />
      {/* 裂开瞬间火光爆亮一档：因果看得见 */}
      <div
        style={{
          position: 'absolute', left: '50%', top: '84%', width: px(900), height: px(360),
          transform: 'translate(-50%,-50%)',
          background: `radial-gradient(ellipse at 50% 50%, rgba(255,178,86,${fireFlash}) 0%, transparent 66%)`,
        }}
      />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, transform: `translate(${sx}px,${sy}px)`}}>
        <defs>
          <filter id="s02-blur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {/* 裂下透光：火从缝里照上来，1.2s 由亮转暗 */}
        <g filter="url(#s02-blur)">
          {CRACK_ARMS.map((_, a) =>
            armSegs(a).map((s, i) => {
              const g = s.grow ? 1 : Math.max(0.22, 1 - (frame - s.end) / 36);
              return (
                <line key={`g${a}-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                  stroke={`rgba(255,150,58,${0.55 * g})`} strokeWidth={9} strokeLinecap="round" />
              );
            }),
          )}
        </g>
        {/* 朱砂慢渗：不是描边，是 2s 往里洇 */}
        {CRACK_ARMS.map((pts, a) => {
          const len = pts.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
          return (
            <path key={`s${a}`} d={`M ${pts.map(p => p.join(' ')).join(' L ')}`}
              fill="none" stroke="#7a1f14" strokeWidth={4.5} strokeLinecap="round"
              strokeDasharray={`${seep * len} 9999`} opacity={0.85 * seep} />
          );
        })}
        {/* 裂纹本体：微段突进 */}
        {CRACK_ARMS.map((_, a) =>
          armSegs(a).map((s, i) => (
            <line key={`c${a}-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={C.coral} strokeWidth={a === 0 ? 2.8 : 2} strokeLinecap="round" opacity={0.9} />
          )),
        )}
        {/* 段尖 2 帧亮闪 */}
        {CRACK_ARMS.map((_, a) =>
          armSegs(a).map((s, i) =>
            frame - s.end >= 0 && frame - s.end < 2 ? (
              <circle key={`f${a}-${i}`} cx={s.x2} cy={s.y2} r={5}
                fill="rgba(255,224,168,.95)" style={{filter: 'blur(1px)'}} />
            ) : null,
          ),
        )}
        {/* 碎屑：裂开点弹起、重力落下 */}
        {frame >= 270
          ? DEBRIS.map((d, i) => {
              const t = frame - 270;
              const x = CRACK_O.x + d.vx * t;
              const y = CRACK_O.y - d.up * t + 0.32 * t * t;
              const o = Math.max(0, 1 - t / 62);
              return <circle key={`d${i}`} cx={x} cy={y} r={d.r} fill={`rgba(214,150,96,${o * 0.8})`} />;
            })
          : null}
      </svg>
      <div style={{position: 'absolute', left: '50%', top: '56%', transform: 'translate(-50%,-50%)', opacity: at(frame, 420, 26)}}>
        <Spark size={30} from={420} />
      </div>
    </Shell>
  );
};

// ── S03 数沙者：沙堆剖面（实心层理 + 逐颗沙粒）+ 球与外切圆柱移到右上夜空 ──
// 为什么重做：原来那五只描边框悬在左列沙坡上，读作"贴上去的表格"而不是"一堆沙"；
// 用户 2026-09-27 点名"这个圆可以放到右上角，观感不好"。
const MOUND = 'M 8 118 Q 58 44 130 36 Q 206 44 252 118 Z';
const GRAINS = (() => {
  let seed = 20260927;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: Array<[number, number, number]> = [];
  while (out.length < 46) {
    const x = 14 + rnd() * 232;
    const y = 40 + rnd() * 76;
    // 只留在沙堆轮廓以内（抛物线近似），沙堆外的落到"地上"
    const top = 118 - 78 * Math.exp(-(((x - 130) / 78) ** 2));
    if (y > top) out.push([x, y, 0.7 + rnd() * 1.5]);
  }
  return out;
})();
export const S03: React.FC = () => {
  const frame = useCurrentFrame();
  const grow = at(frame, 40, 46);
  const strata = at(frame, 92, 40);
  const geo = at(frame, 236, 40);
  return (
    <Shell id="S03" origin="50% 55%" scaleMax={1.05}>
      {/* 沙堆：坐在人物左手边那片沙地上（底图手尖实测在 45%/63%，划痕在 40–52%/62–65%） */}
      <svg
        width={px(300)}
        height={px(140)}
        viewBox="0 0 260 120"
        style={{
          position: 'absolute',
          left: '20%',
          top: '66%',
          transform: 'translate(-50%,-100%)',
          overflow: 'visible',
        }}
      >
        <defs>
          <clipPath id="s03-mound">
            <path d={MOUND} />
          </clipPath>
          <clipPath id="s03-rise">
            <rect x={0} y={118 - 84 * grow} width={260} height={84 * grow + 4} />
          </clipPath>
        </defs>
        <g clipPath="url(#s03-rise)">
          <path d={MOUND} fill="rgba(214,158,84,0.30)" />
          <g clipPath="url(#s03-mound)">
            {[100, 86, 72, 58].map((y, i) => {
              const p = at(frame, 92 + i * 10, 16);
              return (
                <line
                  key={y}
                  x1={6}
                  y1={y}
                  x2={6 + 248 * p}
                  y2={y}
                  stroke="rgba(242,236,224,0.42)"
                  strokeWidth={1.1}
                  strokeDasharray="5 7"
                />
              );
            })}
          </g>
          <path
            d={MOUND}
            fill="none"
            stroke="rgba(242,236,224,0.66)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {GRAINS.map(([x, y, r], i) => {
            const p = at(frame, 150 + i * 1.2, 8);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r * strata}
                fill={`rgba(246,238,222,${0.55 * p * strata})`}
              />
            );
          })}
        </g>
        {/* 地面线：沙堆必须"坐在"沙上，不能悬着 */}
        <line
          x1={0}
          y1={118}
          x2={260 * grow}
          y2={118}
          stroke="rgba(242,236,224,0.34)"
          strokeWidth={1.2}
        />
      </svg>
      {/* 球与外切圆柱：《数沙者》真正的几何（体积比 1:3），移到右上夜空（实测均值 12.4，全图最暗） */}
      <svg
        width={px(190)}
        height={px(190)}
        viewBox="0 0 200 200"
        style={{
          position: 'absolute',
          left: '79%',
          top: '21%',
          transform: 'translate(-50%,-50%)',
          opacity: geo,
        }}
      >
        <rect
          x={50}
          y={50}
          width={100}
          height={100}
          fill="none"
          stroke={C.paper}
          strokeWidth={1.5}
          strokeDasharray={`${geo * 400} 999`}
          opacity={0.62}
        />
        <circle
          cx={100}
          cy={100}
          r={50}
          fill="none"
          stroke={C.paper}
          strokeWidth={1.5}
          strokeDasharray={`${geo * 320} 999`}
          opacity={0.8}
        />
        {/* 切线：球与圆柱相切的那条直径，交代"外切"这件事 */}
        <line
          x1={50}
          y1={100}
          x2={150}
          y2={100}
          stroke={C.paper}
          strokeWidth={1}
          strokeDasharray={`${geo * 100} 999`}
          opacity={0.34}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: '79%',
          top: '21%',
          transform: 'translate(-50%,-50%)',
          opacity: at(frame, 275, 26),
        }}
      >
        <Spark size={26} from={275} />
      </div>
    </Shell>
  );
};

// ── S04 零：圆点落在最右空槽 + 涟漪 ────────────────────────────
export const S04: React.FC = () => {
  const frame = useCurrentFrame();
  const s = spring({frame: frame - 96, fps: 30, config: {damping: 11}});
  const ripple = at(frame, 100, 46);
  return (
    <Shell id="S04" origin="58% 47%" scaleMax={1.04}>
      {/* 底图给最右空槽打了一层玫瑰暖光，把"珊瑚圆点=全场唯一暖色"这条纪律冲掉了。
          重抽已用完预算，就地用 color 混合把它拉回冷调：只换色度，不动明暗和木纹。
          放在圆点之前，圆点仍是画里最暖的一处。 */}
      <div
        style={{
          position: 'absolute',
          left: '70%',
          top: '47%',
          width: px(210),
          height: px(200),
          transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(ellipse, rgba(150,172,205,.34) 0%, rgba(150,172,205,.16) 52%, rgba(150,172,205,0) 78%)',
          mixBlendMode: 'color',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '70%',
          top: '47%',
          width: 30 * s,
          height: 30 * s,
          borderRadius: 15,
          background: C.coral,
          transform: 'translate(-50%,-50%)',
          boxShadow: '0 0 26px rgba(232,115,90,.85)',
        }}
      />
      {[0, 1, 2].map(i => {
        const p = at(frame, 104 + i * 14, 40);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '70%',
              top: '47%',
              width: (30 + p * 130) * (1 - i * 0.18),
              height: (30 + p * 130) * (1 - i * 0.18),
              borderRadius: '50%',
              border: `1px solid rgba(232,115,90,${(1 - p) * 0.5})`,
              transform: 'translate(-50%,-50%)',
              opacity: ripple > 0 ? 1 : 0,
            }}
          />
        );
      })}
    </Shell>
  );
};

// ── S05 滴，答：整句首封电报持续拍发 + 电键火花 ─────────────────
// 1844-05-24 华盛顿→巴尔的摩 首封电报 "WHAT HATH GOD WROUGHT"。
// 逐字符可核对：W=·−− H=···· A=·− T=− G=−−· O=−−− D=−·· R=·−· U=··−
// 原来只发 WHAT（14 字符 × 4 帧 = 1.9s），14s 的场从第 4.2 秒起就彻底冻住，
// 实测电码条时域残差掉回底图漂移基线 —— 正是用户抱怨的那一类"像静止"。
const MORSE_WORDS: string[][] = [
  ['.--', '....', '.-', '-'],
  ['....', '.-', '-', '....'],
  ['--.', '---', '-..'],
  ['.--', '.-.', '---', '..-', '--.', '....', '-'],
];
// 展平成 token：'.'/ '-' 是码元，' ' 是字符间隔，'_' 是单词间隔
const MORSE = MORSE_WORDS.map(w => w.join(' ')).join(' _ ');
const BEAT = 4;                                // 每 token 4 帧；整句 75 个 token → f70 起、f370 收，正好铺满 14s
const MORSE_T0 = 70;
const WIN = 15;                                // 跑马灯窗口：只显示最近 15 个 token
export const S05: React.FC = () => {
  const frame = useCurrentFrame();
  const shown = Math.min(MORSE.length, Math.floor((frame - MORSE_T0) / BEAT));
  const first = Math.max(0, shown - WIN);
  const beat = ((frame - MORSE_T0) % BEAT) / BEAT;         // 落键相位，发完之后停住
  const pressing = shown > 0 && shown < MORSE.length ? 1 - beat : 0;
  return (
    <Shell id="S05" origin="42% 50%" scaleMax={1.05}>
      {/* 点=圆、划=条，右对齐滚动窗口：新码元从右边落键、旧的往左退出画面，
          所以整场 14 秒一直在"发报"，而不是拍四个字母就定格。
          每个码元落键的那 11 帧：珊瑚闪光 + 一次弹跳，然后退回纸白。 */}
      <div
        style={{
          position: 'absolute',
          left: '26%',
          top: '12%',
          width: px(620),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          whiteSpace: 'nowrap',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 14%, #000 100%)',
          maskImage: 'linear-gradient(to right, transparent 0, #000 14%, #000 100%)',
        }}
      >
        {MORSE.slice(first, Math.max(0, shown)).split('').map((ch, j) => {
          const i = first + j;
          if (ch === ' ' || ch === '_')
            return <span key={i} style={{width: px(ch === '_' ? 30 : 15), display: 'inline-block', flex: '0 0 auto'}} />;
          const age = frame - (MORSE_T0 + i * BEAT);
          const k = clamp01(age / 11);
          const pop = 1 + 0.34 * Math.sin(Math.PI * clamp01(age / 11)) * (1 - k * 0.4);
          const hot = 1 - k;
          const col = `rgba(${Math.round(242 - 10 * hot)},${Math.round(236 - 121 * hot)},${Math.round(224 - 134 * hot)},${0.88 + 0.12 * hot})`;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                flex: '0 0 auto',
                width: (ch === '.' ? px(11) : px(34)) * pop,
                height: px(11) * pop,
                borderRadius: ch === '.' ? px(6) : px(5),
                background: col,
                boxShadow: hot > 0.05 ? `0 0 ${Math.round(20 * hot)}px rgba(232,115,90,${0.85 * hot})` : 'none',
                marginLeft: px(13),
              }}
            />
          );
        })}
      </div>
      {/* 电键上的火花：跟着落键相位一明一灭，和码元同拍 */}
      <div
        style={{
          position: 'absolute',
          left: '55%',
          top: '44%',
          width: px(150),
          height: px(110),
          transform: 'translate(-50%,-50%)',
          opacity: at(frame, 36, 20) * (0.35 + 0.65 * pressing),
          background: `radial-gradient(ellipse at 50% 50%, rgba(255,208,150,${0.5 * pressing}) 0%, rgba(232,115,90,${0.22 * pressing}) 40%, transparent 70%)`,
        }}
      />
      <div style={{position: 'absolute', left: '55%', top: '44%', transform: 'translate(-50%,-50%)', opacity: at(frame, 36, 20)}}>
        <Spark size={28} from={36} />
      </div>
    </Shell>
  );
};

// ── S07 图灵之问：打字机逐字打出两行 ───────────────────────────
const L1 = 'Can machines think?';
const L2 = 'ARTIFICIAL INTELLIGENCE — 1956';
const Typed: React.FC<{text: string; from: number; size: number; left: string; top: string}> = ({
  text,
  from,
  size,
  left,
  top,
}) => {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((frame - from) / 2.6)));
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        fontFamily: '"Courier New", monospace',
        fontSize: size,
        color: 'rgba(24,20,16,.97)',
        whiteSpace: 'nowrap',
        letterSpacing: 0.5,
      }}
    >
      {text.slice(0, n)}
      {n > 0 && n < text.length ? (
        <span style={{borderLeft: '2px solid rgba(30,26,22,.7)', height: size, display: 'inline-block', marginLeft: 2}} />
      ) : null}
    </div>
  );
};
export const S07: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Shell id="S07" origin="42% 50%" scaleMax={1.05}>
      <Typed text={L1} from={58} size={px(42)} left="31%" top="44%" />
      <Typed text={L2} from={250} size={px(21)} left="31%" top="52%" />
      {/* ✳ 落在问号上，不是飘在纸缘：正文 31% 起、19 字符等宽 ≈ 收在 55% */}
      <div style={{position: 'absolute', left: '55.5%', top: '45.5%', opacity: at(frame, 105, 20)}}>
        <Spark size={13} from={105} />
      </div>
    </Shell>
  );
};

// ── S08 接话：荧绿对话逐行滚出 + 行末呼吸光标 ─────────────────
const DIALOG = [
  ['MEN ARE ALL ASHAMED OF ME.', ''],
  ['WHY DO YOU SAY THAT?', ''],
  ['MY BOSS SHAMES ME.', ''],
  ['WHY DO YOU SAY YOUR BOSS SHAMES YOU?', ''],
];
export const S08: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Shell id="S08" origin="50% 50%" scaleMax={1.05}>
      {/* 对话列改到左上近黑区（新底图 r4 实测 x4-34%/y16-46% 均值 5.3）。
          旧位置 31%/36% 是给"整块高饱和绿屏"当贴图用的，新图屏幕只占 1.33% 且在正中，
          再钉在屏幕上就压住机器了 —— 让它浮在暗处，读作"人在暗处，机器在亮处"。 */}
      <div style={{position: 'absolute', left: '5%', top: '22%', width: '38%'}}>
        {DIALOG.map(([line], i) => {
          const start = 46 + i * 44;
          const n = Math.max(0, Math.min(line.length, Math.floor((frame - start) / 1.5)));
          if (frame < start) return null;
          const last = i === DIALOG.length - 1;
          return (
            <div
              key={i}
              style={{
                fontFamily: '"Courier New", monospace',
                fontSize: px(19),
                letterSpacing: 1,
                color: i % 2 === 0 ? 'rgba(150,255,190,.72)' : 'rgba(190,255,210,.95)',
                marginBottom: px(12),
                whiteSpace: 'nowrap',
              }}
            >
              {line.slice(0, n)}
              {last ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: px(9),
                    height: px(9),
                    borderRadius: px(5),
                    background: C.coral,
                    marginLeft: px(6),
                    opacity: 0.45 + 0.55 * Math.abs(Math.sin(frame / 11)),
                    boxShadow: '0 0 10px rgba(232,115,90,.8)',
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Shell>
  );
};

// ── S09 六十四格：扫描光带自上而下横扫 + 落子涟漪 ─────────────
// 扫描光带是这场唯一的"时间在走"：11s 内扫两次。原来 12s 完全静止，全片最长静段。
const SWEEP = 165;
export const S09: React.FC = () => {
  const frame = useCurrentFrame();
  const sweep = (frame % SWEEP) / SWEEP;
  const bandY = -18 + sweep * 136;
  const edge = Math.min(1, Math.sin(Math.PI * sweep));   // 进出画面时收掉，不留硬边
  return (
    <Shell id="S09" origin="50% 68%" scaleMax={1.05}>
      <CoolGrade />
      <div
        style={{
          position: 'absolute',
          left: '-6%',
          top: `${bandY}%`,
          width: '112%',
          height: px(150),
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(176,214,255,0.07) 34%, rgba(206,232,255,0.20) 50%, rgba(176,214,255,0.07) 66%, transparent 100%)',
          filter: 'blur(3px)',
          opacity: 0.35 + 0.65 * edge,
        }}
      />
      {Array.from({length: 9}, (_, i) => {
        const start = 40 + i * 13;
        const p = at(frame, start, 20);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${18 + i * 7.5}%`,
              top: `${78 - i * 4}%`,
              width: px(70) * (1 - i * 0.07),
              height: px(14),
              background: `rgba(150,215,255,${0.72 * p * (1 - i * 0.08)})`,
              filter: 'blur(2px)',
            }}
          />
        );
      })}
      <div style={{position: 'absolute', left: '60%', top: '55%', transform: 'translate(-50%,-50%)', opacity: at(frame, 175, 22)}}>
        <Spark size={26} from={175} />
      </div>
      {[0, 1].map(i => {
        const p = at(frame, 185 + i * 12, 36);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '60%',
              top: '55%',
              width: (26 + p * 120) * (1 - i * 0.25),
              height: (26 + p * 120) * (1 - i * 0.25),
              borderRadius: '50%',
              border: `1px solid rgba(232,115,90,${(1 - p) * 0.55})`,
              transform: 'translate(-50%,-50%)',
            }}
          />
        );
      })}
    </Shell>
  );
};
