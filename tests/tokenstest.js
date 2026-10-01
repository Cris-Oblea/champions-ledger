/* The dark theme is written twice in styles/tokens.css, and the two copies
   must stay one theme.

   Once under prefers-color-scheme for the system setting, once under
   [data-theme="dark"] for the button: CSS cannot OR a media query with a
   selector, and light-dark() - the one-block way - leaves an older browser
   with no colours at all. So the copy is deliberate, and this is what keeps
   it honest: an edit to one block that misses the other would give a phone
   in dark mode a different app from the one the button shows. */
const { check, styles } = require("./harness.js");
const css = styles();

/* the token declarations inside the first {...} after `head` */
function block(head) {
  const at = css.indexOf(head);
  if (at < 0) return "";
  const open = css.indexOf("{", at + head.length - 1);
  return css.slice(open + 1, css.indexOf("}", open))
    .split(";").map(d => d.trim()).filter(Boolean).sort().join("; ");
}

const system = block(':root:not([data-theme="light"]){');
const button = block(':root[data-theme="dark"]{');
check("el tema oscuro del sistema define tokens", system.length > 0, true);
check("y el boton define los mismos, con los mismos valores", button, system);
