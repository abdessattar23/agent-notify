#!/usr/bin/env python3
"""Write Agent Notify PNG icons without extra Python dependencies."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

INK = (16, 33, 28, 255)
PANEL = (28, 61, 52, 255)
SIGNAL = (214, 255, 74, 255)
FOAM = (243, 255, 246, 255)
CLEAR = (0, 0, 0, 0)


def inside_bell(nx: float, ny: float) -> bool:
    """nx, ny are in -1..1 with +y downward."""
    handle = abs(nx) < 0.05 and -0.58 < ny < -0.42
    cap = abs(nx) < 0.12 and -0.46 < ny < -0.38
    dome = ((nx / 0.28) ** 2) + (((ny + 0.08) / 0.34) ** 2) <= 1 and ny < 0.18
    # Flared mouth: a wide rounded bar near the bottom of the dome.
    mouth = abs(ny - 0.22) < 0.07 and abs(nx) < 0.36 + 0.04 * math.cos(nx * 6)
    clapper = (nx**2 + (ny - 0.36) ** 2) ** 0.5 < 0.07
    return handle or cap or dome or mouth or clapper


def pixel(x: int, y: int, size: int, maskable: bool) -> tuple[int, int, int, int]:
    nx = (x / (size - 1)) * 2 - 1
    ny = (y / (size - 1)) * 2 - 1
    radius = math.hypot(nx, ny)

    if maskable:
        if radius > 0.92:
            return INK
        if radius > 0.78:
            return PANEL
    else:
        if radius > 0.90:
            return CLEAR
        if radius > 0.82:
            return PANEL

    if inside_bell(nx, ny):
        return SIGNAL
    return INK


def write_png(path: Path, size: int, maskable: bool = False) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel(x, y, size, maskable))
    compressed = zlib.compress(bytes(raw), 9)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    path.write_bytes(
        b"".join(
            [
                b"\x89PNG\r\n\x1a\n",
                chunk(b"IHDR", ihdr),
                chunk(b"IDAT", compressed),
                chunk(b"IEND", b""),
            ]
        )
    )


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def main() -> None:
    out = Path("public/icons")
    out.mkdir(parents=True, exist_ok=True)
    write_png(out / "icon-192.png", 192)
    write_png(out / "icon-512.png", 512)
    write_png(out / "apple-touch-icon.png", 180)
    write_png(out / "icon-maskable-512.png", 512, maskable=True)
    print(f"Wrote icons to {out}")


if __name__ == "__main__":
    main()
