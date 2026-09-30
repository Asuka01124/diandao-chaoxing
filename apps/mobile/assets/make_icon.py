from PIL import Image, ImageDraw
from pathlib import Path

S = 3
def p(value): return value * S
def line(draw, points, width=38):
    draw.line([(p(x), p(y)) for x, y in points], fill='#111111', width=p(width), joint='curve')
    r = p(width) / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((p(x)-r, p(y)-r, p(x)+r, p(y)+r), fill='#111111')

image = Image.new('RGB', (p(1024), p(1024)), 'white')
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((p(205), p(238), p(819), p(822)), radius=p(116), outline='#111111', width=p(38))
line(draw, [(224, 380), (800, 380)])
line(draw, [(358, 198), (358, 305)])
line(draw, [(666, 198), (666, 305)])
draw.ellipse((p(370), p(430), p(654), p(714)), outline='#111111', width=p(38))
line(draw, [(440, 573), (489, 622), (588, 517)])
for x in (355, 512, 669):
    draw.ellipse((p(x-16), p(737), p(x+16), p(769)), fill='#111111')
image.resize((1024, 1024), Image.Resampling.LANCZOS).save(Path(__file__).with_name('icon.png'))
