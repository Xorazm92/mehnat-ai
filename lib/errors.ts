export function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) return false;
  return error.name === 'ChunkLoadError' || 
         !!(error.message && error.message.includes('Loading chunk'));
}
