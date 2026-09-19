#!/usr/bin/env python3
"""
Generate realistic watercolor brush strokes as transparent PNGs.

Real brush strokes look like horizontal swept shapes with:
  - DIRECTIONAL STREAKS (visible horizontal fibers/ridges — they were
    painted in one left-to-right motion)
  - HARD TAPERED ENDS where the brush touched paper last (slight dry-brush
    texture at the tip)
  - ASYMMETRIC body (one side may be denser than the other — the brush
    doesn't unload perfectly evenly)
  - WET BLEED only at the perimeter (not the whole body)
  - RANDOM pigment gaps/holes inside (watercolor pooling)

Technique:
  1. Build a horizontal "brush path" with tapered ends (sin envelope)
  2. Paint it with many overlapping horizontal STRIPES of varying length,
     thickness, alpha, and color — these are the visible fibers
  3. Add wet bleed at the perimeter only (very small blur)
  4. Add a few thin "dry brush" scratches at the leading edge
  5. Subtle paper noise

Output: 7 PNGs at 1260×285 (3x retina of 420×95 logical). Transparent bg.
"""
from PIL import Image, ImageDraw, ImageFilter
import random
import math
import os
import sys

COLORS = {
    "blue":      (186, 230, 253),   # 7ème   #bae6fd
    "green":     (187, 247, 208),   # 8ème   #bbf7d0
    "yellow":    (254, 240, 138),   # 9ème   #fef08a
    "pink":      (251, 207, 232),   # 1ère   #fbcfe8
    "purple":    (221, 214, 254),   # 2ème   #ddd6fe
    "peach":     (254, 215, 170),   # 3ème   #fed7aa
    "turquoise": (153, 246, 228),   # Bac    #99f6e4
}

LOGICAL_W = 420
LOGICAL_H = 95
SCALE = 3
OUT_W = LOGICAL_W * SCALE   # 1260
OUT_H = LOGICAL_H * SCALE   # 285


def envelope_at(t):
    """Sin envelope: 0 at edges, 1 in middle. Used to taper tips."""
    return math.sin(t * math.pi)


def make_brush_stroke(color_rgb, seed=42, output_path=None):
    """Render one watercolor brush stroke PNG with directional streaks."""
    random.seed(seed)
    r, g, b = color_rgb

    # Layer 1: base body — many horizontal stripes (the fibers)
    # Each stripe = one pass of the flat brush bristle.
    img = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")

    n_stripes = 70  # denser fibers for visible body
    cy = OUT_H / 2

    for i in range(n_stripes):
        # Vertical position — concentrated near center, some outliers
        y_local = random.gauss(0, OUT_H * 0.20)
        # Clamp so we stay within roughly the central 90% of height
        y_local = max(-OUT_H * 0.44, min(OUT_H * 0.44, y_local))
        y = cy + y_local

        # The stripe extends across some t range (0..1 of width).
        # Some stripes are short (dry brush at edges), some long (center)
        t_center = random.uniform(0.05, 0.95)
        # Length bias: longer in the center, shorter at the edges
        bias = envelope_at(t_center) ** 0.55
        half_len = random.uniform(0.20, 0.50) * bias
        # Add asymmetry: left and right extents differ slightly
        left_ext = half_len * random.uniform(0.85, 1.15)
        right_ext = half_len * random.uniform(0.85, 1.15)
        t_start = max(0.0, t_center - left_ext)
        t_end = min(1.0, t_center + right_ext)

        x_start = t_start * OUT_W
        x_end = t_end * OUT_W

        # Envelope at the start/end of the stripe — fades alpha at tips
        env_start = envelope_at(t_start) ** 0.80
        env_end = envelope_at(t_end) ** 0.80
        if env_start < 0.04 and env_end < 0.04:
            continue  # entirely outside the brush — skip

        # Alpha = average envelope × random intensity
        # Bumped from 40-95 to 110-200 — colors need to be visibly pastel,
        # not invisible. Overlap from 70 stripes builds the dense center.
        base_alpha = (env_start + env_end) / 2
        alpha = int(base_alpha * random.uniform(110, 200))
        if alpha < 30:
            continue

        # Slight per-stripe color jitter (lighter/darker)
        cr = max(0, min(255, r + random.randint(-12, 4)))
        cg = max(0, min(255, g + random.randint(-10, 8)))
        cb = max(0, min(255, b + random.randint(-14, 6)))

        thickness = random.choice([1, 2, 2, 2, 3, 3])
        # Slight Y wobble (the brush wasn't perfectly stable)
        y_end = y + random.uniform(-0.6, 0.6)
        draw.line(
            [(x_start, y), (x_end, y_end)],
            fill=(cr, cg, cb, alpha),
            width=thickness,
        )

    # Layer 2: broader washes to fill gaps between stripes
    # Bumped from 3 washes @ 15-35 alpha to 6 washes @ 30-65 alpha
    # so the body has a continuous soft tint, not just visible fibers.
    for _ in range(6):
        x0 = random.uniform(OUT_W * 0.05, OUT_W * 0.35)
        y0 = random.uniform(OUT_H * 0.25, OUT_H * 0.75)
        w = random.uniform(OUT_W * 0.30, OUT_W * 0.60)
        h = random.uniform(OUT_H * 0.14, OUT_H * 0.28)
        draw.ellipse(
            [x0, y0, x0 + w, y0 + h],
            fill=(r, g, b, random.randint(30, 65)),
        )

    # Layer 3: tiny "dry brush" fibres at the trailing tip
    # (shorter, thinner lines extending past the main stroke)
    for _ in range(8):
        # Left tip
        x0 = random.uniform(0, OUT_W * 0.05)
        x1 = x0 + random.uniform(OUT_W * 0.02, OUT_W * 0.08)
        y0 = random.uniform(OUT_H * 0.30, OUT_H * 0.70)
        draw.line(
            [(x0, y0), (x1, y0 + random.uniform(-1.5, 1.5))],
            fill=(r, g, b, random.randint(30, 80)),
            width=1,
        )
        # Right tip
        x0 = random.uniform(OUT_W * 0.95, OUT_W)
        x1 = x0 - random.uniform(OUT_W * 0.02, OUT_W * 0.08)
        y0 = random.uniform(OUT_H * 0.30, OUT_H * 0.70)
        draw.line(
            [(x0, y0), (x1, y0 + random.uniform(-1.5, 1.5))],
            fill=(r, g, b, random.randint(30, 80)),
            width=1,
        )

    # Layer 4: a couple of "scratches" — thin straight lines that look
    # like a bristle skipped. They give the brush its directional feel.
    for _ in range(4):
        x0 = random.uniform(OUT_W * 0.05, OUT_W * 0.20)
        x1 = x0 + random.uniform(OUT_W * 0.55, OUT_W * 0.80)
        y0 = random.uniform(OUT_H * 0.35, OUT_H * 0.65)
        # Skip middle (sometimes) to give a "broken" feel
        if random.random() < 0.5:
            mid_x = (x0 + x1) / 2 + random.uniform(-OUT_W * 0.05, OUT_W * 0.05)
            mid_y = y0 + random.uniform(-OUT_H * 0.05, OUT_H * 0.05)
            draw.line([(x0, y0), (mid_x, mid_y)],
                       fill=(r, g, b, random.randint(15, 40)), width=1)
            draw.line([(mid_x, mid_y), (x1, y0)],
                       fill=(r, g, b, random.randint(15, 40)), width=1)
        else:
            draw.line(
                [(x0, y0), (x1, y0)],
                fill=(r, g, b, random.randint(15, 40)), width=1,
            )

    # LIGHT wet bleed only at edges (very small blur)
    # We use a small radius so the directional streaks stay crisp.
    final = img.filter(ImageFilter.GaussianBlur(radius=OUT_W * 0.003))

    # Layer 5: touch of paper-grain noise (very subtle)
    blurred_alpha = final.split()[3]
    noise = Image.new("L", (OUT_W, OUT_H), 0)
    np_ = noise.load()
    for y in range(0, OUT_H, 2):
        for x in range(0, OUT_W, 2):
            if OUT_H * 0.25 < y < OUT_H * 0.75:
                np_[x, y] = random.randint(0, 18)
    noise = noise.filter(ImageFilter.GaussianBlur(radius=0.4))
    noise_alpha = noise.point(lambda v: int(v * 0.30))
    noise_alpha = Image.composite(
        noise_alpha, Image.new("L", (OUT_W, OUT_H), 0), blurred_alpha)
    noise_rgba = Image.merge("RGBA",
        (Image.new("L", (OUT_W, OUT_H), r),
         Image.new("L", (OUT_W, OUT_H), g),
         Image.new("L", (OUT_W, OUT_H), b),
         noise))
    noise_rgba.putalpha(noise_alpha)
    final = Image.alpha_composite(final, noise_rgba)

    if output_path:
        final.save(output_path, "PNG", optimize=True)
        kb = os.path.getsize(output_path) / 1024
        print(f"  -> {os.path.basename(output_path)} "
              f"({final.size[0]}x{final.size[1]}, {kb:.1f} KB)")

    return final


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "./public/brushes"
    os.makedirs(out_dir, exist_ok=True)
    print(f"Generating 7 watercolor brush strokes @ {OUT_W}x{OUT_H} px "
          f"(3x retina of {LOGICAL_W}x{LOGICAL_H})")
    print(f"Output dir: {out_dir}\n")

    for i, (name, rgb) in enumerate(COLORS.items()):
        seed = 100 + i * 37   # different shape per couleur
        out_path = os.path.join(out_dir, f"brush-{name}.png")
        make_brush_stroke(rgb, seed=seed, output_path=out_path)
    print("\nDone!")


if __name__ == "__main__":
    main()
