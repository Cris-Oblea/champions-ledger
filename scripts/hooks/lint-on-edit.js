/* PostToolUse hook for Claude Code (.claude/settings.json): lint the .js or
 * .py file Claude just wrote, with the gate's own rules (ESLint, ruff).
 *
 * The gate finds a lint problem three minutes after the push; this finds it
 * while the edit is still on screen. Silent - and so free in tokens - when the
 * file is clean. Otherwise exit 2 hands the findings to Claude, warnings
 * included: the ratchet in eslint.config.mjs lets a warning through the gate,
 * but the goal is zero, so a file being edited is a file being cleaned.
 */
const path = require("path");
const { spawnSync } = require("child_process");
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
  if (file?.endsWith(".py")) return ruff(file);
  if (!file || !/\.m?js$/.test(file)) return;
  const eslint = new ESLint({ cwd: ROOT });
  if (await eslint.isPathIgnored(file)) return;
  const results = await eslint.lintFiles([file]);
  if (!results.some(r => r.messages.length)) return;
  const formatter = await eslint.loadFormatter("stylish");
  process.stderr.write(await formatter.format(results));
  process.exitCode = 2;
});

function ruff(file) {
  // --force-exclude: a path named explicitly still honours ruff.toml's excludes.
  // The one lint exception in the repo: this runs on the developer's own
  // machine, and the python on PATH is by definition the one ruff was
  // installed into - a fixed absolute path would be wrong on every other one.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  const r = spawnSync("python", ["-m", "ruff", "check", "--quiet", "--force-exclude",
    "--output-format", "concise", file], { cwd: ROOT, encoding: "utf8" });
  if (r.status === 0) return;
  process.stderr.write((r.stdout || "") + (r.stderr || "") || String(r.error));
  process.exitCode = 2;
}
