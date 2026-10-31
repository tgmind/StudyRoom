import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarSelector } from "@/components/settings/AvatarSelector";

// Mock AvatarUpload to keep tests fast and focused on AvatarSelector
vi.mock("@/components/ui/AvatarUpload", () => ({
  AvatarUpload: ({ onAvatarUploaded }: { onAvatarUploaded: (url: string | null) => void }) => (
    <div data-testid="mock-avatar-upload">
      <button onClick={() => onAvatarUploaded("https://custom-url.com/avatar.png")}>
        Upload Mock
      </button>
    </div>
  ),
}));

describe("AvatarSelector Component", () => {
  const defaultProps = {
    userId: "user-123",
    displayName: "Jane Doe",
    currentAvatarId: "avatar-1-01",
    currentAvatarUrl: "/avatars/optimized/avatar-1-01.webp",
    onAvatarChanged: vi.fn(),
  };

  it("renders active avatar label and category correctly", () => {
    render(<AvatarSelector {...defaultProps} />);

    expect(screen.getByText("Profile Avatar")).toBeDefined();
    expect(screen.getAllByText("Anime Girl #01").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Anime Girls")).toBeDefined();
  });

  it("renders category filter buttons with correct avatar counts", () => {
    render(<AvatarSelector {...defaultProps} />);

    expect(screen.getByText(/All \(139\)/)).toBeDefined();
    expect(screen.getByText(/Anime Girls \(20\)/)).toBeDefined();
    expect(screen.getByText(/Study Buddies \(20\)/)).toBeDefined();
    expect(screen.getByText(/Culture & Heritage \(20\)/)).toBeDefined();
  });

  it("filters displayed avatars when a category button is clicked", () => {
    render(<AvatarSelector {...defaultProps} />);

    // Click "Anime Boys" category
    const boysCategoryBtn = screen.getByText(/Anime Boys \(20\)/);
    fireEvent.click(boysCategoryBtn);

    expect(screen.getByText("Showing 20 avatars")).toBeDefined();
    expect(screen.getByLabelText("Anime Boy #01")).toBeDefined();
  });

  it("triggers onAvatarChanged when an avatar card is clicked", () => {
    const onAvatarChanged = vi.fn();
    render(<AvatarSelector {...defaultProps} onAvatarChanged={onAvatarChanged} />);

    const targetAvatar = screen.getByLabelText("Anime Girl #02");
    fireEvent.click(targetAvatar);

    expect(onAvatarChanged).toHaveBeenCalledWith(
      "avatar-1-02",
      "/avatars/optimized/avatar-1-02.webp"
    );
  });

  it("renders radio accessibility attributes correctly", () => {
    render(<AvatarSelector {...defaultProps} />);

    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toBeDefined();

    const selectedRadio = screen.getByLabelText("Anime Girl #01");
    expect(selectedRadio.getAttribute("aria-checked")).toBe("true");

    const unselectedRadio = screen.getByLabelText("Anime Girl #02");
    expect(unselectedRadio.getAttribute("aria-checked")).toBe("false");
  });

  it("allows toggling to custom photo upload mode and back", () => {
    render(<AvatarSelector {...defaultProps} />);

    const customBtn = screen.getByText("Custom Photo");
    fireEvent.click(customBtn);

    expect(screen.getByTestId("mock-avatar-upload")).toBeDefined();
    expect(screen.getByText("Upload Custom Image")).toBeDefined();

    const backBtn = screen.getByText("Back to Presets");
    fireEvent.click(backBtn);

    expect(screen.queryByTestId("mock-avatar-upload")).toBeNull();
  });

  it("allows removing the avatar and reverting to initials", () => {
    const onAvatarChanged = vi.fn();
    render(<AvatarSelector {...defaultProps} onAvatarChanged={onAvatarChanged} />);

    const removeBtn = screen.getByTitle("Remove avatar");
    fireEvent.click(removeBtn);

    expect(onAvatarChanged).toHaveBeenCalledWith(null, null);
  });

  it("shows unsaved preview status and allows reverting to saved avatar", () => {
    const onAvatarChanged = vi.fn();
    render(
      <AvatarSelector
        {...defaultProps}
        currentAvatarId="avatar-1-02"
        currentAvatarUrl="/avatars/optimized/avatar-1-02.webp"
        savedAvatarId="avatar-1-01"
        savedAvatarUrl="/avatars/optimized/avatar-1-01.webp"
        onAvatarChanged={onAvatarChanged}
      />
    );

    expect(screen.getByText("Previewing (Unsaved)")).toBeDefined();
    expect(screen.getByText(/Remember to click/)).toBeDefined();

    const revertBtn = screen.getByText("Revert");
    fireEvent.click(revertBtn);

    expect(onAvatarChanged).toHaveBeenCalledWith(
      "avatar-1-01",
      "/avatars/optimized/avatar-1-01.webp"
    );
  });

  it("filters avatars in real time when typing into the search input", () => {
    render(<AvatarSelector {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText("Search avatars by name or keyword...");
    fireEvent.change(searchInput, { target: { value: "shiva" } });

    expect(screen.getByText("Showing 1 avatars")).toBeDefined();
    expect(screen.getByLabelText("Lord Shiva")).toBeDefined();
  });

  it("renders collapsed when defaultExpanded={false} and expands on clicking Change Avatar", () => {
    render(<AvatarSelector {...defaultProps} defaultExpanded={false} />);

    // Gallery should not be in the document initially
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByPlaceholderText("Search avatars by name or keyword...")).toBeNull();

    // The Change Avatar CTA button should be visible
    const changeAvatarBtn = screen.getByRole("button", { name: /Change Avatar/i });
    expect(changeAvatarBtn).toBeDefined();

    // Click to expand
    fireEvent.click(changeAvatarBtn);

    // Gallery should now be rendered
    expect(screen.getByRole("radiogroup")).toBeDefined();
    expect(screen.getByPlaceholderText("Search avatars by name or keyword...")).toBeDefined();
  });

  it("collapses the gallery when clicking the Done button in the gallery footer", () => {
    render(<AvatarSelector {...defaultProps} defaultExpanded={false} />);

    // Expand
    fireEvent.click(screen.getByRole("button", { name: /Change Avatar/i }));
    expect(screen.getByRole("radiogroup")).toBeDefined();

    // Click Done
    const doneBtn = screen.getByRole("button", { name: /^Done$/i });
    fireEvent.click(doneBtn);

    // Gallery should collapse
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("button", { name: /Change Avatar/i })).toBeDefined();
  });

  it("collapses the gallery when clicking the Done Browsing button in the preview showcase", () => {
    render(<AvatarSelector {...defaultProps} defaultExpanded={true} />);

    // Gallery is initially open
    expect(screen.getByRole("radiogroup")).toBeDefined();

    // Click Done Browsing
    const collapseBtn = screen.getByRole("button", { name: /Done Browsing/i });
    fireEvent.click(collapseBtn);

    // Gallery collapses
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("renders circular avatar preview and expands gallery when circular preview is clicked", () => {
    render(<AvatarSelector {...defaultProps} defaultExpanded={false} />);

    // Circular avatar preview should have rounded-full
    const avatarButton = screen.getByTitle("Click to change avatar");
    expect(avatarButton).toBeDefined();
    expect(avatarButton.className).toContain("rounded-full");

    const img = screen.getByAltText("Anime Girl #01");
    expect(img.className).toContain("rounded-full");

    // Click on circular preview to expand gallery
    fireEvent.click(avatarButton);
    expect(screen.getByRole("radiogroup")).toBeDefined();
  });

  it("renders zoom & adjust slider and controls when an avatar is selected", () => {
    render(<AvatarSelector {...defaultProps} />);

    expect(screen.getByText("Zoom & Adjust")).toBeDefined();
    expect(screen.getByLabelText("Avatar Zoom Level")).toBeDefined();
    expect(screen.getByTitle("Zoom in")).toBeDefined();
    expect(screen.getByTitle("Zoom out")).toBeDefined();
    expect(screen.getAllByText("100%").length).toBeGreaterThanOrEqual(1);
  });

  it("adjusts zoom via the slider and calls onAvatarChanged with zoom parameter", () => {
    const onAvatarChanged = vi.fn();
    render(<AvatarSelector {...defaultProps} onAvatarChanged={onAvatarChanged} />);

    const slider = screen.getByLabelText("Avatar Zoom Level");
    fireEvent.change(slider, { target: { value: "1.25" } });

    expect(onAvatarChanged).toHaveBeenCalledWith(
      "avatar-1-01",
      "/avatars/optimized/avatar-1-01.webp?zoom=1.25"
    );
  });

  it("adjusts zoom via quick preset buttons", () => {
    const onAvatarChanged = vi.fn();
    render(<AvatarSelector {...defaultProps} onAvatarChanged={onAvatarChanged} />);

    const focusPreset = screen.getByRole("button", { name: "Focus 125%" });
    fireEvent.click(focusPreset);

    expect(onAvatarChanged).toHaveBeenCalledWith(
      "avatar-1-01",
      "/avatars/optimized/avatar-1-01.webp?zoom=1.25"
    );
  });

  it("adjusts zoom via Zoom In button and resets via Reset button", () => {
    const onAvatarChanged = vi.fn();
    const { rerender } = render(
      <AvatarSelector
        {...defaultProps}
        currentAvatarUrl="/avatars/optimized/avatar-1-01.webp?zoom=1.25"
        onAvatarChanged={onAvatarChanged}
      />
    );

    // Zoom badge should display 125%
    expect(screen.getByText("125%")).toBeDefined();

    // Reset button should be visible when zoom is not 100%
    const resetBtn = screen.getByTitle("Reset zoom to 100%");
    expect(resetBtn).toBeDefined();

    fireEvent.click(resetBtn);
    expect(onAvatarChanged).toHaveBeenCalledWith(
      "avatar-1-01",
      "/avatars/optimized/avatar-1-01.webp"
    );
  });

  it("renders desktop category header and toggles between single row and wrapped grid", () => {
    render(<AvatarSelector {...defaultProps} />);

    expect(screen.getByText("Categories")).toBeDefined();

    // The desktop mode toggle button
    const wrapToggleBtn = screen.getByTitle("Wrap all categories");
    expect(wrapToggleBtn).toBeDefined();

    // Initially single-row
    const allBtn = screen.getByRole("button", { name: /^All \(/ });
    const pillContainer = allBtn.parentElement!;
    expect(pillContainer.className).toContain("overflow-x-auto");

    // Click to wrap all categories
    fireEvent.click(wrapToggleBtn);
    expect(pillContainer.className).toContain("flex-wrap");
    expect(screen.getByTitle("Switch to single-row scroll")).toBeDefined();

    // Click back to single row
    fireEvent.click(screen.getByTitle("Switch to single-row scroll"));
    expect(pillContainer.className).toContain("overflow-x-auto");
  });
});
