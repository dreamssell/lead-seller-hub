import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  HUB_ORIGIN,
  buildHubUrl,
  resolveHubOrigin,
  safeRedirectTo,
} from "./redirect.ts";

const HUB = "https://hub.leadseller.com.br";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const prev = Deno.env.get(name);
  if (value === undefined) Deno.env.delete(name);
  else Deno.env.set(name, value);
  try {
    fn();
  } finally {
    if (prev === undefined) Deno.env.delete(name);
    else Deno.env.set(name, prev);
  }
}

Deno.test("HUB_ORIGIN is the canonical hub", () => {
  assertEquals(HUB_ORIGIN, HUB);
});

Deno.test("resolveHubOrigin: empty / null / undefined → hub", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(resolveHubOrigin(undefined), HUB);
    assertEquals(resolveHubOrigin(null), HUB);
    assertEquals(resolveHubOrigin(""), HUB);
    assertEquals(resolveHubOrigin("   "), HUB);
  });
});

Deno.test("resolveHubOrigin: preview / lovable.app / arbitrary hosts → hub", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(resolveHubOrigin("https://id-preview--abc.lovable.app"), HUB);
    assertEquals(resolveHubOrigin("https://connecto-center.lovable.app"), HUB);
    assertEquals(resolveHubOrigin("https://evil.example.com"), HUB);
    assertEquals(resolveHubOrigin("https://app.leadseller.com.br"), HUB);
  });
});

Deno.test("resolveHubOrigin: unsafe schemes → hub", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(resolveHubOrigin("javascript:alert(1)"), HUB);
    assertEquals(resolveHubOrigin("data:text/html,x"), HUB);
    assertEquals(resolveHubOrigin("ftp://hub.leadseller.com.br"), HUB);
    assertEquals(resolveHubOrigin("not-a-url"), HUB);
  });
});

Deno.test("resolveHubOrigin: http (non-local) → hub", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(resolveHubOrigin("http://hub.leadseller.com.br"), HUB);
    assertEquals(resolveHubOrigin("http://evil.example.com"), HUB);
  });
});

Deno.test("resolveHubOrigin: localhost / 127.0.0.1 fallback preserved for dev", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(resolveHubOrigin("http://localhost:8080"), "http://localhost:8080");
    assertEquals(resolveHubOrigin("http://localhost:5173/foo"), "http://localhost:5173");
    assertEquals(resolveHubOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  });
});

Deno.test("resolveHubOrigin: hub host preserved (trailing slash trimmed)", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(resolveHubOrigin("https://hub.leadseller.com.br/"), HUB);
    assertEquals(resolveHubOrigin("https://hub.leadseller.com.br/anything"), HUB);
  });
});

Deno.test("resolveHubOrigin: PLATFORM_URL env overrides everything (if https)", () => {
  withEnv("PLATFORM_URL", "https://staging.leadseller.com.br/", () => {
    assertEquals(
      resolveHubOrigin("https://evil.example.com"),
      "https://staging.leadseller.com.br",
    );
    assertEquals(resolveHubOrigin(undefined), "https://staging.leadseller.com.br");
  });
});

Deno.test("resolveHubOrigin: invalid PLATFORM_URL is ignored", () => {
  withEnv("PLATFORM_URL", "http://insecure.example.com", () => {
    assertEquals(resolveHubOrigin(undefined), HUB);
  });
  withEnv("PLATFORM_URL", "not-a-url", () => {
    assertEquals(resolveHubOrigin(undefined), HUB);
  });
});

Deno.test("buildHubUrl: builds hub URL with encoded params", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    const url = new URL(
      buildHubUrl("/auth/callback", { access_token: "a b&c", refresh_token: "r/t" }),
    );
    assertEquals(url.origin, HUB);
    assertEquals(url.pathname, "/auth/callback");
    assertEquals(url.searchParams.get("access_token"), "a b&c");
    assertEquals(url.searchParams.get("refresh_token"), "r/t");
  });
});

Deno.test("buildHubUrl: normalizes leading slash", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(buildHubUrl("sign/abc"), `${HUB}/sign/abc`);
    assertEquals(buildHubUrl("/sign/abc"), `${HUB}/sign/abc`);
  });
});

Deno.test("buildHubUrl: candidate origin from preview is downgraded to hub", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    const url = buildHubUrl("/sign/xyz", undefined, "https://id-preview--foo.lovable.app");
    assertEquals(url, `${HUB}/sign/xyz`);
  });
});

Deno.test("buildHubUrl: localhost candidate preserved in dev", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    const url = buildHubUrl("/sign/xyz", undefined, "http://localhost:8080");
    assertEquals(url, "http://localhost:8080/sign/xyz");
  });
});

Deno.test("safeRedirectTo: relative path anchored to hub", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(safeRedirectTo("/dashboard"), `${HUB}/dashboard`);
    assertEquals(safeRedirectTo("/pipeline?tab=leads"), `${HUB}/pipeline?tab=leads`);
  });
});

Deno.test("safeRedirectTo: absolute hub URL preserved", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(
      safeRedirectTo("https://hub.leadseller.com.br/pipeline?x=1#top"),
      `${HUB}/pipeline?x=1#top`,
    );
  });
});

Deno.test("safeRedirectTo: absolute untrusted URL downgraded to hub, keeps path", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(
      safeRedirectTo("https://evil.example.com/steal?t=1"),
      `${HUB}/steal?t=1`,
    );
    assertEquals(
      safeRedirectTo("https://id-preview--x.lovable.app/dashboard"),
      `${HUB}/dashboard`,
    );
  });
});

Deno.test("safeRedirectTo: empty / invalid → hub + fallback path", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(safeRedirectTo(undefined), `${HUB}/`);
    assertEquals(safeRedirectTo(null, "/dashboard"), `${HUB}/dashboard`);
    assertEquals(safeRedirectTo("   ", "/pipeline"), `${HUB}/pipeline`);
  });
});

Deno.test("safeRedirectTo: localhost preserved for dev", () => {
  withEnv("PLATFORM_URL", undefined, () => {
    assertEquals(
      safeRedirectTo("http://localhost:8080/dashboard"),
      "http://localhost:8080/dashboard",
    );
  });
});
