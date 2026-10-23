# SonicVhibez Short Renderer

This helper assembles local media into a vertical MP4 for review. It does **not** download media, generate narration, verify licenses, upload, schedule, or publish.

## Requirements
- Python 3.10+
- FFmpeg and FFprobe installed and available on PATH
- An authorized wildlife clip, final narration, and an SRT retimed against that exact narration
- Optional music that you have rights to use

## Example
```bash
python scripts/render_sonicvhibez_short.py \
  --video media/leopard-clip.mp4 \
  --voice media/final-narration.wav \
  --captions media/final-captions.srt \
  --music media/licensed-music.mp3 \
  --output build/sonicvhibez-short-002.mp4 \
  --duration 55
```

Omit `--music` if no licensed music is available. If a font is needed for compatibility, supply `--font /path/to/font.ttf`.

The renderer:
- Fails early if required files or FFmpeg are missing.
- Restricts the target duration to 45–60 seconds.
- Creates 1080×1920, 30 fps H.264 video with AAC audio.
- Burns in the supplied captions.
- Adds persistent on-screen disclosure labels for paid promotion and AI-generated visuals/voice.

## Before any upload
1. Watch the complete export and verify the narration, factual claims, caption timing, crop, and sound mix.
2. Change the AI label if only some elements are AI-generated; disclose synthetic or altered content accurately. Also enable the platform's native AI/synthetic-content disclosure wherever required. An on-screen label is not a substitute for a platform setting.
3. Keep the paid-promotion label and an unambiguous written disclosure in the post description. Disclose affiliate commissions where applicable.
4. Open the exact live Selar product URL and verify product identity, current price, and checkout destination.
5. Confirm the destination is SonicVhibez, not Nature Frontiers.
6. Keep the post as a draft until all release gates pass. This script never publishes.

## Important
The default overlay text is intentionally conservative. If the finished assets do not contain AI-generated elements, change the AI overlay before rendering. Do not claim footage is real wildlife footage unless its origin is known and verified. The script cannot certify a numeric SEO score or predict views/sales.
