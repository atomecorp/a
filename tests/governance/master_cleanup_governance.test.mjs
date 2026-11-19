import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

const prioritiesPath = "todo/cleanup_architecture/README.md";
const auditPath = "done/eve_master_cleanup_audit_report.md";

describe("eVe master cleanup governance", () => {
  it("keeps the historical audit accessible from the current priorities", () => {
    const priorities = fs.readFileSync(path.join(root, prioritiesPath), "utf8");
    const audit = fs.readFileSync(path.join(root, auditPath), "utf8");

    expect(priorities).toContain(`(../../${auditPath})`);
    expect(audit).toContain("# eVe / Atome Master Cleanup Audit Report");
  });
});
