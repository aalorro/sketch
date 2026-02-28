"""Advanced style-transfer with proper Canvas algorithm implementation.

Endpoint: POST /api/style-transfer-advanced
Accepts multipart `file` plus form fields for artStyle, style, brush, stroke, etc.
Returns PNG image.

Implements 20+ rendering styles ported from Canvas versions.
"""
from flask import Flask, request, send_file, jsonify, make_response
import numpy as np
import cv2
import io
from PIL import Image
import os
import random
from functools import wraps

app = Flask(__name__)

# Custom CORS decorator
def add_cors_headers(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        response = make_response(f(*args, **kwargs))
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    return decorated_function


# Health check endpoint
@app.route('/health', methods=['GET'])
@add_cors_headers
def health():
    return jsonify({'status': 'ok'}), 200


def read_image_from_stream(stream):
    data = stream.read()
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('Could not decode image')
    return img


def render_stippling(gray, edges, intensity, stroke):
    """Stippling: tone-driven dots -- darker areas get more/larger dots"""
    h, w = gray.shape
    result = np.full((h, w), 255, dtype=np.uint8)
    step = max(3, round(14 - stroke * 1.1))
    dot_thr = int(90 + intensity * 11)   # 101-200
    base_r = 0.4 + stroke * 0.18
    for y in range(0, h, step):
        for x in range(0, w, step):
            g = int(gray[y, x])
            if g >= dot_thr:
                continue
            darkness = 1.0 - g / max(1, dot_thr)
            r = max(1, round(base_r * (0.5 + darkness)))
            jx = max(r, min(w - 1 - r, x + int((random.random() - 0.5) * step * 0.8)))
            jy = max(r, min(h - 1 - r, y + int((random.random() - 0.5) * step * 0.8)))
            cv2.circle(result, (jx, jy), r, 0, -1)
    return result


def render_charcoal(gray, edges, intensity, stroke):
    """Charcoal: S-curve tonal compression + edge deepening + directional marks at ~15deg"""
    h, w = gray.shape
    # S-curve tonal mapping + edge deepening (vectorized)
    edge_thr = max(10, 80 - intensity * 6)
    edge_bite = 0.8 + intensity * 0.07
    t = gray.astype(np.float32) / 255.0
    s = np.where(t < 0.5, 2*t*t, 1 - 2*(1-t)*(1-t))
    v = np.clip(22 + s * 220, 0, 255).astype(np.int32)
    e_over = np.maximum(0, edges.astype(np.int32) - edge_thr)
    v = np.maximum(0, v - (e_over * edge_bite).astype(np.int32))
    result = v.astype(np.uint8)
    # Directional marks at ~15deg in shadow areas (multiply-like darkening)
    mark_step = max(4, round(18 - stroke * 1.4))
    mark_len = round(mark_step * (1.5 + stroke * 0.2))
    mark_alpha = 0.07 + intensity * 0.018
    mark_scale = 1.0 - mark_alpha * (1.0 - 30.0 / 255.0)
    line_w = max(1, round(stroke * 0.7))
    slope = 0.27  # tan(15deg)
    mark_mask = np.zeros((h, w), dtype=np.uint8)
    for y0 in range(0, h, mark_step):
        for x0 in range(0, w, mark_step):
            if gray[y0, x0] > 200:
                continue
            jx = x0 + int((random.random() - 0.5) * mark_step * 0.6)
            jy = y0 + int((random.random() - 0.5) * mark_step * 0.6)
            length = mark_len * (0.5 + random.random() * 0.8)
            dx, dy = int(slope * length), int(length)
            p1 = (max(0, min(w-1, jx - dx//2)), max(0, min(h-1, jy - dy//2)))
            p2 = (max(0, min(w-1, jx + dx//2)), max(0, min(h-1, jy + dy//2)))
            cv2.line(mark_mask, p1, p2, 255, line_w)
    has_mark = mark_mask > 0
    result_f = result.astype(np.float32)
    result_f[has_mark] = np.clip(result_f[has_mark] * mark_scale, 0, 255)
    return result_f.astype(np.uint8)


def render_dry_brush(gray, edges, intensity, stroke):
    """Dry brush: S-curve tonal base + broken mostly-horizontal strokes with dry dropout"""
    h, w = gray.shape
    # S-curve tonal base — slightly brighter range than charcoal (paper shows through)
    t = gray.astype(np.float32) / 255.0
    s = np.where(t < 0.5, 2*t*t, 1 - 2*(1-t)*(1-t))
    result = np.clip(38 + s * 212, 0, 255).astype(np.uint8)
    # Broken brush strokes: mostly horizontal (±20°), skip 32% for dry look
    step   = max(3, round(11 - stroke * 0.8))
    slen   = max(8, round(14 + stroke * 2.5))
    lw     = max(1, round(0.5 + stroke * 0.45))
    alpha  = 0.08 + intensity * 0.02
    scale  = 1.0 - alpha * (1.0 - 20.0 / 255.0)
    mark_mask = np.zeros((h, w), dtype=np.uint8)
    for y in range(0, h, step):
        for x in range(0, w, step):
            gi = int(gray[min(h-1, y), min(w-1, x)])
            ei = int(edges[min(h-1, y), min(w-1, x)])
            if gi > 220 and ei < 15:
                continue  # skip pure highlights with no edge
            if random.random() < 0.32:
                continue  # dry dropout
            jx = x + int((random.random() - 0.5) * step * 0.6)
            jy = y + int((random.random() - 0.5) * step * 0.6)
            l  = slen * (0.35 + random.random() * 0.75)
            ang = (random.random() - 0.5) * 0.7  # ±20 deg from horizontal
            dx, dy = int(float(np.cos(ang)) * l / 2), int(float(np.sin(ang)) * l / 2)
            p1 = (max(0, min(w-1, jx-dx)), max(0, min(h-1, jy-dy)))
            p2 = (max(0, min(w-1, jx+dx)), max(0, min(h-1, jy+dy)))
            cv2.line(mark_mask, p1, p2, 255, lw)
    result_f = result.astype(np.float32)
    result_f[mark_mask > 0] = np.clip(result_f[mark_mask > 0] * scale, 0, 255)
    return result_f.astype(np.uint8)


def render_ink_wash(gray, edges, intensity, stroke):
    """Ink wash: diluted-ink tonal wash from blurred gray + sharp ink contour lines + wet-edge bloom"""
    h, w = gray.shape
    # Tonal wash base: deeply blurred gray → organic pigment dilution
    wash_strength = 0.55 + intensity * 0.04   # 0.59-0.95
    blurred = cv2.GaussianBlur(gray, (15, 15), 5).astype(np.float32)
    base = 255.0 - (1.0 - blurred / 255.0) ** 1.6 * wash_strength * 240.0
    base = cv2.bilateralFilter(np.clip(base, 0, 255).astype(np.uint8), 7, 60, 40).astype(np.float32)
    # Sharp ink contour lines (smoothstep anti-aliased)
    ink_thr  = max(15, int(55 - intensity * 4))
    softness = 6.0 + stroke * 1.2
    e = edges.astype(np.float32)
    fully = e >= (ink_thr + softness)
    band  = (e > ink_thr) & ~fully
    base[fully] = np.minimum(base[fully], 8.0)
    t_b = (e[band] - ink_thr) / softness
    base[band] = np.clip(base[band] * (1 - t_b*t_b*(3-2*t_b) * 0.96), 0, 255)
    # Wet-edge bloom: lighten near dark ink lines (ink bleed into paper)
    dark_mask  = (base < 60).astype(np.float32)
    bk         = max(3, round(stroke * 2 + 1) | 1)
    bloom      = cv2.GaussianBlur(dark_mask * 255, (bk, bk), 2.0) / 255.0
    bloom_alph = 0.06 + intensity * 0.008
    base       = np.clip(base + np.maximum(0.0, 235.0 - base) * bloom * bloom_alph, 0, 255)
    return base.astype(np.uint8)


def render_comic(gray, edges, intensity, stroke):
    """Comic/manga: varied-weight line art + spot blacks + horizontal speed lines"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 8
    # Vectorized varied line weight: stronger edges → darker, weaker → near-white
    e   = edges.astype(np.float32)
    lw  = np.clip((e - thr * 0.5) * 2, 0, 255)
    result = np.where(e > thr,
                      np.clip(50 - lw * 0.3, 0, 50).astype(np.uint8),
                      np.uint8(255))
    # Spot blacks: dense filled circles in dark areas
    spot_step = max(4, 8 - stroke // 2)
    for y in range(spot_step, h, spot_step):
        for x in range(spot_step, w, spot_step):
            if int(gray[y, x]) < 120 and random.random() > 0.35:
                r  = 1 if random.random() > 0.5 else 2
                ox = max(r, min(w-1-r, x + random.randint(-1, 1)))
                oy = max(r, min(h-1-r, y + random.randint(-1, 1)))
                cv2.circle(result, (ox, oy), r, 0, -1)
    # Speed lines: short horizontal segments at strong-edge locations
    speed_step = max(8, 16 - stroke // 2)
    for y in range(0, h, speed_step * 2):
        for x in range(0, w, speed_step):
            if int(edges[y, x]) > thr * 1.5 and random.random() > 0.5:
                cv2.line(result, (max(0, x-speed_step), y),
                         (min(w-1, x+speed_step), y), 100, 1)
    return result


def render_fashion(gray, edges, intensity, stroke):
    """Fashion: warm paper + tonal shadow wash + thin contour lines + vertical drape marks"""
    h, w = gray.shape
    line_thr = max(12, int(60 - intensity*4 - stroke*1.2))
    softness = 8 + stroke * 1.5
    shadow_thr = 100 + intensity * 8  # 108-180
    # Warm paper base + shadow wash from gray (not edges)
    g = gray.astype(np.float32)
    base = np.full((h, w), 250.0, dtype=np.float32)
    sdiff = np.maximum(0.0, shadow_thr - g)
    depth = np.power(np.where(g < shadow_thr, sdiff / shadow_thr, 0.0), 1.5)
    base -= depth * (20 + intensity * 2)
    # Smoothstep contour lines
    e = edges.astype(np.float32)
    fully = e >= (line_thr + softness)
    band = (e > line_thr) & ~fully
    base[fully] = base[fully] * 0.03
    t_b = (e[band] - line_thr) / softness
    base[band] = base[band] * (1 - t_b*t_b*(3-2*t_b)*0.97)
    result = np.clip(base, 0, 255).astype(np.uint8)
    # Vertical drape marks in shadow areas (multiply-like darkening)
    mark_step = max(6, round(24 - stroke * 1.5))
    mark_len = max(10, round(h / 8 * (0.8 + stroke * 0.1)))
    mark_alpha = 0.03 + intensity * 0.008
    mark_scale = 1.0 - mark_alpha * (1.0 - 40.0 / 255.0)
    line_w = max(1, round(stroke * 0.3))
    mark_mask = np.zeros((h, w), dtype=np.uint8)
    for x0 in range(0, w, mark_step):
        for y0 in range(0, h, mark_step):
            if gray[y0, x0] > 160:
                continue
            jx = x0 + int((random.random()-0.5)*mark_step*0.5)
            jy = y0 + int((random.random()-0.5)*mark_step*0.5)
            length = int(mark_len * (0.3 + random.random()*0.9))
            lean = int((random.random()-0.5)*mark_step*0.2)
            p1 = (max(0,min(w-1,jx)), max(0,min(h-1,jy)))
            p2 = (max(0,min(w-1,jx+lean)), max(0,min(h-1,jy+length)))
            cv2.line(mark_mask, p1, p2, 255, line_w)
    has_mark = mark_mask > 0
    result_f = result.astype(np.float32)
    result_f[has_mark] = np.clip(result_f[has_mark] * mark_scale, 0, 255)
    return result_f.astype(np.uint8)


def render_urban(gray, edges, intensity, stroke):
    """Urban sketch: warm paper + blurred-gray watercolor wash + crisp smoothstep pen lines"""
    h, w = gray.shape
    # Warm near-white paper base
    base = np.full((h, w), 248.0, dtype=np.float32)
    # Quick watercolor wash from blurred gray tone
    wash_blur = cv2.GaussianBlur(gray, (9, 9), 3).astype(np.float32)
    wash_str  = 0.28 + stroke * 0.04
    base -= (1.0 - wash_blur / 255.0) ** 1.8 * wash_str * 120.0
    # Crisp pen lines (smoothstep anti-aliased)
    pen_thr  = max(14, int(22 + (11-intensity) * 10 - stroke * 1.5))
    softness = 5.0 + stroke
    e = edges.astype(np.float32)
    fully = e >= (pen_thr + softness)
    band  = (e > pen_thr) & ~fully
    base[fully] = np.minimum(base[fully], 18.0)
    t_b = (e[band] - pen_thr) / softness
    base[band] = np.clip(base[band] * (1 - t_b*t_b*(3-2*t_b) * 0.94), 0, 255)
    return np.clip(base, 0, 255).astype(np.uint8)


def render_architectural(gray, edges, intensity, stroke):
    """Architectural: ultra-precise smoothstep lines, white space, no tonal fill"""
    h, w = gray.shape
    # High threshold — only the sharpest, clearest edges survive
    thr      = max(22, int(52 + (11-intensity) * 14 - stroke * 3))
    softness = max(3.0, 4.0 + stroke * 0.8)
    e        = edges.astype(np.float32)
    result   = np.full((h, w), 255, dtype=np.float32)
    fully    = e >= (thr + softness)
    band     = (e > thr) & ~fully
    result[fully] = 5.0
    t_b = (e[band] - thr) / softness
    result[band] = np.clip(255 - 250 * t_b*t_b*(3 - 2*t_b), 5, 255)
    return result.astype(np.uint8)


def render_academic(gray, edges, intensity, stroke):
    """Academic figure: S-curve tonal form + smoothstep edge lines + hatching in deep shadows"""
    h, w = gray.shape
    # S-curve tonal base for form (range 30-248, lighter than charcoal)
    t    = gray.astype(np.float32) / 255.0
    s    = np.where(t < 0.5, 2*t*t, 1 - 2*(1-t)*(1-t))
    base = np.clip(30 + s * 218, 0, 255).astype(np.float32)
    # Smoothstep edge lines
    thr      = max(12, int(35 + (11-intensity) * 12 - stroke * 2))
    softness = 5.0 + stroke * 1.5
    e        = edges.astype(np.float32)
    fully    = e >= (thr + softness)
    band     = (e > thr) & ~fully
    base[fully] = np.minimum(base[fully], 8.0)
    t_b = (e[band] - thr) / softness
    base[band] = np.clip(base[band] * (1 - t_b*t_b*(3-2*t_b) * 0.95), 0, 255)
    result   = base.astype(np.uint8)
    # Subtle 45-deg hatching in deep shadows only (adds study-sketch texture)
    spacing  = max(5, round(22 - stroke * 1.5))
    half_lw  = 0.4
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    XX, YY = np.meshgrid(xs, ys)
    cos_a, sin_a = float(np.cos(np.pi/4)), float(np.sin(np.pi/4))
    d_grid   = (-XX * sin_a + YY * cos_a) % spacing
    on_line  = (d_grid < half_lw) | (d_grid > spacing - half_lw)
    shade_mask = result < 80
    h_alpha  = 0.25 + intensity * 0.02
    h_scale  = 1.0 - h_alpha * (1.0 - 15.0 / 255.0)
    result_f = result.astype(np.float32)
    result_f[on_line & shade_mask] = np.clip(result_f[on_line & shade_mask] * h_scale, 0, 255)
    return result_f.astype(np.uint8)


def render_etching(gray, edges, intensity, stroke):
    """Etching: smoothstep contours + 4-angle tone-driven hatching (engraving plate look)"""
    h, w = gray.shape
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    XX, YY = np.meshgrid(xs, ys)
    # Edge contours (fine, precise)
    edge_thr = max(5, int(20 + (11-intensity) * 6))
    e        = edges.astype(np.float32)
    soft     = 4.0
    result_f = np.full((h, w), 255, dtype=np.float32)
    fully    = e >= (edge_thr + soft)
    band     = (e > edge_thr) & ~fully
    result_f[fully] = 5.0
    t_b = (e[band] - edge_thr) / soft
    result_f[band] = np.clip(255 - 250*t_b*t_b*(3-2*t_b), 5, 255)
    # 4-angle tone-driven hatching: cumulative layers for darker areas
    spacing = max(2, round(5 - stroke * 0.2))
    half_lw = 0.4
    h_alpha = 0.20 + intensity * 0.015
    h_scale = 1.0 - h_alpha * (1.0 - 10.0 / 255.0)
    # tone_thr increases with intensity so more of the image gets hatched at higher intensity
    tone_levels = [int(180+intensity*5), int(120+intensity*5),
                   int(70+intensity*3),  int(40+intensity*2)]
    angles = [0.0, np.pi/4, np.pi/2, np.pi*3/4]
    for tone_thr, angle in zip(tone_levels, angles):
        cos_a = float(np.cos(angle))
        sin_a = float(np.sin(angle))
        d_grid   = (-XX * sin_a + YY * cos_a) % spacing
        on_line  = (d_grid < half_lw) | (d_grid > spacing - half_lw)
        tone_mask = gray < tone_thr
        result_f[on_line & tone_mask] = np.clip(result_f[on_line & tone_mask] * h_scale, 0, 255)
    return result_f.astype(np.uint8)


def render_minimalist(gray, edges, intensity, stroke):
    """Minimalist: hard threshold only — pure white background + sparse near-black lines, no gradient shading"""
    h, w = gray.shape
    thr   = max(30, 160 - intensity * 14)   # 146 (i=1) → 30 (i=10)
    line_v = max(0, 18 - stroke)             # near-black lines
    return np.where(edges > thr, np.uint8(line_v), np.uint8(255))


def render_glitch(gray, edges, intensity, stroke):
    """Glitch: noise-corrupted edges + row-shift + chromatic bars + dropout bands"""
    h, w = gray.shape
    thr = max(10, 60 - intensity * 5)
    noise_chance = 0.04 + intensity * 0.025
    # 1. Edge base with noise corruption
    e = edges.astype(np.float32).copy()
    noise_mask = np.random.random((h, w)) < noise_chance
    e[noise_mask] = np.random.rand(int(noise_mask.sum())) * 255
    e_u8 = np.clip(e, 0, 255).astype(np.uint8)
    result = np.where(e_u8 > thr,
                      np.maximum(np.int16(0), np.int16(230) - e_u8.astype(np.int16)).astype(np.uint8),
                      np.uint8(255)).astype(np.uint8)
    # 2. Row-shift corruption (horizontal slice displacement)
    corrupt_chance = 0.04 + intensity * 0.035
    max_shift = max(1, round(w * (0.03 + intensity * 0.04)))
    for y in range(h):
        if random.random() > corrupt_chance:
            continue
        shift = round((random.random() - 0.5) * 2 * max_shift)
        result[y] = np.roll(result[y], shift)
    # 3. Chromatic aberration bands (simulate as lighter displaced rows in grayscale)
    num_bars = round(3 + intensity * 1.5)
    for _ in range(num_bars):
        bar_y = random.randint(0, h - 1)
        bar_h = max(1, round(1 + random.random() * (3 + intensity * 0.5)))
        y1, y2 = max(0, bar_y), min(h, bar_y + bar_h)
        result[y1:y2] = np.minimum(255, result[y1:y2].astype(np.int16) + 35).astype(np.uint8)
    # 4. Flat-colour dropout bands
    num_dropouts = round(2 + intensity * 0.8)
    for _ in range(num_dropouts):
        bar_y = random.randint(0, h - 1)
        bar_h = max(1, round(1 + random.random() * 3))
        y1, y2 = max(0, bar_y), min(h, bar_y + bar_h)
        row = result[y1:y2].astype(np.int16)
        if random.random() > 0.5:
            result[y1:y2] = np.minimum(255, row + 50).astype(np.uint8)
        else:
            result[y1:y2] = np.maximum(0, row - 50).astype(np.uint8)
    return result


def render_mixed_media(gray, edges, intensity, stroke):
    """Mixed media: warm tonal base + stipple mid-tones + diagonal cross-hatch shadows"""
    h, w = gray.shape
    line_thr = max(12, 65 - intensity * 5)
    softness = 10.0
    # Warm tonal base (quadratic darkening from gray)
    g = gray.astype(np.float32)
    base = 242.0 - (1.0 - g / 255.0) ** 2 * 115.0
    # Smoothstep pen lines at strong edges
    e = edges.astype(np.float32)
    fully = e >= (line_thr + softness)
    band = (e > line_thr) & ~fully
    base[fully] = base[fully] * 0.07
    t_b = (e[band] - line_thr) / softness
    lf = t_b * t_b * (3 - 2 * t_b)
    base[band] = base[band] * (1 - lf * 0.93)
    result = np.clip(base, 0, 255).astype(np.uint8)
    # Stipple dots in mid-tone areas (gray 80-178)
    dot_step = max(4, round(15 - stroke * 1.0))
    base_r = 0.5 + stroke * 0.14
    for y in range(0, h, dot_step):
        for x in range(0, w, dot_step):
            gi = int(gray[min(h-1, y), min(w-1, x)])
            if gi < 80 or gi > 178:
                continue
            jx = x + int((random.random() - 0.5) * dot_step * 0.7)
            jy = y + int((random.random() - 0.5) * dot_step * 0.7)
            r = max(1, round(base_r * (1 + (178 - gi) / 178 * 0.6)))
            cv2.circle(result, (max(r, min(w-1-r, jx)), max(r, min(h-1-r, jy))), r, 30, -1)
    # Diagonal cross-hatch in deep shadows via mask
    h_step = max(3, round(13 - stroke * 0.9))
    h_len = round(h_step * 2.5)
    h_alpha = 0.18 + intensity * 0.025
    h_scale = 1.0 - h_alpha * (1.0 - 48.0 / 255.0)
    a1 = np.pi / 5         # 36 deg
    c1, s1 = float(np.cos(a1)), float(np.sin(a1))
    a2 = np.pi * 2 / 5    # 72 deg cross
    c2, s2 = float(np.cos(a2)), float(np.sin(a2))
    lw = max(1, round(stroke * 0.35))
    mark_mask = np.zeros((h, w), dtype=np.uint8)
    for y in range(0, h, h_step):
        for x in range(0, w, h_step):
            gi = int(gray[min(h-1, y), min(w-1, x)])
            if gi > 108:
                continue
            jx = x + int((random.random() - 0.5) * h_step * 0.4)
            jy = y + int((random.random() - 0.5) * h_step * 0.4)
            hl = h_len * (0.5 + random.random() * 0.6)
            p1 = (max(0, min(w-1, round(jx - c1*hl/2))), max(0, min(h-1, round(jy - s1*hl/2))))
            p2 = (max(0, min(w-1, round(jx + c1*hl/2))), max(0, min(h-1, round(jy + s1*hl/2))))
            cv2.line(mark_mask, p1, p2, 255, lw)
            if gi < 68:
                p3 = (max(0, min(w-1, round(jx - c2*hl/2))), max(0, min(h-1, round(jy - s2*hl/2))))
                p4 = (max(0, min(w-1, round(jx + c2*hl/2))), max(0, min(h-1, round(jy + s2*hl/2))))
                cv2.line(mark_mask, p3, p4, 255, lw)
    has_mark = mark_mask > 0
    result_f = result.astype(np.float32)
    result_f[has_mark] = np.clip(result_f[has_mark] * h_scale, 0, 255)
    return result_f.astype(np.uint8)


def render_contour(gray, edges, intensity, stroke):
    """Contour: anti-aliased smooth lines via smoothstep transition"""
    h, w = gray.shape
    thr = max(12, int(40 + (11 - intensity) * 13 - stroke * 2.5))
    softness = 6 + stroke * 2
    e = edges.astype(np.float32)
    result = np.full((h, w), 255, dtype=np.float32)
    fully = e >= (thr + softness)
    band = (e > thr) & ~fully
    result[fully] = 10  # near-black line interior
    t_b = (e[band] - thr) / softness
    result[band] = np.clip(255 - 245 * t_b * t_b * (3 - 2 * t_b), 10, 255)
    return result.astype(np.uint8)


def render_blind_contour(gray, edges, intensity, stroke):
    """Blind contour: long fan-directed walks following edges with random drift"""
    h, w = gray.shape
    result = np.full((h, w), 255, dtype=np.uint8)
    step_len = max(1.5, (w + h) / 600)
    num_strokes = 2 + round(intensity * 0.2)   # 2-4
    total_steps = int((w + h) * (4 + intensity * 0.5))
    steps_per_stroke = total_steps // num_strokes
    base_width = max(1, round(0.55 + stroke * 0.18))
    drift_range = (0.18 + (10 - intensity) * 0.035) * np.pi
    edge_sensitivity = 8 + intensity * 2.5
    lookahead = step_len * 4
    fan_count = 12
    fan_spread = np.pi * 0.44   # +-40 deg

    def edge_at(x, y):
        xi, yi = int(x), int(y)
        if xi < 0 or xi >= w or yi < 0 or yi >= h:
            return 0.0
        return float(edges[yi, xi])

    def find_start():
        bx, by, be = random.random() * w, random.random() * h, 0.0
        for _ in range(50):
            x = random.random() * w
            y = random.random() * h
            ev = edge_at(x, y)
            if ev > be:
                be, bx, by = ev, x, y
        return bx, by

    for _ in range(num_strokes):
        x, y = find_start()
        angle = random.random() * np.pi * 2
        pts = [(int(round(x)), int(round(y)))]
        for _step in range(steps_per_stroke):
            best_score, best_angle = -1.0, angle
            for f in range(fan_count):
                t_a = angle - fan_spread / 2 + (f / (fan_count - 1)) * fan_spread
                lx = x + np.cos(t_a) * lookahead
                ly = y + np.sin(t_a) * lookahead
                deviation = abs(t_a - angle)
                score = edge_at(lx, ly) + (1 - deviation / np.pi) * edge_sensitivity
                if score > best_score:
                    best_score, best_angle = score, t_a
            angle = best_angle + (random.random() - 0.5) * drift_range
            x += np.cos(angle) * step_len
            y += np.sin(angle) * step_len
            # Soft boundary: reflect at canvas edges
            if x < 0:      x = -x;           angle = np.pi - angle
            if x > w - 1:  x = 2*(w-1) - x;  angle = np.pi - angle
            if y < 0:      y = -y;            angle = -angle
            if y > h - 1:  y = 2*(h-1) - y;  angle = -angle
            pts.append((int(round(x)), int(round(y))))
        if len(pts) >= 2:
            pts_arr = np.array(pts, dtype=np.int32)
            cv2.polylines(result, [pts_arr], isClosed=False, color=18, thickness=base_width)
    return result


def render_gesture(gray, edges, intensity, stroke):
    """Gesture sketch: vectorized tonal base + Sobel-direction expressive marks"""
    h, w = gray.shape
    # Tonal base: dark shadows, lifted highlights, edge-darkened mid-tone
    g = gray.astype(np.float32) / 255.0
    e = edges.astype(np.float32) / 255.0
    # S-curve on tone
    base = np.where(g < 0.5,
                    2.0 * g * g,
                    1.0 - 2.0 * (1.0 - g) ** 2)
    # Edge contribution pulls toward black
    edge_pull = e * (0.18 + intensity * 0.022)
    result_f = np.clip((1.0 - base * 0.55 - edge_pull) * 255.0, 20, 255)
    result = result_f.astype(np.uint8)

    # Compute Sobel gradients for true gesture-mark direction
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_angle = np.arctan2(gy, gx)   # per-pixel gradient angle (tangent direction)

    # Draw short expressive cv2.line marks where edges are strong
    edge_thr = max(18, int(55 + (11 - intensity) * 7))
    step = max(3, round(12 - stroke * 0.8))
    mark_len = round(9 + stroke * 2.2)
    mark_w = max(1, round(0.4 + stroke * 0.16))
    for y in range(step // 2, h - step, step):
        for x in range(step // 2, w - step, step):
            if edges[y, x] > edge_thr:
                a = float(grad_angle[y, x]) + np.pi / 2  # perpendicular = tangent to edge
                dx = np.cos(a) * mark_len * 0.5
                dy = np.sin(a) * mark_len * 0.5
                x1 = int(round(x - dx))
                y1 = int(round(y - dy))
                x2 = int(round(x + dx))
                y2 = int(round(y + dy))
                cv2.line(result, (x1, y1), (x2, y2), 22, mark_w)

    return result


def render_cartoon(gray, edges, intensity, stroke):
    """Cartoon style: vectorized 4-level posterization + cv2.dilate bold outlines"""
    h, w = gray.shape
    # 4-level flat tonal posterization via np.where
    result = np.where(gray < 64,  np.uint8(22),
             np.where(gray < 140, np.uint8(90),
             np.where(gray < 210, np.uint8(185),
                                  np.uint8(245)))).astype(np.uint8)

    # Bold outlines: threshold edges then dilate for thick, clean cartoon lines
    edge_thr = max(12, int(30 + (11 - intensity) * 9))
    softness = 5.0
    e = edges.astype(np.float32)
    # Smoothstep anti-aliased line on the posterized image
    fully = e >= (edge_thr + softness)
    band  = (e > edge_thr) & ~fully
    result[fully] = 8
    t_b = (e[band] - edge_thr) / softness
    result[band] = np.clip(90 - 82 * t_b * t_b * (3 - 2 * t_b), 8, 90).astype(np.uint8)

    # Dilate edge mask to thicken outlines based on stroke parameter
    dil_r = max(0, round(stroke * 0.28 - 0.1))
    if dil_r > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dil_r * 2 + 1, dil_r * 2 + 1))
        edge_mask = (e > edge_thr).astype(np.uint8)
        thick_mask = cv2.dilate(edge_mask, kernel).astype(bool)
        result[thick_mask] = np.minimum(result[thick_mask], np.uint8(18))

    return result


def render_hatching(gray, edges, intensity, stroke):
    """Hatching: tone-driven 30-degree parallel lines, vectorized with d-grid"""
    h, w = gray.shape
    # Edge outline for form definition
    edge_thr = 35 + (11 - intensity) * 13
    result = np.where(edges > edge_thr, np.uint8(12), np.uint8(255))
    # Hatching parameters
    spacing = max(3, round(16 - stroke * 1.3))
    half_lw = max(0.5, (0.45 + stroke * 0.1) / 2.0)
    tone_thr = 60 + intensity * 14   # 74 (i=1) to 200 (i=10)
    hyst = 6
    h_alpha = 0.82
    h_scale = 1.0 - h_alpha * (1.0 - 14.0 / 255.0)  # multiply blend factor
    # Per-pixel perpendicular distance from any 30-deg hatching line
    angle = np.pi / 6   # 30 deg
    cos_a, sin_a = float(np.cos(angle)), float(np.sin(angle))
    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    XX, YY = np.meshgrid(xs, ys)
    d_grid = (-XX * sin_a + YY * cos_a) % spacing
    on_line = (d_grid < half_lw) | (d_grid > spacing - half_lw)
    # Tone mask: draw where image is dark enough (with hysteresis headroom)
    gray_sm = cv2.GaussianBlur(gray, (3, 3), 0).astype(np.float32)
    tone_mask = gray_sm < (tone_thr + hyst)
    # Apply multiply-equivalent darkening to marked pixels
    has_mark = on_line & tone_mask
    result_f = result.astype(np.float32)
    result_f[has_mark] = np.clip(result_f[has_mark] * h_scale, 0, 255)
    return result_f.astype(np.uint8)


def render_crosshatching(gray, edges, intensity, stroke):
    """Cross-hatching: two-pass d-grid tone-driven hatching at 45° and 135°"""
    h, w = gray.shape
    # Edge outline base
    edge_thr = max(10, int(38 + (11 - intensity) * 13))
    result = np.where(edges > edge_thr, np.uint8(10), np.uint8(255))

    xs = np.arange(w, dtype=np.float32)
    ys = np.arange(h, dtype=np.float32)
    XX, YY = np.meshgrid(xs, ys)

    spacing  = max(3, round(15 - stroke * 1.2))
    half_lw  = max(0.5, (0.44 + stroke * 0.10) / 2.0)
    gray_sm  = cv2.GaussianBlur(gray, (3, 3), 0).astype(np.float32)
    result_f = result.astype(np.float32)

    # Pass 1 – 45°: hatch where mid-to-dark tones
    tone_thr1 = 55 + intensity * 16   # 71 (i=1) → 215 (i=10)
    angle1    = np.pi / 4
    d1 = (-XX * np.sin(angle1) + YY * np.cos(angle1)) % spacing
    on1 = (d1 < half_lw) | (d1 > spacing - half_lw)
    mask1 = gray_sm < (tone_thr1 + 6)
    h_scale1 = 1.0 - 0.80 * (1.0 - 14.0 / 255.0)
    result_f[on1 & mask1] = np.clip(result_f[on1 & mask1] * h_scale1, 0, 255)

    # Pass 2 – 135°: counter-hatch only in darker tones
    tone_thr2 = max(30, tone_thr1 - 60)
    angle2    = np.pi * 3 / 4
    d2 = (-XX * np.sin(angle2) + YY * np.cos(angle2)) % spacing
    on2 = (d2 < half_lw) | (d2 > spacing - half_lw)
    mask2 = gray_sm < (tone_thr2 + 6)
    h_scale2 = 1.0 - 0.72 * (1.0 - 14.0 / 255.0)
    result_f[on2 & mask2] = np.clip(result_f[on2 & mask2] * h_scale2, 0, 255)

    return result_f.astype(np.uint8)


def render_tonal_shading(gray, edges, intensity, stroke):
    """Tonal pencil: vectorized S-curve tonal map + Gaussian pencil-blend + edge deepening"""
    h, w = gray.shape
    # S-curve: pull shadows darker, lift highlights
    g = gray.astype(np.float32) / 255.0
    curved = np.where(g < 0.5,
                      2.0 * g * g,
                      1.0 - 2.0 * (1.0 - g) ** 2)
    # Compress into pencil tonal range [30, 252]
    tonal = (curved * 222.0 + 30.0).astype(np.float32)

    # Gaussian blur for pencil-blend softness (radius scales with stroke)
    blur_k = max(3, (round(2 + stroke * 0.55)) | 1)   # odd kernel, 3-9
    sigma  = 0.8 + stroke * 0.18
    blurred = cv2.GaussianBlur(tonal, (blur_k, blur_k), sigma)

    # Edge deepening: smoothstep anti-aliased dark lines
    edge_thr  = max(14, int(45 + (11 - intensity) * 11 - stroke * 2.0))
    softness  = 5.0 + stroke * 1.0
    e = edges.astype(np.float32)
    result_f  = blurred.copy()
    fully = e >= (edge_thr + softness)
    band  = (e > edge_thr) & ~fully
    result_f[fully] = np.minimum(result_f[fully], 25.0)
    t_b = (e[band] - edge_thr) / softness
    edge_dark = blurred[band] - (blurred[band] - 25.0) * t_b * t_b * (3.0 - 2.0 * t_b)
    result_f[band] = np.clip(edge_dark, 25.0, 255.0)

    return np.clip(result_f, 0, 255).astype(np.uint8)


def apply_brush_effect(result, intensity, stroke, brush):
    """Apply brush texture overlay on the grayscale style output.
    Mirrors the canvas applyBrushEffect logic for the five brush modes."""
    if brush == 'line':
        return result
    h, w = result.shape

    if brush in ('hatch', 'crosshatch'):
        # Tone-aware hatching: vectorized d-grid modulo, draw only where sketch is dark
        spacing  = max(4, round(18 - stroke * 1.4))
        tone_thr = 85 + intensity * 12   # 97 (i=1) to 205 (i=10)
        hyst     = 8
        half_lw  = max(0.15, (0.38 + stroke * 0.09) / 2.0)
        xs = np.arange(w, dtype=np.float32)
        ys = np.arange(h, dtype=np.float32)
        XX, YY = np.meshgrid(xs, ys)
        PASSES = [(np.pi / 6, tone_thr, 0.60)]
        if brush == 'crosshatch':
            PASSES.append((np.pi * 2 / 3, tone_thr - 24, 0.44))
        result_f = result.astype(np.float32)
        for angle, thr, alpha in PASSES:
            cos_a = float(np.cos(angle))
            sin_a = float(np.sin(angle))
            d_grid   = (-XX * sin_a + YY * cos_a) % spacing
            on_line  = (d_grid < half_lw) | (d_grid > spacing - half_lw)
            tone_mask = result_f < (thr + hyst)
            h_scale  = 1.0 - alpha * (1.0 - 18.0 / 255.0)
            result_f[on_line & tone_mask] = np.clip(
                result_f[on_line & tone_mask] * h_scale, 0, 255)
        return result_f.astype(np.uint8)

    elif brush == 'charcoal':
        # Directional grain marks at ~15 deg (matching renderCharcoal angle) + grain noise
        mark_step  = max(4, round(16 - stroke * 1.1))
        mark_len   = round(mark_step * (1.3 + stroke * 0.2))
        mark_alpha = 0.07 + intensity * 0.016
        mark_scale = 1.0 - mark_alpha * (1.0 - 22.0 / 255.0)
        slope  = 0.27   # tan(15 deg)
        line_w = max(1, round(stroke * 0.5))
        mark_mask = np.zeros((h, w), dtype=np.uint8)
        for y in range(0, h, mark_step):
            for x in range(0, w, mark_step):
                if int(result[min(h-1, y), min(w-1, x)]) > 215:
                    continue
                jx     = x + int((random.random() - 0.5) * mark_step * 0.7)
                jy     = y + int((random.random() - 0.5) * mark_step * 0.7)
                length = mark_len * (0.4 + random.random() * 0.8)
                hdx    = slope * length * 0.5
                p1 = (max(0, min(w-1, round(jx - hdx))), max(0, min(h-1, round(jy - length*0.5))))
                p2 = (max(0, min(w-1, round(jx + hdx))), max(0, min(h-1, round(jy + length*0.5))))
                cv2.line(mark_mask, p1, p2, 255, line_w)
        grain_chance = 0.009 + intensity * 0.007
        grain_alpha  = 0.17 + stroke * 0.03
        grain_scale  = 1.0 - grain_alpha * (1.0 - 24.0 / 255.0)
        grain_mask   = np.random.random((h, w)) < grain_chance
        mid_mask     = (result > 18) & (result < 235)
        result_f = result.astype(np.float32)
        result_f[mark_mask > 0] = np.clip(result_f[mark_mask > 0] * mark_scale, 0, 255)
        result_f[grain_mask & mid_mask] = np.clip(
            result_f[grain_mask & mid_mask] * grain_scale, 0, 255)
        return result_f.astype(np.uint8)

    elif brush == 'inkwash':
        # 3x3 box-blur softening (1-3 passes) blended with original + wet-edge bloom
        blur_passes = 1 + round(stroke * 0.2)
        wash_str    = 0.28 + stroke * 0.055
        orig   = result.astype(np.float32)
        blurred = orig.copy()
        for _ in range(blur_passes):
            blurred = cv2.blur(blurred, (3, 3))
        washed = np.clip(orig * (1 - wash_str) + blurred * wash_str, 0, 255).astype(np.uint8)
        # Wet-edge bloom: lighten near dark sketch marks (simulates ink bleed)
        bloom_r     = max(1, 2 + round(stroke * 0.45))
        bloom_alpha = 0.07 + intensity * 0.009
        ksize       = bloom_r * 2 + 1
        dark_mask   = (result < 75).astype(np.float32)
        bloom_spread = cv2.GaussianBlur(dark_mask * 255, (ksize, ksize), bloom_r * 0.5) / 255.0
        result_f    = washed.astype(np.float32)
        boost       = np.maximum(0.0, 238.0 - result_f) * bloom_spread * bloom_alpha
        result_f    = np.clip(result_f + boost, 0, 255)
        return result_f.astype(np.uint8)

    return result


def stylize_opencv(img_bgr, artStyle='pencil', style='line', brush='line',
                   stroke=1, skipHatching=False, seed=0, intensity=6,
                   smoothing=0, colorize=False, invert=False, 
                   contrast=0, saturation=0, hueShift=0):
    """Main stylization pipeline: edge detection + style rendering + medium effect"""
    np.random.seed(seed)
    random.seed(seed)
    
    # Resize to reasonable max dimension
    h0, w0 = img_bgr.shape[:2]
    max_dim = 1200
    scale = 1.0
    if max(h0, w0) > max_dim:
        scale = max_dim / float(max(h0, w0))
        img_bgr = cv2.resize(img_bgr, (int(w0*scale), int(h0*scale)), 
                           interpolation=cv2.INTER_AREA)

    img_color = cv2.bilateralFilter(img_bgr, d=9, sigmaColor=75, sigmaSpace=75)
    gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    
    # Sobel edge detection
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    edges = np.sqrt(sobelx**2 + sobely**2)
    edges = np.clip(edges * (intensity / 6.0), 0, 255).astype(np.uint8)
    
    # Route to style-specific renderer
    if style == 'stippling':
        result = render_stippling(gray, edges, intensity, stroke)
    elif style == 'charcoal':
        result = render_charcoal(gray, edges, intensity, stroke)
    elif style == 'drybrush':
        result = render_dry_brush(gray, edges, intensity, stroke)
    elif style == 'inkwash':
        result = render_ink_wash(gray, edges, intensity, stroke)
    elif style == 'comic':
        result = render_comic(gray, edges, intensity, stroke)
    elif style == 'fashion':
        result = render_fashion(gray, edges, intensity, stroke)
    elif style == 'urban':
        result = render_urban(gray, edges, intensity, stroke)
    elif style == 'architectural':
        result = render_architectural(gray, edges, intensity, stroke)
    elif style == 'academic':
        result = render_academic(gray, edges, intensity, stroke)
    elif style == 'etching':
        result = render_etching(gray, edges, intensity, stroke)
    elif style == 'minimalist':
        result = render_minimalist(gray, edges, intensity, stroke)
    elif style == 'glitch':
        result = render_glitch(gray, edges, intensity, stroke)
    elif style == 'mixedmedia':
        result = render_mixed_media(gray, edges, intensity, stroke)
    elif style == 'contour':
        result = render_contour(gray, edges, intensity, stroke)
    elif style == 'blindcontour':
        result = render_blind_contour(gray, edges, intensity, stroke)
    elif style == 'gesture':
        result = render_gesture(gray, edges, intensity, stroke)
    elif style == 'cartoon':
        result = render_cartoon(gray, edges, intensity, stroke)
    elif style == 'hatching':
        result = render_hatching(gray, edges, intensity, stroke)
    elif style == 'crosshatching':
        result = render_crosshatching(gray, edges, intensity, stroke)
    elif style == 'tonalpencil':
        result = render_tonal_shading(gray, edges, intensity, stroke)
    else:
        # Default: tonal rendering
        result = 255 - np.minimum(255, edges).astype(np.uint8)
    
    # Apply medium effect (line thickness and tonal adjustments)
    medium_props = {
        'pencil': {'dilations': 0, 'tone_delta': 15},
        'ink': {'dilations': 1, 'tone_delta': -10},
        'marker': {'dilations': 1, 'tone_delta': -20},
        'pen': {'dilations': 2, 'tone_delta': -30},
        'pastel': {'dilations': 3, 'tone_delta': -35}
    }
    
    props = medium_props.get(artStyle, medium_props['pencil'])
    
    if props['dilations'] > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        result = cv2.dilate(result, kernel, iterations=props['dilations'])
    
    if props['tone_delta'] != 0:
        result = np.clip(result.astype(np.int16) + props['tone_delta'], 0, 255).astype(np.uint8)
    
    # Apply smoothing (gaussian blur)
    if smoothing > 0:
        kernel_size = max(3, int(smoothing * 2) | 1)  # Ensure odd number >= 3
        result = cv2.GaussianBlur(result, (kernel_size, kernel_size), 0)
    
    # Apply brush texture overlay
    if brush != 'line':
        result = apply_brush_effect(result, intensity, stroke, brush)

    # Convert to BGR
    result_bgr = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
    
    # Apply colorization if enabled (blend original colors into grayscale)
    if colorize and img_color is not None:
        try:
            # Blend sketch structure with original image colors
            result_bgr = cv2.addWeighted(result_bgr, 0.5, img_color, 0.5, 0)
        except:
            pass  # If blending fails, just use the grayscale version
    
    # Apply color adjustments (contrast, saturation, hue shift)
    if contrast != 0 or saturation != 0 or hueShift != 0:
        result_bgr = apply_color_adjustments(result_bgr, contrast, saturation, hueShift)
    
    # Apply inversion if enabled
    if invert:
        result_bgr = cv2.bitwise_not(result_bgr)
    
    return result_bgr


def apply_color_adjustments(img_bgr, contrast, saturation, hue_shift):
    """Apply contrast, saturation, and hue shift adjustments"""
    result = img_bgr.copy().astype(np.float32)
    
    # Apply contrast (multiply by factor)
    if contrast != 0:
        factor = 1.0 + (contrast / 100.0)
        result = result * factor
    
    # Saturation is more complex - adjust in HSV space
    if saturation != 0 or hue_shift != 0:
        result_uint = np.clip(result, 0, 255).astype(np.uint8)
        img_hsv = cv2.cvtColor(result_uint, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        # Apply saturation
        if saturation != 0:
            factor = 1.0 + (saturation / 100.0)
            img_hsv[:,:,1] = img_hsv[:,:,1] * factor
        
        # Apply hue shift
        if hue_shift != 0:
            img_hsv[:,:,0] = img_hsv[:,:,0] + hue_shift
        
        img_hsv[:,:,0] = np.clip(img_hsv[:,:,0], 0, 255)
        img_hsv[:,:,1] = np.clip(img_hsv[:,:,1], 0, 255)
        img_hsv[:,:,2] = np.clip(img_hsv[:,:,2], 0, 255)
        
        result_uint = cv2.cvtColor(img_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        result = result_uint.astype(np.float32)
    
    return np.clip(result, 0, 255).astype(np.uint8)


@app.route('/api/style-transfer-advanced', methods=['POST', 'OPTIONS'])
@add_cors_headers
def api_style_transfer_advanced():
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 204
    
    if 'file' not in request.files:
        return make_response(jsonify({'error': 'no file provided'}), 400)
    
    try:
        f = request.files['file']
        
        # Extract and safely convert parameters
        artStyle = request.form.get('artStyle', 'pencil').strip()
        style = request.form.get('style', 'line').strip()
        brush = request.form.get('brush', 'line').strip()
        
        try:
            stroke = int(request.form.get('stroke', '1') or '1')
        except:
            stroke = 1
            
        skipHatching = request.form.get('skipHatching', 'false').lower() == 'true'
        
        try:
            seed = int(request.form.get('seed', '0') or '0')
        except:
            seed = 0
            
        try:
            intensity = int(request.form.get('intensity', '6') or '6')
        except:
            intensity = 6
            
        try:
            smoothing = int(request.form.get('smoothing', '0') or '0')
        except:
            smoothing = 0
            
        colorize = request.form.get('colorize', 'false').lower() == 'true'
        invert = request.form.get('invert', 'false').lower() == 'true'
        
        try:
            contrast = int(request.form.get('contrast', '0') or '0')
        except:
            contrast = 0
            
        try:
            saturation = int(request.form.get('saturation', '0') or '0')
        except:
            saturation = 0
            
        try:
            hueShift = int(request.form.get('hueShift', '0') or '0')
        except:
            hueShift = 0
        
        # Parse resolution and aspect ratio
        try:
            resolution = int(request.form.get('resolution', '1024') or '1024')
        except:
            resolution = 1024
        
        aspect_str = request.form.get('aspect', '1:1').strip()
        try:
            asp_parts = aspect_str.split(':')
            aw, ah = int(asp_parts[0]), int(asp_parts[1])
        except:
            aw, ah = 1, 1

        img = read_image_from_stream(f.stream)
        
        # Resize image to match requested resolution and aspect ratio
        target_width = resolution
        target_height = int(resolution * ah / aw)
        img = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_LANCZOS4)
    except Exception as e:
        return make_response(jsonify({'error': 'invalid image', 'details': str(e)}), 400)

    try:
        out = stylize_opencv(img, artStyle=artStyle, style=style, brush=brush, 
                            stroke=stroke, skipHatching=skipHatching, seed=seed, 
                            intensity=intensity, smoothing=smoothing, 
                            colorize=colorize, invert=invert,
                            contrast=contrast, saturation=saturation, 
                            hueShift=hueShift)
    except Exception as e:
        return make_response(jsonify({'error': 'processing failed', 'details': str(e)}), 500)

    # Return PNG
    try:
        is_success, buffer = cv2.imencode('.png', out)
        if not is_success:
            return make_response(jsonify({'error': 'encoding failed'}), 500)
        bio = io.BytesIO(buffer.tobytes())
        resp = send_file(bio, mimetype='image/png')
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    except Exception as e:
        return make_response(jsonify({'error': 'PNG encoding failed', 'details': str(e)}), 500)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)

