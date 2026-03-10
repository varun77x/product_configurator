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

Arguments:
    --panel          Path to the panel/background image (jpg/png)
    --pattern        Path to the line pattern image (white bg, dark lines)
    --output         Output file path
    --depth          Overall depth multiplier (0.1–3.0, default 1.0)
    --light-angle    Light source angle in degrees (0=right, 90=top,
                     135=top-left, default 135)
    --line-threshold Sensitivity for detecting lines (0.0–1.0, default 0.5).
                     Lower = picks up fainter lines.
    --groove-width   Width of the deboss groove in pixels (1–20, default 3.0)
    --highlight      Highlight intensity (0.0–1.0, default 0.25)
    --shadow         Shadow intensity (0.0–1.0, default 0.50)
    --bevel-width    Bevel / spread width in pixels (1–30, default 6)
    --raised         Invert effect to create an embossed/raised look

Can also be imported as a module:

    from deboss_engine import apply_deboss_effect
    result = apply_deboss_effect(panel_path, pattern_path, **options)
    result.save("output.png")
"""

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


# ── Line Detection ──────────────────────────────────────────────────────

def extract_line_mask(
    pattern: Image.Image,
    threshold: float = 0.5,
    target_size: tuple = None,
) -> Image.Image:
    """
    Detect lines from a pattern image.
    Expects dark lines on a light background.
    Returns a grayscale mask where white = line.
    """
    gray = pattern.convert("L")

    if target_size:
        gray = gray.resize(target_size, Image.LANCZOS)

    arr = np.array(gray).astype(float)

    # Normalize to 0-1
    lo, hi = arr.min(), arr.max()
    if hi - lo < 1:
        return Image.fromarray(np.zeros_like(arr, dtype=np.uint8))
    norm = (arr - lo) / (hi - lo)  # 0 = darkest, 1 = lightest

    # Auto-detect background tone so both image formats work correctly:
    #   median > 0.5 → light background with dark lines → invert to make lines bright
    #   median <= 0.5 → dark background with light lines → lines are already the bright part
    if np.median(norm) > 0.5:
        inv = 1.0 - norm   # dark lines on light bg → flip so lines → 1
    else:
        inv = norm          # light lines on dark bg → lines already → 1

    # Threshold: only pixels that are clearly lines (above the cutoff) are included.
    # This prevents near-background pixels from polluting the mask and
    # over-darkening the whole panel.
    mask = np.clip((inv - (1.0 - threshold)) / (threshold + 1e-6), 0, 1)

    # Boost contrast
    mask = np.power(mask, 0.7)

    return Image.fromarray((mask * 255).astype(np.uint8))


# ── Deboss / Emboss Core ────────────────────────────────────────────────

def apply_deboss_effect(
    panel_path: str,
    pattern_path: str,
    depth: float = 1.0,
    light_angle: float = 135.0,
    line_threshold: float = 0.5,
    groove_width: float = 3.0,
    highlight_intensity: float = 0.25,
    shadow_intensity: float = 0.50,
    bevel_width: int = 6,
    raised: bool = False,
) -> Image.Image:
    """
    Apply a debossed (or raised) 3D effect to a panel image using a
    line-pattern overlay.

    Returns the composited PIL Image (RGBA).
    """

    # Load images
    panel = Image.open(panel_path).convert("RGBA")
    pattern = Image.open(pattern_path)
    pw, ph = panel.size

    # 1. Extract lines ────────────────────────────────────────────────
    line_mask = extract_line_mask(pattern, threshold=line_threshold,
                                  target_size=(pw, ph))

    # If raised mode, we invert the lighting direction
    if raised:
        light_angle = (light_angle + 180) % 360

    # 2. Compute directional offsets from light angle ─────────────────
    rad = math.radians(light_angle)
    dx = -math.cos(rad)  # shadow falls opposite to light
    dy = math.sin(rad)   # PIL y-axis is inverted

    # Scale offsets by depth
    close_dist = groove_width * depth
    far_dist = bevel_width * depth

    shadow_offset = (int(round(dx * close_dist)), int(round(dy * close_dist)))
    highlight_offset = (int(round(-dx * close_dist * 0.7)),
                        int(round(-dy * close_dist * 0.7)))
    wide_shadow_offset = (int(round(dx * far_dist)), int(round(dy * far_dist)))
    wide_highlight_offset = (int(round(-dx * far_dist * 0.6)),
                             int(round(-dy * far_dist * 0.6)))

    # 3. Build shadow & highlight layers ──────────────────────────────
    blur_close = max(1, groove_width * depth)
    blur_wide = max(2, bevel_width * depth)

    def shift(img, offset):
        out = Image.new("L", (pw, ph), 0)
        out.paste(img, offset)
        return out

    # Close shadow
    shadow_blur = line_mask.filter(ImageFilter.GaussianBlur(radius=blur_close))
    shadow_layer = shift(shadow_blur, shadow_offset)
    shadow_arr = np.array(shadow_layer).astype(float) / 255.0

    # Close highlight
    hl_blur = line_mask.filter(
        ImageFilter.GaussianBlur(radius=blur_close * 0.8))
    highlight_layer = shift(hl_blur, highlight_offset)
    highlight_arr = np.array(highlight_layer).astype(float) / 255.0

    # Wide / bevel shadow
    wide_s_blur = line_mask.filter(
        ImageFilter.GaussianBlur(radius=blur_wide))
    wide_shadow_layer = shift(wide_s_blur, wide_shadow_offset)
    wide_shadow_arr = np.array(wide_shadow_layer).astype(float) / 255.0

    # Wide / bevel highlight
    wide_h_blur = line_mask.filter(
        ImageFilter.GaussianBlur(radius=blur_wide * 0.8))
    wide_highlight_layer = shift(wide_h_blur, wide_highlight_offset)
    wide_highlight_arr = np.array(wide_highlight_layer).astype(float) / 255.0

    # Groove center darkening
    groove_blur = line_mask.filter(
        ImageFilter.GaussianBlur(radius=max(1, groove_width * 0.6)))
    groove_arr = np.array(groove_blur).astype(float) / 255.0

    # 4. Emboss convolution for extra surface detail ──────────────────
    # Build kernel from light angle
    kx, ky = math.cos(rad), -math.sin(rad)
    kernel = [
        -kx - ky,   -ky,    kx - ky,
        -kx,         0,     kx,
        -kx + ky,    ky,    kx + ky,
    ]
    emboss_filter = ImageFilter.Kernel(
        size=(3, 3), kernel=kernel, scale=1, offset=128
    )
    resized_pattern = pattern.convert("L").resize((pw, ph), Image.LANCZOS)
    embossed = resized_pattern.filter(emboss_filter)
    emboss_arr = (np.array(embossed).astype(float) - 128) / 128.0

    # 5. Composite everything ─────────────────────────────────────────
    result = np.array(panel).astype(float)

    si = shadow_intensity * depth
    hi = highlight_intensity * depth

    for c in range(3):
        # Groove
        result[:, :, c] *= (1 - groove_arr * 0.35 * depth)
        # Close shadow
        result[:, :, c] *= (1 - shadow_arr * si)
        # Close highlight
        result[:, :, c] += (255 - result[:, :, c]) * highlight_arr * hi
        # Wide shadow
        result[:, :, c] *= (1 - wide_shadow_arr * si * 0.4)
        # Wide highlight
        result[:, :, c] += (255 - result[:, :, c]) * wide_highlight_arr * hi * 0.4
        # Emboss surface detail
        result[:, :, c] += result[:, :, c] * emboss_arr * 0.12 * depth

    result = np.clip(result, 0, 255).astype(np.uint8)
    return Image.fromarray(result)


# ── CLI ─────────────────────────────────────────────────────────────────

def main():
    _here = Path(__file__).parent
    _default_panel = str(
        _here / "static/images/flat-embossed-vmt/panels/vmd-rhythm-and-repeat/VMD-RR-007.jpg"
    )
    _default_pattern = str(_here / "diamond.png")
    _default_output = str(_here / "VMD-RR-007_debossed.png")

    parser = argparse.ArgumentParser(
        description="Apply debossed 3D effect to wall panels"
    )
    parser.add_argument("--panel", default=_default_panel,
                        help="Panel background image (default: VMD-RR-007.jpg)")
    parser.add_argument("--pattern", default=_default_pattern,
                        help="Line pattern image (default: diamond.png)")
    parser.add_argument("--output", default=_default_output,
                        help="Output file path (default: VMD-RR-007_debossed.png)")
    parser.add_argument("--depth", type=float, default=1.0,
                        help="Depth multiplier (0.1–3.0)")
    parser.add_argument("--light-angle", type=float, default=135.0,
                        help="Light angle in degrees (default 135 = top-left)")
    parser.add_argument("--line-threshold", type=float, default=0.5,
                        help="Line detection sensitivity (0–1)")
    parser.add_argument("--groove-width", type=float, default=3.0,
                        help="Groove width in px")
    parser.add_argument("--highlight", type=float, default=0.25,
                        help="Highlight intensity (0–1)")
    parser.add_argument("--shadow", type=float, default=0.50,
                        help="Shadow intensity (0–1)")
    parser.add_argument("--bevel-width", type=int, default=6,
                        help="Bevel spread width in px")
    parser.add_argument("--raised", action="store_true",
                        help="Invert to embossed/raised effect")

    args = parser.parse_args()

    print(f"Panel:   {args.panel}")
    print(f"Pattern: {args.pattern}")
    print(f"Depth:   {args.depth}  |  Light: {args.light_angle}°")
    print(f"Mode:    {'RAISED' if args.raised else 'DEBOSSED'}")
    print()

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
    print(f"Saved → {out}  ({result.size[0]}×{result.size[1]})")


if __name__ == "__main__":
    main()
