export const isValidPassword = (password: string) => {
  // Must contain at least one uppercase, one lowercase, one number, and one special character
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
};

// Xodim uchun eslab qolinadigan parol yaratish: Ism + 4 raqam + "!"
// Masalan: "Abrorbek1234!" — katta/kichik harf + raqam + belgi bo'ladi.
export function generateMemorablePassword(fullName?: string): string {
  const first = (fullName || "").split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, "") || "";
  const base = first
    ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
    : "Asro";
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${base}${num}!`;
}
