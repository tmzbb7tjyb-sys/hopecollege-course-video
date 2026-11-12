import asyncio, json, os, subprocess, sys
import edge_tts

ROOT = os.path.dirname(os.path.abspath(__file__))
FF = '/Users/tendays/.local/bin/ffmpeg'
FP = '/Users/tendays/.local/bin/ffprobe'
VOICE = 'zh-CN-XiaoxiaoNeural'
RATE = '+16%'
RAW = os.path.join(ROOT, 'audio', 'raw')
os.makedirs(RAW, exist_ok=True)


def dur(p):
    o = subprocess.run([FP, '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'default=nw=1:nk=1', p], capture_output=True, text=True)
    return float(o.stdout.strip())


async def one(n, text):
    mp3 = os.path.join(RAW, f'{n:02d}.mp3')
    wav = os.path.join(RAW, f'{n:02d}.wav')
    for attempt in range(4):
        try:
            c = edge_tts.Communicate(text, VOICE, rate=RATE)
            await c.save(mp3)
            if os.path.getsize(mp3) > 20000:
                break
        except Exception as e:
            print(f'  {n:02d} 第{attempt+1}次失败：{e}')
            await asyncio.sleep(3)
    subprocess.run([FF, '-y', '-v', 'error', '-i', mp3,
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', wav], check=True)
    d = dur(wav)
    cpm = len(text) / d * 60
    print(f'{n:02d} {len(text):3d}字 {d:5.2f}s {cpm:6.1f}字/分')


async def main():
    rows = json.load(open(os.path.join(ROOT, 'narration.json')))
    nums = [int(x) for x in sys.argv[1:]] or [r['number'] for r in rows]
    for r in rows:
        if r['number'] not in nums:
            continue
        text = (r.get('tts') or r['narration']).strip()
        await one(r['number'], text)

asyncio.run(main())
