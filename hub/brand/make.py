# Hub logo masters. usage: python3 make.py <out-dir>  (PNGs are rendered from hub-icon.svg / hub-icon-small.svg)
import math, sys, os
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
f = lambda v: f"{v:.2f}".rstrip('0').rstrip('.')
def mark(gap_r=46, dot_r=30, w=46, top=44, bot=212):
    cx = cy = 128; r = w / 2; L0, L1 = 50, 50 + w; R1 = 206; R0 = R1 - w
    dy = math.sqrt(gap_r**2 - (cx - L1)**2)
    left = (f"M{f(L0+r)} {top}H{f(L1-r)}A{f(r)} {f(r)} 0 0 1 {f(L1)} {f(top+r)}V{f(cy-dy)}A{gap_r} {gap_r} 0 0 0 {f(L1)} {f(cy+dy)}"
            f"V{f(bot-r)}A{f(r)} {f(r)} 0 0 1 {f(L1-r)} {bot}H{f(L0+r)}A{f(r)} {f(r)} 0 0 1 {L0} {f(bot-r)}V{f(top+r)}A{f(r)} {f(r)} 0 0 1 {f(L0+r)} {top}Z")
    right = (f"M{f(R0+r)} {top}H{f(R1-r)}A{f(r)} {f(r)} 0 0 1 {R1} {f(top+r)}V{f(bot-r)}A{f(r)} {f(r)} 0 0 1 {f(R1-r)} {bot}H{f(R0+r)}"
             f"A{f(r)} {f(r)} 0 0 1 {R0} {f(bot-r)}V{f(cy+dy)}A{gap_r} {gap_r} 0 0 0 {R0} {f(cy-dy)}V{f(top+r)}A{f(r)} {f(r)} 0 0 1 {f(R0+r)} {top}Z")
    return left + right, cx, cy, dot_r
INK, LIVE, TILE = '#f2f2f3', '#4c9dff', '#111113'
def doc(title, body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>{title}</title>{body}</svg>\n'
def placed(scale, stems, dot, **k):
    d, cx, cy, r = mark(**k)
    return (f'<g transform="translate(128 128) scale({scale}) translate(-128 -128)">'
            f'<path fill="{stems}" d="{d}"/><circle fill="{dot}" cx="{cx}" cy="{cy}" r="{r}"/></g>')
# Hub mark: two machines lean in toward one live dot.
files = {
  'hub-icon.svg':        doc('Hub', f'<rect width="256" height="256" fill="{TILE}"/>' + placed(0.62, INK, LIVE)),
  'hub-icon-small.svg':  doc('Hub', f'<rect width="256" height="256" rx="56" fill="{TILE}"/>' + placed(0.84, INK, LIVE, gap_r=52, dot_r=28)),  # 16-32 px: bigger mark, wider gap
  'hub-mark.svg':        doc('Hub', placed(1, INK, LIVE)),
  'hub-mark-black.svg':  doc('Hub', placed(1, '#000', '#000')),
  'hub-mark-white.svg':  doc('Hub', placed(1, '#fff', '#fff')),
  'hub-badge.svg':       doc('Hub', placed(0.9, '#fff', '#fff', gap_r=52, dot_r=28)),  # notification badge: alpha only
}
for n, s in files.items(): open(f'{out}/{n}', 'w').write(s)
