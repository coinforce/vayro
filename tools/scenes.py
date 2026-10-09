#!/usr/bin/env python3
"""Araç sahnesi arka planlarını (yol, gün batımı, gece yolu) SVG olarak üretir ve styles.css içine yazar.
Çalıştır: python3 tools/scenes.py"""
import random, re, pathlib
from urllib.parse import quote

W, H, RY = 400, 300, 200  # tuval ve yolun üst kenarı

def lin(i, stops, x2=0, y2=1):
    s = "".join(f"<stop offset='{o}' stop-color='{c}'" + (f" stop-opacity='{a[0]}'" if a else "") + "/>" for o, c, *a in stops)
    return f"<linearGradient id='{i}' x1='0' y1='0' x2='{x2}' y2='{y2}'>{s}</linearGradient>"

def rad(i, stops):
    s = "".join(f"<stop offset='{o}' stop-color='{c}' stop-opacity='{a}'/>" for o, c, a in stops)
    return f"<radialGradient id='{i}'>{s}</radialGradient>"

def ridge(seed, base, amp, step, fill, jag=False):
    r = random.Random(seed); pts = [(0, base - r.uniform(0, amp))]
    x = 0
    while x < W:
        x += step * r.uniform(.7, 1.3); pts.append((min(x, W), base - r.uniform(0, amp)))
    if jag:
        d = "M0 %d " % RY + " ".join(f"L{x:.0f} {y:.0f}" for x, y in pts)
    else:
        d = f"M0 {RY} L{pts[0][0]:.0f} {pts[0][1]:.0f} "
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            d += f"Q{x0 + (x1 - x0) / 2:.0f} {min(y0, y1) - amp * .15:.0f} {x1:.0f} {y1:.0f} "
    return f"<path d='{d} L{W} {RY}Z' fill='{fill}'/>"

def road(top, bottom, edge, dash, kerb, sheen=None, rail=None):
    o = f"<rect y='{RY - 4}' width='{W}' height='7' fill='{kerb}'/>"
    if rail:
        o += f"<rect y='{RY - 14}' width='{W}' height='4' rx='1' fill='{rail}'/>" + "".join(f"<rect x='{x}' y='{RY - 14}' width='3' height='12' fill='{rail}'/>" for x in range(12, W, 44))
    o += f"<rect y='{RY + 2}' width='{W}' height='{H - RY}' fill='url(#rd)'/>"
    r = random.Random(7)
    o += "".join(f"<rect x='{r.uniform(0, W):.0f}' y='{r.uniform(RY + 10, H - 6):.0f}' width='{r.uniform(3, 9):.0f}' height='1' fill='#fff' opacity='.05'/>" for _ in range(46))
    if sheen: o += sheen
    o += f"<rect y='{RY + 8}' width='{W}' height='2.5' fill='{edge}' opacity='.9'/><rect y='{H - 10}' width='{W}' height='4' fill='{edge}' opacity='.9'/>"
    o += "".join(f"<rect x='{x}' y='246' width='52' height='6' rx='2' fill='{dash}'/>" for x in range(-30, W + 30, 92))
    return lin("rd", [(0, top), (1, bottom)]) and (f"<defs>{lin('rd', [(0, top), (1, bottom)])}</defs>" + o)

def cloud(x, y, s, op):
    return "".join(f"<ellipse cx='{x + dx * s:.0f}' cy='{y + dy * s:.0f}' rx='{rx * s:.0f}' ry='{ry * s:.0f}' fill='#fff' opacity='{op}'/>"
                   for dx, dy, rx, ry in [(0, 0, 30, 10), (-18, 4, 20, 8), (20, 3, 22, 8), (4, -7, 16, 8)])

def day():
    o = f"<defs>{lin('sk', [(0, '#3d8fdd'), (.6, '#93cbf3'), (1, '#e9f6fe')])}{rad('sn', [(0, '#fffbe0', 1), (.25, '#fff3b0', .9), (1, '#fff3b0', 0)])}</defs>"
    o += f"<rect width='{W}' height='{H}' fill='url(#sk)'/><circle cx='332' cy='48' r='60' fill='url(#sn)'/>"
    o += cloud(80, 52, 1.1, .92) + cloud(210, 30, .8, .8) + cloud(300, 96, .9, .7) + cloud(20, 110, .7, .6)
    o += ridge(3, 150, 46, 60, '#a9c5e0', jag=True) + ridge(5, 172, 34, 80, '#84bd8b') + ridge(9, 188, 22, 70, '#559a66')
    r = random.Random(11)
    for x in range(6, W, 17):
        h = r.uniform(10, 20); b = RY - 3 - r.uniform(0, 6); xx = x + r.uniform(-4, 4)
        o += f"<path d='M{xx:.0f} {b:.0f} l{h * .32:.1f} 0 l-{h * .32:.1f} -{h:.0f} l-{h * .32:.1f} {h:.0f}Z' fill='#2f6f47'/>"
    o += road('#565c63', '#33383e', '#f4f6f7', '#f5c531', '#8f979e', rail='#d5dbe0')
    return o

def sunset():
    o = f"<defs>{lin('sk', [(0, '#1a1240'), (.4, '#6b2b72'), (.75, '#ea5a6e'), (1, '#ffb65c')])}{rad('sn', [(0, '#fff4c4', 1), (.3, '#ffd27a', .95), (.55, '#ff9a5a', .45), (1, '#ff9a5a', 0)])}{rad('gl', [(0, '#ffb65c', .45), (1, '#ffb65c', 0)])}</defs>"
    o += f"<rect width='{W}' height='{H}' fill='url(#sk)'/><circle cx='278' cy='176' r='96' fill='url(#sn)'/><circle cx='278' cy='176' r='34' fill='#ffe9a8'/>"
    for x, y, rx, op, c in [(90, 70, 70, .35, '#ff8fa0'), (260, 52, 90, .3, '#c86aa0'), (340, 104, 60, .4, '#ffb07a'), (60, 128, 80, .3, '#ff9a8a'), (180, 110, 50, .25, '#e77a9a')]:
        o += f"<ellipse cx='{x}' cy='{y}' rx='{rx}' ry='4' fill='{c}' opacity='{op}'/>"
    o += ridge(21, 160, 40, 70, '#6a3270', jag=True) + ridge(23, 180, 26, 90, '#3c1f4a') + ridge(27, 192, 14, 60, '#22132e')
    r = random.Random(31)
    for x in [18, 34, 70, 132, 150, 214, 330, 352, 386]:
        h = r.uniform(22, 40); o += f"<ellipse cx='{x}' cy='{RY - 2 - h / 2:.0f}' rx='{h * .13:.1f}' ry='{h / 2:.0f}' fill='#170d20'/>"
    sheen = f"<ellipse cx='278' cy='{RY + 40}' rx='150' ry='60' fill='url(#gl)'/>"
    o += road('#4a3a48', '#231c28', '#ffe2c2', '#ffc34d', '#5c4658', sheen=sheen, rail='#3a2a40')
    return o

def night():
    o = f"<defs>{lin('sk', [(0, '#040712'), (.6, '#0f1d3a'), (1, '#2a3d63')])}{rad('mn', [(0, '#f4f1dc', 1), (.2, '#dfe6f5', .5), (1, '#dfe6f5', 0)])}{rad('lp', [(0, '#fff0b8', .95), (.3, '#ffd77a', .5), (1, '#ffd77a', 0)])}{rad('pl', [(0, '#ffe2a0', .28), (1, '#ffe2a0', 0)])}{lin('cn', [(0, '#ffe9b0', .16), (1, '#ffe9b0', 0)])}</defs>"
    o += f"<rect width='{W}' height='{H}' fill='url(#sk)'/><circle cx='64' cy='52' r='46' fill='url(#mn)'/><circle cx='64' cy='52' r='13' fill='#f1eedc'/><circle cx='59' cy='48' r='3' fill='#d9d6c2'/><circle cx='68' cy='57' r='2' fill='#d9d6c2'/>"
    r = random.Random(41)
    o += "".join(f"<circle cx='{r.uniform(0, W):.0f}' cy='{r.uniform(4, 130):.0f}' r='{r.choice([.6, .8, 1.1, 1.4])}' fill='#fff' opacity='{r.uniform(.4, .95):.2f}'/>" for _ in range(60))
    def skyline(seed, col, hmin, hmax, wcol, dens):
        rr = random.Random(seed); x = -6; s = ""
        while x < W:
            w = rr.uniform(20, 42); h = rr.uniform(hmin, hmax); top = RY - 4 - h
            s += f"<rect x='{x:.0f}' y='{top:.0f}' width='{w:.0f}' height='{h + 2:.0f}' fill='{col}'/>"
            if rr.random() < .3: s += f"<rect x='{x + w / 2 - 1:.0f}' y='{top - 10:.0f}' width='2' height='10' fill='{col}'/>"
            for wy in range(int(top) + 5, RY - 10, 8):
                for wx in range(int(x) + 4, int(x + w) - 4, 7):
                    if rr.random() < dens: s += f"<rect x='{wx}' y='{wy}' width='3' height='4' fill='{wcol}' opacity='{rr.uniform(.55, 1):.2f}'/>"
            x += w + rr.uniform(-2, 5)
        return s
    o += skyline(51, '#16243f', 60, 120, '#9fc3ff', .12) + skyline(57, '#0a1222', 30, 84, '#ffd56b', .3)
    lamps = [58, 200, 342]; sheen = ""
    for x in lamps:
        o += f"<path d='M{x} {RY - 4} L{x - 46} {H} L{x + 46} {H}Z' fill='url(#cn)' transform='translate(0 -72)'/>"
        sheen += f"<ellipse cx='{x + 14}' cy='{RY + 44}' rx='64' ry='30' fill='url(#pl)'/>"
    body = road('#2a3038', '#14181d', '#b9c4cf', '#d6ac2c', '#3a424c', sheen=sheen, rail='#263042')
    for x in lamps:
        body += f"<rect x='{x - 1.5}' y='{RY - 76}' width='3' height='78' fill='#2c3646'/><path d='M{x} {RY - 76} q2 -10 16 -10' stroke='#2c3646' stroke-width='3' fill='none'/><circle cx='{x + 16}' cy='{RY - 84}' r='18' fill='url(#lp)'/><ellipse cx='{x + 16}' cy='{RY - 85}' rx='5' ry='2.2' fill='#fff6d2'/>"
    return o + body

def uri(body):
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' preserveAspectRatio='xMidYMax slice'>{body}</svg>"
    return 'url("data:image/svg+xml,' + quote(svg, safe="/:=' ()-.,;") + '")'

css = pathlib.Path(__file__).resolve().parent.parent / "styles.css"
text = css.read_text()
for name, fn in [("road", day), ("sunset", sunset), ("night", night)]:
    rule = f".bg-{name}{{background:{uri(fn())} center bottom/cover no-repeat}}"
    text, n = re.subn(r"^\.bg-" + name + r"\{.*\}$", lambda m: rule, text, flags=re.M)
    if not n: text += rule + "\n"
css.write_text(text)
print("sahneler yazıldı:", len(text), "bayt")
