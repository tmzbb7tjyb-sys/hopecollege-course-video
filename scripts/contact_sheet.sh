#!/usr/bin/env bash
# 把成片抽成一张缩略图墙，用来一眼扫出重叠、截字、黑帧、错页码。
# 用法：bash contact_sheet.sh 成片.mp4 sheet.jpg [列数] [张数]
set -euo pipefail
FFPROBE="${FFPROBE:-ffprobe}"
FFMPEG="${FFMPEG:-ffmpeg}"
VIDEO="${1:?用法: contact_sheet.sh <视频> <输出图片> [列数] [张数]}"
OUT="${2:?缺少输出图片路径}"
COLS="${3:-6}"
COUNT="${4:-36}"
DUR=$($FFPROBE -v error -show_entries format=duration -of default=nw=1:nk=1 "$VIDEO")
STEP=$(python3 -c "print(max(1, int(float($DUR) / $COUNT)))")
ROWS=$(python3 -c "print(-(-$COUNT // $COLS))")
$FFMPEG -y -v error -i "$VIDEO" \
  -vf "select='not(mod(n,${STEP}*30))',scale=320:-1,tile=${COLS}x${ROWS}:padding=6:color=white" \
  -frames:v 1 "$OUT"
echo "已生成 ${OUT}（每 ${STEP} 秒取一帧，${COLS}x${ROWS}）"
