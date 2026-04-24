export function getReadinessLevel(score) {
  if (score <= 25) return 'Starting Out';
  if (score <= 50) return 'Building Foundation';
  if (score <= 75) return 'Portfolio Ready';
  if (score <= 90) return 'Interview Ready';
  return 'Job Ready';
}
