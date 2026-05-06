import { PlaceholderPage } from '@/shared/ui/PlaceholderPage';

export default function CoachAttendancePage() {
  return (
    <PlaceholderPage
      area="Coach"
      title="Attendance"
      description="Finalize participation after sessions based on athlete availability and coach observation."
      primaryFocus="Athletes report availability before the session. Coaches finalize attendance after the session."
      nextModules={['Availability exceptions', 'Final attendance', 'Present/late/partial', 'Excused/unexcused absent', 'Attendance history']}
    />
  );
}
