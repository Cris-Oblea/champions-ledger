#!/usr/bin/env python3
"""Inline tracker/data.js into tracker/index.template.html -> tracker/index.html.

An artifact is a single page: nothing external is served alongside it, so the
reference blob has to travel inside the file.  Keeping the two apart on disk is
what lets a source refresh regenerate the data without touching the app code.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, "tracker", "index.template.html")
DATA = os.path.join(ROOT, "tracker", "data.js")
CFG = os.path.join(ROOT, "tracker", "config.local.json")
OUT = os.path.join(ROOT, "tracker", "index.html")
DIST = os.path.join(ROOT, "tracker", "dist")
SRC = os.path.join(ROOT, "tracker", "src")
MARK = "/*__CHAMP_DATA__*/"
# Filled in during the build, read when the headers are written:
# only the Supabase URL, and only so the CSP names the same host.
BUILT = {}
CMARK = "/*__CHAMP_CONFIG__*/"
EMARK = "/*__CHAMP_ENGINE__*/"
ENGINE = os.path.join(ROOT, "tracker", "engine.bundle.js")
# supabase-js used to be a <script src> pointing at jsDelivr. It is inlined from
# node_modules now, which is the same 213 KB the browser downloaded either way -
# what changes is who can alter it. A CDN file is a third party in the runtime of
# a page that holds the whole ledger behind a login; SRI would have caught a
# tampered copy but leaves the dependency, and leaves a hash to keep in sync with
# a version by hand. From node_modules the lockfile pins the version, Dependabot
# moves it, and the CSP loses its last third-party origin.
SBMARK = "/*__CHAMP_SUPABASE__*/"
SBJS = os.path.join(ROOT, "node_modules", "@supabase", "supabase-js",
                    "dist", "umd", "supabase.js")
SMARK = "/*__CHAMP_STYLE__*/"
KMARK = "<!--__CHAMP_MARKUP__-->"
AMARK = "/*__CHAMP_APP__*/"


def assemble(tpl):
    """Put tracker/src/ back together into the single page it has to be.

    The app was one 7,269-line file, which is not a file anyone can hold in
    their head: two views a thousand lines apart shared a helper and nothing
    said so, and every edit meant scrolling past nine other screens to reach
    the one being changed. It is one page at RUNTIME for a good reason - an
    artifact serves exactly one file - but that is a delivery constraint, not
    a way to write it.

    So the pieces live under tracker/src/ and are concatenated here, in the
    order their number prefixes give. That order is the file's original order
    and it matters: function declarations hoist, but the statements at the end
    of 13-boot.js wire up a DOM the markup above has to have produced first.

    Nothing here transforms the source - it is concatenation and nothing else,
    so a line in a part is that same line in the page and a stack trace still
    points at real code.
    """
    for m in (SMARK, KMARK, AMARK):
        if m not in tpl:
            sys.exit("the shell lost its %s marker" % m)
    css = open(os.path.join(SRC, "style.css"), encoding="utf-8").read()
    markup = open(os.path.join(SRC, "markup.html"), encoding="utf-8").read()
    parts = sorted(f for f in os.listdir(SRC) if f.endswith(".js"))
    if not parts:
        sys.exit("tracker/src/ has no .js parts - the app would build empty")
    app = "".join(open(os.path.join(SRC, f), encoding="utf-8").read()
                  for f in parts)
    print("  app: %d parts, %d lines" % (len(parts), app.count(chr(10))))
    tpl = tpl.replace(SMARK, css.rstrip(chr(10)))
    tpl = tpl.replace(KMARK, markup.rstrip(chr(10)))
    return tpl.replace(AMARK, app.rstrip(chr(10)))


def config_js():
    """The Supabase endpoint, or nothing.

    The publishable key belongs in the page: the browser needs it to speak to
    PostgREST at all, and Supabase publishes it for exactly that. What keeps
    the data private is Row Level Security plus the sign-in, not hiding this
    string. A secret / service_role key must NEVER end up here - it bypasses
    RLS, and this file is meant to be served to anyone.
    """
    # CI has no config.local.json - it is gitignored, because it is per
    # machine. Without a fallback the build would quietly succeed and deploy a
    # page with CHAMP_CONFIG = {}, i.e. the app with its ledger disconnected.
    # Silent, and worse than failing. Environment first, then the file.
    env_url = os.environ.get("SUPABASE_URL")
    env_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if env_url and env_key:
        c = {"url": env_url, "publishableKey": env_key,
             "loginEmail": os.environ.get("SUPABASE_LOGIN_EMAIL", "")}
        print("  Supabase: from the environment")
    elif not os.path.exists(CFG):
        print("  no tracker/config.local.json - building the Claude-db version")
        return "window.CHAMP_CONFIG = {};"
    else:
        c = json.load(open(CFG, encoding="utf-8"))
    for k in ("url", "publishableKey"):
        if not c.get(k):
            sys.exit("config.local.json is missing %s" % k)
    for k, v in c.items():
        s = str(v)
        if "service_role" in s or s.startswith("sb_secret"):
            sys.exit("config.local.json holds a SECRET key (%s). Remove it and "
                     "rotate that key - it must never be built into the page." % k)
    print("  Supabase: %s" % c["url"])
    # Remembered for the Content-Security-Policy. The policy has to name the exact
    # host the page was built to talk to, and resolving it twice is how the two
    # would drift: the day the project URL moves, a second copy keeps pointing at
    # the old one and the app looks broken with no error, just a blocked request.
    BUILT["supabase"] = c["url"]
    return "window.CHAMP_CONFIG = " + json.dumps(
        {"supabase": {"url": c["url"], "key": c["publishableKey"],
                      "email": c.get("loginEmail", "")}},
        ensure_ascii=False) + ";"


def headers(supabase_url):
    """What the page may load, and above all where it may SEND.

    Derived from the page's measured surface, not guessed:
      - one external script, supabase-js from jsDelivr
      - the IBM Plex stylesheet from fonts.googleapis.com, its files from
        fonts.gstatic.com
      - Supabase over https for REST and auth, and over wss for realtime
      - a same-origin fetch of the page itself, which is how the search view
        probes whether it is online
      - photographs held as data:/blob: while a box scan is confirmed
    Nothing in tracker/src/ or the vendored engine uses eval or new Function -
    both checked - so no 'unsafe-eval' is needed.

    `script-src` does carry 'unsafe-inline', and that is the price of the single
    page: the whole app is inline, so there is no origin to allow instead. A hash
    per block was considered and rejected - five of them, recomputed every build,
    where one whitespace difference serves a blank screen.

    That trade is fair because the attack this closes is not inline script, it is
    exfiltration. The page holds the entire ledger behind a login, and the one
    piece of code on it that nobody here wrote is fetched from a CDN. `connect-src`
    means a tampered supabase.js can read the ledger and has nowhere to send it:
    one Supabase project, and the page's own origin.
    """
    csp = [
        "default-src 'self'",
        # no third-party origin at all: supabase-js is inlined from
        # node_modules, so the only script on the page is the page
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "object-src 'none'",
        "base-uri 'none'",
        # there is exactly one real <form> on the page, the login
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
    send = ["'self'"]
    if supabase_url:
        host = supabase_url.rstrip("/")
        send += [host, "wss://" + host.split("://", 1)[-1]]
    else:
        # the Claude-db build has no Supabase host to allow, and saying so beats
        # shipping a policy that quietly permits nothing
        print("  CSP: no Supabase host - connect-src is same-origin only")
    csp.insert(1, "connect-src " + " ".join(send))
    open(os.path.join(DIST, "_headers"), "w", encoding="utf-8").write(
        "/*\n"
        "  X-Content-Type-Options: nosniff\n"
        "  Referrer-Policy: no-referrer\n"
        "  X-Frame-Options: DENY\n"
        "  Content-Security-Policy: " + "; ".join(csp) + "\n")


def main():
    if not os.path.exists(DATA):
        sys.exit("tracker/data.js is missing - run scripts/build_tracker_data.py")
    tpl = assemble(open(TPL, encoding="utf-8").read())
    for m in (MARK, CMARK, EMARK, SBMARK):
        if m not in tpl:
            sys.exit("the template lost its %s marker" % m)
    data = open(DATA, encoding="utf-8").read()
    # a literal </script> inside either blob would end the tag early
    if not os.path.exists(SBJS):
        # Never fall back to the CDN: a page that silently reaches out again is
        # the one thing this change exists to prevent.
        sys.exit("supabase-js is not installed - run `npm ci`. Looked in %s"
                 % SBJS)
    if not os.path.exists(ENGINE):
        sys.exit("tracker/engine.bundle.js is missing - run "
                 "scripts/build_engine_bundle.py")
    engine = open(ENGINE, encoding="utf-8").read()
    print("  engine bundle: %.0f KB" % (len(engine) / 1024))
    import datetime
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    tpl = tpl.replace("/*__CHAMP_BUILD__*/",
                      "window.CHAMP_BUILD = %r;" % stamp)
    out = tpl.replace(EMARK, engine.replace("</", r"<\/"))
    sbjs = open(SBJS, encoding="utf-8").read()
    out = out.replace(SBMARK, sbjs.replace("</", r"<\/"))
    out = out.replace(CMARK, config_js().replace("</", r"<\/"))
    out = out.replace(MARK, data.replace("</", r"<\/"))
    open(OUT, "w", encoding="utf-8").write(out)
    print("wrote %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
    build_dist(out)


def standalone(html):
    """Wrap the artifact-shaped fragment into a real HTML document.

    The Claude artifact viewer supplies the skeleton - doctype, charset,
    viewport and a small reset - so the published file is written without one.
    Served from anywhere else that skeleton is simply absent, and three things
    break at once:

      * no <meta charset>: the browser guesses, and every em dash, ×, ·, → and
        the ellipsis in "Signing in..." renders as mojibake
      * no <meta viewport>: the phone lays the page out at desktop width
      * no [hidden]{display:none!important}: the UA default loses to any author
        rule that sets display, so .sheetfoot stays visible when hidden is set

    Everything up to the first </style> is head material; the rest is body.
    """
    cut = html.index("</style>") + len("</style>")
    head, body = html[:cut], html[cut:]
    return (
        "<!doctype html>\n"
        '<html lang="en">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,'
        'viewport-fit=cover">\n'
        '<meta name="color-scheme" content="light dark">\n'
        "<style>html{color-scheme:light dark}body{margin:0}"
        "img{max-width:100%}[hidden]{display:none!important}</style>\n"
        + head + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")


def build_dist(html):
    """tracker/dist/ is the ONLY directory that may be deployed.

    tracker/ holds config.local.json, the template, and - whenever
    anyone has left a supabase_seed.sql there - every Pokemon and every build
    in plaintext. Nothing generates one any more, but the reasoning stands and
    applies equally to a backup snapshot dropped in the wrong place: serving
    the folder would put the whole ledger on a public URL and undo the Row
    Level Security it took to keep it private. The deploy
    target is built from scratch here and contains nothing that was not put in
    deliberately.
    """
    import shutil
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    open(os.path.join(DIST, "index.html"), "w",
         encoding="utf-8").write(standalone(html))

    manifest = {
        "name": "Champions Ledger",
        "short_name": "Ledger",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#0A1012",
        "theme_color": "#0A1012",
        # the two purposes are declared separately on purpose: a maskable
        # icon is drawn to be CROPPED to the system shape, so offering the
        # same file as "any" lets a browser show the cropped-for design
        # uncropped, and the other way round eats the mark.
        "icons": ([{"src": "icon-%d.png" % s, "sizes": "%dx%d" % (s, s),
                    "type": "image/png", "purpose": "any"} for s in (192, 512)]
                  + [{"src": "icon-%d.png" % s, "sizes": "%dx%d" % (s, s),
                      "type": "image/png", "purpose": "maskable"}
                     for s in (192, 512)]),
    }
    with open(os.path.join(DIST, "manifest.webmanifest"), "w",
              encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    icons()

    # belt and braces: nothing may reach dist/ that was not written above
    allowed = {"index.html", "manifest.webmanifest", "icon-192.png",
               "icon-512.png", "apple-touch-icon.png", "_headers"}
    stray = set(os.listdir(DIST)) - allowed
    if stray:
        sys.exit("dist/ picked up unexpected files: %s" % sorted(stray))

    headers(BUILT.get("supabase"))

    total = sum(os.path.getsize(os.path.join(DIST, f))
                for f in os.listdir(DIST))
    print("wrote %s  (%d files, %.0f KB) - this is the deploy directory"
          % (DIST, len(os.listdir(DIST)), total / 1024))


TEAL = (51, 192, 173, 255)
INK = (8, 22, 24, 255)
AMBER = (224, 164, 76, 255)


def icons():
    """The mark: a dark C-ring on full teal, with one amber slot in its gap.

    History, so neither mistake comes back. v1 drew a dark frame on the app's
    near-black ground: on a phone home screen that is an invisible black
    square, and the player reported the app as having "no icon". v2 went full
    bleed and readable, but the mark was three plain rounded rectangles, which
    he then called "un icono generico feo" (2026-09-11) - correct, it looked
    like any storage app.

    Three rules it follows now:

      * FULL BLEED and light. Teal ground, dark ink, so it reads against any
        wallpaper at launcher size.
      * The mark lives in the central 80%, the maskable safe zone. Android
        crops a maskable icon to a circle, squircle or teardrop, and anything
        on that line gets eaten.
      * It is a GLYPH, not a diagram. A C-ring is one shape the eye resolves
        at 48px; the amber slot in the gap is the app's own accent for "open",
        the same colour the box list uses for a slot that is not yours yet.
    """
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  (no PIL - skipping icons; the manifest will 404 on them)")
        return
    # drawn at 4x and downsampled: PIL has no antialiasing on arcs or
    # rounded rectangles, and at 192px the jaggies are plainly visible
    SS = 4
    for size in (192, 512, 180):
        S = size * SS
        img = Image.new("RGBA", (S, S), TEAL)
        d = ImageDraw.Draw(img)
        safe = S * 0.8
        cx = cy = S / 2
        r = safe * 0.40                    # ring radius, centre of the stroke
        t = safe * 0.17                    # stroke thickness
        box = [cx - r, cy - r, cx + r, cy + r]
        # open to the RIGHT, which is what makes it read as a C rather than an
        # O; the gap is wide enough to survive the downsample
        d.arc(box, start=38, end=322, fill=INK, width=int(t))
        # the open slot, sitting in the gap on the ring's own centre line
        sq = safe * 0.215
        sx, sy = cx + r, cy
        d.rounded_rectangle([sx - sq / 2, sy - sq / 2, sx + sq / 2, sy + sq / 2],
                            radius=sq * 0.28, fill=AMBER)
        img = img.resize((size, size), Image.LANCZOS)
        name = "apple-touch-icon.png" if size == 180 else "icon-%d.png" % size
        if size == 180:
            img = img.convert("RGB")       # iOS wants no alpha channel
        img.save(os.path.join(DIST, name))


if __name__ == "__main__":
    main()
