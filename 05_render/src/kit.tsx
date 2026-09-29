import React, {createContext, useContext} from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {colorsFor, Mode, SERIF, T, W, H, C, assertScale, px, BLACK_FLOOR, HAZE, HAZE_DIR, SCRIM_DARK, SCRIM_PAPER} from './theme';
import {getShot, plateOf} from './data';

/**
 * 出封面时置 true：铭牌（左上角年代章）和旁白字幕都不进画面。
 * 用 context 而不是给每个场景加 prop —— 13 场里 8 场在 batch.tsx、5 场各自独立文件，
 * 加 prop 要改 13 个签名，漏一个就是一条字幕留在封面上。
 * 默认 false，成片渲染路径完全不受影响。
 */
export const Chrome = createContext(false);

/** 绕中心转 deg 之后仍要盖满 W×H 所需的最小放大倍率（两个轴里取严的那个）。 */
export const overscanFor = (deg: number) => {
  const t = (Math.abs(deg) * Math.PI) / 180;
  return Math.max(
    (W * Math.cos(t) + H * Math.sin(t)) / W,
    (W * Math.sin(t) + H * Math.cos(t)) / H,
  );
};

/** 天球是刚体：代码画的星点要和底图烘焙的星同速同轴，就得共用这一个角度。 */
export const useSkyTheta = (deg: number, dur: number) =>
  interpolate(useCurrentFrame(), [0, dur], [0, deg], {extrapolateRight: 'clamp'});

/** 满幅底图 + 缓推。children 与图片同处一个变换空间 —— 构图锚点系统。 */
export const Plate: React.FC<{
  id: string;
  variant?: 'a' | 'b';
  dur: number;
  mode: Mode;
  origin?: string;
  scaleMin?: number;
  scaleMax?: number;
  background?: string;
  /** 只让天空转：ground = 一张"底图 + 山脊以下不透明"的 RGBA（tools/sky_mask.py 生成） */
  sky?: {ground: string; deg: number};
  children?: React.ReactNode;
}> = ({
  id,
  variant = 'a',
  dur,
  mode,
  origin = '50% 45%',
  scaleMin = 1,
  scaleMax,
  background = C.ink,
  sky,
  children,
}) => {
  // 有没有底图、是哪张图，由 storyboard 说了算：见 data.ts plateOf()
  const spec = plateOf(id, variant);
  const frame = useCurrentFrame();
  const kind = spec.kind === 'video' ? 'video' : 'static';
  const cap = scaleMax ?? (kind === 'video' ? 1.06 : 1.05);
  assertScale(kind, cap);
  const scale = scaleMin + interpolate(frame, [0, dur], [0, cap - scaleMin], {
    extrapolateRight: 'clamp',
  });
  // 旋转 θ 后还要盖满整幅画面，需要的最小放大倍率（绕自身中心，两个轴取严的那个）
  const need = sky ? overscanFor(sky.deg) : 1;
  if (sky && scaleMin + 1e-9 < need) {
    throw new Error(
      `${id}: 转 ${sky.deg}° 至少要 ${need.toFixed(4)}× 覆盖，scaleMin=${scaleMin} 会露角`,
    );
  }
  const theta = useSkyTheta(sky?.deg ?? 0, dur);
  const plateImg =
    spec.kind === 'none' ? null : spec.src ? (
      spec.kind === 'video' ? (
        // 视频底图：OffthreadVideo 在 remotion 核心包里，不用装 @remotion/video（那个包不存在）。
        // 帧率/帧数由 tools/vidprep.mjs 预处理成"该场精确帧数 @30fps"，
        // 否则装配总长不是 180.00s —— OffthreadVideo 不负责对齐时长。
        <OffthreadVideo
          src={staticFile(spec.src)}
          style={{position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover'}}
        />
      ) : (
        <Img
          src={staticFile(spec.src)}
          style={{position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover'}}
        />
      )
    ) : (
      // storyboard 声明有底图却没拿到文件名 —— 露出刺眼洋红，别用纯色掩盖
      <div style={{position: 'absolute', inset: 0, background: '#ff00ff'}} />
    );
  return (
    <AbsoluteFill style={{overflow: 'hidden', background}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${scale})${sky ? ` rotate(${theta}deg)` : ''}`,
          transformOrigin: sky ? '50% 50%' : origin,
        }}
      >
        {plateImg}
        {children}
      </div>
      {/* 星空缓旋的地面层：alpha 已经烘进图里（tools/sky_mask.py）。
          它和底图共用同一个 scale、且都不转 —— 遮罩与山脊因此永远对齐。
          反过来做（把 alpha 烘在转动的那层上）遮罩会跟着转 1°，山尖就露出来了。
          旋转只能绕画面中心，否则两层不同轴 → 交界处星星错开，所以这里写死 50% 50%。 */}
      {sky && spec.src ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${scale})`,
            transformOrigin: '50% 50%',
          }}
        >
          <Img
            src={staticFile(sky.ground)}
            style={{position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover'}}
          />
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            mode === 'dark'
              ? 'radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,.78) 100%)'
              : 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(60,45,25,.2) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: mode === 'dark' ? 'rgba(232,150,70,.10)' : 'rgba(200,160,90,.06)',
          mixBlendMode: 'soft-light',
        }}
      />
      {/* 颗粒与黑位兜底都挪到了根级 GradeLayers：
          代码画的暗色面板盖在 plate 之上，放在这里钳不到它们的黑位 */}
    </AbsoluteFill>
  );
};

/**
 * 全片调色层 v2 —— 颗粒 + 黑位兜底 + 暖琥珀雾。
 *
 * 为什么挂在 Composition 根而不是 <Plate> 里：S08/S09/S10/S11/S13 的暗部是代码画的，
 * 盖在 <Plate> 之上，实测 1% 黑位只有 0.4%（要求 ≥5%）。放在根上，任何场景都无法绕过。
 *
 * 为什么不能包一层 opacity 做淡入淡出：opacity<1 会新建隔离组，
 * mix-blend-mode 就只跟组内的透明背景混合，lighten/screen 直接失效。
 */
export const GradeLayers: React.FC = () => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    {/* 颗粒必须早于兜底：overlay 在暗部是乘法，之后放会把黑位重新压回 0 */}
    <Grain />
    {/* 黑位兜底：最后一道钳制，任何像素不得低于 #121008 ≈ IRE 6 */}
    <div style={{position: 'absolute', inset: 0, background: BLACK_FLOOR, mixBlendMode: 'lighten'}} />
    {/* 暖琥珀雾：整幅泡在暖空气里，暗部也被晕染 */}
    <div style={{position: 'absolute', inset: 0, background: HAZE, mixBlendMode: 'screen'}} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at 30% 20%, ${HAZE_DIR} 0%, transparent 62%)`,
        mixBlendMode: 'screen',
      }}
    />
  </AbsoluteFill>
);

/** 胶片颗粒：单张噪声图逐帧抖动，比 4 张轮播省资源且不会周期可见 */
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.09}) => {
  const frame = useCurrentFrame();
  const dx = ((frame * 37) % 40) - 20;
  const dy = ((frame * 53) % 40) - 20;
  return (
    <Img
      src={staticFile('grain.png')}
      style={{
        position: 'absolute',
        left: dx,
        top: dy,
        width: W + 40,
        height: H + 40,
        mixBlendMode: 'overlay',
        opacity,
      }}
    />
  );
};

/** 构图锚点：坐标以素材自身为准（%），随推镜一起变换。禁止在场景代码里写死像素。 */
export const Anchor: React.FC<{
  x: number;
  y: number;
  from: number;
  anchor?: string;
  children: React.ReactNode;
}> = ({x, y, from, anchor = 'translate(-50%,-100%)', children}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [from, from + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: anchor,
        opacity: o,
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
};

/** 左上铭牌：短横线 + small-caps 英文 + 更小的灰中文地名。英文不得是金色。 */
export const Stamp: React.FC<{en: string; cn: string; mode: Mode; from: number}> = ({
  en,
  cn,
  mode,
  from,
}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [from, from + 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (useContext(Chrome)) return null;   // 封面：左上角不许有任何东西
  const col = colorsFor(mode);
  return (
    <div
      style={{
        position: 'absolute',
        left: T.stampX,
        top: T.stampY,
        opacity: o,
        display: 'flex',
        padding: `${px(10)}px ${px(16)}px`,
        background:
          mode === 'paper'
            ? 'radial-gradient(ellipse at 0% 50%, rgba(243,236,221,.92) 0%, rgba(243,236,221,.55) 55%, rgba(243,236,221,0) 100%)'
            : 'radial-gradient(ellipse at 0% 50%, rgba(10,15,30,.72) 0%, rgba(10,15,30,.35) 55%, rgba(10,15,30,0) 100%)',
      }}>
      <div style={{width: T.stampRuleW, height: 1, background: col.main, opacity: 0.5, marginTop: T.stampEn * 0.6}} />
      <div style={{marginLeft: px(22)}}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: T.stampEn,
            letterSpacing: T.stampEnTrack,
            color: col.main,
            fontVariant: 'small-caps',
            textShadow: mode === 'dark' ? col.shadow : 'none',
          }}
        >
          {en}
        </div>
        <div style={{fontFamily: SERIF, fontSize: T.stampCn, letterSpacing: T.stampCnTrack, color: col.sub, marginTop: px(10)}}>
          {cn}
        </div>
      </div>
    </div>
  );
};

/** 底部双语字幕：中文逐字匀速浮现 + 斜体英文回声。句级时间轴下 in/out 由 timeline.json 给。 */
export const Line: React.FC<{
  cn: string;
  en?: string;
  mode: Mode;
  from: number;
  to: number;
  size?: number;
}> = ({cn, en = '', mode, from, to, size}) => {
  const frame = useCurrentFrame();
  // 字幕只许从 storyboard 来。S06 曾经额外硬写了一条，和真字幕叠在一起渲染，
  // 而 assertCaptionLimits() 只数 JSON 里的条数，抓不到代码里多写的那条。
  const {id} = useVideoConfig();
  if (useContext(Chrome)) return null;   // 必须在 getShot(id) 之前：封面 composition 的 id 不在 storyboard 里
  const known = getShot(id).captions.some(c => c.cn === cn);
  if (!known) {
    throw new Error(`${id}: 字幕「${cn.slice(0, 12)}…」不在 storyboard 里 —— 文案只能改 JSON`);
  }
  const span = Math.max(1, to - from);
  const charEvery = Math.max(1, Math.floor((span * 0.72) / Math.max(1, cn.length)));
  const shown = Math.max(0, Math.min(cn.length, Math.floor((frame - from) / charEvery) + 1));
  const enStart = from + cn.length * charEvery + 4;
  const enO = interpolate(frame, [enStart, enStart + 18], [0, 0.62], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const col = colorsFor(mode);
  const fs = size ?? T.captionSize;
  // 字幕必须有退场：否则同场第二条会与第一条叠字（S06 冒烟测试真实踩到）
  const exit = interpolate(frame, [to - 10, to], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (frame >= to) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: H * 0.3,
          background: mode === 'dark' ? SCRIM_DARK : SCRIM_PAPER,
        }}
      />
      <div style={{position: 'relative', marginBottom: T.captionBottom - px(20), maxWidth: W - 2 * T.marginX, opacity: exit}}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: fs,
            letterSpacing: T.captionTrack,
            color: col.main,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            textShadow: mode === 'dark' ? col.shadow : col.shadow,
          }}
        >
          {cn.slice(0, frame >= from ? shown : 0)}
          {frame >= from && shown < cn.length ? (
            // 3px 细条，不是 ▍ 那个字符 —— 砖块状的 ▍ 在 720p 下宽到像一个错字（A5）
            <span
              style={{
                display: 'inline-block',
                width: px(3),
                height: fs * 0.84,
                marginLeft: px(4),
                verticalAlign: `-0.09em`,
                borderRadius: px(1.5),
                background: C.coral,
                opacity: 0.78,
              }}
            />
          ) : null}
        </div>
        {en ? (
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: T.enSize,
              letterSpacing: T.enTrack,
              color: col.sub,
              textAlign: 'center',
              marginTop: px(14),
              opacity: enO,
            }}
          >
            {en}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** 珊瑚星芒 ✳ —— 全片母题。12 芒、长短交替、带辉光。 */
export const Spark: React.FC<{size: number; from: number; spokes?: number}> = ({
  size,
  from,
  spokes = 12,
}) => {
  const frame = useCurrentFrame();
  const s = spring({frame: frame - from, fps: 30, config: {damping: 12}});
  const lines = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const r = (size / 2) * (i % 2 === 0 ? 1 : 0.6) * s;
    lines.push(
      <line
        key={i}
        x1={size / 2}
        y1={size / 2}
        x2={size / 2 + Math.cos(a) * r}
        y2={size / 2 + Math.sin(a) * r}
        stroke={C.coral}
        strokeWidth={size * 0.055}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <svg width={size} height={size} style={{filter: 'drop-shadow(0 0 14px rgba(232,115,90,.85))'}}>
      {lines}
    </svg>
  );
};

/** 场间淡入淡出（不引入额外依赖） */
export const Fade: React.FC<{d: number; children: React.ReactNode}> = ({d, children}) => {
  const frame = useCurrentFrame();
  const o = Math.min(
    interpolate(frame, [0, 15], [0, 1], {extrapolateLeft: 'clamp'}),
    interpolate(frame, [d - 16, d], [1, 0], {extrapolateRight: 'clamp'}),
  );
  return <div style={{position: 'absolute', inset: 0, opacity: o}}>{children}</div>;
};

export const Scene: React.FC<{from: number; d: number; children: React.ReactNode}> = ({
  from,
  d,
  children,
}) => (
  <Sequence from={from} durationInFrames={d} layout="none">
    <Fade d={d}>{children}</Fade>
  </Sequence>
);
