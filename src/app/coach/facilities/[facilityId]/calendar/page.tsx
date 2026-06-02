import { FacilityCalendar } from '@/features/calendar/FacilityCalendar';

export default async function CoachFacilityCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams?: Promise<{
    from?: string;
    departmentId?: string;
    teamId?: string;
  }>;
}) {
  const { facilityId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <FacilityCalendar
      facilityId={facilityId}
      from={resolvedSearchParams?.from}
      departmentId={resolvedSearchParams?.departmentId}
      teamId={resolvedSearchParams?.teamId}
    />
  );
}
