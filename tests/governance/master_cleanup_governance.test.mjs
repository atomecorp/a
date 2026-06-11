import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

// The todo tree was reorganized: the plan moved into todo/cleanup_architecture/
// and the audit report into done/. The machine-readable findings JSON and the
// file tree snapshot were deliberately removed during the todo cleanup, so the
// governance contract only covers the surviving evidence artifacts.
const requiredArtifacts = [
  "todo/cleanup_architecture/eve_atome_master_cleanup_plan.md",
  "done/eve_master_cleanup_audit_report.md",
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
    const planPath = path.join(root, "todo/cleanup_architecture/eve_atome_master_cleanup_plan.md");
    const plan = fs.readFileSync(planPath, "utf8");
    expect(plan.includes("[ ]")).toBe(false);
    expect(plan).toContain("# Completed Cleanup Phases");
  });
});
