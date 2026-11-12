---
name: hopecollege-course-video
description: 希望学院视频课程 1.0——把一份中文课程脚本做成带旁白、逐镜动效画面、字幕、可选插入视频段的成片 MP4，并产出可修改工程与验收记录。当用户要做希望学院的内训讲解视频、课程视频、知识科普短片，把课件或逐镜脚本变成视频，要求“同一音色统一语速的旁白”“字幕对齐”“原图按课件上场”“可修改工程”“成片验收”，或脚本已有分镜表只差配音与渲染时使用。也适用于只做其中一段（试片、单镜返修）。
---

# 课程视频流水线（希望学院视频课程 1.0）

版本 1.0（2026-11-12 定版）：在 24 镜内训成片实战中沉淀，覆盖配音、时间轴、动效画面、原图植入、视频段插入与验收。

把「脚本 → 配音 → 时间轴／字幕 → 动效画面 → 成片 → 验收」串成一条可重跑的链路。默认 1920×1080 / 30 fps / H.264 CRF16 ＋ AAC 192k，旁白同一音色统一到 330 字/分。

## 开工前必须拿到的三项基准

拿不到就先问，不要自己发明，否则后面整体返工：

1. **视觉基准**：一张参考帧或一段样片。风格一旦定版，所有镜头照它做。
2. **旁白基准**：让用户试听 2–3 个候选音色各 15 秒，选定后全片只用这一个。
3. **时长／语速目标**：例如 1.5 倍速、330 字/分，或“总长压到 7 分钟以内”。

## 五个阶段与三个闸门

| 阶段 | 产出 | 闸门（不过不许往下走） |
|---|---|---|
| 1 脚本落地 | `narration.json`（镜号／旁白／屏幕字／画面说明）、依据表、`production_profile.md` | 事实类内容能回到依据表；待确认项标成“待确认”而非定论 |
| 2 配音 | `audio/raw/NN.wav` → `audio/proc/NN.wav` | **15 秒样片转写核对通过**（逐字，不改写不漏字），才批量 |
| 3 时间轴 | `timeline.json/js`、`subtitles.srt/ass`、`audio/narration.wav` | 句数与 `scene.js` 的分句假设一致；总长与脚本预估的偏差有解释；含视频段的按实测时长排，段内默认不叠旁白，需边放边讲则压低原声 |
| 4 画面 | `scene.js`＋`scene.html`，逐帧由 `window.__render(t)` 决定 | 抽帧检查：无重叠、无截字、页码与总镜数正确、屏上字与旁白一致；脚本提到的原图都已上场且可读 |
| 5 成片 | MP4 ＋ 验收记录 | 时长 ±0.3 s、响度 −16 LUFS、TP ≤ −1 dBTP、无黑帧 |

## 命令顺序

把 `scripts/` 里的脚本拷进工程根目录（它们按自身所在目录找 `narration.json`／`audio/`／`scene.html`），依次执行：

```bash
python3 tts_neural.py                      # 神经语音逐镜合成，默认 zh-CN-XiaoxiaoNeural, rate=+16%
python3 prep_audio.py                      # atempo 归一到 330 字/分、48 kHz 双声道、−16 LUFS
python3 build_timeline.py                  # 分句、时间轴、SRT/ASS、narration.wav
node render_video.mjs 成片.mp4             # 帧直通 ffmpeg，不落盘
```

单镜返修不重跑全片：

```bash
node render_video.mjs _seg.mp4 406.08 420.94
ffmpeg -y -i 全片.mp4 -i _seg.mp4 -i audio/narration.wav \
  -filter_complex "[0:v]trim=0:406.08,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -map 2:a -c:v libx264 -crf 16 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -shortest 新片.mp4
```

## 配音选型（最容易返工的一步）

| 通道 | 逐字可靠 | 字音清晰 | 适用 |
|---|---|---|---|
| 生成式配音（参考音色＋音频生成模型） | 否：会漏字、改词、把提示词念出来 | 好 | 不做逐字核对就不该用 |
| macOS `say`（compact 语音） | 是 | 差，1.5 倍速更糊 | 只做临时占位 |
| `edge-tts` 神经语音 | 是 | 好 | **默认**；女声 `zh-CN-XiaoxiaoNeural`，男声 `YunyangNeural` |

- 语速先用 `rate` 粗调（`+16%` 约 320–340 字/分），再用 `atempo` 精调：`tempo = 目标字速 / 实测字速`（别写反）。
- 批量前抽 1–2 段做转写核对；英文缩写（PR、CPM、Vlog）要确认按字母/原音读出。

## 画面引擎约定

- 所有状态由 `window.__render(t)` 的时间参数决定，不读真实时钟，重跑结果一致。
- 契约：`window.TIMELINE = {scenes:[{number,start,end,clauses:[{start,end,text}]}]}`、`__duration`、`__ready`、`__sceneStarts`。
- 文案唯一真源是 `narration.json`；**屏幕字不要另写一份硬编码**，页码与总镜数从 `SCENES.length` 算。
- 版式控制 3＋1：卡组 / 对比 / 结论 / 流程（按需）。一屏一个焦点，正文 ≥24 px，字幕 42 px。
- 逐帧渲染用「浏览器截帧直通 ffmpeg」，中间帧不落盘；不要先存 1 万多张 JPEG 再编码。

`assets/engine/` 是一套可用参考实现（通栏渐变＋白卡＋无页眉页码），改文案、配色、版式都在 `scene.reference.js` 里。

## 原图必须上场

脚本里凡是“参考图 0X”“课件第 X 页”“后台/历史截图”，该镜就要放那张原图，不能拿示意图或一段文字顶替。放图的硬约束：

- 单图宽 ≥1150 px（1920 画面的 60%），两图并排时每张 ≥860 px，做不到就改成先后出场。
- 图内正文字高 ≥16 px，被旁白点名的数字 ≥22 px。1280 宽的截图放到 760 px 宽只剩 0.59 倍，轴标签必然糊。
- 用 contain 等比缩放，留白居中；入场帧必须完整不裁，推近阶段才允许裁切聚焦。裁切是“放大镜”，只丢无关空白，不丢被点名数字的坐标轴、单位、时间范围。
- 三段式动效：整图淡入 0.5–0.8 s → 推近到证据点 1.5–2.5 s（建议 ≤2.2 倍，保留 10% 边缘做位置提示）→ 标注跟随旁白分句渐显，同一时刻只亮一个。

细节与检查项见 `references/image-embedding.md`。

## 视频段要当正片片段处理

脚本里“放一段视频给学员看”的地方，视频计入总时长，但**不要塞进 canvas 逐帧渲**（会掉帧、丢音、色偏）。做法是切三段：前段逐帧渲 → 中间放重编码好的 1080p30 素材 → 后段逐帧渲，最后用 `concat` 拼接并统一混音。

- 素材先 `ffprobe` 取实测时长，`scale+pad+fps=30+setsar=1` 统一规格；竖屏素材白底居中，不拉伸。
- 视频段前后各留 0.6–0.8 s 淡入淡出；原声默认保留并用 `loudnorm` 归到与全片同一基准（−16 LUFS 左右），需要边放边讲时用旁白作 sidechain 压低原声 10–12 dB。
- 段内语音要字幕必须单独转写；不转写就在画面标“视频原声”，不要空字幕条。
- 拼完回抽四个边界帧（入场前后、收尾前后），并整片重测响度——接了原声最容易把整体拉高。

细节、命令与坑见 `references/video-embedding.md`。

## 验收

按 `references/qc-checklist.md` 走五项：事实 → 教学 → 旁白 → 分镜 → 技术。技术项优先用脚本判定，别用眼看：

```bash
bash scripts/contact_sheet.sh 成片.mp4 sheet.jpg   # 一张缩略图墙，扫重叠/截字/黑帧
ffmpeg -hide_banner -i 成片.mp4 -vf blackdetect=d=0.08:pix_th=0.10 -af loudnorm=print_format=summary -f null -
```

## 必须由人拍板的环节

内容口径（统计窗口、指标口径、案例代表性）、音色与语速选择、视觉风格定版、含真人的素材能否使用、事实与教学层的终审、是否需要背景音乐。这些不要替用户决定，也不要自我盖章。

## 细节参考

- 配置字段与默认值：`references/production-profile.md`
- 原图植入与动效：`references/image-embedding.md`
- 插入可播放的视频段：`references/video-embedding.md`
- 验收清单与自动质检：`references/qc-checklist.md`
- 这次踩过的坑与处置：`references/pitfalls.md`
