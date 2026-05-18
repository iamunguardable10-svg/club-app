import { FacilityCalendar } from '@/features/calendar/FacilityCalendar';

type FacilityCalendarPageProps = {
  params: Promise<{
    facilityId: string;
  }>;
  searchParams?: Promise<{
    from?: string;
    departmentId?: string;
    teamId?: string;
  }>;
};

export default async function FacilityCalendarPage({ params, searchParams }: FacilityCalendarPageProps) {
  const { facilityId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  return <FacilityCalendar facilityId={facilityId} from={resolvedSearchParams?.from} departmentId={resolvedSearchParams?.departmentId} teamId={resolvedSearchParams?.teamId} />;
}
