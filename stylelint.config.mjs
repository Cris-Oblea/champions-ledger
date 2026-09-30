/* The CSS half of the lint gate, the twin of eslint.config.mjs and ruff.toml:
   stylelint's standard rules over tracker/src/styles/, every one an error.

   What is switched off is switched off for a reason, never for a count. */
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    // THE HOUSE STYLE IS DENSE: a small rule is one line, and a comment sits
    // directly on the rule it explains. These four rules only ask for blank
    // lines and line breaks; they would double the files and find nothing.
    "declaration-block-single-line-max-declarations": null,
    "comment-empty-line-before": null,
    "rule-empty-line-before": null,
    "at-rule-empty-line-before": null,
    // The files are ordered by COMPONENT (styles/index.css fixes the cascade),
    // not by specificity. This rule would reorder a component's rules across
    // the file and flags pairs that never set the same property.
    "no-descending-specificity": null,
    // An id is a JavaScript handle (getElementById), named like the variable
    // that holds it: boxCount, not box-count.
    "selector-id-pattern": null,
    // build_tracker_page.py reads index.css with `@import "x.css";` exactly.
    "import-notation": "string",
    // `(max-width:600px)`, not `(width <= 600px)`: the range syntax needs
    // Safari 16.4, and an old iPhone would lose every phone layout.
    "media-feature-range-notation": "prefix",
    // Each of these prefixes sits beside its standard property as the WebKit
    // fallback: Safari still needs text-size-adjust and user-select prefixed,
    // and -webkit-mask-composite takes `xor` where the standard takes
    // `exclude`.
    "property-no-vendor-prefix": [true, {
      ignoreProperties: ["-webkit-text-size-adjust", "-webkit-user-select",
                         "-webkit-mask", "-webkit-mask-composite",
                         "-webkit-appearance", "-webkit-backdrop-filter"],
    }],
  },
};
