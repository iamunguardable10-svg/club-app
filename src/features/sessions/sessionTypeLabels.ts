export const coachSessionTypes = [
  { value: 'training', label: 'Team training' },
  { value: 'game', label: 'Game' },
  { value: 's_and_c', label: 'Strength' },
  { value: 'other', label: 'Individual' },
  { value: 'recovery', label: 'Recovery' },
];

export function normalizeCoachSessionType(value?: string | null) {
  if (value === 'strength') return 's_and_c';
  if (value === 'individual') return 'other';
  return value ?? 'training';
}

export function labelForCoachSessionType(value: string) {
  return coachSessionTypes.find((type) => type.value === normalizeCoachSessionType(value))?.label ?? 'Training';
}
