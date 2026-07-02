export function estimateWatchProgress(item) {
  const seed = item?.title?.length || 5;
  return Math.min(92, 18 + seed * 4);
}

export function estimateReadProgress(item) {
  const pages = Number(item?.pages || 1);
  return Math.min(88, Math.max(10, Math.round((Math.min(6, pages) / pages) * 100)));
}
