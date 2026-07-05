import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getPublicAppOrigin, getPublicLandingUrl } from "../publicLinks";

const HUB = "https://hub.leadseller.com.br";

describe("publicLinks — hub domain guarantees", () => {
  const originalLocation = window.location;

  afterEach(() => {
    vi.unstubAllEnvs();
    // restore location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  const setLocation = (href: string) => {
    const url = new URL(href);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        href,
        origin: url.origin,
        hostname: url.hostname,
        protocol: url.protocol,
        host: url.host,
        pathname: url.pathname,
      },
    });
  };

  describe("getPublicAppOrigin", () => {
    it("uses hub.leadseller.com.br as canonical origin on preview/production domains", () => {
      setLocation("https://id-preview--foo.lovable.app/");
      expect(getPublicAppOrigin()).toBe(HUB);
    });

    it("uses hub.leadseller.com.br on published lovable.app domain", () => {
      setLocation("https://connecto-center.lovable.app/dashboard");
      expect(getPublicAppOrigin()).toBe(HUB);
    });

    it("uses hub.leadseller.com.br even when accessed from the hub itself", () => {
      setLocation("https://hub.leadseller.com.br/pipeline");
      expect(getPublicAppOrigin()).toBe(HUB);
    });

    it("keeps localhost origin in local development", () => {
      setLocation("http://localhost:8080/");
      expect(getPublicAppOrigin()).toBe("http://localhost:8080");
    });

    it("keeps 127.0.0.1 origin in local development", () => {
      setLocation("http://127.0.0.1:5173/");
      expect(getPublicAppOrigin()).toBe("http://127.0.0.1:5173");
    });

    it("honors VITE_PUBLIC_APP_URL override when configured", () => {
      vi.stubEnv("VITE_PUBLIC_APP_URL", "https://hub.leadseller.com.br/");
      setLocation("https://some-other-domain.example.com/");
      // trailing slash must be trimmed
      expect(getPublicAppOrigin()).toBe(HUB);
    });

    it("never returns a trailing slash", () => {
      setLocation("https://connecto-center.lovable.app/");
      expect(getPublicAppOrigin().endsWith("/")).toBe(false);
    });
  });

  describe("getPublicLandingUrl", () => {
    it("builds a hub-scoped URL for a slug", () => {
      setLocation("https://connecto-center.lovable.app/");
      expect(getPublicLandingUrl("promo-black-friday")).toBe(
        `${HUB}/p/promo-black-friday`,
      );
    });

    it("never emits a lovable.app landing URL from a preview session", () => {
      setLocation("https://id-preview--abc.lovable.app/landing/edit");
      const url = getPublicLandingUrl("meu-funil");
      expect(url).not.toMatch(/lovable\.app/);
      expect(url.startsWith(HUB + "/p/")).toBe(true);
    });

    it("produces a single /p/ segment (no double slashes)", () => {
      setLocation("https://connecto-center.lovable.app/");
      const url = getPublicLandingUrl("slug");
      // remove protocol so we can search for accidental //
      expect(url.replace(/^https?:\/\//, "")).not.toMatch(/\/\//);
    });
  });
});
