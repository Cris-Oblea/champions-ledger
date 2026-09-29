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
  /* THE RATCHET. These rules still have findings, so they warn instead of
     failing the push. Each one leaves this list in the pull request that takes
     it to zero, and from then on it is an error like every other rule - so the
     count can only go down. The goal is an empty list. */
  {
    rules: {
      "unicorn/consistent-function-scoping": "warn",
      "sonarjs/anchor-precedence": "warn",
      "sonarjs/code-eval": "warn",
      "sonarjs/cognitive-complexity": "warn",
      "sonarjs/concise-regex": "warn",
      "sonarjs/no-dead-store": "warn",
      "sonarjs/no-ignored-exceptions": "warn",
      "sonarjs/no-nested-assignment": "warn",
      "sonarjs/no-nested-conditional": "warn",
      "sonarjs/no-nested-functions": "warn",
      "sonarjs/no-unused-vars": "warn",
      "sonarjs/single-character-alternation": "warn",
      "sonarjs/super-linear-regex": "warn",
    },
  },
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
