"""Crop the supplied FocusBoard symbol into the app icons. Does not redraw the mark."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "brand" / "focusboard-logo.png"
OUT = ROOT / "assets" / "brand"
SIZES = (16, 24, 32, 48, 64, 128, 256)


def luminance(pixel: tuple[int, int, int, int]) -> int:
    red, green, blue, _alpha = pixel
    return int(round(0.2126 * red + 0.7152 * green + 0.0722 * blue))


def symbol_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    pixels = image.load()
    rows: list[tuple[int, int, int]] = []
    for y in range(image.height):
        xs = [x for x in range(image.width) if luminance(pixels[x, y]) > 210]
        if xs:
            rows.append((y, xs[0], xs[-1]))
    gap_at = 0
    widest = 0
    for index in range(1, len(rows)):
        gap = rows[index][0] - rows[index - 1][0]
        if gap > widest:
            widest = gap
            gap_at = rows[index - 1][0]
    symbol = [row for row in rows if row[0] <= gap_at]
    left = min(row[1] for row in symbol)
    right = max(row[2] for row in symbol)
    top = symbol[0][0]
    bottom = symbol[-1][0]
    pad = 6
    return (
        max(0, left - pad),
        max(0, top - pad),
        min(image.width - 1, right + pad),
        min(image.height - 1, bottom + pad),
    )


def extract_mark(image: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    crop = image.crop((bounds[0], bounds[1], bounds[2] + 1, bounds[3] + 1)).convert("RGBA")
    pixels = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            alpha = luminance(pixels[x, y])
            pixels[x, y] = (255, 255, 255, alpha)
    return crop


def square_icon(mark: Image.Image, size: int, background: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), background)
    margin = max(1, round(size * 0.1))
    inner = size - margin * 2
    scale = inner / max(mark.width, mark.height)
    fitted = mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def dib_image(image: Image.Image) -> bytes:
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    xor = bytearray()
    for y in range(height - 1, -1, -1):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            xor.extend((blue, green, red, alpha))
    mask_row = ((width + 31) // 32) * 4
    mask = bytearray()
    for y in range(height - 1, -1, -1):
        row = bytearray(mask_row)
        for x in range(width):
            if pixels[x, y][3] < 128:
                row[x // 8] |= 0x80 >> (x % 8)
        mask.extend(row)
    header = (
        40).to_bytes(4, "little") + width.to_bytes(4, "little", signed=True) + (height * 2).to_bytes(4, "little", signed=True)
    header += (1).to_bytes(2, "little") + (32).to_bytes(2, "little")
    header += (0).to_bytes(4, "little") + (len(xor) + len(mask)).to_bytes(4, "little")
    header += (0).to_bytes(4, "little") * 2 + (0).to_bytes(4, "little") * 2
    return header + bytes(xor) + bytes(mask)


def write_ico(images: list[Image.Image], destination: Path) -> None:
    blobs = [dib_image(image) for image in images]
    header = (0).to_bytes(2, "little") + (1).to_bytes(2, "little") + len(images).to_bytes(2, "little")
    offset = 6 + 16 * len(images)
    entries = bytearray()
    body = bytearray()
    for image, blob in zip(images, blobs, strict=True):
        entries.append(0 if image.width == 256 else image.width)
        entries.append(0 if image.height == 256 else image.height)
        entries.extend((0, 0))
        entries.extend((1).to_bytes(2, "little"))
        entries.extend((32).to_bytes(2, "little"))
        entries.extend(len(blob).to_bytes(4, "little"))
        entries.extend(offset.to_bytes(4, "little"))
        body.extend(blob)
        offset += len(blob)
    destination.write_bytes(header + bytes(entries) + bytes(body))


def overview(images: list[Image.Image], crop: Image.Image, destination: Path) -> None:
    pad = 28
    cell = 220
    label_h = 48
    width = pad + len(images) * cell
    height = pad + cell + label_h + 720 + 48
    board = Image.new("RGBA", (width, height), (244, 241, 234, 255))
    draw = ImageDraw.Draw(board)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    for index, image in enumerate(images):
        x = pad + index * cell
        y = pad
        tile = Image.new("RGBA", (cell - 20, cell - 20), (20, 20, 24, 255))
        shown = cell - 56
        scale = image.resize((shown, shown), Image.Resampling.NEAREST)
        tile.alpha_composite(scale, ((tile.width - scale.width) // 2, (tile.height - scale.height) // 2))
        board.alpha_composite(tile, (x, y))
        draw.text((x + 8, y + cell - 8), f"{image.width} px", fill=(20, 16, 12, 255), font=font)
    preview = crop.resize((720, 720), Image.Resampling.NEAREST)
    board.alpha_composite(preview, (pad, pad + cell + label_h))
    draw.text((pad, pad + cell + label_h + 720), "1024 px crop", fill=(20, 16, 12, 255), font=font)
    board.convert("RGB").save(destination, "PNG")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    bounds = symbol_bounds(source)
    mark = extract_mark(source, bounds)
    mark.save(OUT / "mark.png")
    background = source.getpixel((8, 8))
    master = square_icon(mark, 1024, background)
    master.save(OUT / "icon-1024.png")
    icons = [square_icon(mark, size, background) for size in SIZES]
    for icon in icons:
        icon.save(OUT / f"icon-{icon.width}.png")
    write_ico(icons, OUT / "icon.ico")
    overview(icons, master, OUT / "icon-overview.png")
    print("bounds", bounds, "mark", mark.size, "background", background)


if __name__ == "__main__":
    main()
