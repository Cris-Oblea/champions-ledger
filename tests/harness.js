/* The deployed page is five files now, and JSDOM is handed one string.
 *
 * dist/index.html is a 51 KB shell that points at four hashed assets - the app,
 * the dex, the Smogon engine and supabase-js - so that a nightly dex refresh
 * re-downloads 347 KB instead of all 1,314. Splitting them is a DELIVERY
 * decision; the program is the same one, and the tests must keep exercising the
 * thing that ships rather than a convenient copy of it.
 *
 * So this puts the assets back exactly where they were. That matters twice
 * over: JSDOM will not fetch relative script srcs out of a string, and three of
 * the tests (consistencytest, learnsettest, profiletest) GREP this string for
 * the app's own source - duplicate declarations, whether `vp_balance` is still
 * written. Handed the bare shell they would have passed by finding nothing,
 * which is the worst way for a check to fail.
 */
const fs = require("fs");
const path = require("path");

function page(root) {
  const dist = path.join(root, "tracker", "dist");
  let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, function (m, name) {
    const body = fs.readFileSync(path.join(dist, name), "utf8");
    /* </ has to be escaped on the way back in, or a literal </script> inside
       the code ends the tag early - the same reason the build escapes it. */
    return '<script id="' + name.split(".")[0] + '">'
           + body.replace(/<\//g, "<\/") + "</script>";
  });
  /* The real library would load over each harness's stub and every test would
     read an empty ledger. */
  return html.replace(/<script id="vendor-supabase">[\s\S]*?<\/script>/, "");
}

/* The app's own SOURCE, as a person edits it: the numbered parts under
 * tracker/src/, in the order the build reads them.
 *
 * Three assertions in these tests are about the source and not about
 * behaviour - a `var` declared twice, a table read behind the back of its one
 * accessor, a column the app must never write. They used to grep page(), which
 * worked while the page was the parts concatenated verbatim. It is a linked
 * bundle now, and a bundler is entitled to reformat a two-line `if` into one
 * and to RENAME a name that two modules both declare - so those greps would
 * have gone quietly wrong rather than failed. They read this instead, which is
 * the text the fault would actually be written in.
 *
 * The generated `_legacy.js` and `_entry.js` are deliberately not included:
 * they are output, and a smell found in one of them was written elsewhere.
 */
function source(root) {
  const src = path.join(root, "tracker", "src");
  return fs.readdirSync(src)
    .filter(f => /^\d/.test(f) && f.endsWith(".js")).sort()
    .map(f => fs.readFileSync(path.join(src, f), "utf8")).join("");
}

module.exports = { page, source };
