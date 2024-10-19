export const formatDuration = (duration: number) => {
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  const format = (value: number) => value.toString().padStart(2, "0");

  if (hours) return `${hours}:${format(minutes)}:${format(seconds)}`;

  return `${format(minutes)}:${format(seconds)}`;
};
