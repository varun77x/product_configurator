"""
Panel Deboss Engine — Product Configurator Utility
===================================================
Applies a realistic debossed / engraved 3D effect to any wall-panel
background using any line-pattern overlay.

Usage:
    python deboss_engine.py \
        --panel  panel_background.jpg \
        --pattern line_pattern.png \
        --output result.png \
        [--depth 1.0] \
        [--light-angle 135] \
        [--line-threshold 0.5] \
        [--groove-width 3.0] \
        [--highlight 0.25] \
        [--shadow 0.50] \
        [--bevel-width 6] \
        [--raised]

Can also be imported as a module:

    from deboss_engine import apply_deboss_effect
    result = apply_deboss_effect(panel_path, pattern_path, **options)
    result.save("output.png")
"""

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def extract_line_mask(pattern, threshold=0.5, target_size=None):
    """
    Detect lines from a pattern image.
    Expects dark lines on a light background.
    Returns a grayscale Image where white = line.
    """
    gray = pattern.convert("L")
    if target_size:
        gray = gray.resize(target_size, Image.LANCZOS)

    arr = np.array(gray).astype(float)
    lo, hi = arr.min(), arr.max()
    if hi - lo < 1:
        return Image.fromarray(np.zeros_like(arr, dtype=np.uint8))

    # Normalize: 0 = darkest (line), 1 = lightest (background)
    norm = (arr - lo) / (hi - lo)
    # Invert so lines become high values
    inv = 1.0 - norm

    cutoff = 1.0 - threshold
    mask = np.clip((inv - cutoff * 0.3) / (1 - cutoff * 0.3 + 1e-6), 0, 1)
    mask = np.power(mask, 0.7)

    return Image.fromarray((mask * 255).astype(np.uint8))


def apply_deboss_effect(
    panel_path,
    pattern_path,
    depth=1.0,
    light_angle=135.0,
    line_threshold=0.5,
    groove_width=3.0,
    highlight_intensity=0.25,
    shadow_intensity=0.50,
    bevel_width=6,
    raised=False,
):
    """
    Apply a debossed (or raised) 3D effect to a panel image using a
    line-pattern overlay. Returns the composited PIL Image (RGBA).
    """
    panel = Image.open(panel_path).convert("RGBA")
    pattern = Image.open(pattern_path)
    pw, ph = panel.size

    # Extract line mask
    line_mask = extract_line_mask(pattern, threshold=line_threshold,
                                  target_size=(pw, ph))

    # Flip light direction for raised mode
    if raised:
        light_angle = (light_angle + 180) % 360

    # Directional offsets from light angle
    rad = math.radians(light_angle)
    dx = -math.cos(rad)
    dy = math.sin(rad)

    close_dist = groove_width * depth
    far_dist = bevel_width * depth

    shadow_offset = (int(round(dx * close_dist)), int(round(dy * close_dist)))
    highlight_offset = (int(round(-dx * close_dist * 0.7)),
                        int(round(-dy * close_dist * 0.7)))
    wide_shadow_offset = (int(round(dx * far_dist)), int(round(dy * far_dist)))
    wide_highlight_offset = (int(round(-dx * far_dist * 0.6)),
                             int(round(-dy * far_dist * 0.6)))

    blur_close = max(1, groove_width * depth)
    blur_wide = max(2, bevel_width * depth)

    def shift(img, offset):
        out = Image.new("L", (pw, ph), 0)
        out.paste(img, offset)
        return out

    # Build shadow & highlight layers
    shadow_arr = np.array(
        shift(line_mask.filter(ImageFilter.GaussianBlur(radius=blur_close)),
              shadow_offset)
    ).astype(float) / 255.0

    highlight_arr = np.array(
        shift(line_mask.filter(ImageFilter.GaussianBlur(radius=blur_close * 0.8)),
              highlight_offset)
    ).astype(float) / 255.0

    wide_shadow_arr = np.array(
        shift(line_mask.filter(ImageFilter.GaussianBlur(radius=blur_wide)),
              wide_shadow_offset)
    ).astype(float) / 255.0

    wide_highlight_arr = np.array(
        shift(line_mask.filter(ImageFilter.GaussianBlur(radius=blur_wide * 0.8)),
              wide_highlight_offset)
    ).astype(float) / 255.0

    groove_arr = np.array(
        line_mask.filter(ImageFilter.GaussianBlur(radius=max(1, groove_width * 0.6)))
    ).astype(float) / 255.0

    # Fixed emboss kernel — safe integer values, no color inversion
    emboss_filter = ImageFilter.Kernel(
        size=(3, 3),
        kernel=[-1, -1, 0,
                -1,  0, 1,
                 0,  1, 1],
        scale=1,
        offset=128,
    )
    pattern_resized = pattern.convert("L").resize((pw, ph), Image.LANCZOS)
    emboss_arr = (np.array(pattern_resized.filter(emboss_filter)).astype(float)
                  - 128) / 128.0

    # Composite onto panel — multiplicative darkening preserves hue
    result = np.array(panel).astype(float).copy()
    si = shadow_intensity * depth
    hi = highlight_intensity * depth

    for c in range(3):
        result[:, :, c] *= (1 - groove_arr * 0.35 * depth)
        result[:, :, c] *= (1 - shadow_arr * si)
        result[:, :, c] += (255 - result[:, :, c]) * highlight_arr * hi
        result[:, :, c] *= (1 - wide_shadow_arr * si * 0.4)
        result[:, :, c] += (255 - result[:, :, c]) * wide_highlight_arr * hi * 0.4
        # Emboss detail — clamped low to prevent color shifts
        result[:, :, c] += result[:, :, c] * emboss_arr * 0.08 * depth

    result[:, :, 3] = 255
    result = np.clip(result, 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def main():
    parser = argparse.ArgumentParser(
        description="Apply debossed 3D effect to wall panels"
    )
    parser.add_argument("--panel", required=True)
    parser.add_argument("--pattern", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--depth", type=float, default=1.0)
    parser.add_argument("--light-angle", type=float, default=135.0)
    parser.add_argument("--line-threshold", type=float, default=0.5)
    parser.add_argument("--groove-width", type=float, default=3.0)
    parser.add_argument("--highlight", type=float, default=0.25)
    parser.add_argument("--shadow", type=float, default=0.50)
    parser.add_argument("--bevel-width", type=int, default=6)
    parser.add_argument("--raised", action="store_true")

    args = parser.parse_args()

    print(f"Panel:   {args.panel}")
    print(f"Pattern: {args.pattern}")
    print(f"Mode:    {'RAISED' if args.raised else 'DEBOSSED'}")

    result = apply_deboss_effect(
        panel_path=args.panel,
        pattern_path=args.pattern,
        depth=args.depth,
        light_angle=args.light_angle,
        line_threshold=args.line_threshold,
        groove_width=args.groove_width,
        highlight_intensity=args.highlight,
        shadow_intensity=args.shadow,
        bevel_width=args.bevel_width,
        raised=args.raised,
    )

    out = Path(args.output)
    result.save(str(out), quality=95)
    print(f"Saved -> {out}  ({result.size[0]}x{result.size[1]})")


if __name__ == "__main__":
    main()
