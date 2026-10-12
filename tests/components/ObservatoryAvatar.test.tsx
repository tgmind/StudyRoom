import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObservatoryAvatar } from "@/components/analytics/ObservatoryAvatar";

describe("ObservatoryAvatar Component", () => {
  it("renders image tag when url is provided", () => {
    render(
      <ObservatoryAvatar
        name="Anindita Debnath"
        url="https://example.com/avatar.jpg"
        theme="amber"
      />
    );

    const img = screen.getByRole("img", { name: "Anindita Debnath" });
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://example.com/avatar.jpg");
    expect(img.className).toContain("object-cover");
    expect(img.className).toContain("rounded-[inherit]");
  });

  it("gracefully falls back to initials when image load errors", () => {
    render(
      <ObservatoryAvatar
        name="Anindita Debnath"
        url="https://example.com/broken.jpg"
        theme="amber"
      />
    );

    const img = screen.getByRole("img", { name: "Anindita Debnath" });
    fireEvent.error(img);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("AD")).toBeDefined();
  });

  it("renders luxury initials crest when url is null", () => {
    render(
      <ObservatoryAvatar
        name="Anindita Debnath"
        url={null}
        theme="amber"
        size="hero"
      />
    );

    expect(screen.queryByRole("img")).toBeNull();
    const initials = screen.getByText("AD");
    expect(initials).toBeDefined();
  });

  it("handles single-word names and extracts initials correctly", () => {
    render(
      <ObservatoryAvatar
        name="Ritesh"
        url={null}
        theme="purple"
      />
    );

    expect(screen.getByText("R")).toBeDefined();
  });

  it("handles empty or missing names gracefully with fallback", () => {
    render(
      <ObservatoryAvatar
        name=""
        url={null}
        theme="default"
      />
    );

    expect(screen.getByText("??")).toBeDefined();
  });

  it("applies theme-specific styling classes for initials fallback", () => {
    const { container: amberContainer } = render(
      <ObservatoryAvatar name="Alpha" url={null} theme="amber" />
    );
    expect(amberContainer.querySelector(".text-amber-300")).toBeDefined();

    const { container: purpleContainer } = render(
      <ObservatoryAvatar name="Beta" url={null} theme="purple" />
    );
    expect(purpleContainer.querySelector(".text-purple-300")).toBeDefined();

    const { container: emeraldContainer } = render(
      <ObservatoryAvatar name="Gamma" url={null} theme="emerald" />
    );
    expect(emeraldContainer.querySelector(".text-emerald-300")).toBeDefined();

    const { container: skyContainer } = render(
      <ObservatoryAvatar name="Delta" url={null} theme="sky" />
    );
    expect(skyContainer.querySelector(".text-sky-300")).toBeDefined();
  });
});
