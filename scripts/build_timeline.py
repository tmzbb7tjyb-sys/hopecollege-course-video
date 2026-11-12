#!/usr/bin/env python3
"""按实测配音构造全片时间轴：场景起止、分句边界、字幕与完整旁白音轨。"""
import json, os, re, subprocess, wave, struct
import array

FF = '/Users/tendays/.local/bin/ffmpeg'
FP = '/Users/tendays/.local/bin/ffprobe'
ROOT = os.path.dirname(os.path.abspath(__file__))
PROC = os.path.join(ROOT, 'audio', 'proc')
SR = 48000

# 每镜动效依赖的分句数量（scene.js 中 at(q,n)/q[n] 的最大下标 + 1）
NEED = {1: 4, 2: 3, 3: 4, 4: 6, 5: 4, 6: 3, 7: 4, 8: 5, 9: 3, 10: 7, 11: 5, 12: 3,
        13: 3, 14: 4, 15: 3, 16: 5, 17: 3, 18: 4, 19: 4, 20: 4, 21: 3, 22: 7,
        25: 6, 26: 5}
# 需要多留时间看图的镜
HOLD = {9: 2.6, 11: 2.6, 15: 2.6, 20: 2.6, 22: 2.6, 26: 1.4}
DEFAULT_TAIL = 0.7
LEAD = 0.8
OUTRO = 1.6


def dur(path):
    o = subprocess.run([FP, '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', path], capture_output=True, text=True)
    return float(o.stdout.strip())


def load_pcm(path):
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-f', 's16le', '-acodec', 'pcm_s16le',
                          '-ac', '2', '-ar', str(SR), '-'], capture_output=True).stdout
    return raw


def silences(path):
    o = subprocess.run([FF, '-hide_banner', '-i', path, '-af', 'silencedetect=noise=-34dB:d=0.15',
                        '-f', 'null', '-'], capture_output=True, text=True)
    ss = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', o.stderr)]
    se = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', o.stderr)]
    mids = []
    for i, s in enumerate(ss):
        if i < len(se):
            mids.append((s + se[i]) / 2)
    return mids


def split_clauses(text, k):
    parts = [p.strip() for p in re.split(r'(?<=[。！？；：])', text.strip()) if p.strip()]
    merged = []
    for p in parts:
        if merged and len(p) < 5:
            merged[-1] += p
        else:
            merged.append(p)
    while len(merged) > k:
        i = min(range(len(merged) - 1), key=lambda j: len(merged[j]) + len(merged[j + 1]))
        merged[i] = merged[i] + merged[i + 1]
        del merged[i + 1]
    while len(merged) < k:
        i = max(range(len(merged)), key=lambda j: len(merged[j]))
        p = merged[i]
        cut = -1
        for m in re.finditer('，', p):
            if 8 <= m.end() <= len(p) - 4:
                cut = m.end()
                if abs(m.end() - len(p) / 2) < 12:
                    break
        if cut == -1:
            cut = max(6, len(p) // 2)
        merged[i:i + 1] = [p[:cut].strip(), p[cut:].strip()]
    return merged


def main():
    rows = json.load(open(os.path.join(ROOT, 'narration.json')))
    scenes = []
    t = LEAD
    pcm_all = b'\x00\x00' * int(LEAD * SR) * 2
    for r in rows:
        n = r['number']
        wav = os.path.join(PROC, f'{n:02d}.wav')
        if not os.path.exists(wav):
            raise SystemExit(f'缺少配音 {wav}')
        d = dur(wav)
        text = r.get('tts') or r['narration']
        k = NEED.get(n, 3)
        cls = split_clauses(text, k)
        # 分句边界按字数比例找最近的静音中点
        mids = silences(wav)
        total_chars = sum(len(c) for c in cls)
        bounds = []
        acc = 0
        for c in cls[:-1]:
            acc += len(c)
            target = d * acc / total_chars
            cand = [m for m in mids if abs(m - target) < 0.95 and 0.4 < m < d - 0.4]
            bounds.append(min(cand, key=lambda m: abs(m - target)) if cand else target)
        bounds = [0] + bounds + [d]
        clauses = []
        for i, c in enumerate(cls):
            s, e = bounds[i], bounds[i + 1]
            if e <= s:
                e = s + 0.05
            clauses.append({'start': round(t + s, 3), 'end': round(t + e, 3), 'text': c.rstrip('。；，、：')})
        tail = HOLD.get(n, DEFAULT_TAIL)
        scenes.append({'number': n, 'start': round(t, 3), 'end': round(t + d + tail, 3),
                       'dur': round(d, 3), 'clauses': clauses})
        pcm = load_pcm(wav)
        pcm_all += pcm + b'\x00\x00' * int(tail * SR) * 2
        t = t + d + tail

    pcm_all += b'\x00\x00' * int(OUTRO * SR) * 2
    total = t + OUTRO

    wav_path = os.path.join(ROOT, 'audio', 'narration.wav')
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm_all)

    tl = {'scenes': scenes, 'duration': round(total, 3)}
    with open(os.path.join(ROOT, 'timeline.json'), 'w') as f:
        json.dump(tl, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'timeline.js'), 'w') as f:
        f.write('window.TIMELINE = ')
        json.dump(tl, f, ensure_ascii=False)
        f.write(';\n')

    # 字幕
    def ts(x, sep=','):
        h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
        return f'{h:02d}:{m:02d}:{int(s):02d}{sep}{int(round((s - int(s)) * 1000)):03d}'

    with open(os.path.join(ROOT, 'subtitles.srt'), 'w') as f:
        for i, sc in enumerate(scenes):
            for j, cl in enumerate(sc['clauses']):
                f.write(f"{i*10+j+1}\n{ts(cl['start'])} --> {ts(cl['end'])}\n{cl['text']}\n\n")

    with open(os.path.join(ROOT, 'subtitles.ass'), 'w') as f:
        f.write('[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n'
                'WrapStyle: 2\nScaledBorderAndShadow: yes\n\n'
                '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, '
                'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, '
                'Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, '
                'MarginV, Encoding\n'
                'Style: N,Songti SC,46,&HFFFFFFFF,&HFFFFFFFF,&H00202020,&H64000000,0,0,0,0,'
                '100,100,1,0,1,3,0,2,120,120,72,1\n\n[Events]\n'
                'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
        for sc in scenes:
            for cl in sc['clauses']:
                f.write(f"Dialogue: 0,{ts(cl['start'],'.')},{ts(cl['end'],'.')},N,,0,0,0,,{cl['text']}\n")

    print(f'总时长 {total:.1f}s = {total/60:.2f} 分钟，镜数 {len(scenes)}，字幕条 {sum(len(s["clauses"]) for s in scenes)}')
    for sc in scenes:
        print(f'  {sc["number"]:02d} {sc["start"]:7.2f}-{sc["end"]:7.2f} 配音{sc["dur"]:5.2f}s 分句{len(sc["clauses"])}')


if __name__ == '__main__':
    main()
