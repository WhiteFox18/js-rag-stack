// localStorage can throw (private mode, blocked site data); every caller
// treats storage as a best-effort convenience.
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage({
  key,
  value,
}: {
  key: string;
  value: string | null;
}): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Ignore: persistence is optional.
  }
}
