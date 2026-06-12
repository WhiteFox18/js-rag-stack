export async function checkDependency(
  check: () => Promise<void>,
): Promise<'up' | 'down'> {
  try {
    await check();
    return 'up';
  } catch {
    return 'down';
  }
}
