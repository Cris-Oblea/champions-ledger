/* The DOM helpers every screen builds with: $, el, the toast, a note, a
   footer button, the search box with its clear button, and the three every
   switch and sheet shares - setPressed, showPane, resetHost. */

/* ===================================================================== util */
function $(id){ return document.getElementById(id); }
function el(tag, cls, txt){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
}
let toastT = null;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  /* restart the entrance animation, otherwise a second toast inside the
     window just swaps the text with no sign anything happened */
  t.hidden = true; t.getBoundingClientRect(); t.hidden = false;
  clearTimeout(toastT);
  /* long messages need longer than short ones - 2.6s is not enough to read
     "That copy is already in the GTS, waiting for Steelix" */
  const ms = Math.min(7000, Math.max(2600, 1200 + msg.length * 55));
  toastT = setTimeout(function(){ t.hidden = true; }, ms);
}

/* ------------------------------------------------------ nothing cut silently

   NO LIST MAY SHOW FEWER ROWS THAN IT HAS WITHOUT SAYING SO.

   Every picker in the app capped itself and none of them mentioned it: the
   species list in the damage calculator drew 50 of 345 forms, the team's item
   picker 60 of 118, a Pokemon's own movepool 60 - and 131 of the 264
   learnsets in Champions are longer than 60, so half the dex was quietly
   losing moves off the end. The player found it on Rillaboom, 67 moves and 60
   drawn: "no se alcanza a ver toda en el movil, se corta".

   A cap is sometimes right - 512 move rows is too many to draw on a phone -
   but a cap nobody can see is indistinguishable from a Pokemon that does not
   learn the move. This says it, in the same words everywhere. */
function capNote(host, shown, total, what){
  if (shown >= total) return null;
  const n = el("div", "sub mt6 mb0");
  n.textContent = "Showing " + shown + " of " + total + " " + what +
                  " — type above to narrow the list.";
  host.appendChild(n);
  return n;
}

/* ONE SEARCH BOX, AND EVERY LIST GETS ONE.

   Eight copies of the same six lines - a div, an inline magnifier, an input -
   had grown across the app, so a screen only got a search box if whoever wrote
   it remembered to paste them. The team's build picker did not:

     "el selector de slot no tiene buscador! imaginate tener 100 builds
      diferentes y tener que deslizar, es mucho tiempo perdido. yo necesito que
      todos los menus de busqueda de cualquier cosa puedan tener un search y/o
      filtros"  (player, 2026-09-21)

   A helper makes adding one a line rather than a paste, which is the only way
   "every list" stays true of the next list as well.

   It carries its own clear button rather than relying on `type=search`: the
   native one is drawn by the browser inside our own border, Safari hides it
   the moment a search field is restyled, and a filter you cannot empty in one
   tap is a filter you stop using. */
function addClear(wrap, inp){
  if (!wrap || !inp || wrap.querySelector(".clr")) return;
  const clr = el("button", "clr", "×");
  clr.type = "button";
  clr.title = "Clear";
  clr.setAttribute("aria-label", "Clear the filter");
  wrap.appendChild(clr);
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
  const wraps = document.querySelectorAll(".search");
  Array.prototype.forEach.call(wraps, function(w){
    const inp = w.querySelector("input");
    if (inp) addClear(w, inp);
  });
}

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

function fbtn(label, cls, fn){
  const b = el("button", "btn " + (cls || ""), label);
  b.onclick = fn;
  return b;
}

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
   body._marks) survives into the next one, which is exactly how the
   Champions "rental" choice leaked into the 11 HOME adds of 2026-09-11.
   Anything underscore-prefixed is that builder's own state, so it goes too. */
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
  $, capNote, el, fbtn, filterLabel, note, pressOnly, resetHost, searchField,
  setPressed, showPane, toast, wireClears,
};
