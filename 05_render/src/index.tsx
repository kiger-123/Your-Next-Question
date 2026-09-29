import React from 'react';
import {
  Composition,
  interpolate,
  registerRoot,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {S06} from './scenes/S06';
import {S10} from './scenes/S10';
import {S11} from './scenes/S11';
import {S12} from './scenes/S12';
import {S13} from './scenes/S13';
import {S01, S02, S03, S04, S05, S07, S08, S09} from './scenes/batch';
import {Cover, CoverOnScene} from './cover';
import {ImagePathTest, VideoPathTest} from './vidpathtest';
import {FPS, H, W} from './theme';
import {GradeLayers} from './kit';
import {assertCaptionLimits, getShot} from './data';

/**
 * 装配规范（manifest 已签发）：每场一个独立 Composition，渲完由 tools/assemble.mjs concat。
 * 时长一律取自 03_storyboard/ep01.json，不在这里手填。
 * 新增一场 = 写组件 + 在 SCENES 加一行。
 *
 * 调色层在根上统一叠：写在场景里迟早会被某场忘掉，而"暗部不得死黑"是全片闸门。
 */
/**
 * 场间淡变。审片 A1：`kit.tsx` 里的 Fade/Scene 从来没被任何 Composition 用过，
 * 13 场全是硬切 —— 实测 0.2s 步进亮度 37→230 一步跳（暗场切宣纸场就是闪）。
 * 调色层必须留在淡变组外面：opacity<1 会新建隔离组，把 GradeLayers 的
 * mix-blend-mode 与画面隔开，黑位兜底和暖雾会整个失效。
 */
const FADE = 18;

const FadeWrap: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const o = Math.min(
    interpolate(frame, [0, FADE], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  return <div style={{position: 'absolute', inset: 0, opacity: o}}>{children}</div>;
};

const graded = (Comp: React.FC): React.FC => {
  const Wrapped: React.FC = () => (
    <>
      <FadeWrap>
        <Comp />
      </FadeWrap>
      <GradeLayers />
    </>
  );
  Wrapped.displayName = `${Comp.name}·graded`;
  return Wrapped;
};
const SCENES: {id: string; comp: React.FC}[] = [
  {id: 'S01', comp: S01},
  {id: 'S02', comp: S02},
  {id: 'S03', comp: S03},
  {id: 'S04', comp: S04},
  {id: 'S05', comp: S05},
  {id: 'S06', comp: S06},
  {id: 'S07', comp: S07},
  {id: 'S08', comp: S08},
  {id: 'S09', comp: S09},
  {id: 'S10', comp: S10},
  {id: 'S11', comp: S11},
  {id: 'S12', comp: S12},
  {id: 'S13', comp: S13},
].map(s => ({id: s.id, comp: graded(s.comp)}));

const bad = assertCaptionLimits();
if (bad.length) {
  throw new Error(`字幕违反冻结口径（5–24 全角 / 每场 2 条）：\n  ${bad.join('\n  ')}`);
}

/** 封面：A 纯画面 / B 加片名 / C 再加副句 / S 方图（朋友圈信息流会裁成接近方形） */
const COVERS: {id: string; comp: () => JSX.Element; w: number; h: number; dur: number}[] = [
  {id: 'Cover16A', comp: () => <Cover variant="A" />, w: W, h: H, dur: 60},
  {id: 'Cover16B', comp: () => <Cover variant="B" />, w: W, h: H, dur: 60},
  {id: 'Cover16C', comp: () => <Cover variant="C" />, w: W, h: H, dur: 60},
  {id: 'CoverSq', comp: () => <Cover variant="S" />, w: 1080, h: 1080, dur: 60},
  // 直接拿成片某一场的画面当封面：Chrome 摘掉铭牌与字幕，GradeLayers 保持和成片同一层序
  // 时长给满整场，这样可以在任意一帧挑构图（工具按 --frame 出图）
  {
    id: 'CoverQ10',
    comp: () => (
      <CoverOnScene mode="dark">
        <>
          <S10 />
          <GradeLayers />
        </>
      </CoverOnScene>
    ),
    w: W,
    h: H,
    dur: getShot('S10').dur_frame,
  },
  {
    id: 'CoverQ06',
    comp: () => (
      <CoverOnScene mode="paper">
        <>
          <S06 />
          <GradeLayers />
        </>
      </CoverOnScene>
    ),
    w: W,
    h: H,
    dur: getShot('S06').dur_frame,
  },
];

/** P0 视频通路等价测试：两条 composition 同源同帧，只差渲染方式（见 vidpathtest.tsx） */
const PATHTEST = [
  {id: 'ImagePathTest', comp: ImagePathTest},
  {id: 'VideoPathTest', comp: VideoPathTest},
];

export const Root: React.FC = () => (
  <>
    {PATHTEST.map(t => (
      <Composition key={t.id} id={t.id} component={t.comp} durationInFrames={330} fps={FPS} width={W} height={H} />
    ))}
    {COVERS.map(c => (
      <Composition
        key={c.id}
        id={c.id}
        component={c.comp}
        durationInFrames={c.dur}
        fps={FPS}
        width={c.w}
        height={c.h}
      />
    ))}
    {SCENES.map(s => {
      const shot = getShot(s.id);
      return (
        <Composition
          key={s.id}
          id={s.id}
          component={s.comp}
          durationInFrames={shot.dur_frame}
          fps={FPS}
          width={W}
          height={H}
        />
      );
    })}
  </>
);

registerRoot(Root);
