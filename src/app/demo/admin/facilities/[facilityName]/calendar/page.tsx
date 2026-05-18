import { DemoFacilityCalendar } from '@/features/calendar/DemoFacilityCalendar';

type DemoFacilityCalendarPageProps = {
  params: Promise<{
    facilityName: string;
  }>;
  searchParams?: Promise<{
    from?: string;
    departmentName?: string;
    teamName?: string;
  }>;
};

export default async function DemoFacilityCalendarPage({ params, searchParams }: DemoFacilityCalendarPageProps) {
  const { facilityName } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const decodedFacilityName = decodeURIComponent(facilityName);
  return <DemoFacilityCalendar facilityName={decodedFacilityName} from={resolvedSearchParams?.from} departmentName={resolvedSearchParams?.departmentName} teamName={resolvedSearchParams?.teamName} />;
}
