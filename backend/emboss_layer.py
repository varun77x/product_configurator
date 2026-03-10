"""
Emboss Layer Generator
======================
Takes a transparent pattern overlay (dark lines on transparent background)
and generates a transparent RGBA PNG with baked shadow & highlight effects
that simulate a 3D embossed (raised) or debossed (carved) appearance.

The output can be placed over ANY panel texture — no per-panel rendering.

How it works:
  1. Extracts the line mask from the pattern's alpha channel.
  2. Blurs + shifts the mask in the light and shadow directions.
  3. Outputs an RGBA image:
       • Shadow regions  → semi-transparent BLACK pixels  (darken underneath)
       • Highlight regions → semi-transparent WHITE pixels (lighten underneath)
       • Everything else → fully transparent

  In a browser, regular alpha compositing makes shadows darken and highlights
  brighten the panel beneath.  Works with or without CSS blend modes.

Usage:
    python emboss_layer.py \
        --pattern diamond.png \
        --output diamond_emboss.png \
        [--light-angle 135] \
        [--depth 1.0] \
        [--bevel-width 4] \
        [--shadow-opacity 0.6] \
        [--highlight-opacity 0.35] \
        [--debossed]

Can also be imported:

    from emboss_layer import generate_emboss_layer
    layer = generate_emboss_layer("diamond.png", depth=1.2)
    layer.save("diamond_emboss.png")
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


# ── Helpers ────────────────────────────────────────────────────────────────────

def _blur(mask_pil, radius):
    """Gaussian-blur a grayscale PIL image and return float64 array in 0..1."""
    return np.array(
        mask_pil.filter(ImageFilter.GaussianBlur(radius=max(0.5, radius)))
    ).astype(np.float64) / 255.0


# ── Main generator ────────────────────────────────────────────────────────────

def generate_emboss_layer(
    pattern_path,
    depth=2.0,
    bevel_width=30,
    shadow_opacity=0.95,
    highlight_opacity=0.35,
    debossed=False,
):
    """
    Generate a transparent RGBA emboss-effect layer from a line-pattern image.
    Light source is always FRONT-FACING — uniform shadow around every line edge,
    works for straight, curved, or organic patterns equally.

    Parameters
    ----------
    pattern_path : str | Path
        Input pattern PNG — dark lines on transparent background (RGBA).
    depth : float
        Overall intensity multiplier (>1 = stronger, <1 = subtler).
    bevel_width : int
        Spread in pixels of the shadow / highlight along line edges.
    shadow_opacity : float
        Peak opacity of shadow regions (0–1).
    highlight_opacity : float
        Peak opacity of highlight regions (0–1).
    debossed : bool
        False = lines appear raised (embossed).
        True  = lines appear carved inward (debossed).

    Returns
    -------
    PIL.Image.Image
        RGBA image — transparent everywhere except near lines, where
        shadows are semi-transparent black and highlights are semi-transparent white.
    """
    pattern = Image.open(pattern_path).convert("RGBA")
    w, h = pattern.size

    # Line mask from alpha channel (0 = background, 1 = line)
    alpha = np.array(pattern)[:, :, 3].astype(np.float64) / 255.0

    mask_pil = Image.fromarray((alpha * 255).astype(np.uint8))

    # ── Front-lit approach: uniform shadow/highlight around every edge ────

    # Shadow: blurred mask extends beyond the original mask edges.
    # Subtracting the original mask gives just the halo = the groove shadow.
    shadow_blur_r = max(1, bevel_width * 0.6 * depth)
    shadow_halo = np.clip(_blur(mask_pil, shadow_blur_r) - alpha, 0, 1)

    # Wider, softer outer shadow for more depth
    outer_blur_r = max(2, bevel_width * 1.2 * depth)
    outer_halo = np.clip(_blur(mask_pil, outer_blur_r) - alpha, 0, 1) * 0.4

    # Highlight: the bright rim on line edges where the surface curves
    # back toward the viewer. Computed by subtracting a slightly eroded
    # (more-blurred then thresholded) version from the original mask.
    rim_blur_r = max(0.5, bevel_width * 0.25 * depth)
    eroded = _blur(mask_pil, rim_blur_r)
    # The rim is where the original mask is present but the eroded version fades
    highlight_rim = np.clip(alpha - eroded, 0, 1)

    # Groove darkening — subtle dimming on the line body itself
    groove_blur_r = max(0.5, bevel_width * 0.3)
    groove = _blur(mask_pil, groove_blur_r) * 0.12 * depth

    # ── Swap shadow/highlight for debossed mode ──────────────────────────
    if debossed:
        shadow_halo, highlight_rim = highlight_rim, shadow_halo
        outer_halo = outer_halo * 0  # no outer halo for debossed

    # ── Combine ──────────────────────────────────────────────────────────
    total_shadow = np.clip(
        (shadow_halo * shadow_opacity
         + outer_halo * shadow_opacity * 0.5
         + groove) * depth,
        0, 1,
    )
    total_highlight = np.clip(
        (highlight_rim * highlight_opacity) * depth,
        0, 1,
    )

    # Net effect per pixel:  positive → highlight,  negative → shadow
    net = total_highlight - total_shadow

    # ── Build output RGBA ─────────────────────────────────────────────────
    output = np.zeros((h, w, 4), dtype=np.uint8)

    # Shadow pixels: RGB = 0   (black),  A = |net| mapped to opacity
    # Highlight pixels: RGB = 255 (white), A = |net| mapped to opacity
    is_highlight = net > 0
    magnitude = np.abs(net)

    output[:, :, 0] = np.where(is_highlight, 255, 0)
    output[:, :, 1] = np.where(is_highlight, 255, 0)
    output[:, :, 2] = np.where(is_highlight, 255, 0)
    output[:, :, 3] = (magnitude * 255).astype(np.uint8)

    return Image.fromarray(output)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="Generate transparent emboss/deboss overlay from a line pattern"
    )
    p.add_argument("--pattern", required=True, help="Input pattern PNG (RGBA, dark lines on transparent)")
    p.add_argument("--output", required=True, help="Output emboss layer PNG")
    p.add_argument("--depth", type=float, default=0.9, help="Effect intensity multiplier (default: 1.3)")
    p.add_argument("--bevel-width", type=int, default=6, help="Shadow/highlight spread in pixels (default: 10)")
    p.add_argument("--shadow-opacity", type=float, default=0.9, help="Peak shadow opacity 0–1 (default: 1.0)")
    p.add_argument("--highlight-opacity", type=float, default=0.2, help="Peak highlight opacity 0–1 (default: 0.5)")
    p.add_argument("--debossed", action="store_true", help="Inward (debossed) effect instead of raised (embossed)")

    args = p.parse_args()

    print(f"Pattern:    {args.pattern}")
    print(f"Mode:       {'DEBOSSED' if args.debossed else 'EMBOSSED'}")
    print(f"Light:      front-facing (omnidirectional)")
    print(f"Depth:      {args.depth}")
    print(f"Bevel:      {args.bevel_width}px")

    result = generate_emboss_layer(
        pattern_path=args.pattern,
        depth=args.depth,
        bevel_width=args.bevel_width,
        shadow_opacity=args.shadow_opacity,
        highlight_opacity=args.highlight_opacity,
        debossed=args.debossed,
    )

    out = Path(args.output)
    result.save(str(out), optimize=True)
    print(f"Saved → {out}  ({result.size[0]}×{result.size[1]})")


if __name__ == "__main__":
    main()
