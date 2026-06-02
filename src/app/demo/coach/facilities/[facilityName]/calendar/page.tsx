import { DemoFacilityCalendar } from '@/features/calendar/DemoFacilityCalendar';

export default async function DemoCoachFacilityCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityName: string }>;
  searchParams?: Promise<{
    from?: string;
    departmentName?: string;
    teamName?: string;
    departmentNames?: string;
    teamNames?: string;
  }>;
}) {
  const { facilityName } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const decodedFacilityName = decodeURIComponent(facilityName);

  return (
    <DemoFacilityCalendar
      facilityName={decodedFacilityName}
      from={resolvedSearchParams?.from}
      departmentName={resolvedSearchParams?.departmentName}
      teamName={resolvedSearchParams?.teamName}
      departmentNames={resolvedSearchParams?.departmentNames}
      teamNames={resolvedSearchParams?.teamNames}
    />
  );
}
