# 插入可播放的视频段

课件里凡是要“放一段视频给学员看”的地方，视频按**正片片段**处理：它计入总时长，有自己的起止时间，前后的动效镜头照常做。不要把它当成一张会动的图塞进 canvas。

## 1 素材先过一遍

```bash
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,sample_rate -of default=nw=1 素材.mp4
```

记下**实测时长**（保留两位小数）、有无音轨、原始比例。不要用脚本里估的秒数排时间轴。

比例与分辨率统一（不变形）：

```bash
ffmpeg -y -i 素材.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,fps=30" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -ac 2 素材_1080p.mp4
```

- 竖屏或 4:3 素材：白底留边居中，两侧可加同色模糊衬底，绝不拉伸。
- 原素材帧率不是 30 fps（25/24/60）必须 `fps=30` 重编码，否则 concat 后出现抖动或音画不同步。
- 素材本身带角标、水印、播放器 UI 的，先判断能不能用；不能就换素材，不要靠裁切掩盖。

## 2 时间轴怎么排

1. 视频段在自己的镜里占 `[t_start, t_start + 实测时长]`，前后的旁白句按视频结束点往后顺延。
2. 视频段内默认**不叠旁白**：要么放原声，要么只放一段引导语（“先看这段 40 秒的演示”）。确实需要边放边讲时，原声按下一节规则侧链压低，旁白照常走，不要两条声音等音量硬拼。
3. 视频段前后各留 0.6–0.8 s 画面过渡（视频淡入 / 淡出到白），避免硬切。
4. 视频段内的语音如果要字幕，必须单独转写后按时间码铺；不转写就在画面上标“视频原声”，不要空着字幕条假装有字幕。
5. `narration.json` 里给这一镜单独记一条 `video` 字段（路径、时长、是否保留原声），`build_timeline.py` 按它留白，不生成的旁白句子也要留位置。

## 3 渲染路径：分段渲，再拼

逐帧 canvas 渲染撑不住真实视频（掉帧、丢音、色偏）。正确做法是把它切成三段：

```
A 段 = 0            → t_start         （逐帧渲，到视频入场前一帧）
B 段 = 视频本体                        （重编码成 1080p30 的那份）
C 段 = t_start+dur  → 总时长           （逐帧渲，从淡入后的第一帧起）
```

```bash
node render_video.mjs _A.mp4 0 123.45
node render_video.mjs _C.mp4 165.20 480.00        # 注意：参数是时间轴上的绝对秒

ffmpeg -y -i _A.mp4 -i 素材_1080p.mp4 -i _C.mp4 -i audio/narration.wav \
  -filter_complex "\
   [0:v]fade=t=out:st=122.25:d=1.2[v0];\
   [1:v]fade=t=in:st=0:d=0.8,fade=t=out:st=40.95:d=0.8[v1];\
   [2:v]fade=t=in:st=0:d=1.2[v2];\
   [v0][v1][v2]concat=n=3:v=1:a=0[v];\
   [3:a]asplit=2[a0][ak];\
   [1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a1];\
   [a1][ak]sidechaincompress=threshold=0.03:ratio=8:attack=150:release=800[vd];\
   [vd][a0]amix=inputs=2:duration=longest[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 16 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k 成片.mp4
```

- 若视频段内不该有旁白，`narration.wav` 相应区间必须是空白；用 `amix` 而不是 `amerge`，避免双声道错位。

### 原声音量对齐（默认保留原声）

视频原声一律**保留并按全片基准归一**，不要固定写 `volume=-16dB`——素材电平差异很大，写死会一段太响一段太轻。做法：

```bash
# 1 先测素材原声
ffmpeg -hide_banner -i 素材_1080p.mp4 -af loudnorm=print_format=summary -f null - 2>&1 | grep "Input Integrated"
# 2 再按全片目标 −16 LUFS 归一（两遍法或单遍 loudnorm 均可）
```

- 目标是**与全片旁白同一听感**：视频段自己也在 −16 LUFS 附近，接上后整片不应出现“突然变响/变轻”。
- **需要边放边讲**时，旁白是主声道，用 `sidechaincompress` 以旁白为键压缩原声（说话时降 10–12 dB，说完自动回），比手工切音量窗口稳。
- 纯演示、现场嘈杂或原声里没有有效信息的，才整段静音，用旁白承载；这属于内容判断，不默认。
- 拼完一定回抽边界帧（`t_start-1`、`t_start+1`、`t_end-1`、`t_end+1`），确认没有黑场、没有字幕断层。

## 4 时长与验收

- 总时长 = 场景段总长 ＋ 视频段总长，误差仍按 ±0.3 s 卡；时间轴文件、字幕末条、音频长度三者对齐。
- 整片响度统一到 −16 LUFS：视频原声接入后最容易把整体拉高，必须整片重测一次，不能只测旁白。
- `blackdetect` 会抓到视频段前后的淡入淡出，阈值用 `d=0.08:pix_th=0.10`，淡出时长控制在 0.8–1.2 s，别做到 2 s 造成“疑似黑场”。
- 依据表里给这段视频建一条：来源、发布时间、授权状态、是否限内训、片内用到的秒数区间。

## 5 常见坑

| 现象 | 原因 | 处置 |
|---|---|---|
| concat 后画面抖动、字幕偏移 | 素材帧率/SAR 与主片不一致 | 先 `fps=30`＋`setsar=1` 重编码再拼 |
| 视频段人声忽大忽小 | 原素材电平与旁白差 10 dB 以上 | 单独 `volume` 或 `loudnorm` 校正后 amix |
| 视频放完突然切回动画，观众出戏 | 缺淡入淡出 | 前后各 0.6–0.8 s 过渡 |
| 字幕条在视频段还是出现 | 时间轴没给视频段留白 | `narration.json` 记录 `video` 字段，`build_timeline.py` 跳过 |
| 视频里的关键数字学员看不清 | 素材本身分辨率低 | 视频段结束后加一镜“画面回看＋数字标注”，而不是放大视频硬拉 |
