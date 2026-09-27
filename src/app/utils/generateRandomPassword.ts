import crypto from "crypto";
import httpStatus from "http-status";

import { AppError } from "./AppError";

export default function generateRandomPassword(length = 10): string {
  if (length < 8) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password length must be at least 8 characters",
    );
  }

  // Character sets
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const specials = "!@#$%^&*-_?=";

  // All characters
  const all = lower + upper + digits + specials;

  // Securely pick a random character
  const pick = (chars: string): string => {
    return chars[crypto.randomInt(chars.length)];
  };

  // Make sure password contains at least one of each type
  const chars: string[] = [
    pick(lower),
    pick(upper),
    pick(digits),
    pick(specials),
  ];

  // Fill remaining characters
  for (let i = chars.length; i < length; i++) {
    chars.push(pick(all));
  }

  // Shuffle password
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);

    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
