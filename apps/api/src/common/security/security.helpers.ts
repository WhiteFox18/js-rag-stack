import { timingSafeEqual } from 'node:crypto';
import type { SafeEqualParams } from './security.types';

export function safeEqual({ left, right }: SafeEqualParams): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
