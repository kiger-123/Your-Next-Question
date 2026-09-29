import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, staticFile} from 'remotion';
import {GradeLayers} from './kit';
import {C, W, H} from './theme';

/**
 * P0 通路等价测试：同一张源图，一条走 <Img>（静图通路，已在用），
 * 一条走 <OffthreadVideo>（视频通路，本次新加），两层都叠同一个 GradeLayers。
 *
 * 为什么要做这个：视频通路一次都没跑过，而"调色层叠在视频上还能不能生效"这件事
 * 有个前科 —— v1 方案里 opacity<1 会新建隔离组，把 lighten/screen 整个废掉。
 * 如果这里不等价，说明视频底图的 AND 混合没接上，后面花的每一笔视频钱都是浪费。
 *
 * 验收：两张 still 逐像素差，平均差 <3、最大差 <30（只允许 h264 有损编码的噪声）。
 */
const Box: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{background: C.ink, overflow: 'hidden'}}>
    {children}
    <GradeLayers />
  </AbsoluteFill>
);

const SRC = 'S01.png';

export const ImagePathTest: React.FC = () => (
  <Box>
    <Img
      src={staticFile(SRC)}
      style={{position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover'}}
    />
  </Box>
);

export const VideoPathTest: React.FC = () => (
  <Box>
    <OffthreadVideo
      src={staticFile('_pathtest.mp4')}
      style={{position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover'}}
    />
  </Box>
);
