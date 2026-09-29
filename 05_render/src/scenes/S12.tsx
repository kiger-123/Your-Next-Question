import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Line, Plate, Spark, Stamp} from '../kit';
import {C, SERIF, W, H, px} from '../theme';
import {useCaptions, useShot} from '../data';

/**
 * S12 家谱树 · 一票否决场。
 * 底图已含墨笔主干与根系 → 不重画线条，改用「墨迹显影遮罩」：
 * 一张纸色软边蒙版自上而下退去，让墨像洇在纸上那样长出来。
 * ★anchors 全部标 TBD：底图到位后必须目视标定到真实根分叉上（教训：标签与树脱节）。
 *
 * 本轮（运动密度专项）只动两处 + 一层无形状的光：
 *  ① 年份点 2018→2025 按拍依次亮起（22 帧/拍 ≈ 0.73s）：spring 弹入 + 一圈涟漪 +
 *     节点之间一节一节的墨线"时间轴"随拍生长 —— 这是"时间在长"的视觉证据。
 *  ② 花苞呼吸改成真的看得见的呼吸：尺度 ±6% + 光晕 0.75→1.3 倍半径、0.32→0.95 明暗，
 *     周期约 3.7s（原来的 13% 缩放作用在 34px 的 ✳ 上，只有 ±4px，实测读不出来）。
 *  ③ 纸面加一层极缓漂移的暖光（soft-light，无形状、不遮字），让 18s 里任何一秒都在动。
 * 位置一律不动：花苞仍在 25%/8%（实测墨点最高处 x≈25% y≈5%）、题字/朱章/10 个标签坐标不改，
 * 底部 30% 字幕区不放任何新元素。
 */
// ★已按真图 S12_r1 目视标定：树干偏左、根扇占左下、枝梢伸向右上
// 分区语义：根 = 四万年的古代；枝 = 近七十年的现代
const ROOT_LABELS = [
  {t: '仰望', y: '40000 BCE', x: 5, yy: 64},
  {t: '甲骨', y: '1300 BCE', x: 13, yy: 70},
  {t: '数沙者', y: '212 BCE', x: 23, yy: 74},
  {t: '零', y: '628', x: 33, yy: 76},
  {t: '电报', y: '1844', x: 44, yy: 74},
  {t: '香农', y: '1948', x: 55, yy: 56},
  {t: '图灵', y: '1950', x: 64, yy: 48},
  {t: 'ELIZA', y: '1966', x: 73, yy: 41},
  {t: '深蓝', y: '1997', x: 81, yy: 35},
  {t: 'Transformer', y: '2017', x: 84, yy: 66},
];
const YEARS = ['2018', '2020', '2022', '2024', '2025'];
// 年份点位置沿用上一轮标定值（% 画面坐标），本轮只改节拍与亮起方式
const SPOTS = YEARS.map((_, i) => ({x: 46 + i * 7.5, y: 22 - i * 2.2}));
const Y0 = 252; // 第一拍
const BEAT = 22; // 0.73s 一拍：五拍点亮 2018→2025

const PAPER = '#f3ecdd';

const at = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, a + b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

export const S12: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const shot = useShot('S12');
  const caps = useCaptions('S12');
  const D = shot.dur_frame;

  // 显影：0→40% 时长内把墨从上往下洇出来
  const reveal = interpolate(frame, [24, D * 0.42], [0, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const maskTop = reveal * H;

  // ③ 纸面上极缓漂移的暖光：只有明暗，没有形状 → 不可能遮字
  const washX = interpolate(frame, [0, D], [-W * 0.16, W * 0.2], {extrapolateRight: 'clamp'});

  // ② 花苞呼吸（约 3.7s 一次）
  const budO = at(frame, 400, 30);
  const br = 0.5 + 0.5 * Math.sin((frame - 424) / 17.5);
  const budScale = 0.94 + 0.12 * br;

  return (
    <AbsoluteFill>
      <Plate
        id="S12"
        dur={D}
        mode="paper"
        scaleMax={1.03}
        origin="50% 60%"
        background={PAPER}
      >
        <div
          style={{
            position: 'absolute',
            left: -20,
            top: maskTop,
            width: W + 40,
            height: H,
            background: `linear-gradient(to bottom, rgba(243,236,221,0) 0, ${PAPER} 46px, ${PAPER} 100%)`,
          }}
        />

        {/* ③ 漂移暖光：压在显影蒙版之上、所有字与点之下 */}
        <div
          style={{
            position: 'absolute',
            left: washX,
            top: -H * 0.12,
            width: W * 1.15,
            height: H * 1.2,
            background:
              'radial-gradient(ellipse 46% 40% at 42% 30%, rgba(255,248,226,.55) 0%, rgba(255,240,208,.18) 46%, rgba(255,240,208,0) 72%)',
            mixBlendMode: 'soft-light',
            opacity: 0.72,
          }}
        />

        {/* ① 时间轴：随拍一节点一节点地长出来 + 亮起瞬间的一圈涟漪 */}
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {SPOTS.slice(1).map((p, i) => {
            const prev = SPOTS[i];
            const seg = at(frame, Y0 + (i + 1) * BEAT + 2, 20);
            if (seg <= 0) return null;
            const x1 = (W * prev.x) / 100;
            const y1 = (H * prev.y) / 100;
            const x2 = (W * p.x) / 100;
            const y2 = (H * p.y) / 100;
            return (
              <line
                key={`seg${i}`}
                x1={x1}
                y1={y1}
                x2={x1 + (x2 - x1) * seg}
                y2={y1 + (y2 - y1) * seg}
                stroke="rgba(43,38,32,.3)"
                strokeWidth={px(1.6)}
                strokeLinecap="round"
              />
            );
          })}
          {SPOTS.map((p, i) => {
            const rp = at(frame, Y0 + i * BEAT, 26);
            if (rp <= 0 || rp >= 1) return null;
            return (
              <circle
                key={`rip${i}`}
                cx={(W * p.x) / 100}
                cy={(H * p.y) / 100}
                r={px(11) + rp * px(40)}
                fill="none"
                stroke={C.coral}
                strokeWidth={Math.max(0.4, px(2.4) * (1 - rp))}
                opacity={(1 - rp) * 0.55}
              />
            );
          })}
        </svg>

        {/* 地面线上方：年份节点逐拍绽放（无任何品牌名） */}
        {SPOTS.map((p, i) => {
          const a = Y0 + i * BEAT;
          const pop = spring({
            frame: Math.max(0, frame - a),
            fps,
            config: {damping: 13, stiffness: 150, mass: 0.7},
          });
          const lit = at(frame, a, 10);
          const shim = 0.78 + 0.22 * Math.abs(Math.sin((frame - a) / 30));
          return (
            <div
              key={YEARS[i]}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                opacity: lit,
                transform: `translate(-50%,-50%) scale(${0.3 + 0.7 * pop})`,
                textAlign: 'center',
              }}
            >
              {/* 盒子 = 墨点本身 → 点心正落在锚点上，时间轴的线才能穿心而过；
                  年份字用绝对定位挂在点下方，不参与盒子尺寸（否则线会从点底下擦过去） */}
              <div
                style={{
                  width: px(17),
                  height: px(17),
                  borderRadius: px(9),
                  background: C.coral,
                  boxShadow: `0 0 ${px(18)}px rgba(232,115,90,${0.62 * shim})`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '100%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontFamily: SERIF,
                  fontSize: px(23),
                  color: C.paperMute,
                  marginTop: px(6),
                  letterSpacing: px(1.5),
                  opacity: at(frame, a + 8, 16),
                }}
              >
                {YEARS[i]}
              </div>
            </div>
          );
        })}

        {/* 树顶未开花苞：半透明 + 能看见的呼吸（尺度 + 明暗） */}
        <div
          style={{
            position: 'absolute',
            left: `${25}%`,
            top: `8%`,
            opacity: budO,
            transform: `translate(-50%,-50%) scale(${budScale})`,
          }}
        >
          {/* 花苞要含在枝梢里，不是贴在画角的图章：实测墨点最高处在 x≈25% y≈5% */}
          <Spark size={px(51)} from={400} />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: px(81),
              height: px(81),
              transform: `translate(-50%,-50%) scale(${0.75 + 0.55 * br})`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(232,115,90,.30) 0%, rgba(232,115,90,0) 70%)',
              opacity: 0.32 + 0.63 * br,
            }}
          />
        </div>
      </Plate>

      {/* 右上竖排题字 + 朱框「问」章（画面空间，不参与推镜） */}
      <div
        style={{
          position: 'absolute',
          right: px(150),
          top: px(72),
          fontFamily: SERIF,
          fontSize: px(52),
          color: C.paperInk,
          writingMode: 'vertical-rl',
          letterSpacing: px(14),
          opacity: interpolate(frame, [20, 46], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        下一个问题
      </div>
      <div
        style={{
          position: 'absolute',
          right: px(146),
          top: px(400),
          width: px(44),
          height: px(44),
          border: `2px solid ${C.coral}`,
          color: C.coral,
          fontFamily: SERIF,
          fontSize: px(24),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: interpolate(frame, [36, 58], [0, 0.92], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        问
      </div>

      {/* 10 个根标签逐个淡入 —— 坐标 TBD，必须目视标定 */}
      {ROOT_LABELS.map((n, i) => {
        const a = 60 + i * 26;
        const o = interpolate(frame, [a, a + 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={n.t}
            style={{
              position: 'absolute',
              left: `${n.x}%`,
              top: `${n.yy}%`,
              opacity: o,
              transform: 'translate(-50%,-50%)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{fontFamily: SERIF, fontSize: px(25), color: C.paperInk, letterSpacing: 2}}>{n.t}</div>
            <div style={{fontFamily: SERIF, fontSize: px(15), color: C.paperMute, marginTop: px(3)}}>{n.y}</div>
            <div
              style={{
                width: px(7),
                height: px(7),
                borderRadius: px(4),
                background: C.coral,
                margin: `${px(6)}px auto 0`,
              }}
            />
          </div>
        );
      })}

      <Stamp en={shot.stamp_en} cn={shot.stamp_cn} mode="paper" from={8} />
      {caps.map(c => (
        <Line key={c.n} cn={c.cn} en={c.en} mode="paper" from={c.from} to={c.to} />
      ))}
    </AbsoluteFill>
  );
};
