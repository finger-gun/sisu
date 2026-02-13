import { test, expect } from "vitest";
import { matchRoute } from "../src/router";

test("matchRoute extracts params", () => {
  const m = matchRoute("/api/runs/123/status?x=1", "/api", "/runs/:id/status");
  expect(m).not.toBeNull();
  expect(m!.params.id).toBe("123");
});

test("matchRoute mismatched length returns null", () => {
  const m = matchRoute("/api/runs/123", "/api", "/runs/:id/status");
  expect(m).toBeNull();
});

test("matchRoute basePath mismatch returns null", () => {
  const m = matchRoute("/v1/runs/123/status", "/api", "/runs/:id/status");
  expect(m).toBeNull();
});
