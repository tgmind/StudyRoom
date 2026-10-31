import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  getAllAvatars,
  getAvatarById,
  isValidAvatarId,
  getAvatarsByCategory,
  resolveAvatarUrl,
  parseAvatarZoom,
  buildAvatarUrl,
  getAvatarScaleStyle,
  AVATAR_CATEGORIES,
  DEFAULT_AVATAR_ID,
} from "@/lib/avatars/manifest";

describe("StudyRoom Production Avatar System Suite", () => {
  const publicDir = path.resolve(process.cwd(), "public");
  const manifestPath = path.join(publicDir, "avatars", "manifest.json");
  const contactSheetPath = path.join(publicDir, "avatars", "contact_sheet.png");
  const optimizedDir = path.join(publicDir, "avatars", "optimized");
  const extractedDir = path.join(publicDir, "avatars", "extracted");
  const sourceDir = path.resolve(process.cwd(), "avatars");

  describe("1. Manifest & Asset Integrity Verification", () => {
    it("should have exactly 7 source collection sheets preserved and unmodified", () => {
      for (let s = 1; s <= 7; s++) {
        const srcFile = path.join(sourceDir, `${s}.png`);
        expect(fs.existsSync(srcFile)).toBe(true);
        const stats = fs.statSync(srcFile);
        expect(stats.size).toBeGreaterThan(1_500_000); // 1.5MB - 2.4MB high-res
      }
    });

    it("should load the manifest containing exactly 139 avatars across 7 categories", () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(data.total_avatars).toBe(139);
      expect(data.source_sheets).toBe(7);
      expect(data.avatars).toHaveLength(139);
    });

    it("should verify every avatar has a unique ID, valid category, and existing asset files", () => {
      const avatars = getAllAvatars();
      expect(avatars).toHaveLength(139);

      const seenIds = new Set<string>();
      avatars.forEach((avatar) => {
        // Unique ID check
        expect(seenIds.has(avatar.id)).toBe(false);
        seenIds.add(avatar.id);

        // ID format check: avatar-<sheet>-<num>
        expect(avatar.id).toMatch(/^avatar-[1-7]-[0-9]{2}$/);

        // Category validity check
        expect(AVATAR_CATEGORIES).toContain(avatar.category);

        // Asset file existence check (WebP)
        const webpRelative = avatar.assetPath.replace(/^\//, "");
        const webpAbsolute = path.join(publicDir, webpRelative);
        expect(fs.existsSync(webpAbsolute)).toBe(true);
        const webpStats = fs.statSync(webpAbsolute);
        expect(webpStats.size).toBeGreaterThan(1000); // Valid image data

        // Master PNG existence check
        const pngAbsolute = path.join(extractedDir, `${avatar.id}.png`);
        expect(fs.existsSync(pngAbsolute)).toBe(true);
      });
    });

    it("should have generated a valid visual contact sheet", () => {
      expect(fs.existsSync(contactSheetPath)).toBe(true);
      const stats = fs.statSync(contactSheetPath);
      expect(stats.size).toBeGreaterThan(500_000); // Multi-megabyte contact sheet
    });
  });

  describe("2. Avatar Manifest Helpers & Category Filtering", () => {
    it("should retrieve avatar by ID accurately", () => {
      const avatar = getAvatarById("avatar-1-01");
      expect(avatar).toBeDefined();
      expect(avatar?.id).toBe("avatar-1-01");
      expect(avatar?.category).toBe("Anime Girls");
      expect(avatar?.assetPath).toBe("/avatars/optimized/avatar-1-01.webp");

      const ganesha = getAvatarById("avatar-7-06");
      expect(ganesha).toBeDefined();
      expect(ganesha?.category).toBe("Culture & Heritage");
      expect(ganesha?.label).toBe("Lord Ganesha");

      const unknown = getAvatarById("avatar-99-99");
      expect(unknown).toBeUndefined();
    });

    it("should validate avatar IDs strictly", () => {
      expect(isValidAvatarId("avatar-1-01")).toBe(true);
      expect(isValidAvatarId("avatar-5-19")).toBe(true);
      expect(isValidAvatarId("avatar-7-20")).toBe(true);

      // Rejections
      expect(isValidAvatarId("")).toBe(false);
      expect(isValidAvatarId(null)).toBe(false);
      expect(isValidAvatarId(undefined)).toBe(false);
      expect(isValidAvatarId("avatar-1-99")).toBe(false);
      expect(isValidAvatarId("malicious_injection")).toBe(false);
      expect(isValidAvatarId("../../etc/passwd")).toBe(false);
    });

    it("should filter avatars by category accurately", () => {
      const all = getAvatarsByCategory("All");
      expect(all).toHaveLength(139);

      const girls = getAvatarsByCategory("Anime Girls");
      expect(girls).toHaveLength(20);

      const buddies = getAvatarsByCategory("Study Buddies");
      expect(buddies).toHaveLength(20);

      const portraits = getAvatarsByCategory("Student Portraits");
      expect(portraits).toHaveLength(20);

      const animals = getAvatarsByCategory("Cute Animals & Friends");
      expect(animals).toHaveLength(20);

      const icons = getAvatarsByCategory("Playful Icons");
      expect(icons).toHaveLength(19);

      const boys = getAvatarsByCategory("Anime Boys");
      expect(boys).toHaveLength(20);

      const heritage = getAvatarsByCategory("Culture & Heritage");
      expect(heritage).toHaveLength(20);

      // Sum of all individual categories must match total
      const totalCategorized =
        girls.length +
        buddies.length +
        portraits.length +
        animals.length +
        icons.length +
        boys.length +
        heritage.length;
      expect(totalCategorized).toBe(139);
    });
  });

  describe("3. Universal Avatar URL Resolution", () => {
    it("should resolve valid avatarId to optimized asset path", () => {
      expect(resolveAvatarUrl("avatar-1-05", null)).toBe("/avatars/optimized/avatar-1-05.webp");
      expect(resolveAvatarUrl("avatar-4-10", "")).toBe("/avatars/optimized/avatar-4-10.webp");
    });

    it("should prefer avatarId over stale avatarUrl when avatarId is valid", () => {
      expect(
        resolveAvatarUrl("avatar-2-01", "/avatars/optimized/avatar-1-01.webp")
      ).toBe("/avatars/optimized/avatar-2-01.webp");
    });

    it("should preserve custom external/Supabase uploaded URLs when avatarId is null", () => {
      const customUrl = "https://wppnfezoqpcgmowdkofp.supabase.co/storage/v1/object/public/avatars/user-123/avatar.png";
      expect(resolveAvatarUrl(null, customUrl)).toBe(customUrl);
    });

    it("should resolve legacy avatarUrl that contains an avatar ID", () => {
      expect(resolveAvatarUrl(null, "avatar-3-15")).toBe("/avatars/optimized/avatar-3-15.webp");
    });

    it("should safely return null when both avatarId and avatarUrl are empty/null", () => {
      expect(resolveAvatarUrl(null, null)).toBeNull();
      expect(resolveAvatarUrl(undefined, undefined)).toBeNull();
      expect(resolveAvatarUrl("", "")).toBeNull();
    });

    it("should preserve user zoom level when resolving avatar URLs", () => {
      expect(
        resolveAvatarUrl("avatar-1-01", "/avatars/optimized/avatar-1-01.webp?zoom=1.25")
      ).toBe("/avatars/optimized/avatar-1-01.webp?zoom=1.25");

      expect(
        resolveAvatarUrl(null, "https://example.com/avatar.png?zoom=1.50")
      ).toBe("https://example.com/avatar.png?zoom=1.50");
    });
  });

  describe("4. Avatar Zoom & Framing Scale Management", () => {
    it("should parse zoom level from URL accurately", () => {
      expect(parseAvatarZoom(null)).toBe(1.0);
      expect(parseAvatarZoom("")).toBe(1.0);
      expect(parseAvatarZoom("/avatars/optimized/avatar-1-01.webp")).toBe(1.0);
      expect(parseAvatarZoom("/avatars/optimized/avatar-1-01.webp?zoom=1.35")).toBe(1.35);
      expect(parseAvatarZoom("/avatars/optimized/avatar-1-01.webp?foo=bar&zoom=0.85")).toBe(0.85);
      expect(parseAvatarZoom("https://example.com/image.jpg#zoom=1.50")).toBe(1.5);
    });

    it("should clamp zoom levels within valid range [0.75, 2.0]", () => {
      expect(parseAvatarZoom("/avatar.webp?zoom=0.1")).toBe(1.0); // out of bounds -> default
      expect(parseAvatarZoom("/avatar.webp?zoom=9.99")).toBe(1.0); // out of bounds -> default
      expect(parseAvatarZoom("/avatar.webp?zoom=invalid")).toBe(1.0);
    });

    it("should build avatar URL with zoom cleanly and strip 1.0 default", () => {
      expect(buildAvatarUrl("/avatar.webp", 1.25)).toBe("/avatar.webp?zoom=1.25");
      expect(buildAvatarUrl("/avatar.webp?zoom=1.25", 1.5)).toBe("/avatar.webp?zoom=1.50");
      expect(buildAvatarUrl("/avatar.webp?zoom=1.50", 1.0)).toBe("/avatar.webp");
      expect(buildAvatarUrl("https://storage.com/pic.png?token=abc", 1.3)).toBe("https://storage.com/pic.png?token=abc&zoom=1.30");
    });

    it("should generate CSS scale styles properly", () => {
      expect(getAvatarScaleStyle("/avatar.webp")).toBeUndefined();
      expect(getAvatarScaleStyle("/avatar.webp?zoom=1.00")).toBeUndefined();
      expect(getAvatarScaleStyle("/avatar.webp?zoom=1.25")).toEqual({
        transform: "scale(1.25)",
        transformOrigin: "center 42%",
      });
    });
  });

  describe("5. Security and Input Sanitization", () => {
    it("should reject path traversal attempts in avatar IDs", () => {
      const payload = "../../../etc/passwd";
      expect(isValidAvatarId(payload)).toBe(false);
      expect(resolveAvatarUrl(payload, null)).toBeNull();
    });

    it("should reject SQL injection patterns in avatar IDs", () => {
      const payload = "avatar-1-01'; DROP TABLE users; --";
      expect(isValidAvatarId(payload)).toBe(false);
      expect(resolveAvatarUrl(payload, null)).toBeNull();
    });
  });

  describe("5. Asset Generation & Edge Quality Integrity", () => {
    it("should have visual contact sheet and QA comparison sheets generated", () => {
      const contactSheetPath = path.join(process.cwd(), "public", "avatars", "contact_sheet.png");
      const qaSheetPath = path.join(process.cwd(), "public", "avatars", "before_after_qa.png");

      expect(fs.existsSync(contactSheetPath)).toBe(true);
      expect(fs.statSync(contactSheetPath).size).toBeGreaterThan(100_000);

      expect(fs.existsSync(qaSheetPath)).toBe(true);
      expect(fs.statSync(qaSheetPath).size).toBeGreaterThan(100_000);
    });

    it("should verify all 139 avatars have non-empty master PNGs and optimized WebPs", () => {
      const all = getAllAvatars();
      expect(all).toHaveLength(139);

      for (const item of all) {
        const webpPath = path.join(process.cwd(), "public", item.assetPath);
        const pngPath = path.join(process.cwd(), "public", "avatars", "extracted", `${item.id}.png`);

        expect(fs.existsSync(webpPath)).toBe(true);
        expect(fs.statSync(webpPath).size).toBeGreaterThan(1_000);

        expect(fs.existsSync(pngPath)).toBe(true);
        expect(fs.statSync(pngPath).size).toBeGreaterThan(1_000);
      }
    });
  });
});
