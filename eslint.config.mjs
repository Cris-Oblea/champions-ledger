/* The lint half of the gate: the same rules SonarQube for IDE shows in VS Code,
   run over every file, so a finding cannot come back once it is fixed.

   `no-undef` is the rule that matters most. A name a module never declares or
   imports is legal JavaScript - the bundler treats it as a global - and it
   throws ReferenceError on the phone, on whatever path touches it first. */
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";

export default [
  { ignores: ["node_modules/**", "data/**", "graphify-out/**",
              "tracker/dist/**", "tracker/build/**", "tracker/*.js",
              "tracker/src/_*.js"] },
  sonarjs.configs.recommended,
  {
    plugins: { unicorn },
    rules: {
      "no-undef": "error",
      "no-redeclare": "error",
      // Sonar's S7721 ("move function to the outer scope") is this rule.
      "unicorn/consistent-function-scoping": "error",
      // S1135 flags the word "todo"; the only one is Spanish, inside a quote.
      "sonarjs/todo-tag": "off",
    },
  },
  /* THE REPO IS CLEAN, AND STAYS CLEAN: every rule is an error everywhere,
     and in tracker/src so is a function longer than 80 lines of code. A
     screen that grows past that is a screen with a section that wants its own
     name - the build editor was one 686-line function until 2026-09-29. */
  { files: ["tracker/src/**/*.js"],
    rules: { "max-lines-per-function": ["error",
      {max: 80, skipComments: true, skipBlankLines: true}] } },
  { files: ["tracker/src/**/*.js"],
    languageOptions: { sourceType: "module", globals: globals.browser } },
  /* THE LAYERS: core <- ui <- tabs <- boot.js. A part imports from its own
     layer or a lower one, never a higher one. build_tracker_page.py checks the
     same rule and also refuses any import cycle; this says it in the editor,
     on the line that breaks it. */
  { files: ["tracker/src/core/**/*.js"],
    rules: { "no-restricted-imports": ["error", { patterns: [{
      group: ["../ui/*", "../tabs/*", "../boot.js"],
      message: "core/ is the bottom layer: it imports only from core/." }] }] } },
  { files: ["tracker/src/ui/**/*.js"],
    rules: { "no-restricted-imports": ["error", { patterns: [{
      group: ["../tabs/*", "../boot.js"],
      message: "ui/ imports from core/ and ui/ only - a shared piece never knows which tab it is in." }] }] } },
  { files: ["tracker/src/tabs/**/*.js"],
    rules: { "no-restricted-imports": ["error", { patterns: [{
      group: ["../boot.js"],
      message: "Nothing imports boot.js: it starts the app." }] }] } },
  { files: ["tests/**/*.js", "scripts/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node } },
  { files: ["cron/**/*.js"],
    languageOptions: { sourceType: "module", globals: globals.serviceworker } },
];
