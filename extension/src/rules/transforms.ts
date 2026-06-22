/** Value transforms applied between profile values and form values. */

export function boolToYesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

export function stringifyNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}
