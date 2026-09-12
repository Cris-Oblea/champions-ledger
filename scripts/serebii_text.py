"""Lossless reading and mojibake repair for the cached Serebii pages.

Serebii serves cp1252, but some spans arrive already double-encoded on their
side: Triple Axel's em dash is stored as the UTF-8 bytes of "a EUR ..." -- the
classic mojibake of U+2014 -- rather than as cp1252 0x97.

Reading such a page as cp1252 with errors="replace" makes that unrecoverable,
because cp1252 leaves 0x81/0x8D/0x8F/0x90/0x9D undefined and those bytes are
exactly the ones carrying the lost information. So:

    read()        decodes cp1252 without ever dropping a byte
    unmojibake()  undoes any encode/decode round-trips left in the text

Both are safe on clean text: unmojibake() only rewrites a string when the
round-trip actually succeeds, which normal cp1252 prose never does (a lone
0xE9 for "e-acute" is not valid UTF-8).
"""
import codecs

_NAME = "serebii"


def _handler(err):
    """Map the five bytes cp1252 leaves undefined to U+0080-U+009F, both ways.

    That keeps the decode reversible, which is what lets unmojibake() re-encode
    the string and try reading it as UTF-8.
    """
    if isinstance(err, UnicodeDecodeError):
        return ("".join(chr(b) for b in err.object[err.start:err.end]), err.end)
    if isinstance(err, UnicodeEncodeError):
        chunk = err.object[err.start:err.end]
        if all(0x80 <= ord(c) <= 0x9F for c in chunk):
            return (bytes(ord(c) for c in chunk), err.end)
    raise err


codecs.register_error(_NAME, _handler)


def unmojibake(s, rounds=3):
    """Undo cp1252/UTF-8 round-trips, however many times they were applied."""
    for _ in range(rounds):
        try:
            t = s.encode("cp1252", _NAME).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
        if t == s:
            return s
        s = t
    return s


def read(path):
    """Read a cached Serebii page as text, losing nothing."""
    with open(path, "rb") as f:
        return f.read().decode("cp1252", _NAME)
