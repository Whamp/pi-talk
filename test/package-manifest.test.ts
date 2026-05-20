import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Pi package manifest", () => {
  it("loads a precompiled native CommonJS wrapper from the package", () => {
    expect(packageJson.pi.extensions).toEqual(expect.arrayContaining([expect.any(String)]));

    for (const extensionPath of packageJson.pi.extensions) {
      expect(extname(extensionPath)).toBe(".cjs");
      expect(existsSync(join(packageRoot, extensionPath))).toBe(true);
    }
  });
});
