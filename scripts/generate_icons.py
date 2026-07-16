"""Generate PWA PNG icons from the chat app design."""
import math
from PIL import Image, ImageDraw


def create_icon(size: int) -> Image.Image:
    """Draw the chat app icon at a given size (square)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale factor from 512px reference
    s = size / 512
    r = int(96 * s)  # corner radius

    # --- Background: purple-to-violet gradient ---
    # Draw rounded rectangle by creating a mask
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)

    # Gradient: top-left #4F46E5 → bottom-right #7C3AED
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)  # diagonal progress
            cr = int(79 + (124 - 79) * t)   # R: 79 (0x4F) → 124 (0x7C)
            cg = int(70 + (58 - 70) * t)    # G: 70 (0x46) → 58 (0x3A)
            cb = int(229 + (237 - 229) * t)  # B: 229 (0xE5) → 237 (0xED)
            bg_draw.point((x, y), (cr, cg, cb, 255))

    # Rounded rectangle mask
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)

    img.paste(bg, mask=mask)

    # --- Draw inside the rounded area ---
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # ---- Chat bubble (white, 20% opacity) ----
    bubble_l = int(cx - 120 * s)
    bubble_t = int(cy - 160 * s)
    bubble_r = int(cx + 120 * s)
    bubble_b = int(cy + 120 * s)
    bubble_rx = int(40 * s)
    bubble_color = (255, 255, 255, 51)  # ~20% opacity

    # Create bubble on a temp image for rounded rect
    bubble = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bubble)
    bd.rounded_rectangle(
        [bubble_l, bubble_t, bubble_r, bubble_b],
        radius=bubble_rx,
        fill=bubble_color,
    )
    # Bubble tail (triangle)
    tail_pts = [
        (int(cx - 80 * s), int(cy + 120 * s)),
        (int(cx - 120 * s), int(cy + 170 * s)),
        (int(cx - 60 * s), int(cy + 120 * s)),
    ]
    bd.polygon(tail_pts, fill=bubble_color)
    img.paste(bubble, mask=bubble)

    # ---- Message lines ----
    msg_color_full = (255, 255, 255, 229)   # ~90%
    msg_color_med = (255, 255, 255, 179)    # ~70%
    msg_color_dim = (255, 255, 255, 153)    # ~60%
    msg_h = int(16 * s)
    msg_rx = int(8 * s)
    ml = int(cx - 90 * s)

    def draw_rounded_line(left, top, w, h, rx, color):
        """Draw a pill-shaped rounded rectangle."""
        overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.rounded_rectangle(
            [left, top, left + w, top + h], radius=rx, fill=color
        )
        img.paste(overlay, mask=overlay)

    draw_rounded_line(ml, int(cy - 110 * s), int(180 * s), msg_h, msg_rx, msg_color_full)
    draw_rounded_line(ml, int(cy - 70 * s), int(140 * s), msg_h, msg_rx, msg_color_dim)
    draw_rounded_line(ml, int(cy - 30 * s), int(160 * s), msg_h, msg_rx, msg_color_med)

    # ---- Phone icon (top-right area) ----
    phone_cx = int(cx + 140 * s)
    phone_cy = int(cy - 100 * s)
    phone_scale = s

    def draw_phone(draw_obj, px, py, sc):
        """Draw the phone receiver shape."""
        w = (255, 255, 255, 242)
        lw = max(2, int(8 * sc))

        # Receiver arc
        h = int(90 * sc)
        hw = int(45 * sc)
        top = py - h
        bot = py
        left = px - hw
        right = px + hw

        # Draw receiver as an arc
        from PIL import ImageDraw as ID
        # Top curve
        draw_obj.arc(
            [left, top, right, bot + int(10 * sc)],
            start=180, end=360, fill=w, width=lw,
        )
        # Vertical sides
        draw_obj.line([left, py - int(20 * sc), left, py + int(10 * sc)], fill=w, width=lw)
        draw_obj.line([right, py - int(20 * sc), right, py + int(10 * sc)], fill=w, width=lw)

        # Horizontal bar
        bar_y = py - int(30 * sc)
        draw_obj.line([px - int(15 * sc), bar_y, px + int(15 * sc), bar_y], fill=w, width=lw)

    draw_phone(draw, phone_cx, phone_cy, phone_scale)

    return img


def main():
    sizes = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "apple-touch-icon.png": 180,
    }
    out_dir = "public"
    import os
    os.makedirs(out_dir, exist_ok=True)

    for filename, sz in sizes.items():
        path = os.path.join(out_dir, filename)
        img = create_icon(sz)
        img.save(path, "PNG")
        print(f"  {path}  ({sz}x{sz})")


if __name__ == "__main__":
    main()
