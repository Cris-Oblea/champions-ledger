/* NOTHING PAINTED ON TOP OF ANYTHING ELSE.
 *
 * An icon drawn over the text being typed, in every search box, is the kind
 * of bug only a person looking at a phone finds - so there is a check for
 * the whole class, not just for that one bug.
 *
 * TWO HALVES, BECAUSE NEITHER IS ENOUGH ON ITS OWN.
 *
 *   The ALGORITHM is tested here. jsdom lays nothing out - every rectangle it
 *   reports is zero - so a test that swept the real app under jsdom would find
 *   nothing and pass while the screen was wrong, which is worse than no test.
 *   Instead the sweep is fed rectangles this file controls, and asked to find
 *   a planted collision, to ignore the cases that only look like one, and to
 *   stay linear.
 *
 *   The LAYOUT is checked on the device, by the button this adds to the
 *   diagnostics panel: "Check every screen for overlaps". That is the half
 *   that knows what a real browser did, and it is one tap on the phone where
 *   the bug was found.
 */
const { describe } = require("node:test");
const { check, open, idle } = require("./harness.js");

/* No ledger: this exercises one pure function. */
const { dom, errs } = open();
const w = dom.window, d = w.document;

/* A fake view whose boxes report exactly the rectangles we say they do. */
function view(boxes){
  const v = d.createElement("div");
  boxes.forEach(b => {
    const host = b.parent || v;
    const e = d.createElement(b.tag || "span");
    e.className = b.cls || "";
    /* jsdom resolves this app's border shorthand to 16px, which would make a
       field's content box collapse - so the fixture states the box it means
       rather than leaning on jsdom's CSS. */
    if (b.style) e.setAttribute("style", b.style);
    /* a fixture that cannot express "out of the flow" cannot test the rule
       that treats it differently */
    if (b.fixed) e.style.position = "fixed";
    e.textContent = b.text === undefined ? "x" : b.text;
    e.getBoundingClientRect = () => ({
      left:b.l, top:b.t, right:b.l + b.w, bottom:b.t + b.h,
      width:b.w, height:b.h
    });
    host.appendChild(e);
    b.el = e;
  });
  v.getBoundingClientRect = () => ({left:0,top:0,right:1000,bottom:1000,
                                    width:1000,height:1000});
  return v;
}

(async () => {
  await idle();
  const sweep = w.overlapSweep;
  describe("the overlap sweep", () => {
    check("the app exposes it", typeof sweep, "function");

    /* THE BUG IT WAS WRITTEN FOR: an icon drawn on top of the text beside it. */
    let r = sweep(view([
      {tag:"svg", cls:"icon", l:9, t:10, w:16, h:16, text:""},
      {cls:"text", l:2,  t:8,  w:300, h:20, text:"Search 345 forms"}
    ]));
    check("it finds the icon over the text", r.hits.length, 1);
    check("and names both", /icon/.test(r.hits[0]) && /text/.test(r.hits[0]), true);
    /* An icon paints without carrying a word, so svg AND img have to count -
       otherwise the very bug this was written for slips through. */
    r = sweep(view([
      {tag:"img", cls:"pic", l:9, t:10, w:16, h:16, text:""},
      {cls:"text", l:2, t:8, w:300, h:20, text:"Miracle Seed"}
    ]));
    check("and an <img> on top counts the same", r.hits.length, 1);

    /* A FIELD PAINTS ITS VALUE, and `value` is not `textContent` - so without
       a rule for it an <input> is never a box, and the sweep reports "nothing
       overlaps" with the icon sitting squarely on the text. (Planting a known
       bug back and watching the tool is how such a hole shows.) */
    r = sweep(view([
      {tag:"svg", cls:"icon", l:9, t:10, w:16, h:16, text:""},
      {tag:"input", cls:"field", l:2, t:8, w:300, h:24, text:"",
       style:"padding:9px 11px;border-width:1px"}
    ]));
    check("an icon over an <input> counts too", r.hits.length, 1);

    /* FIXED: the text now starts past the icon. */
    r = sweep(view([
      {cls:"icon", l:9,  t:10, w:16, h:16, text:""},
      {cls:"text", l:34, t:8,  w:300, h:20, text:"Search 345 forms"}
    ]));
    check("and does not complain once there is room", r.hits.length, 0);

    /* NOT a collision: boxes that merely touch. Layout kisses all the time and
       a check that shouts about it is a check that gets turned off. */
    r = sweep(view([
      {cls:"a", l:0,  t:0, w:100, h:20},
      {cls:"b", l:99, t:0, w:100, h:20}
    ]));
    check("it ignores a one-pixel touch", r.hits.length, 0);

    /* NOT a collision: one inside the other. Every nested box overlaps its
       parent by definition, which is what makes the naive version useless. */
    const outer = d.createElement("div");
    outer.getBoundingClientRect = () => ({left:0,top:0,right:200,bottom:40,
                                          width:200,height:40});
    r = sweep(view([
      {cls:"child", parent:outer, l:10, t:10, w:50, h:20}
    ]));
    check("it ignores nesting", r.hits.length, 0);

    /* Stacked rows, the normal case: 200 boxes, none overlapping. This is also
       what proves the sweep is not quadratic - the naive loop froze a real
       renderer on this shape. */
    const rows = [];
    for (let i = 0; i < 200; i++) rows.push({cls:"r", l:0, t:i*30, w:300, h:20});
    const t0 = Date.now();
    r = sweep(view(rows));
    const ms = Date.now() - t0;
    check("200 stacked rows: no overlaps", r.hits.length, 0);
    check("and it counts them all", r.boxes, 200);
    check("in linear time (<150ms)", ms < 150, true);

    /* One bad row hidden among good ones still gets found. */
    const many = rows.slice(0, 60);
    many.push({cls:"intruder", l:20, t:31, w:120, h:16});
    r = sweep(view(many));
    check("it finds one bad among 60 good", r.hits.length, 1);
    check("and says which", /intruder|\.r/.test(r.hits[0]), true);

    /* A FLOATING LAYER IS NOT A FAULT - BUT IT IS NOT HIDDEN EITHER.

       The "+" button floats over the list below 900px on purpose, and the page
       scrolls out from under it. Counting that as a fault would put a
       permanent "1 overlap" on HOME and Builds, and a check that cries wolf is
       a check that gets turned off.

       The danger in that exception is going blind. So the case is pinned from
       both ends: it must NOT be a hit, and it MUST still be reported. */
    r = sweep(view([
      {cls:"row", l:0, t:0, w:300, h:60, text:"115"},
      {cls:"fab", l:200, t:20, w:110, h:44, text:"+ New build", fixed:true}
    ]));
    check("the floating button does not count as a fault", r.hits.length, 0);
    check("but IS reported apart", r.floating.length, 1);
    check("and names both",
       /fab/.test(r.floating[0]) && /row/.test(r.floating[0]), true);

    /* Two floating layers fighting over one corner is nobody's design. */
    r = sweep(view([
      {cls:"toast", l:200, t:20, w:110, h:44, text:"saved", fixed:true},
      {cls:"fab", l:210, t:24, w:110, h:44, text:"+ New", fixed:true}
    ]));
    check("two floating layers on each other IS a fault", r.hits.length, 1);

    /* And the one it was written for must survive the new rule: neither of
       those is out of the flow, so it stays a hit. */
    r = sweep(view([
      {tag:"svg", cls:"icon", l:9, t:10, w:16, h:16, text:""},
      {cls:"text", l:2,  t:8,  w:300, h:20, text:"Search 345 forms"}
    ]));
    check("and the original bug is still a fault", r.hits.length, 1);
  });

  check("the page reports no script error", errs.join(" | ") || "none", "none");
})();
