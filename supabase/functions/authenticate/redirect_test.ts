import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAuthRedirectUrl,
  PLATFORM_URL_DEFAULT,
  resolvePlatformUrl,
} from "./redirect.ts";

const HUB = "https://hub.leadseller.com.br";

Deno.test("PLATFORM_URL_DEFAULT points at the hub", () => {
  assertEquals(PLATFORM_URL_DEFAULT, HUB);
});

Deno.test("resolvePlatformUrl falls back to hub when env is missing/empty", () => {
  assertEquals(resolvePlatformUrl(undefined), HUB);
  assertEquals(resolvePlatformUrl(null), HUB);
  assertEquals(resolvePlatformUrl(""), HUB);
  assertEquals(resolvePlatformUrl("   "), HUB);
});

Deno.test("resolvePlatformUrl rejects non-https origins", () => {
  assertEquals(resolvePlatformUrl("http://evil.example.com"), HUB);
  assertEquals(resolvePlatformUrl("javascript:alert(1)"), HUB);
  assertEquals(resolvePlatformUrl("not-a-url"), HUB);
});

Deno.test("resolvePlatformUrl trims trailing slashes and paths", () => {
  assertEquals(resolvePlatformUrl("https://hub.leadseller.com.br/"), HUB);
  assertEquals(
    resolvePlatformUrl("https://hub.leadseller.com.br/auth/whatever"),
    HUB,
  );
});

Deno.test("buildAuthRedirectUrl always hits /auth/callback on the hub", () => {
  const url = new URL(
    buildAuthRedirectUrl("", { access_token: "a.b.c", refresh_token: "r.t" }),
  );
  assertEquals(url.origin, HUB);
  assertEquals(url.pathname, "/auth/callback");
  assertEquals(url.searchParams.get("access_token"), "a.b.c");
  assertEquals(url.searchParams.get("refresh_token"), "r.t");
});

Deno.test("buildAuthRedirectUrl honors PLATFORM_URL env override", () => {
  const prev = Deno.env.get("PLATFORM_URL");
  Deno.env.set("PLATFORM_URL", "https://staging.leadseller.com.br");
  try {
    const url = new URL(
      buildAuthRedirectUrl(null, { access_token: "x", refresh_token: "y" }),
    );
    assertEquals(url.origin, "https://staging.leadseller.com.br");
    assertEquals(url.pathname, "/auth/callback");
  } finally {
    if (prev === undefined) Deno.env.delete("PLATFORM_URL");
    else Deno.env.set("PLATFORM_URL", prev);
  }
});

Deno.test("buildAuthRedirectUrl downgrades untrusted candidate to hub", () => {
  const url = new URL(
    buildAuthRedirectUrl("https://evil.example.com", {
      access_token: "x",
      refresh_token: "y",
    }),
  );
  assertEquals(url.origin, HUB);
});

Deno.test("buildAuthRedirectUrl URL-encodes tokens with unsafe characters", () => {
  const redirect = buildAuthRedirectUrl(HUB, {
    access_token: "a b&c=d",
    refresh_token: "r+t/z",
  });
  const url = new URL(redirect);
  assertEquals(url.searchParams.get("access_token"), "a b&c=d");
  assertEquals(url.searchParams.get("refresh_token"), "r+t/z");
  // Raw string must not contain a literal "&c=" that would break parsing.
  assert(!redirect.includes("access_token=a b&c=d"));
});
