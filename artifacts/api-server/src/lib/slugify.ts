export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 9).toUpperCase();
}

export function generateUserSlug(email: string, suffix?: string): string {
  const base = slugify(email.split("@")[0]);
  return suffix ? `${base}-${suffix}` : base;
}
