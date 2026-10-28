import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
it("initializes secure local credentials and upgrades without changing existing values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sales-env-test-"));
  try {
    copyFileSync(".env.example", path.join(root, ".env.example"));
    copyFileSync("scripts/init-env.mjs", path.join(root, "init-env.mjs"));
    const run = () => {
      const result = spawnSync(process.execPath, ["init-env.mjs"], {
        cwd: root,
        env: { PATH: process.env.PATH },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
    };
    run();
    const first = readFileSync(path.join(root, ".env"), "utf8"),
      config = parse(first);
    expect(config.POSTGRES_PASSWORD).toMatch(/^[a-f0-9]{48}$/);
    expect(config.DATABASE_URL).toContain(config.POSTGRES_PASSWORD!);
    expect(config.SESSION_MASTER_KEY).toMatch(/^[a-f0-9]{64}$/);
    expect(config.GATEWAY_TOKEN).not.toBe(config.SESSION_MASTER_KEY);
    run();
    expect(readFileSync(path.join(root, ".env"), "utf8")).toBe(first);
    writeFileSync(
      path.join(root, ".env"),
      "POSTGRES_PASSWORD=existing-do-not-change\nCUSTOM_SETTING=keep-me\n",
    );
    run();
    const upgrade = parse(readFileSync(path.join(root, ".env")));
    expect(upgrade.POSTGRES_PASSWORD).toBe("existing-do-not-change");
    expect(upgrade.CUSTOM_SETTING).toBe("keep-me");
    expect(upgrade.SESSION_MASTER_KEY).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
