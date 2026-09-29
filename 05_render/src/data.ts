import {useMemo} from 'react';
import SB from '../../03_storyboard/ep01.json';
import {useVideoConfig} from 'remotion';

export type Cap = {n: number; cn: string; en?: string; in_frac: number; out_frac: number};
export type Shot = {
  id: string;
  era: string;
  stamp_en: string;
  stamp_cn: string;
  mode: 'dark' | 'paper';
  dur_frame: number;
  captions: Cap[];
  [k: string]: unknown;
};

const SHOTS = SB.shots as unknown as Shot[];
const BY_ID = new Map(SHOTS.map(s => [s.id, s]));

export const storyboard = SB;
export const shotIds = SHOTS.map(s => s.id);
export const getShot = (id: string): Shot => {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`storyboard 里没有 ${id}`);
  return s;
};

/**
 * 把 storyboard 的字幕区间换算成帧。
 * narration=false → 用 in_frac/out_frac（对齐原片 6.8s/条的节奏）
 * narration=true  → 用 tools/timeline.mjs 产出的 timeline.json 真实音频边界（此处仍回落到 frac，
 *                   等 P3 出 timeline.json 后由 TimelineProvider 覆盖）
 * 目的：改文案只改 JSON，不动场景代码。
 */
export function useCaptions(id: string) {
  const {fps} = useVideoConfig();
  const shot = getShot(id);
  return useMemo(() => {
    return shot.captions.map(c => {
      const from = Math.round(c.in_frac * shot.dur_frame);
      const to = Math.round(c.out_frac * shot.dur_frame);
      return {
        ...c,
        from,
        to,
        // 24 全角上限自检（v1.1 §14.2③）
        over: [...c.cn].length > 24,
        sec: ((to - from) / fps).toFixed(1),
      };
    });
  }, [id, fps, shot]);
}

export function useShot(id: string) {
  return getShot(id);
}

/**
 * 素材唯一事实源：这场有没有底图、是哪张图，由 storyboard 决定，不由场景代码自觉。
 * 为什么要收上来：S12 曾经忘了传 src，占位纯色和兜底背景一模一样，整场底图缺失却看不出来。
 * variant='b' 读 plate.alt_src（S13 一场两张图）。
 */
export type PlateSpec = {kind: 'none' | 'image' | 'video'; src?: string};

export const plateOf = (id: string, variant: 'a' | 'b' = 'a'): PlateSpec => {
  const p = (getShot(id) as Record<string, unknown>).plate as
    | {kind?: string; src?: string | null; alt_src?: string | null}
    | undefined;
  const kind = p?.kind === 'video' ? 'video' : p?.kind === 'image' ? 'image' : 'none';
  const raw = variant === 'b' ? p?.alt_src : p?.src;
  // 没有 alt_src = 这场本来就只有一张图，不是"图丢了"
  if (variant === 'b' && !raw) return {kind: 'none'};
  return {kind, src: raw ? String(raw).split('/').pop() : undefined};
};

/** 渲染前跑一遍：storyboard 说有图、public/ 里却没有，直接炸在打包阶段 */
export function assertPlateSources(publicDirFiles: string[]) {
  const bad: string[] = [];
  for (const id of shotIds) {
    for (const v of ['a', 'b'] as const) {
      const {kind, src} = plateOf(id, v);
      if (kind === 'none') continue;
      if (!src) bad.push(`${id}${v === 'b' ? '·b' : ''} 声明有底图但没有 src`);
      else if (!publicDirFiles.includes(src)) bad.push(`${id}${v === 'b' ? '·b' : ''} 缺素材 ${src}`);
    }
  }
  return bad;
}

/** 字幕字数红线：任何一条超 24 全角直接抛错，让它在渲染阶段就炸，而不是等 QC 发现 */
export function assertCaptionLimits() {
  const bad: string[] = [];
  for (const s of SHOTS) {
    for (const c of s.captions) {
      const n = [...c.cn].length;
      if (n > 24 || n < 5) bad.push(`${s.id}-${c.n} (${n}字)`);
    }
    if (s.captions.length !== 2) bad.push(`${s.id} 字幕数=${s.captions.length}（应为 2）`);
  }
  return bad;
}
