import { describe, it, expect } from "vitest";
import { sanitizeFilename, buildStoragePath } from "../sanitizeFilename";

const VALID_KEY = /^[A-Za-z0-9._\-/]+$/; // Supabase Storage allowed chars

describe("sanitizeFilename", () => {
  it("removes diacritics (acentos)", () => {
    expect(sanitizeFilename("Contrato Consórcios Ação.pdf")).toMatch(/^Contrato_Consorcios_Acao\.pdf$/);
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeFilename("My Contract File.pdf")).toBe("My_Contract_File.pdf");
  });

  it("strips slashes and path traversal", () => {
    const out = sanitizeFilename("../../etc/passwd/Contrato Q3/2024.pdf");
    expect(out).not.toContain("/");
    expect(out).not.toContain("..");
    expect(out).toMatch(VALID_KEY);
  });

  it("removes special characters and emojis", () => {
    const out = sanitizeFilename("Doc!@#$%^&*()=+[]{}|;:'\",<>?`~🎉.pdf");
    expect(out).toMatch(VALID_KEY);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("preserves extension and lowercases it", () => {
    expect(sanitizeFilename("File.PDF")).toBe("File.pdf");
  });

  it("collapses repeated underscores", () => {
    expect(sanitizeFilename("a   b___c.pdf")).toBe("a_b_c.pdf");
  });

  it("never returns empty string", () => {
    expect(sanitizeFilename("")).toBe("arquivo");
    expect(sanitizeFilename("   ")).toBe("arquivo");
    expect(sanitizeFilename("///***")).toMatch(/.+/);
    expect(sanitizeFilename(null as any)).toBe("arquivo");
    expect(sanitizeFilename(undefined as any)).toBe("arquivo");
  });

  it("clamps to maxLen while keeping extension", () => {
    const long = "a".repeat(500) + ".pdf";
    const out = sanitizeFilename(long, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("handles file without extension", () => {
    expect(sanitizeFilename("Arquivo sem extensão")).toBe("Arquivo_sem_extensao");
  });

  it("output is always a valid Supabase Storage key segment", () => {
    const cases = [
      "Contrato Mult Seguros e Consórcios.pdf",
      "Relatório/Final 2024 – v2.PDF",
      "  espaços  no  começo  .pdf",
      "ção_acentuação!.png",
      "中文文件.pdf",
      "../traversal\\windows.pdf",
    ];
    for (const c of cases) {
      const safe = sanitizeFilename(c);
      expect(safe).toMatch(VALID_KEY);
      expect(safe.length).toBeGreaterThan(0);
    }
  });
});

describe("buildStoragePath", () => {
  it("builds a deterministic-shape path with sanitized name", () => {
    const p = buildStoragePath("user-123", "Contrato Mult Seguros.pdf");
    expect(p.startsWith("user-123/")).toBe(true);
    expect(p).toMatch(/^user-123\/\d+_Contrato_Mult_Seguros\.pdf$/);
  });

  it("supports optional prefix", () => {
    const p = buildStoragePath("u", "a b.pdf", "signed-docs");
    expect(p.startsWith("signed-docs/u/")).toBe(true);
  });

  it("produces valid storage keys for adversarial filenames", () => {
    const p = buildStoragePath("u", "../../x/y z!*.pdf");
    expect(p).toMatch(VALID_KEY);
  });
});
