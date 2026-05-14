import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

const requiredArtifacts = [
  "todos/eve_atome_master_cleanup_plan.md",
  "todos/eve_master_cleanup_audit_report.md",
  "todos/eve_master_cleanup_findings.json",
  "todos/eve_master_cleanup_file_tree.txt",
];

describe("eVe master cleanup governance", () => {
  it("keeps the master cleanup evidence artifacts available", () => {
    for (const relativePath of requiredArtifacts) {
      const absolutePath = path.join(root, relativePath);
      expect(fs.existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
      expect(fs.statSync(absolutePath).size, `${relativePath} must not be empty`).toBeGreaterThan(0);
    }
  });

  it("keeps the master cleanup plan fully checked for the completed pass", () => {
    const planPath = path.join(root, "todos/eve_atome_master_cleanup_plan.md");
    const plan = fs.readFileSync(planPath, "utf8");
    expect(plan.includes("[ ]")).toBe(false);
    expect(plan).toContain("# Completed Cleanup Phases");
  });

  it("keeps machine-readable cleanup findings structurally valid", () => {
    const findingsPath = path.join(root, "todos/eve_master_cleanup_findings.json");
    const findings = JSON.parse(fs.readFileSync(findingsPath, "utf8"));
    expect(findings.summary.totalFiles).toBeGreaterThan(0);
    expect(findings.summary.firstPartyFiles).toBeGreaterThan(0);
    expect(Array.isArray(findings.oversized.over1000)).toBe(true);
    expect(Array.isArray(findings.emptyFiles)).toBe(true);
    expect(Array.isArray(findings.longFunctions)).toBe(true);
    expect(findings.runtimeInventory).toBeTypeOf("object");
    expect(findings.securityInventory).toBeTypeOf("object");
  });
});
