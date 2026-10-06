/* The DOM helpers every screen builds with: $, el, the toast, a note, a
   footer button, the search box with its clear button, and the ones every
   switch and sheet shares - setPressed, pressOnly, showPane, resetHost.
   No screen logic: anything here must be true of every screen. */

/* ===================================================================== util */
function $(id){ return document.getElementById(id); }
/* $ for a control read by its value or switched off: an input, a select, a
   textarea or a button. The same element; only its type says so. */
function field(id){ return /** @type {HTMLInputElement} */ ($(id)); }
/* Every element matching a selector, as an array. */
function $$(sel){
  return /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll(sel)));
}
/* The one way the UI makes an element: a tag, its classes, its text.
   Text goes through textContent, so a scraped string is never parsed as
   markup. */
function el(tag, cls, txt){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
/* The one-line message at the bottom of the screen. Its time on screen
   grows with its length, so a long one can be read before it goes. */
let toastT = null;
/* A short message along the bottom, kept on screen longer the longer it is. */
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  /* restart the entrance animation, otherwise a second toast inside the
     window just swaps the text with no sign anything happened */
  t.hidden = true; t.getBoundingClientRect(); t.hidden = false;
  clearTimeout(toastT);
  const ms = Math.min(7000, Math.max(2600, 1200 + msg.length * 55));
  toastT = setTimeout(function(){ t.hidden = true; }, ms);
}

/* ------------------------------------------------------ nothing cut silently
   NO LIST MAY SHOW FEWER ROWS THAN IT HAS WITHOUT SAYING SO. A cap is
   sometimes right - 512 move rows is too many to draw on a phone - but a cap
   nobody can see looks exactly like a Pokemon that does not learn the move.
   Every capped list calls this, so it is said in the same words everywhere.
   Returns the note, or null when nothing was cut. */
function capNote(host, shown, total, what){
  if (shown >= total) return null;
  const n = el("div", "sub mt6 mb0");
  n.textContent = "Showing " + shown + " of " + total + " " + what +
                  " — type above to narrow the list.";
  host.appendChild(n);
  return n;
}

/* EVERY LIST GETS A SEARCH BOX: a list built in JS calls searchField(), and
   one written in the markup is wired by wireClears(). Both end in addClear().

   The clear button is our own rather than `type=search`'s: the native one is
   drawn by the browser inside our border, Safari hides it once the field is
   restyled, and a filter you cannot empty in one tap is one you stop using. */
function addClear(wrap, inp){
  if (!wrap || !inp || wrap.querySelector(".clr")) return;
  const clr = el("button", "clr", "×");
  clr.type = "button";
  clr.title = "Clear";
  clr.setAttribute("aria-label", "Clear the filter");
  wrap.appendChild(clr);
  /* The clear button shows only while there is text to clear. */
  function paint(){ wrap.classList.toggle("has", !!inp.value); }
  /* WRAPS whatever handler is already on the field rather than replacing it.
     The seven boxes written straight into the markup are wired in boot.js,
     and this pass runs over them afterwards - taking `oninput` would have
     silently unwired all seven. */
  const prev = inp.oninput;
  inp.oninput = function(e){ paint(); if (prev) prev.call(inp, e); };
  clr.onclick = function(e){
    /* guarded: a test, or any code, may call this handler directly */
    if (e) { e.preventDefault(); e.stopPropagation(); }
    inp.value = "";
    /* through the field's own handler, so the list redraws exactly as it does
       for a keystroke - there is no second code path to keep in step */
    if (inp.oninput) inp.oninput(e);
    inp.focus();
  };
  paint();
}

/* Every search box written straight into the markup gets the same clear
   button, so the two ways a field can be born look identical on screen. */
function wireClears(){
  $$(".search").forEach(function(w){
    const inp = w.querySelector("input");
    if (inp) addClear(w, inp);
  });
}

/* A search box, appended to `host`: returns the input, with `.wrap` (its
   container) and `.q()` (the value, trimmed and lowercased). */
function searchField(host, placeholder, onInput){
  const wrap = el("div", "search field");
  wrap.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/>'
                 + '<path d="m20 20-3.5-3.5"/></svg>';
  const inp = el("input");
  inp.type = "text";
  inp.placeholder = placeholder || "Search";
  inp.setAttribute("aria-label", inp.placeholder);
  /* a filter box is not a name being typed for the first time - autocorrect
     and a capital letter on a phone both fight what is being typed here */
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "none");
  inp.setAttribute("autocorrect", "off");
  inp.setAttribute("spellcheck", "false");
  wrap.appendChild(inp);
  if (onInput) inp.oninput = onInput;
  addClear(wrap, inp);
  if (host) host.appendChild(wrap);
  inp.wrap = wrap;
  /* the value, lowercased and trimmed - every caller was writing this out */
  inp.q = function(){ return inp.value.trim().toLowerCase(); };
  return inp;
}

/* A button for a sheet's footer (or anywhere): label, extra classes, click. */
function fbtn(label, cls, fn){
  const b = el("button", "btn " + (cls || ""), label);
  b.onclick = fn;
  return b;
}

/* A boxed note; `kind` is its tone class ("warn", "bad", "ok"...). Takes
   HTML, so only ever pass it text the app wrote, never scraped text. */
function note(kind, html){
  const n = el("div", "note mb10 " + kind);
  n.innerHTML = html;
  return n;
}

/* The small label above a row of filter chips or a sort row - the pickers
   all use the same one. */
function filterLabel(t){
  const d = el("div", "sub mb4"); d.textContent = t;
  return d;
}

/* A toggle's state IS its aria-pressed: the stylesheet draws the pressed look
   off it and a screen reader announces it, so there is no class to keep in
   step with it. */
function setPressed(node, on){
  node.setAttribute("aria-pressed", on ? "true" : "false");
}

/* A row of toggles where exactly one is chosen: `on` pressed, its siblings
   not. */
function pressOnly(group, on){
  Array.prototype.forEach.call(group.children, function(x){
    setPressed(x, x === on);
  });
}

/* Empty a host that every sheet or editor reuses. innerHTML only clears the
   children - an expando a previous builder hung on the node (body._mode,
   body._marks) survives into the next one, which once leaked one sheet's
   "rental" choice into the next sheet's adds. Anything underscore-prefixed
   is that builder's own state, so it goes too. */
function resetHost(node){
  node.innerHTML = "";
  Object.keys(node).forEach(function(k){
    if (k.startsWith("_")) { try { delete node[k]; } catch (e) {} }
  });
  return node;
}

/* A segmented switch between panes: {key: [paneId, buttonId]}. Shows the
   chosen pane, hides the rest and presses its button - written once, so a
   switcher that gains a pane cannot forget to hide it. */
function showPane(panes, which){
  Object.keys(panes).forEach(function(k){
    $(panes[k][0]).hidden = k !== which;
    setPressed($(panes[k][1]), k === which);
  });
}

export {
  $, $$, capNote, el, fbtn, field, filterLabel, note, pressOnly, resetHost, searchField,
  setPressed, showPane, toast, wireClears,
};
