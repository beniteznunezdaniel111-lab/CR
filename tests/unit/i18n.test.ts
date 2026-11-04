import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import messages from "../../messages/es.json";
import { MAIN_NAV, SETTINGS_NAV } from "@/lib/navigation";

type Tree = { [key: string]: string | Tree };

function has(tree: Tree, path: string): boolean {
  let node: string | Tree | undefined = tree;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return false;
    node = node[part];
  }
  return typeof node === "string";
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const tree = messages as unknown as Tree;

describe("mensajes en español", () => {
  it("existen todas las claves de error usadas en los esquemas Zod", () => {
    const sources = filesUnder("src/modules").filter((file) => file.endsWith("schemas.ts"));
    const keys = new Set<string>();
    for (const file of sources) {
      for (const match of readFileSync(file, "utf8").matchAll(/error: "([a-zA-Z]+)"/g)) {
        keys.add(match[1]!);
      }
    }
    // Claves usadas desde las Server Actions.
    for (const key of ["alreadyMember", "accessCode", "passwordMin", "invalid"]) keys.add(key);
    expect(keys.size).toBeGreaterThan(5);
    for (const key of keys) expect(has(tree, `validation.${key}`), `validation.${key}`).toBe(true);
  });

  it("cada elemento de navegación tiene texto y descripción de 'próximamente'", () => {
    for (const item of [...MAIN_NAV, ...SETTINGS_NAV]) {
      expect(has(tree, `nav.${item.key}`), `nav.${item.key}`).toBe(true);
      if (item.phase > 0) {
        expect(has(tree, `comingSoon.modules.${item.key}`), item.key).toBe(true);
      }
    }
    for (const item of MAIN_NAV.filter((entry) => entry.key !== "home")) {
      expect(has(tree, `dashboard.moduleDescriptions.${item.key}`), item.key).toBe(true);
    }
  });

  it("hay etiqueta para cada rol, estado y país", () => {
    for (const key of [
      "roles.admin",
      "roles.hr",
      "roles.employee",
      "memberStatus.active",
      "memberStatus.disabled",
      "countries.ES",
      "countries.CR",
    ]) {
      expect(has(tree, key), key).toBe(true);
    }
  });

  it("las claves t('...') literales usadas en la app existen", () => {
    const files = filesUnder("src").filter((file) => /\.(tsx?|ts)$/.test(file));
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Namespaces declarados en el fichero: useTranslations("x") / getTranslations("x").
      const namespaces = [
        ...source.matchAll(/(?:useTranslations|getTranslations)\((?:"([\w.]+)")?\)/g),
      ].map((match) => match[1] ?? "");
      if (namespaces.length === 0) continue;
      for (const match of source.matchAll(/\bt[A-Z]?\w*(?:\.rich)?\("([\w.]+)"/g)) {
        const key = match[1]!;
        const found = namespaces.some((ns) => has(tree, ns ? `${ns}.${key}` : key));
        if (!found) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
