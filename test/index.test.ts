import { describe, it, expect } from "vitest";
import { hello } from "../src/index";

describe("hello", () => {
  it("greets by default", () => {
    expect(hello()).toBe("Hello, world!");
  });
});