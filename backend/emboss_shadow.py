"""
emboss_shadow.py
────────────────
Adds a 3-D depth illusion to a flat line-pattern PNG by painting:
  • a soft DARK shadow  offset in the shadow direction  (bottom-right by default)
  • a soft LIGHT highlight offset in the opposite direction (top-left)

Light source is assumed to come from the TOP-LEFT corner — change SHADOW_OFFSET
and HIGHLIGHT_OFFSET below to move the light direction.

Usage:
    python emboss_shadow.py                        # uses defaults
    python emboss_shadow.py input.png output.png   # custom paths

Requires: Pillow  (pip install Pillow)
"""

import sys
from PIL import Image, ImageFilter, ImageChops, ImageOps

# ── Inputs / outputs ─────────────────────────────────────────────────────────
INPUT_PATH      = sys.argv[1] if len(sys.argv) > 1 else "diamond.png"
OUTPUT_PATH     = sys.argv[2] if len(sys.argv) > 2 else "diamond_3d.png"

# ── Tuning knobs ──────────────────────────────────────────────────────────────
# How many pixels the shadow/highlight are displaced from the lines.
# (dx, dy) — positive dx = right, positive dy = down
SHADOW_OFFSET    = (13, 13)   # shadow goes bottom-right  (away from light)
HIGHLIGHT_OFFSET = (-7, -7)   # highlight goes top-left   (toward light)

# Blur radius — larger = softer / more diffuse shadow
SHADOW_BLUR      = 6
HIGHLIGHT_BLUR   = 4

# Darkness of the shadow  (0 = invisible, 1 = full black)
SHADOW_STRENGTH    = 0.90
# Brightness of the highlight (0 = invisible, 1 = full white)
HIGHLIGHT_STRENGTH = 0.45

# Background colour of the output (R, G, B) — typically the panel base colour
BACKGROUND_COLOR = (240, 238, 233)   # warm off-white; change to match your panel

# ── Processing ────────────────────────────────────────────────────────────────
def offset_image(img: Image.Image, dx: int, dy: int) -> Image.Image:
    """Shift an image by (dx, dy), filling exposed edges with transparency."""
    return ImageChops.offset(img, dx, dy)


def build_mask(img_rgba: Image.Image) -> Image.Image:
    """
    Extract the line mask from a white-background PNG.
    Returns a greyscale image where lines = white (255), bg = black (0).
    Works whether the background is opaque white OR already transparent.
    """
    r, g, b, a = img_rgba.split()

    # Combine alpha channel (if present) with darkness of the lines.
    # Dark pixels → high mask value (they ARE the lines).
    darkness = ImageOps.invert(r.convert("L"))   # dark lines → bright in mask

    # If alpha is not all-opaque, also use it: transparent = not a line
    alpha_arr = a.convert("L")
    mask = ImageChops.multiply(darkness, alpha_arr)
    return mask


def main():
    src = Image.open(INPUT_PATH).convert("RGBA")
    W, H = src.size

    # ── 1. Build line mask (white = line, black = background) ────────────────
    mask = build_mask(src)

    # ── 2. Shadow layer ───────────────────────────────────────────────────────
    # Blur FIRST (creates gradient darkest-at-line → fades with distance),
    # THEN offset (displaces the gradient toward the shadow direction).
    # This makes shadows darkest close to the ridge and naturally fade outward.
    shadow_mask = mask.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    shadow_mask = offset_image(shadow_mask, *SHADOW_OFFSET)

    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    darkness_val = int(SHADOW_STRENGTH * 255)
    shadow_color = Image.new("RGBA", (W, H), (0, 0, 0, darkness_val))
    shadow_layer.paste(shadow_color, mask=shadow_mask)

    # ── 3. Highlight layer ────────────────────────────────────────────────────
    # Same principle — blur first, offset toward the light source.
    highlight_mask = mask.filter(ImageFilter.GaussianBlur(HIGHLIGHT_BLUR))
    highlight_mask = offset_image(highlight_mask, *HIGHLIGHT_OFFSET)

    highlight_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    brightness_val = int(HIGHLIGHT_STRENGTH * 255)
    highlight_color = Image.new("RGBA", (W, H), (255, 255, 255, brightness_val))
    highlight_layer.paste(highlight_color, mask=highlight_mask)

    # ── 4. Compose (bottom → top): transparent base → shadow → highlight → lines
    # No solid background — keep fully transparent so the print layer in the
    # browser shows through. Only shadow/highlight/lines are painted.
    result = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    result = Image.alpha_composite(result, shadow_layer)
    result = Image.alpha_composite(result, highlight_layer)
    result = Image.alpha_composite(result, src)          # original lines on top

    # ── 5. Save ───────────────────────────────────────────────────────────────
    result.save(OUTPUT_PATH)
    print(f"✓ Saved 3-D embossed pattern → {OUTPUT_PATH}")
    print(f"  Shadow offset: {SHADOW_OFFSET}, blur: {SHADOW_BLUR}, strength: {SHADOW_STRENGTH}")
    print(f"  Highlight offset: {HIGHLIGHT_OFFSET}, blur: {HIGHLIGHT_BLUR}, strength: {HIGHLIGHT_STRENGTH}")


if __name__ == "__main__":
    main()
