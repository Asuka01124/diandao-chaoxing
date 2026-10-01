"""Render the app icon at 3x for clean rounded edges."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 3
SIZE = 1024 * S
INK = '#3155D9'


def px(value):
    return round(value * S)


def line(draw, points, width=38):
    points = [(px(x), px(y)) for x, y in points]
    draw.line(points, fill=INK, width=px(width), joint='curve')
    radius = px(width) / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=INK)


base = Image.new('RGBA', (1024, 1024))
bg = ImageDraw.Draw(base)
for y in range(1024):
    ratio = y / 1023
    start = (247, 250, 255)
    end = (200, 216, 249)
    color = tuple(round(a * (1-ratio) + b * ratio) for a, b in zip(start, end)) + (255,)
    bg.line((0, y, 1024, y), fill=color)
image = base.resize((SIZE, SIZE), Image.Resampling.BICUBIC)

glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse((px(500), px(-115), px(1120), px(505)), fill=(141, 169, 255, 95))
glow_draw.ellipse((px(-150), px(620), px(430), px(1200)), fill=(141, 169, 255, 64))
image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(px(65))))

plate = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
plate_draw = ImageDraw.Draw(plate)
plate_draw.rounded_rectangle((px(145), px(147), px(879), px(877)), radius=px(186), fill=(255, 255, 255, 174), outline=(255, 255, 255, 232), width=px(5))
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
