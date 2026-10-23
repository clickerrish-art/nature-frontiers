#!/usr/bin/env python3
"""Render a review-ready SonicVhibez vertical promo; never uploads or publishes.

Requires ffmpeg + ffprobe. Provide licensed/authorized video, final narration,
and captions retimed to that narration. Output is 1080x1920 H.264/AAC, 30 fps.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def run(args: list[str]) -> str:
    p = subprocess.run(args, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
    if p.returncode:
        raise RuntimeError(p.stderr[-4000:] or "Command failed")
    return p.stdout.strip()


def duration(path: Path) -> float:
    raw = run(["ffprobe", "-v", "error", "-show_entries",
               "format=duration", "-of", "json", str(path)])
    return float(json.loads(raw)["format"]["duration"])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--video", required=True, type=Path,
                    help="Authorized wildlife video clip")
    ap.add_argument("--voice", required=True, type=Path,
                    help="Final narration audio file")
    ap.add_argument("--captions", required=True, type=Path,
                    help="SRT captions synchronized to final narration")
    ap.add_argument("--output", required=True, type=Path, help="Output MP4")
    ap.add_argument("--music", type=Path, help="Optional licensed music bed")
    ap.add_argument("--duration", type=int, default=55,
                    help="Target duration, 45–60 seconds (default 55)")
    ap.add_argument("--font", type=str,
                    help="Optional path to a readable .ttf font for overlays")
    ap.add_argument("--paid-disclosure", default="PAID PROMOTION",
                    help="On-screen disclosure text; keep clear and readable")
    ap.add_argument("--ai-disclosure", default="AI-MADE VISUALS / VOICE",
                    help="On-screen AI disclosure; adjust to actual asset use")
    args = ap.parse_args()

    for exe in ("ffmpeg", "ffprobe"):
        if not shutil.which(exe):
            print(f"ERROR: {exe} is not installed.", file=sys.stderr)
            return 2
    for p in (args.video, args.voice, args.captions):
        if not p.is_file():
            print(f"ERROR: required input missing: {p}", file=sys.stderr)
            return 2
    if args.music and not args.music.is_file():
        print(f"ERROR: music file missing: {args.music}", file=sys.stderr)
        return 2
    if not 45 <= args.duration <= 60:
        print("ERROR: duration must be between 45 and 60 seconds.", file=sys.stderr)
        return 2
    voice_len = duration(args.voice)
    if voice_len > args.duration + 0.25:
        print(f"ERROR: narration is {voice_len:.1f}s, longer than target "
              f"{args.duration}s. Recut narration or increase target.",
              file=sys.stderr)
        return 2
    if duration(args.video) < 1:
        print("ERROR: video clip is too short to use.", file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Burned captions ensure they remain visible on platforms that mute video.
    # Draw disclosure bands for the entire video so they are not missed.
    def esc_path(p: Path) -> str:
        return str(p.resolve()).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

    def esc_text(s: str) -> str:
        return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")

    vf = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,fps=30,setsar=1,"
        f"subtitles='{esc_path(args.captions)}',"
        f"drawtext=text='{esc_text(args.paid_disclosure)}':"
        "x=(w-text_w)/2:y=h-250:fontsize=42:fontcolor=white:"
        "box=1:boxcolor=black@0.78:boxborderw=14,"
        f"drawtext=text='{esc_text(args.ai_disclosure)}':"
        "x=(w-text_w)/2:y=70:fontsize=30:fontcolor=white:"
        "box=1:boxcolor=black@0.72:boxborderw=10"
    )
    if args.font:
        if not Path(args.font).is_file():
            print(f"ERROR: font file missing: {args.font}", file=sys.stderr)
            return 2
        vf = vf.replace("drawtext=text=", f"drawtext=fontfile='{esc_path(Path(args.font))}':text=")

    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-stream_loop", "-1", "-i", str(args.video),
           "-i", str(args.voice)]
    if args.music:
        cmd += ["-stream_loop", "-1", "-i", str(args.music)]
    cmd += ["-t", str(args.duration), "-vf", vf]
    if args.music:
        # Narration stays prominent; music is ducked to a low background level.
        cmd += ["-filter_complex",
                "[1:a]apad=pad_dur=60[voice];"
                "[2:a]volume=0.10,apad=pad_dur=60[music];"
                "[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
                "-map", "0:v:0", "-map", "[aout]"]
    else:
        cmd += ["-map", "0:v:0", "-map", "1:a:0", "-af", "apad"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
            "-ar", "48000", "-movflags", "+faststart", str(args.output)]
    try:
        run(cmd)
        out_len = duration(args.output)
        if not args.output.is_file() or args.output.stat().st_size == 0:
            raise RuntimeError("FFmpeg did not create a usable output file.")
        print(f"RENDERED: {args.output.resolve()}")
        print(f"DURATION: {out_len:.1f}s")
        print("STATUS: RENDER ONLY — not uploaded, scheduled, or published.")
        print("REVIEW REQUIRED: inspect full video, caption timing, audio levels, "
              "rights, product link, disclosure accuracy, and destination.")
        return 0
    except (RuntimeError, ValueError, KeyError) as exc:
        print(f"ERROR: render failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
