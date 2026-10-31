import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminAvatarManager } from "@/components/admin/AdminAvatarManager";

// Mock fetch for admin avatar API calls
const mockAvatars = [
  {
    id: "avatar-1-01",
    label: "Anime Girl #01",
    category: "Anime Girls",
    asset_path: "/avatars/optimized/avatar-1-01.webp",
    display_order: 1,
    is_active: true,
  },
  {
    id: "avatar-1-02",
    label: "Anime Girl #02",
    category: "Anime Girls",
    asset_path: "/avatars/optimized/avatar-1-02.webp",
    display_order: 2,
    is_active: true,
  },
  {
    id: "avatar-2-01",
    label: "Study Buddy #01",
    category: "Study Buddies",
    asset_path: "/avatars/optimized/avatar-2-01.webp",
    display_order: 21,
    is_active: false,
  },
  {
    id: "avatar-custom-99",
    label: "Custom Mascot",
    category: "Playful Icons",
    asset_path: "https://mock-supabase.co/storage/v1/object/public/avatars/presets/custom-99.webp",
    display_order: 140,
    is_active: true,
  },
];

const mockCategories = ["Anime Girls", "Study Buddies", "Playful Icons"];

vi.mock("@/lib/avatars/imageOptimizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/avatars/imageOptimizer")>();
  return {
    ...actual,
    analyzeAndOptimizeAvatarImage: vi.fn().mockImplementation((file: File, options?: any) => {
      options?.onProgress?.("resampling", 50);
      options?.onProgress?.("complete", 100);
      return Promise.resolve({
        file: new File(["optimized-webp-bytes"], "replaced.webp", { type: "image/webp" }),
        blob: new Blob(["optimized-webp-bytes"], { type: "image/webp" }),
        previewUrl: "blob:http://localhost/mock-replaced-preview",
        originalName: file.name,
        originalSize: file.size || 1048576,
        optimizedSize: 18432,
        compressionRatio: 98.2,
        originalWidth: 1024,
        originalHeight: 1024,
        optimizedWidth: 256,
        optimizedHeight: 256,
        suggestedLabel: "Replaced Anime Girl",
        suggestedCategory: "Anime Girls",
      });
    }),
  };
});

describe("AdminAvatarManager Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes("/api/admin/avatars") && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              avatars: mockAvatars,
              categories: mockCategories,
              total: mockAvatars.length,
            }),
        });
      }

      if (url.includes("/api/admin/avatars/upload") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              id: "avatar-1-01-new",
              publicUrl: "https://mock-supabase.co/storage/v1/object/public/avatars/presets/avatar-1-01-new.webp",
            }),
        });
      }

      if (url.includes("/api/admin/avatars/sync") && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              syncedCount: 1,
              freedBytes: 15360,
              cleanedStorageObjects: ["presets/mock.webp"],
              manifestUpdated: true,
            }),
        });
      }

      if (url.includes("/api/admin/avatars") && options?.method === "POST") {
        const body = JSON.parse(options.body || "{}");
        if (body.action === "update") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, avatar: body }),
          });
        }
        if (body.action === "delete") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ success: true, deletedId: body.id }),
          });
        }
        if (body.action === "delete_category") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                success: true,
                action: body.relocateToCategory ? "relocate" : "delete_avatars",
                count: 1,
                category: body.category,
                relocatedTo: body.relocateToCategory,
              }),
          });
        }
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    });
  });

  it("renders header stats bar with total presets, categories, and custom added", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Total Presets")).toBeDefined();
    });

    // Stats bar cards
    expect(screen.getByText("Total Presets")).toBeDefined();
    expect(screen.getByText("Categories")).toBeDefined();
    expect(screen.getByText("Custom Added")).toBeDefined();
    expect(screen.getByText("WebP Engine")).toBeDefined();
    expect(screen.getByText("256 × 256")).toBeDefined();
  });

  it("renders search input, category filter buttons, and avatar cards", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
      expect(screen.getByText("Study Buddy #01")).toBeDefined();
      expect(screen.getByText("Custom Mascot")).toBeDefined();
    });

    // Check category pills
    expect(screen.getByText("All (4)")).toBeDefined();
    expect(screen.getByText("Anime Girls (2)")).toBeDefined();
    expect(screen.getByText("Study Buddies (1)")).toBeDefined();
  });

  it("filters avatar cards when typing in the search box", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search avatars by title/i);
    fireEvent.change(searchInput, { target: { value: "Mascot" } });

    expect(screen.getByText("Custom Mascot")).toBeDefined();
    expect(screen.queryByText("Anime Girl #01")).toBeNull();
    expect(screen.queryByText("Study Buddy #01")).toBeNull();
  });

  it("filters avatar cards by category pill", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
    });

    const categoryBtn = screen.getByText("Study Buddies (1)");
    fireEvent.click(categoryBtn);

    expect(screen.getByText("Study Buddy #01")).toBeDefined();
    expect(screen.queryByText("Anime Girl #01")).toBeNull();
    expect(screen.queryByText("Custom Mascot")).toBeNull();
  });

  it("filters avatar cards by active/inactive status filter select", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
      expect(screen.getByText("Study Buddy #01")).toBeDefined();
    });

    // Filter by inactive status
    const statusSelect = screen.getByLabelText("Filter avatars by status");
    fireEvent.change(statusSelect, { target: { value: "inactive" } });

    expect(screen.getByText("Study Buddy #01")).toBeDefined();
    expect(screen.queryByText("Anime Girl #01")).toBeNull();
  });

  it("opens the Add Preset Avatar modal on clicking Add Avatar button", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Add Avatar")).toBeDefined();
    });

    const addBtn = screen.getByRole("button", { name: /Add Avatar/i });
    fireEvent.click(addBtn);

    expect(screen.getByText("Add & Optimize Preset Avatar")).toBeDefined();
    expect(screen.getByText(/Drag and drop an image here/i)).toBeDefined();
    expect(screen.getByText(/browse files/i)).toBeDefined();
  });

  it("opens the Edit Avatar modal when clicking the edit button on an avatar card", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
    });

    const editBtns = screen.getAllByTitle(/Edit avatar metadata/i);
    expect(editBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(editBtns[0]);

    expect(screen.getByText("Edit Preset Avatar")).toBeDefined();
    const labelInput = screen.getByDisplayValue("Anime Girl #01");
    expect(labelInput).toBeDefined();
  });

  it("opens the Delete confirmation modal when clicking the delete button", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
    });

    const deleteBtns = screen.getAllByTitle(/Delete avatar/i);
    expect(deleteBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(deleteBtns[0]);

    expect(screen.getByText("Delete Preset Avatar")).toBeDefined();
    expect(screen.getByText(/Are you sure you want to delete this preset avatar/i)).toBeDefined();
  });

  it("renders Replace Image button in the Edit Avatar modal and allows replacing and reverting the image", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByText("Anime Girl #01")).toBeDefined();
    });

    const editBtns = screen.getAllByTitle(/Edit avatar metadata/i);
    fireEvent.click(editBtns[0]);

    expect(screen.getByText("Edit Preset Avatar")).toBeDefined();
    expect(screen.getByRole("button", { name: /Replace Image/i })).toBeDefined();

    // Trigger file change on the hidden input in edit modal
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const editFileInput = fileInputs[fileInputs.length - 1]; // edit modal's input
    expect(editFileInput).toBeDefined();

    const mockFile = new File(["dummy image bytes"], "replacement_portrait.png", { type: "image/png" });
    fireEvent.change(editFileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText("WebP Ready")).toBeDefined();
      expect(screen.getByText("Revert")).toBeDefined();
    });

    // Test revert
    const revertBtn = screen.getByText("Revert");
    fireEvent.click(revertBtn);

    expect(screen.queryByText("WebP Ready")).toBeNull();
    expect(screen.getByRole("button", { name: /Replace Image/i })).toBeDefined();

    // Now re-replace and save
    fireEvent.change(editFileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText("WebP Ready")).toBeDefined();
    });

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/avatars/upload",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("renders Sync to Local button and triggers cloud sync API on click", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Sync to Local/i })).toBeDefined();
    });

    const syncBtn = screen.getByRole("button", { name: /Sync to Local/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/avatars/sync",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("opens the Avatar Sync & Recovery Handbook modal when clicking the help button", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Avatar Sync & Disaster Recovery Guide/i })).toBeDefined();
    });

    const helpBtn = screen.getByRole("button", { name: /Avatar Sync & Disaster Recovery Guide/i });
    fireEvent.click(helpBtn);

    expect(screen.getByText("Avatar Cloud Sync & Recovery Handbook")).toBeDefined();
    expect(screen.getByText(/Why Sync from Cloud to Local/i)).toBeDefined();
    expect(screen.getAllByText("npm run avatars:sync").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("npm install")).toBeDefined();
  });

  it("opens Delete Category modal and relocates avatars to another category upon confirmation", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Delete category Study Buddies/i })).toBeDefined();
    });

    const deleteCatBtn = screen.getByRole("button", { name: /Delete category Study Buddies/i });
    fireEvent.click(deleteCatBtn);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText('Delete Category: "Study Buddies"')).toBeDefined();
    });

    expect(screen.getByText(/Relocate avatars to another category/i)).toBeDefined();
    expect(screen.getByText(/Permanently delete all/i)).toBeDefined();

    // Confirm button
    const confirmBtn = screen.getByRole("button", { name: /Relocate & Delete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/avatars",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"action":"delete_category"'),
        })
      );
    });
  });

  it("opens Delete Category modal and permanently deletes avatars when delete option is selected", async () => {
    render(<AdminAvatarManager />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Delete category Playful Icons/i })).toBeDefined();
    });

    const deleteCatBtn = screen.getByRole("button", { name: /Delete category Playful Icons/i });
    fireEvent.click(deleteCatBtn);

    await waitFor(() => {
      expect(screen.getByText('Delete Category: "Playful Icons"')).toBeDefined();
    });

    // Select permanent delete radio
    const radioDelete = screen.getByDisplayValue("delete");
    fireEvent.click(radioDelete);

    const confirmBtn = screen.getByRole("button", { name: /Permanently Delete Category/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/avatars",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"deleteAvatars":true'),
        })
      );
    });
  });
});
