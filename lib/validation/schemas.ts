export interface ValidationResult<T = string> {
  isValid: boolean;
  value: T;
  error?: string;
}

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Validates display name: required, trimmed, 2 to 32 characters.
 */
export function validateDisplayName(rawInput: string): ValidationResult<string> {
  if (!rawInput) {
    return { isValid: false, value: "", error: "Display name is required" };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length < 2) {
    return { isValid: false, value: trimmed, error: "Display name must be at least 2 characters" };
  }

  if (trimmed.length > 32) {
    return { isValid: false, value: trimmed.substring(0, 32), error: "Display name cannot exceed 32 characters" };
  }

  return { isValid: true, value: trimmed };
}

/**
 * Validates focus tag: optional, trimmed, max 60 characters.
 */
export function validateFocusTag(rawInput?: string | null): ValidationResult<string | null> {
  if (!rawInput) {
    return { isValid: true, value: null };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { isValid: true, value: null };
  }

  if (trimmed.length > 60) {
    return { isValid: true, value: trimmed.substring(0, 60), error: "Focus tag cannot exceed 60 characters" };
  }

  return { isValid: true, value: trimmed };
}

/**
 * Validates a single goal task description: required, trimmed, 1 to 120 characters.
 */
export function validateTaskText(rawInput: string): ValidationResult<string> {
  if (!rawInput) {
    return { isValid: false, value: "", error: "Task text cannot be empty" };
  }

  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { isValid: false, value: "", error: "Task text cannot be empty" };
  }

  if (trimmed.length > 120) {
    return { isValid: false, value: trimmed.substring(0, 120), error: "Task text cannot exceed 120 characters" };
  }

  return { isValid: true, value: trimmed };
}

/**
 * Validates task array for 24-hour goal set creation (1 to 10 valid tasks, no duplicate blank entries).
 */
export function validateGoalTasks(tasks: string[]): ValidationResult<string[]> {
  if (!tasks || tasks.length === 0) {
    return { isValid: false, value: [], error: "At least one task is required" };
  }

  const cleaned: string[] = [];
  for (const raw of tasks) {
    const res = validateTaskText(raw);
    if (res.isValid && res.value) {
      cleaned.push(res.value);
    }
  }

  if (cleaned.length === 0) {
    return { isValid: false, value: [], error: "At least one non-empty task is required" };
  }

  if (cleaned.length > 10) {
    return { isValid: false, value: cleaned.slice(0, 10), error: "Maximum 10 tasks allowed per 24-hour window" };
  }

  return { isValid: true, value: cleaned };
}

/**
 * Validates uploaded profile picture file size (< 2 MB) and MIME type (image/*).
 */
export function validateAvatarFile(file: File): ValidationResult<File> {
  if (!file) {
    return { isValid: false, value: file, error: "No file selected" };
  }

  if (!ALLOWED_AVATAR_TYPES.includes(file.type.toLowerCase())) {
    return {
      isValid: false,
      value: file,
      error: "Invalid file format. Please upload a JPEG, PNG, WebP, or GIF image.",
    };
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      value: file,
      error: `File size (${sizeInMB} MB) exceeds the 2 MB limit.`,
    };
  }

  return { isValid: true, value: file };
}
