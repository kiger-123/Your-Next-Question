import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {Line, Plate, Spark} from '../kit';
import {C, H, SERIF, W, px} from '../theme';
import {plateOf, useCaptions, useShot} from '../data';

/*
 * S13 回扣 + 落版 · 一票否决场。上半深夜书桌（光标即 ✳），下半回到四万年前的岩壁。
 *
 * 2026-09-27 v2 改动（方案 §3.2 / §3.3）：
 *  1) N1 矩形残影：a→b 不再做 opacity 交叉淡化，改成「前半淡出到黑位 → 后半从黑位淡入」，
 *     中间垫一层不透明 floor，任何一帧都不会同时看见两张底图。
 *  2) 手印按压三段：软手形阴影压上(15f) → 径向遮罩把底图里本来就有的那个手印显影出来(24f)
 *     → ✳ 在掌心亮起(18f)。有机形状全部来自 r5 底图，代码只画阴影、遮罩、光。
 *  3) 上半场那块琥珀屏加"活"：极淡扫描线 + 上下明暗结构 + 一条慢速刷新扫光 + 光标余辉。
 *  4) 画面内的 AI 生成说明整行删除（endcard.compliance 已在 storyboard 置 null）。
 *
 * 坐标一律从 storyboard 的 anchors 读，不写死。唯一例外是掌心 —— 见 aPalm 上方的注释。
 */

type Anch = {role: string; x: number; y: number; at?: number; w?: number; h?: number};

/** 手形阴影：一团带指缝暗示的软暗斑。指叶之间留缝，但 ≥13px 的模糊会把它们糊成一团 —— 不画解剖细节。 */
const HandShadow: React.FC<{
  x: number;
  y: number;
  o: number;
  s: number;
  blur: number;
  dx: number;
  dy: number;
}> = ({x, y, o, s, blur, dx, dy}) => {
  if (o <= 0.004) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${s})`,
        opacity: o,
        filter: `blur(${blur}px)`,
      }}
    >
      <svg width={196} height={216} viewBox="0 0 196 216">
        <g fill="#07060a">
          <ellipse cx={98} cy={144} rx={60} ry={50} />
          <ellipse cx={58} cy={82} rx={15} ry={46} transform="rotate(-14 58 82)" />
          <ellipse cx={87} cy={64} rx={15} ry={52} transform="rotate(-3 87 64)" />
          <ellipse cx={117} cy={67} rx={15} ry={50} transform="rotate(7 117 67)" />
          <ellipse cx={145} cy={87} rx={14} ry={41} transform="rotate(18 145 87)" />
          <ellipse cx={42} cy={150} rx={19} ry={35} transform="rotate(-54 42 150)" />
        </g>
      </svg>
    </div>
  );
};

export const S13: React.FC = () => {
  const frame = useCurrentFrame();
  const shot = useShot('S13');
  const caps = useCaptions('S13');
  const D = shot.dur_frame;
  const SPLIT = (shot as {split_at_frame?: number}).split_at_frame ?? 210;
  const anchors = ((shot as {anchors?: Anch[]}).anchors ?? []) as Anch[];
  const anc = (role: string) => anchors.find(a => a.role === role);
  const ec = (shot as {endcard?: Record<string, string | null>}).endcard ?? {};

  const aCur = anc('cursor') ?? {x: 40, y: 58, at: 20};
  const aScr = anc('spark_screen') ?? {x: 50, y: 64, at: 60};
  const aEnd = anc('endcard') ?? {x: 12, y: 46};
  // ★spark_rock(72,60) 故意没有用：实测 r5 底图那个位置只有一团岩面模糊暗斑（x66–80/y55–72
  // 均值 29.2、p90 44.8），径向显影在那里"显"不出手。r5 上手印最密、最完整的一块实测在
  // x31.8–35.3 / y63.5–70（五指齐全，掌心 33.2/68.2，手形约 45×47px）。
  // storyboard 补一条 role:"hand_palm" 的锚点后这里自动接管，不必改代码。
  const aPalm = anc('hand_palm') ?? {x: 33.3, y: 66.6, at: 0};
  const palm = {x: aPalm.x, y: aPalm.y + 1.0}; // 显影圆心：整只手的外接中心
  // 屏幕矩形：实测自当前 public/S13a.png（x34.0–64.7% / y53.8–89.4%）。
  // 新底图换进来后若位置不同，加一条 role:"screen_rect" 的锚点即可，代码侧不必改。
  const aRect = anc('screen_rect');
  const SR = {x: aRect?.x ?? 34, y: aRect?.y ?? 53.8, w: aRect?.w ?? 30.7, h: aRect?.h ?? 35.6};

  /* ── 场内部 a→b：黑位过渡，不交叉 ───────────────────────────── */
  const A_OUT: [number, number] = [SPLIT - 12, SPLIT + 18]; // 198 → 228
  const B_IN: [number, number] = [SPLIT + 20, SPLIT + 48]; // 230 → 258
  const cl = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const aO = interpolate(frame, A_OUT, [1, 0], cl);
  const bO = interpolate(frame, B_IN, [0, 1], cl);
  const floor = 1 - Math.max(aO, bO);

  /* ── 手印三段 ─────────────────────────────────────────────── */
  const EC_IN: [number, number] = [SPLIT + 42, SPLIT + 78]; // 252 → 288 落版文字
  const T_PRESS = SPLIT + 82; // 292 阴影压上（15f）
  const T_REVEAL = T_PRESS + 15; // 307 径向显影开始（24f）
  const T_SPARK = T_REVEAL + 24; // 331 ✳ 亮起（18f）
  const T_DONE = T_SPARK + 18; // 349 三段结束，此后只留呼吸
  const ease = (t: number) => t * t * (3 - 2 * t);
  const press = ease(interpolate(frame, [T_PRESS, T_REVEAL], [0, 1], cl));
  const lift = interpolate(frame, [T_REVEAL + 4, T_SPARK - 1], [0, 1], cl);
  const rev = ease(interpolate(frame, [T_REVEAL, T_SPARK], [0, 1], cl));
  const rOut = 18 + 96 * rev; // 显影盘外半径 px：307f 起 24 帧长到 114px
  const shO = 0.74 * press * (1 - lift);
  const shS = 0.62 + 0.38 * press - 0.16 * lift;
  const shDx = (1 - press) * 152 + lift * 74;
  const shDy = (1 - press) * -118 + lift * -54;
  const shBlur = 30 - 17 * press + 15 * lift;

  /* ── 上半场：屏幕要读起来是活的 ─────────────────────────────── */
  const blink = interpolate(((frame % 34) + 34) % 34, [0, 17, 24, 34], [1, 1, 0.17, 0.17], cl);
  const curOn = frame > (aCur.at ?? 20);
  const sweepCyc = (((frame - 30) % 84) + 84) % 84;
  const sweepTop = -16 + (sweepCyc / 84) * 132;
  const breathe = 0.5 + 0.5 * Math.sin((frame / 88) * Math.PI * 2);
  const scrO = interpolate(frame, [aScr.at ?? 60, (aScr.at ?? 60) + 24], [0, 1], cl);

  const bSpec = plateOf('S13', 'b');
  const bSrc = bSpec.src ? staticFile(bSpec.src) : null;
  const sparkPop = spring({frame: frame - T_SPARK, fps: 30, config: {damping: 13}});
  const sparkBreath =
    frame >= T_DONE ? 1 + 0.035 * Math.sin(((frame - T_DONE) / 120) * Math.PI * 2) : 1;

  return (
    <AbsoluteFill>
      {/* 黑位垫层：a 淡尽、b 未起的那两帧不留透明/白底，也从不会露出另一张底图 */}
      {floor > 0.002 ? (
        <AbsoluteFill style={{background: '#0b0906', opacity: floor}} />
      ) : null}

      {/* ───── 上半：深夜书桌 ───── */}
      {aO > 0.002 ? (
        <AbsoluteFill style={{opacity: aO}}>
          <Plate id="S13" dur={SPLIT + 18} mode="dark" scaleMax={1.04} origin="40% 46%">
            {/* 屏幕活性层：全部走软边遮罩，绝不出现矩形硬边（那正是 N1 的病灶） */}
            <div
              style={{
                position: 'absolute',
                left: `${SR.x}%`,
                top: `${SR.y}%`,
                width: `${SR.w}%`,
                height: `${SR.h}%`,
                overflow: 'hidden',
                WebkitMaskImage:
                  'radial-gradient(ellipse 74% 76% at 50% 50%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 94%)',
                maskImage:
                  'radial-gradient(ellipse 74% 76% at 50% 50%, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 94%)',
              }}
            >
              {/* 上下明暗结构：把纯色橙块拉出层次 */}
              <AbsoluteFill
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,242,208,.13) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 66%, rgba(74,34,0,.16) 100%)',
                }}
              />
              {/* 极淡扫描线 */}
              <AbsoluteFill
                style={{
                  background:
                    'repeating-linear-gradient(180deg, rgba(0,0,0,.115) 0px, rgba(0,0,0,.115) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 3px)',
                }}
              />
              {/* 慢速刷新扫光：一条，84 帧一趟 */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: `${sweepTop}%`,
                  height: '15%',
                  background:
                    'linear-gradient(180deg, rgba(255,247,228,0) 0%, rgba(255,247,228,.11) 50%, rgba(255,247,228,0) 100%)',
                }}
              />
              {/* 整机呼吸：屏幕是画面里唯一光源，它就该有轻微的明暗起伏 */}
              <AbsoluteFill
                style={{background: `rgba(255,226,168,${(0.02 + 0.026 * breathe).toFixed(4)})`}}
              />
            </div>

            {/* 光标：4px 实柱 + 一层散焦余辉，720p 下看得见；熄灭时留 0.17 的磷光残影 */}
            {curOn ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: `${aCur.x}%`,
                    top: `${aCur.y}%`,
                    width: px(26),
                    height: px(52),
                    transform: 'translate(-50%,0)',
                    background:
                      'radial-gradient(ellipse at 50% 50%, rgba(16,12,7,.34) 0%, rgba(16,12,7,0) 68%)',
                    filter: 'blur(5px)',
                    opacity: 0.35 + 0.65 * blink,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${aCur.x}%`,
                    top: `${aCur.y}%`,
                    width: 4,
                    height: px(46),
                    transform: 'translate(-50%,0)',
                    background: `rgba(22,17,11,${0.94 * blink})`,
                  }}
                />
              </>
            ) : null}

            {/* ✳ 在屏幕上亮起（光标即 ✳） */}
            {scrO > 0.002 ? (
              <div
                style={{
                  position: 'absolute',
                  left: `${aScr.x}%`,
                  top: `${aScr.y}%`,
                  transform: 'translate(-50%,-50%)',
                  opacity: scrO,
                }}
              >
                <Spark size={72} from={aScr.at ?? 60} />
              </div>
            ) : null}
          </Plate>
        </AbsoluteFill>
      ) : null}

      {/* ───── 下半：星空岩壁 + 落版 ───── */}
      {bO > 0.002 ? (
        <AbsoluteFill style={{opacity: bO}}>
          <Plate id="S13" variant="b" dur={D} mode="dark" scaleMax={1.04} origin="60% 50%">
            {/* 第二段：径向遮罩显影底图里本来就有的那个手印。
                同一张图再叠一遍、只提高曝光，用 radial-gradient 软盘把它"洗"出来 ——
                乘性提亮会同时拉开手印与岩面的绝对反差，所以越亮越读得出手。 */}
            {bSrc && rev > 0.002 ? (
              <Img
                src={bSrc}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: W,
                  height: H,
                  objectFit: 'cover',
                  filter: 'brightness(1.42) contrast(1.05) saturate(1.05)',
                  opacity: 0.96,
                  WebkitMaskImage: `radial-gradient(circle ${rOut}px at ${palm.x}% ${palm.y}%, rgba(0,0,0,1) 0%, rgba(0,0,0,.92) ${(rOut * 0.4).toFixed(1)}px, rgba(0,0,0,0) 100%)`,
                  maskImage: `radial-gradient(circle ${rOut}px at ${palm.x}% ${palm.y}%, rgba(0,0,0,1) 0%, rgba(0,0,0,.92) ${(rOut * 0.4).toFixed(1)}px, rgba(0,0,0,0) 100%)`,
                }}
              />
            ) : null}

            {/* 第一段：手形阴影从画外压向掌心，触壁后抬起淡出 */}
            <HandShadow
              x={palm.x}
              y={palm.y}
              o={shO}
              s={shS}
              blur={shBlur}
              dx={shDx}
              dy={shDy}
            />

            {/* 第三段：✳ 在掌心亮起 + 一次呼吸，之后长驻到淡出。
                底下垫一小团暗斑：掌心本来就是深色颜料，有了它珊瑚色才不会被显影盘的
                亮橙吞掉 —— ✳ 是全片唯一强调色，落版这一下必须是画面里最饱和的一点。 */}
            {frame >= T_SPARK ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: `${palm.x}%`,
                    top: `${palm.y + 0.6}%`,
                    width: 132,
                    height: 132,
                    transform: 'translate(-50%,-50%)',
                    background:
                      'radial-gradient(circle closest-side, rgba(26,11,6,.42) 0%, rgba(26,11,6,.22) 46%, rgba(26,11,6,0) 100%)',
                    opacity: Math.min(1, sparkPop * 1.4),
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${palm.x}%`,
                    top: `${palm.y + 0.6}%`,
                    transform: `translate(-50%,-50%) scale(${(0.86 + 0.14 * sparkPop) * sparkBreath})`,
                    opacity: Math.min(1, sparkPop * 1.4),
                  }}
                >
                  <Spark size={68} from={T_SPARK} />
                </div>
              </>
            ) : null}
          </Plate>

          {/* 落版文字：锚点 endcard（左 1/3 暗岩，实测均值 22.2 / p90 48.1） */}
          <div
            style={{
              position: 'absolute',
              left: `${aEnd.x}%`,
              top: `${aEnd.y}%`,
              transform: 'translate(0,-50%)',
              opacity: interpolate(frame, EC_IN, [0, 1], cl),
            }}
          >
            <div style={{fontFamily: SERIF, fontSize: px(56), color: C.paper, letterSpacing: px(4)}}>
              <span style={{color: C.coral}}>✳</span> {(ec.main ?? '').replace('✳ ', '')}
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontStyle: 'italic',
                fontSize: px(26),
                color: 'rgba(242,236,224,.5)',
                letterSpacing: px(2),
                marginTop: px(14),
              }}
            >
              {ec.sub ?? ''}
            </div>
          </div>
        </AbsoluteFill>
      ) : null}

      {/* 字幕：文案只从 storyboard 走；到点才挂，否则 Line 的底部压暗层会提前出现 */}
      {caps
        .map(c => {
          const from = c.from;
          const to = c.n === 1 ? SPLIT - 16 : c.to; // 第一条不许跨过黑位过渡
          if (frame < from || frame >= to) return null;
          return (
            <Line key={c.n} cn={c.cn} en={c.en} mode="dark" from={from} to={to} />
          );
        })}
    </AbsoluteFill>
  );
};
