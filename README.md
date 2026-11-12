# 希望学院视频课程 1.0

一个把「中文课程脚本」做成「带旁白、逐镜动效画面、字幕的成片 MP4」的可重跑流水线技能，同时产出可修改工程与验收记录。适用于内训讲解视频、课程视频、知识科普短片；也适用于只做其中一段（试片、单镜返修）。

## 它解决什么

- **配音不逐字**：生成式配音会漏字、改词、把提示词念出来，本技能默认走神经语音，并要求先做 15 秒样片转写核对再批量。
- **画面靠手改**：所有画面状态由 `window.__render(t)` 的时间函数决定，重跑结果一致；逐帧截帧直通 ffmpeg，中间帧不落盘。
- **课件里的图没进片**：脚本写了“参考图 0X / 后台截图”，对应原图就必须上场；入场帧完整不裁，推近阶段允许裁切聚焦，但不能裁掉被点名数字的坐标轴、单位、时间范围。
- **课件里的视频没进片**：可播放视频按正片片段处理，计入总时长，切三段渲染再 `concat`，原声保留并归一到与全片同一响度基准。

## 目录结构

```
SKILL.md                     主文件：三项基准、五阶段三闸门、命令顺序、配音选型、画面约定
references/
  production-profile.md      配置字段与默认值（画幅、语速、配色、字体、留白、验收阈值）
  image-embedding.md         原图植入：何时必须放图、尺寸硬约束、两段式裁切、实测坐标表
  video-embedding.md         视频段：素材重编码、时间轴排布、三段渲染、原声侧链压低
  qc-checklist.md            五层验收：事实 → 教学 → 旁白 → 分镜 → 技术
  pitfalls.md                实战踩坑与处置
scripts/
  tts_neural.py              神经语音逐镜合成
  prep_audio.py              atempo 语速归一、48 kHz 双声道、−16 LUFS
  build_timeline.py          分句、时间轴、SRT/ASS、narration.wav
  render_video.mjs           帧直通 ffmpeg 渲染（支持起止秒，用于单镜返修）
  snap.mjs                   抽单帧做版式检查
  contact_sheet.sh           生成缩略图墙，一张图扫完重叠、截字、黑帧
assets/engine/
  scene.html                 Canvas 画面引擎外壳
  scene.reference.js         参考实现（通栏渐变 + 白卡 + 无页眉页码）
  timeline.example.js        时间轴契约示例
```

## 快速开始

把 `scripts/` 拷进工程根目录（脚本按自身所在目录找 `narration.json` / `audio/` / `scene.html`），依次执行：

```bash
python3 tts_neural.py                      # 默认 zh-CN-XiaoxiaoNeural, rate=+16%
python3 prep_audio.py                      # 归一到 330 字/分、48 kHz、−16 LUFS
python3 build_timeline.py                  # 分句、时间轴、SRT/ASS、narration.wav
node render_video.mjs 成片.mp4             # 全片
node render_video.mjs _seg.mp4 406.08 420.94   # 只渲某段，用于单镜返修
```

## 质检

```bash
bash scripts/contact_sheet.sh 成片.mp4 sheet.jpg
ffmpeg -hide_banner -i 成片.mp4 -vf blackdetect=d=0.08:pix_th=0.10 \
  -af loudnorm=print_format=summary -f null -
```

验收阈值：时长 ±0.3 s、响度 −16 LUFS、True peak ≤ −1 dBTP、无黑帧、无截字。

## 依赖

- Node.js（`render_video.mjs` 用 `puppeteer-core` 驱动本机 Chrome）
- `edge-tts`（神经语音）、ffmpeg / ffprobe
- Python 3（`prep_audio.py` / `build_timeline.py`）

## 版本

1.0（2026-11-12 定版）：在 24 镜、420 秒内训成片实战中沉淀。覆盖配音选型、语速归一、时间轴与字幕对齐、逐帧动效、原图植入、视频段插入、五层验收。

## 必须由人拍板

内容口径（统计窗口、指标口径、案例代表性）、音色与语速、视觉风格定版、含真人素材能否使用、事实与教学层终审、是否需要背景音乐。技能只负责执行与自检，不替使用者下判断。
