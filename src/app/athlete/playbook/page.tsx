import { redirect } from 'next/navigation';

// Push notifications for a released playbook (0049) still link here.
export default function AthletePlaybook() {
  redirect('/athlete/tactics');
}
