export type TelegramProxy = {
  server: string;
  port: number;
  type:
    | { _: "proxyTypeMtproto"; secret: string }
    | { _: "proxyTypeSocks5"; username: string; password: string }
    | {
        _: "proxyTypeHttp";
        username: string;
        password: string;
        http_only: false;
      };
};

const invalid = () =>
  new Error(
    "Invalid TELEGRAM_PROXY_URL. Use a Telegram proxy sharing link, socks5:// or http:// URL. The configured value is hidden.",
  );

// Parse locally. Never fetch sharing links or include credentials in diagnostics.
export function parseTelegramProxy(value?: string): TelegramProxy | undefined {
  if (!value?.trim()) return undefined;
  try {
    if (value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) throw invalid();
    const url = new URL(value.trim());
    let server: string;
    let portText: string;
    let type: TelegramProxy["type"];
    if (url.protocol === "socks5:" || url.protocol === "http:") {
      if (url.search || url.hash || (url.pathname && url.pathname !== "/"))
        throw invalid();
      server = url.hostname.replace(/^\[|\]$/g, "");
      portText = url.port || (url.protocol === "http:" ? "80" : "");
      const credentials = {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
      type =
        url.protocol === "socks5:"
          ? { _: "proxyTypeSocks5", ...credentials }
          : { _: "proxyTypeHttp", ...credentials, http_only: false };
    } else {
      if (url.username || url.password || url.port || url.hash) throw invalid();
      const action =
        url.protocol === "tg:" && (!url.pathname || url.pathname === "/")
          ? url.hostname
          : url.protocol === "https:" &&
              ["t.me", "telegram.me", "www.t.me", "www.telegram.me"].includes(
                url.hostname,
              )
            ? url.pathname.replace(/^\/|\/$/g, "")
            : "";
      if (!["proxy", "socks"].includes(action)) throw invalid();
      const params = url.searchParams;
      for (const key of ["server", "port", "secret", "user", "pass"])
        if (params.getAll(key).length > 1) throw invalid();
      server = params.get("server") ?? "";
      portText = params.get("port") ?? "";
      type =
        action === "proxy"
          ? { _: "proxyTypeMtproto", secret: params.get("secret") ?? "" }
          : {
              _: "proxyTypeSocks5",
              username: params.get("user") ?? "",
              password: params.get("pass") ?? "",
            };
      if (type._ === "proxyTypeMtproto" && !type.secret) throw invalid();
    }
    const port = Number(portText);
    if (
      !server ||
      server.length > 253 ||
      /[\s/@?#\\]/.test(server) ||
      !/^\d+$/.test(portText) ||
      port < 1 ||
      port > 65535 ||
      Object.values(type).some(
        (v) =>
          typeof v === "string" &&
          (v.length > 1024 || /[\x00-\x1f\x7f]/.test(v)),
      )
    )
      throw invalid();
    return { server, port, type };
  } catch {
    // URL errors can contain the entire input. Replace them, including causes.
    throw invalid();
  }
}

export function proxyQuery(proxy?: TelegramProxy): Record<string, unknown> {
  // TDLib 1.8.69 takes a nested proxy object (older releases used flat fields).
  return proxy
    ? { _: "addProxy", proxy: { _: "proxy", ...proxy }, enable: true }
    : { _: "disableProxy" };
}
