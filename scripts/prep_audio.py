#!/usr/bin/env python3
"""把逐镜配音统一到固定音色的统一语速，并转成 48 kHz 双声道，供时间轴与合成使用。"""
import json, os, subprocess, sys

FF = '/Users/tendays/.local/bin/ffmpeg'
FP = '/Users/tendays/.local/bin/ffprobe'
ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, 'audio', 'raw')
PROC = os.path.join(ROOT, 'audio', 'proc')
TARGET_CPM = 330.0          # 全片统一语速：每分钟 330 字
ATEMPO_RANGE = (0.72, 1.30) # 保护音质的变速上下限


def dur(path):
    out = subprocess.run([FP, '-v', 'error', '-show_entries', 'format=duration',
                          '-of', 'default=nw=1:nk=1', path], capture_output=True, text=True)
    return float(out.stdout.strip())


def main():
    os.makedirs(PROC, exist_ok=True)
    rows = json.load(open(os.path.join(ROOT, 'narration.json')))
    report = []
    for r in rows:
        n = r['number']
        tts = r.get('tts') or r['narration']
        chars = len([c for c in tts if c.strip()])
        src = os.path.join(RAW, f'{n:02d}.wav')
        dst = os.path.join(PROC, f'{n:02d}.wav')
        if not os.path.exists(src):
            print(f'缺少 {src}')
            continue
        d = dur(src)
        rate = chars / d * 60 if d else 0
        tempo = TARGET_CPM / rate  # 比目标快就放慢，比目标慢就加快
        tempo = max(ATEMPO_RANGE[0], min(ATEMPO_RANGE[1], tempo))
        af = f'atempo={tempo:.4f},aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11'
        subprocess.run([FF, '-y', '-hide_banner', '-loglevel', 'error', '-i', src,
                        '-af', af, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', dst], check=True)
        nd = dur(dst)
        report.append({'number': n, 'chars': chars, 'raw_dur': round(d, 3), 'raw_cpm': round(rate, 1),
                       'atempo': round(tempo, 3), 'proc_dur': round(nd, 3), 'cpm': round(chars / nd * 60, 1)})
        print(f'{n:02d} 原{rate:5.1f}字/分 atempo={tempo:.3f} -> {chars/nd*60:5.1f}字/分 {nd:6.2f}s')
    json.dump(report, open(os.path.join(ROOT, 'audio', 'speed-report.json'), 'w'),
              ensure_ascii=False, indent=1)
    total = sum(x['proc_dur'] for x in report)
    print(f'合计 {total/60:.2f} 分钟，平均 {sum(x["cpm"] for x in report)/len(report):.0f} 字/分')


if __name__ == '__main__':
    main()
