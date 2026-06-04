const parseDriveTimeMinutes = drive => {
  if (!drive || typeof drive !== "string") return Number.POSITIVE_INFINITY;
  const text = drive.toLowerCase();
  const hrMatch = text.match(/(\d+)\s*hr/);
  const minMatch = text.match(/(\d+)\s*min/);
  const hrs = hrMatch ? Number(hrMatch[1]) : 0;
  const mins = minMatch ? Number(minMatch[1]) : 0;
  const total = hrs * 60 + mins;
  return total > 0 ? total : Number.POSITIVE_INFINITY;
};
export { parseDriveTimeMinutes };

