/* Script errors, collected from the first moment the page runs, so the
   Settings diagnostics can show them on a phone that has no console. */

/* ------------------------------------------------------------ diagnostics --
   "It does not work on my phone" is not something to guess at from a desktop
   browser that works. This reports what the page can actually see, on the
   device where it is failing, without needing a console. */
var BOOT_ERRORS = [];
window.addEventListener("error", function(e){
  BOOT_ERRORS.push((e.message || "error") +
    (e.filename ? "  @" + String(e.filename).split("/").pop() : "") +
    (e.lineno ? ":" + e.lineno : ""));
  showBootError();
});
window.addEventListener("unhandledrejection", function(e){
  BOOT_ERRORS.push("unhandled: " + (e.reason?.message || e.reason));
  showBootError();
});

/* an error that only reaches the console is invisible on a phone */
function showBootError(){
  var bar = document.getElementById("bootErr");
  if (!bar) return;
  bar.hidden = false;
  bar.textContent = BOOT_ERRORS.length + " script error" +
    (BOOT_ERRORS.length === 1 ? "" : "s") + " - open Trainer > Diagnostics";
}

export { BOOT_ERRORS };
