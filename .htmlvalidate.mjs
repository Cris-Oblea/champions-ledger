/* The HTML half of the lint gate, over tracker/src/markup/: html-validate's
   recommended rules, every one an error. The markup has no inline style="",
   and no-inline-style keeps it that way - spacing lives in styles/space.css. */
export default {
  extends: ["html-validate:recommended"],
  rules: {
    // A button submits only inside a <form>, and the markup has one - the
    // sign-in gate, whose button says type="submit". Everywhere else the
    // attribute would say nothing, and the JavaScript builds far more buttons
    // than this file holds without it.
    "no-implicit-button-type": "off",
    // Every <fieldset> here is a segmented control (Dex # | A-Z), named by
    // aria-label - a label WCAG accepts as well as a <legend>, and one that
    // draws no caption above a row of buttons that already says what it is.
    "wcag/h71": "off",
  },
};
