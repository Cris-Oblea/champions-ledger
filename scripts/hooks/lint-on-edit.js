/* PostToolUse hook for Claude Code (.claude/settings.json): lint the .js file
 * Claude just wrote, with the gate's own rules.
 *
 * The gate finds a lint problem three minutes after the push; this finds it
 * while the edit is still on screen. Silent - and so free in tokens - when the
 * file is clean. Otherwise exit 2 hands the findings to Claude, warnings
 * included: the ratchet in eslint.config.mjs lets a warning through the gate,
 * but the goal is zero, so a file being edited is a file being cleaned.
 */
const path = require("path");
const { ESLint } = require("eslint");

const ROOT = path.dirname(path.dirname(__dirname));

let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", async () => {
  let file;
  try {
    file = JSON.parse(input).tool_input?.file_path;
  } catch {
    return;                            // not a tool event: nothing to check
  }
  if (!file || !/\.m?js$/.test(file)) return;
  const eslint = new ESLint({ cwd: ROOT });
  if (await eslint.isPathIgnored(file)) return;
  const results = await eslint.lintFiles([file]);
  if (!results.some(r => r.messages.length)) return;
  const formatter = await eslint.loadFormatter("stylish");
  process.stderr.write(await formatter.format(results));
  process.exitCode = 2;
});
