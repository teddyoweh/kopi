"""A Write call's document, read while the model is still generating it.

With partial messages on, the SDK streams a tool call's input as fragments of JSON text
('{"file_path": "…", "content": "# Bid pl', 'an\\n\\n## Why…'). `PartialWrite` takes those
fragments and gives back the document's text as it grows. It decodes the JSON string by hand,
because the input is never valid JSON until the call is complete, and it never releases half
an escape: a fragment can end in the middle of `\\n` or `\\u00e9`, or between the two halves of
a surrogate pair.
"""

from __future__ import annotations

import json
import re

FILE_PATH = re.compile(r'"file_path"\s*:\s*("(?:[^"\\]|\\.)*")')
CONTENT = re.compile(r'"content"\s*:\s*"')
SIMPLE_ESCAPES = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}


class PartialWrite:
    def __init__(self) -> None:
        self.raw = ""
        self.file_path: str | None = None
        self._start: int | None = None  # where the content string's characters begin in `raw`
        self._pos = 0  # how far into `raw` the content has been decoded
        self._closed = False

    def feed(self, fragment: str) -> str:
        """Take the next fragment; return the content decoded since the last call ('' if none yet)."""
        self.raw += fragment
        if self.file_path is None and (found := FILE_PATH.search(self.raw)):
            self.file_path = json.loads(found.group(1))
        if self._start is None and (found := CONTENT.search(self.raw)):
            self._start = self._pos = found.end()
        if self._start is None or self._closed:
            return ""
        text, self._pos, self._closed = decode(self.raw, self._pos)
        return text


def decode(raw: str, pos: int) -> tuple[str, int, bool]:
    """Decode a JSON string body from `pos` as far as is safe; (text, new position, string closed)."""
    out: list[str] = []
    end = len(raw)
    while pos < end:
        char = raw[pos]
        if char == '"':
            return "".join(out), pos + 1, True
        if char != "\\":
            out.append(char)
            pos += 1
            continue
        if pos + 1 >= end:
            break
        kind = raw[pos + 1]
        if kind in SIMPLE_ESCAPES:
            out.append(SIMPLE_ESCAPES[kind])
            pos += 2
            continue
        if kind != "u":
            out.append(kind)  # not valid JSON; keep the character rather than stall the stream
            pos += 2
            continue
        code, used = unicode_escape(raw, pos)
        if code is None:
            break
        out.append(code)
        pos += used
    return "".join(out), pos, False


def unicode_escape(raw: str, pos: int) -> tuple[str | None, int]:
    """`\\uXXXX` at `pos`, joined with its low surrogate when it is a high one; (None, 0) until complete."""
    unit = raw[pos + 2 : pos + 6]
    if len(unit) < 4:
        return None, 0
    high = int(unit, 16)
    if not 0xD800 <= high <= 0xDBFF:
        return chr(high), 6
    tail = raw[pos + 6 : pos + 12]
    if len(tail) < 6:
        return None, 0
    if tail.startswith("\\u"):
        low = int(tail[2:], 16)
        if 0xDC00 <= low <= 0xDFFF:
            return chr(0x10000 + ((high - 0xD800) << 10) + (low - 0xDC00)), 12
    return "�", 6
