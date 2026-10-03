"""The one way a script downloads anything.

Every source here drops a request now and then (a timeout, a 502, a reset), so
each fetcher used to carry its own copy of the same three-try loop and its own
copy of the browser User-Agent. They live here once:

    body = net.get(url)                    # bytes, after up to three tries
    try:
        body = net.get(url)
    except net.ERRORS as e:                # what the last try raised
        ...

A caller that can carry on without the page catches net.ERRORS; one that
cannot lets it propagate, which stops the stage with the real error.
"""
import http.client
import time
import urllib.request

# A browser's, because the scraped sites are built for browsers; the APIs
# (GitHub, PokeAPI) accept anything.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")

# URLError and HTTPError are OSErrors; ValueError is a body under min_size.
ERRORS = (OSError, http.client.HTTPException, ValueError)


def get(url, *, data=None, headers=None, timeout=60, min_size=0):
    """The response body; `data` makes it a POST. A body shorter than
    `min_size` is an error page rather than the page asked for, so it fails
    and is retried like a timeout. Two failures are waited out (1.5 s, 3 s);
    the third is raised."""
    req = urllib.request.Request(url, data=data,
                                 headers={"User-Agent": UA, **(headers or {})})

    def once():
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
        if len(body) < min_size:
            raise ValueError("%d bytes, an error page" % len(body))
        return body

    for pause in (1.5, 3):
        try:
            return once()
        except ERRORS:
            time.sleep(pause)
    return once()


def text(url, **kw):
    """get() read as UTF-8, for an HTML or CSS page: a byte that is not UTF-8
    becomes U+FFFD instead of failing the whole page."""
    return get(url, **kw).decode("utf-8", "replace")
