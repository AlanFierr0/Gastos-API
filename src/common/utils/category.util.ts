export function normalizeCategoryName(value: any): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length ? normalized : null;
}

export function assertCategoryName(value: any): string {
  const normalized = normalizeCategoryName(value);
  if (!normalized) {
    throw new Error('Category name is required');
  }
  return normalized;
}

