import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Line, Plate, Spark, Stamp} from '../kit';
import {C, SERIF, W, H} from '../theme';
import {useCaptions, useShot} from '../data';

/** S10 星座 · 2017 · 零素材场。词=星，注意力=连线；用一句有代词的句子，让"it 指向 cat"成为可见的那条线。 */
const WORDS = ['the', 'cat', 'sat', 'on', 'the', 'mat', 'because', 'it', 'was', 'warm'];
// 注意力权重：故意让 it→cat 最粗（代词消解），其余为局部搭配
const LINKS: [number, number, number][] = [
  [7, 1, 1],
  [7, 5, 0.55],
  [2, 1, 0.7],
  [2, 3, 0.5],
  [5, 4, 0.6],
  [6, 2, 0.35],
  [6, 8, 0.5],
  [8, 9, 0.65],
  [0, 1, 0.4],
  [3, 4, 0.3],
];

const xOf = (i: number) => W * (0.14 + (i / (WORDS.length - 1)) * 0.72);
const yOf = (i: number) => H * (0.33 + Math.sin(i * 1.7) * 0.05);

export const S10: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const shot = useShot('S10');
  const caps = useCaptions('S10');
  const D = shot.dur_frame;

  const starIn = (i: number) => 24 + i * 7;
  const titleIn = 205;

  return (
    <AbsoluteFill>
      <Plate id="S10" dur={D} mode="dark" scaleMax={1.02} background="#05070f" origin="50% 45%">
        {/* 远景星尘 */}
        {Array.from({length: 90}, (_, i) => {
          const x = ((i * 137.5) % 100) / 100;
          const y = ((i * 71.3) % 100) / 100;
          const tw = 0.25 + 0.35 * Math.abs(Math.sin((frame + i * 13) / 22));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x * W,
                top: y * H,
                width: 2,
                height: 2,
                borderRadius: 1,
                background: `rgba(235,232,224,${tw})`,
              }}
            />
          );
        })}

        {/* 注意力连线 */}
        <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
          {LINKS.map(([a, b, wgt], i) => {
            const start = 95 + i * 9;
            const p = interpolate(frame, [start, start + 26], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            if (p <= 0) return null;
            const x1 = xOf(a);
            const y1 = yOf(a);
            const x2 = xOf(b);
            const y2 = yOf(b);
            const cx = (x1 + x2) / 2;
            const cy = Math.min(y1, y2) - 34 - Math.abs(x2 - x1) * 0.16;
            const hot = i === 0;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                fill="none"
                stroke={hot ? C.coral : 'rgba(201,162,39,.72)'}
                strokeWidth={(hot ? 3.0 : 1.9) * wgt * 2}
                strokeDasharray={`${p * 900} 9999`}
                opacity={hot ? 0.95 : 0.85}
              />
            );
          })}
        </svg>

        {/* 词星 */}
        {WORDS.map((w, i) => {
          const s = spring({frame: frame - starIn(i), fps, config: {damping: 13}});
          const o = interpolate(frame, [starIn(i), starIn(i) + 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const x = xOf(i);
          const y = yOf(i);
          return (
            <div key={i} style={{position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)', opacity: o}}>
              <div
                style={{
                  width: 11 * s,
                  height: 11 * s,
                  borderRadius: 6,
                  background: i === 7 ? C.coral : C.paper,
                  boxShadow: `0 0 ${i === 7 ? 26 : 14}px rgba(232,115,90,${i === 7 ? 0.9 : 0.45})`,
                  margin: '0 auto',
                }}
              />
              <div
                style={{
                  fontFamily: SERIF,
                  fontStyle: 'italic',
                  fontSize: 21,
                  letterSpacing: 1.5,
                  color: i === 7 ? C.coral : 'rgba(242,236,224,.72)',
                  marginTop: 9,
                  whiteSpace: 'nowrap',
                }}
              >
                {w}
              </div>
            </div>
          );
        })}

        {/* ★QC 专项：连线最密处一枚小星芒 */}
        <div
          style={{
            position: 'absolute',
            left: xOf(4) - 24,
            top: yOf(4) - 96,
            opacity: interpolate(frame, [170, 195], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <Spark size={48} from={170} />
        </div>

        {/* 论文题名 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: H * 0.575,
            textAlign: 'center',
            opacity: interpolate(frame, [titleIn, titleIn + 22], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div style={{fontFamily: SERIF, fontSize: 34, letterSpacing: 1}}>
            <span style={{color: C.coral, fontStyle: 'italic'}}>Attention</span>{' '}
            <span style={{color: C.paper}}>Is All You Need</span>
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 12,
              letterSpacing: 3,
              color: 'rgba(242,236,224,.34)',
              marginTop: 8,
            }}
          >
            Vaswani et al. · 2017
          </div>
        </div>
      </Plate>
      <Stamp en={shot.stamp_en} cn={shot.stamp_cn} mode="dark" from={8} />
      {caps.map(c => (
        <Line key={c.n} cn={c.cn} en={c.en} mode="dark" from={c.from} to={c.to} />
      ))}
    </AbsoluteFill>
  );
};
