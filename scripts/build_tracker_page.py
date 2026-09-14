#!/usr/bin/env python3
"""Inline tracker/data.js into tracker/index.template.html -> tracker/index.html.

Two shapes come out of this, and the difference is delivery, not code.

`tracker/index.html` is the single page, everything inlined. That was the
original constraint - an artifact serves exactly one file - and it is still the
right answer anywhere nothing else can be served alongside it.

`tracker/dist/` is what Cloudflare gets: a 51 KB shell pointing at four hashed
assets. Same program, cached in four pieces that change at different rates, so a
nightly dex refresh costs 347 KB instead of 1,314. See split_assets().
"""
import hashlib, json, os, re, sys

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
    the one being changed. It was one page at RUNTIME because an artifact
    serves exactly one file - the deployed build splits into four cached assets
    now, and tracker/index.html keeps the inlined shape - but that is a
    delivery question, not
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
    return tpl.replace(AMARK, scope(app))


# THE APP'S PUBLIC SURFACE - the 25 names that leave the closure.
#
# Until now every top-level name in 6,403 lines was a global by accident:
# thirteen parts concatenated into one script, so `byName` and `go` and `S` sat
# on `window` beside anything else that happened to be there, and nothing
# recorded which of them were meant to be reachable. `check_app.js` existed to
# catch the collisions that arrangement invites.
#
# Wrapping the parts in one closure makes that deliberate. This list is the
# surface, and it is derived from a real consumer rather than guessed: it is
# exactly what the seventeen browser tests reach for through `window`. The
# markup needs none of it - it has no inline handlers at all, only an
# aria-controls attribute, checked.
#
# The parts still share scope WITH EACH OTHER. That is the next increment, when
# each becomes a module that says what it exports; this one stops the page
# leaking into the tab it is rendered in, and gives the later work a list of
# what may not break.
# CHAMP and SMOGON are NOT here: the tests read them, but the dex and the engine
# put them on window themselves, from their own scripts. The app only consumes
# them, so closing the app over its names never touched them.
PUBLIC = [
    "AB_SET", "CALC", "DEX", "MOVE_BY", "S", "TYPE_COLOR",
    "abilityTag", "buildLink", "buildSheet", "buildsPane", "byName",
    "closeSheet", "engineCalc", "findDetail", "go", "gtsPickMine", "learnset",
    "megasFor", "moveRowFor", "pokeSheet", "teamReport", "teamSheet",
    "teamTypes",
]


def scope(app):
    """Close the app over its own names and publish only PUBLIC.

    A name in the list that no part declares would be a ReferenceError the
    moment the page loads - the whole app, not one feature - so it is checked
    here instead. The build failing is the cheap version of that.
    """
    missing = [n for n in PUBLIC
               if not re.search(r"\b(?:function|var|let|const)\s+%s\b" % n, app)]
    if missing:
        sys.exit("PUBLIC names that nothing declares: %s" % ", ".join(missing))
    out = "(function () {" + chr(10) + app.rstrip(chr(10)) + chr(10)
    out += chr(10) + "/* the declared surface - everything else is private now */"
    out += chr(10) + "Object.assign(window, {" + chr(10)
    out += "".join("  %s: %s," % (n, n) + chr(10) for n in PUBLIC)
    out += "});" + chr(10) + "})();"
    return out


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


def headers(supabase_url, assets=()):
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
    # A hashed name can never mean anything else, so it is cached for a year
    # and never revalidated. index.html is the opposite: it is the pointer to
    # which hashes are current, so it must be re-checked on every load or a
    # new deploy stays invisible until something evicts it.
    rules = "".join("/%s\n  Cache-Control: public, max-age=31536000, immutable\n\n" % a for a in assets)
    rules += "/index.html\n  Cache-Control: no-cache\n\n/\n  Cache-Control: no-cache\n\n"
    open(os.path.join(DIST, "_headers"), "w", encoding="utf-8").write(rules +
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


# WHICH BLOCKS LEAVE THE PAGE, and why each earns its own file: they change at
# completely different rates. The dex is rewritten every night, the app when it
# is edited, the engine only when Smogon ships one, the library on a version
# bump. Inlined together they were one artifact, so a single usage number moving
# overnight made the phone re-download all 1,314 KB - engine and library
# included, neither of which had changed.
#
# The filename carries a hash of the content, so a changed file is a NEW url and
# an unchanged one is never fetched again. _headers marks those immutable, which
# is what makes the split pay: without it the browser still revalidates every
# asset on every load, and the saving is a round trip rather than a download.
#
# index.html stays small and deliberately uncached: it is the pointer saying
# which hashes are current, so it has to be allowed to change.
SPLIT = ["vendor-supabase", "engine", "dex", "app"]


def split_assets(html):
    """Move the four big inline blocks into their own files.

    -> (html carrying <script src> tags, {filename: text})
    """
    assets = {}
    for ident in SPLIT:
        open_tag = '<script id="%s">' % ident
        if open_tag not in html:
            sys.exit("the page lost its %s block - split_assets cannot run"
                     % ident)
        i = html.index(open_tag)
        j = html.index("</script>", i)
        body = html[i + len(open_tag):j]
        # The inline form escapes </ so a literal </script> inside the code
        # cannot close the tag early. A separate file has no such constraint and
        # must carry the original text, or the code is not the code any more.
        body = body.replace(r"<\/", "</")
        name = "%s.%s.js" % (
            ident, hashlib.sha256(body.encode("utf-8")).hexdigest()[:8])
        assets[name] = body
        html = (html[:i] + '<script src="%s"></script>' % name
                + html[j + len("</script>"):])
    return html, assets


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

    page, assets = split_assets(standalone(html))
    for name, text in sorted(assets.items()):
        open(os.path.join(DIST, name), "w", encoding="utf-8").write(text)
        print("  asset %-30s %6.0f KB" % (name, len(text) / 1024))
    open(os.path.join(DIST, "index.html"), "w", encoding="utf-8").write(page)

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
               "icon-512.png", "apple-touch-icon.png", "_headers"} | set(assets)
    # Every asset the page names must exist, or the deploy is a page that loads
    # nothing. That is the failure this split introduces, so it is checked here
    # rather than discovered on the phone.
    for name in assets:
        if ('src="%s"' % name) not in page:
            sys.exit("dist/%s was written but the page never references it"
                     % name)
    stray = set(os.listdir(DIST)) - allowed
    if stray:
        sys.exit("dist/ picked up unexpected files: %s" % sorted(stray))

    headers(BUILT.get("supabase"), sorted(assets))

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
