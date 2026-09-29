import React from 'react';
import {AbsoluteFill, Img, staticFile, useVideoConfig} from 'remotion';
import {C, SERIF} from './theme';
import {Chrome, GradeLayers, Spark} from './kit';

/**
 * 封面二：直接把某一场的画面当封面（铭牌和字幕已被 Chrome 摘掉），只叠片名。
 *
 * 为什么不复用上面那个 Cover：那个是"底图 + 自己叠调色"，而这里的输入已经是渲好的
 * 成片帧，调色叠过一遍了 —— 再走一遍 GradeLayers 就是二次调色，宣纸场会被压出黑带。
 *
 * 底部那条渐隐按明暗分两种方向：暗场压暗让米白片名浮起来，亮场（宣纸）反过来提亮，
 * 否则一块深色渐变糊在纸上就是一条脏带子。
 */
export const CoverOnScene: React.FC<{mode: 'dark' | 'paper'; children: React.ReactNode}> = ({
  mode,
  children,
}) => {
  const {height} = useVideoConfig();
  const u = (v: number) => Math.round((v * height) / 720);
  const paper = mode === 'paper';
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: paper ? C.paper : C.ink}}>
      <Chrome.Provider value={true}>{children}</Chrome.Provider>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: paper
            ? 'linear-gradient(to top, rgba(243,236,221,.95) 0%, rgba(243,236,221,.66) 15%, rgba(243,236,221,0) 38%)'
            : 'linear-gradient(to top, rgba(8,6,3,.93) 0%, rgba(8,6,3,.62) 17%, rgba(8,6,3,0) 42%)',
        }}
      />
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
        {/* 不重复放 ✳：S06 的 0—1 之间、S10 的弧线顶点本来就各有一颗珊瑚星芒，
            标题再来一颗就是画面里两个同款标记，看着像叠图 bug。 */}
        <div
          style={{
            fontFamily: SERIF,
            fontSize: u(88),
            letterSpacing: u(13),
            color: paper ? 'rgba(24,20,16,.95)' : C.paper,
            lineHeight: 1.1,
            marginRight: u(-13),
            textShadow: paper ? 'none' : '0 2px 18px rgba(0,0,0,.75)',
          }}
        >
          下一个问题
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: u(20),
            letterSpacing: u(9),
            color: paper ? 'rgba(30,26,22,.6)' : 'rgba(226,220,206,.62)',
            marginTop: u(16),
            marginBottom: u(52),
            marginRight: u(-9),
          }}
        >
          YOUR NEXT QUESTION
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * 封面帧。发朋友圈/B站时首帧是黑的（每场开头 18 帧从纯黑淡入），
 * 所以封面必须单独出，不能截首帧。
 *
 * 排版沿用成片那套：衬线纸白 + 唯一珊瑚 ✳ + 同一条底部压暗渐变。
 * 尺寸全部按"以 720 高为基准"换算，所以同一个组件在 1280×720 和 1080×1080 下比例一致。
 */
export type CoverVariant = 'A' | 'B' | 'C' | 'S';

export const Cover: React.FC<{variant: CoverVariant}> = ({variant}) => {
  const {height} = useVideoConfig();
  const u = (v: number) => Math.round((v * height) / 720);
  const square = variant === 'S';
  const title = variant !== 'A';
  return (
    <AbsoluteFill style={{background: C.ink, overflow: 'hidden'}}>
      <Img
        src={staticFile('S01_cover.png')}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // 方图会把 16:9 的两侧切掉：窗口中心对到 x≈38% 才能把人影留在画面里
          objectPosition: square ? '38% 52%' : '50% 50%',
          transform: `scale(${square ? 1.02 : 1.05})`,
        }}
      />
      {/* 暗角：与 kit.Plate 的 dark 模式同一条 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,.78) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(232,150,70,.10)',
          mixBlendMode: 'soft-light',
        }}
      />
      {title ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to top, rgba(10,8,4,.86) 0%, rgba(10,8,4,.46) 26%, rgba(10,8,4,0) 54%)',
          }}
        />
      ) : null}
      <GradeLayers />
      {title ? (
        <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
          {variant === 'C' ? (
            <div
              style={{
                fontFamily: SERIF,
                fontSize: u(25),
                letterSpacing: u(6),
                color: 'rgba(242,236,224,.72)',
                marginBottom: u(26),
              }}
            >
              从抬头，到伸手。
            </div>
          ) : null}
          <div style={{marginBottom: u(18)}}>
            <Spark size={u(52)} from={0} />
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: u(96),
              letterSpacing: u(14),
              color: C.paper,
              lineHeight: 1.1,
              textShadow: '0 2px 18px rgba(0,0,0,.75)',
              // 字距会给最后一个字也留一份空，右边看起来偏一格
              marginRight: u(-14),
            }}
          >
            下一个问题
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: u(21),
              letterSpacing: u(9),
              color: 'rgba(226,220,206,.62)',
              marginTop: u(20),
              marginBottom: u(64),
              marginRight: u(-9),
            }}
          >
            YOUR NEXT QUESTION
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
