export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateUniqueId(chunkId: string): string {
  // Convert chunkId to a UUID v5 format using a deterministic hash
  // This ensures we get a valid UUID that Qdrant accepts
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(chunkId).digest('hex');

  // Format as UUID v4 (8-4-4-4-12)
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32),
  ].join('-');

  return uuid;
}
