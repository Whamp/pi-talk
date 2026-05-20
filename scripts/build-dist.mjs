import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = fileURLToPath(new URL("../dist", import.meta.url));
rmSync(distDir, { recursive: true, force: true });

const tsc = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(tsc, ["-p", "tsconfig.build.json"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

for (const file of readdirSync(distDir)) {
  if (!file.endsWith(".js")) continue;
  const jsPath = join(distDir, file);
  const mjsPath = join(distDir, file.replace(/\.js$/, ".mjs"));
  const rewritten = readFileSync(jsPath, "utf8").replace(/(["'])((?:\.\.?\/)[^"']+)\.js\1/g, "$1$2.mjs$1");
  writeFileSync(jsPath, rewritten);
  if (existsSync(mjsPath)) rmSync(mjsPath);
  renameSync(jsPath, mjsPath);
}

writeFileSync(
  join(distDir, "index.cjs"),
  [
    "module.exports = async function piTalkExtension(pi) {",
    "  const extension = await import('./index.mjs');",
    "  return (extension.default ?? extension)(pi);",
    "};",
    "",
  ].join("\n"),
);
