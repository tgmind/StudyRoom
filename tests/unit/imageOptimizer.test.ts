import { describe, it, expect } from "vitest";
import {
  deriveLabelFromFilename,
  predictCategoryFromFilename,
} from "@/lib/avatars/imageOptimizer";

describe("Avatar Image Optimizer Utilities Suite", () => {
  describe("deriveLabelFromFilename", () => {
    it("should convert snake_case to Title Case", () => {
      expect(deriveLabelFromFilename("anime_girl_special_edition.png")).toBe("Anime Girl Special Edition");
      expect(deriveLabelFromFilename("study_buddy_reader.webp")).toBe("Study Buddy Reader");
    });

    it("should convert kebab-case to Title Case", () => {
      expect(deriveLabelFromFilename("cyber-student-portrait.jpg")).toBe("Cyber Student Portrait");
      expect(deriveLabelFromFilename("cute-cat-companion.png")).toBe("Cute Cat Companion");
    });

    it("should handle messy spaces, underscores, and file extensions cleanly", () => {
      expect(deriveLabelFromFilename("  lord_ganesha__blessing--icon.jpeg  ")).toBe("Lord Ganesha Blessing Icon");
      expect(deriveLabelFromFilename("avatar.png")).toBe("Avatar");
      expect(deriveLabelFromFilename("")).toBe("New Avatar");
    });
  });

  describe("predictCategoryFromFilename", () => {
    it("should predict Anime Girls correctly", () => {
      expect(predictCategoryFromFilename("cool_anime_girl.png")).toBe("Anime Girls");
      expect(predictCategoryFromFilename("waifu_portrait.webp")).toBe("Anime Girls");
    });

    it("should predict Anime Boys correctly", () => {
      expect(predictCategoryFromFilename("anime_boy_with_glasses.png")).toBe("Anime Boys");
      expect(predictCategoryFromFilename("stylish_guy.jpg")).toBe("Anime Boys");
    });

    it("should predict Cute Animals correctly", () => {
      expect(predictCategoryFromFilename("fluffy_cat_studying.png")).toBe("Cute Animals & Friends");
      expect(predictCategoryFromFilename("pet_dog.webp")).toBe("Cute Animals & Friends");
    });

    it("should predict Culture & Heritage correctly", () => {
      expect(predictCategoryFromFilename("lord_shiva_meditating.png")).toBe("Culture & Heritage");
      expect(predictCategoryFromFilename("indian_culture_art.png")).toBe("Culture & Heritage");
    });

    it("should fallback gracefully to Study Buddies or preferred category", () => {
      expect(predictCategoryFromFilename("random_illustration.png")).toBe("Study Buddies");
      expect(predictCategoryFromFilename("random.png", ["All", "Custom Category"])).toBe("Custom Category");
    });
  });
});
