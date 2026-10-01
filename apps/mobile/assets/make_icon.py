"""Render the app icon at 3x for clean rounded edges."""

from pathlib import Path
from PIL import Image, ImageDraw

S = 3
SIZE = 1024 * S
INK = '#4D4D4D'


def px(value):
    return round(value * S)


def line(draw, points, width=38):
    points = [(px(x), px(y)) for x, y in points]
    draw.line(points, fill=INK, width=px(width), joint='curve')
    radius = px(width) / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=INK)


image = Image.new('RGBA', (SIZE, SIZE), '#F7F7F7')

plate = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
plate_draw = ImageDraw.Draw(plate)
plate_draw.rounded_rectangle((px(145), px(147), px(879), px(877)), radius=px(186), fill=(255, 255, 255, 255))
image = Image.alpha_composite(image, plate)

draw = ImageDraw.Draw(image)
draw.rounded_rectangle((px(234), px(267), px(790), px(782)), radius=px(94), outline=INK, width=px(38))
line(draw, [(253, 391), (771, 391)])
line(draw, [(370, 238), (370, 323)])
line(draw, [(654, 238), (654, 323)])
draw.ellipse((px(386), px(443), px(638), px(695)), outline=INK, width=px(38))
line(draw, [(445, 569), (492, 616), (584, 518)])
for x in (383, 512, 641):
    draw.ellipse((px(x-14), px(708), px(x+14), px(736)), fill=INK)

image.convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS).save(Path(__file__).with_name('icon.png'))
