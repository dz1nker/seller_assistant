import { afterEach, describe, expect, it, vi } from "vitest";
import { AppConfig } from "../../apps/api/src/config";
afterEach(() => vi.unstubAllEnvs());
function validEnv() {
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
  vi.stubEnv("WEB_ORIGIN", "https://sales.example.com");
  vi.stubEnv("COOKIE_SECURE", "true");
  vi.stubEnv("NODE_ENV", "production");
}
describe("Production configuration", () => {
  it("rejects production without secure cookies", () => {
    validEnv();
    vi.stubEnv("COOKIE_SECURE", "false");
    expect(() => new AppConfig()).toThrow("Production requires HTTPS");
  });
  it("rejects production over HTTP", () => {
    validEnv();
    vi.stubEnv("WEB_ORIGIN", "http://sales.example.com");
    expect(() => new AppConfig()).toThrow("Production requires HTTPS");
  });
  it("accepts exact HTTPS origin and secure cookies", () => {
    validEnv();
    expect(new AppConfig().secureCookies).toBe(true);
  });
  it("rejects credentials or query secrets in the AI endpoint without echoing them", () => {
    validEnv();
    for (const url of [
      "https://user:private-secret@api.example/v1",
      "https://api.example/v1?key=private-secret",
    ]) {
      vi.stubEnv("AI_BASE_URL", url);
      let error: unknown;
      try {
        new AppConfig();
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("private-secret");
    }
  });
  it("validates AI proxy credentials, scheme and path", () => {
    validEnv();
    for (const url of [
      "socks5://proxy.example:1080",
      "http://proxy.example/path",
      "http://user:private%XX@proxy.example:8080",
    ]) {
      vi.stubEnv("AI_PROXY_URL", url);
      expect(() => new AppConfig()).toThrow("HTTP(S) proxy");
    }
    vi.stubEnv("AI_PROXY_URL", "http://user:p%40ss@proxy.example:8080");
    expect(new AppConfig().values.AI_PROXY_URL).toContain("proxy.example");
  });
});
