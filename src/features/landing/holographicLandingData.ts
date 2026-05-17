import { BarChart3, Building2, CalendarDays, CheckCircle2, LayoutDashboard, Users, Zap } from 'lucide-react';

export const trustItems = ['Open demo instantly', 'Browser-only demo data', 'Same flow as real setup'];
export const capabilities = ['Structure', 'Attendance', 'Facilities', 'Sessions', 'Load', 'Roles', 'Demo mode', 'Real setup'];

export const heroMetrics = [
  { label: 'Departments', value: '4', icon: Building2 },
  { label: 'Teams', value: '18', icon: Users },
  { label: 'Ready today', value: '86%', icon: CheckCircle2 },
];

export const storySteps = [
  {
    eyebrow: '01 · Structure',
    title: 'One operating model for the whole club.',
    text: 'Start with departments, teams, roles and facilities. TeamLoad turns the club structure into product data instead of another spreadsheet.',
    icon: Building2,
  },
  {
    eyebrow: '02 · Attendance',
    title: 'See who is expected before training starts.',
    text: 'Coaches get the reality early: expected, maybe, late and missing. The story card mirrors that same training-state view.',
    icon: CheckCircle2,
  },
  {
    eyebrow: '03 · Sessions & facilities',
    title: 'Connect sessions to the places they happen.',
    text: 'Facility assignment, session ownership and schedule context stay together, so departments do not coordinate from scattered chats.',
    icon: CalendarDays,
  },
  {
    eyebrow: '04 · Load',
    title: 'Turn daily activity into planning data.',
    text: 'Attendance and completed sessions become a cleaner load history, ready for better coaching and performance decisions.',
    icon: BarChart3,
  },
  {
    eyebrow: '05 · Roles',
    title: 'Give every role the right workspace.',
    text: 'Admins control structure, coaches manage today, athletes report fast. One system, different views, same source of truth.',
    icon: Users,
  },
];

export const roleCards = [
  {
    href: '/admin/setup',
    label: 'Admin',
    title: 'Structure the club once.',
    text: 'Departments, teams, roles and facilities become a clean operating model.',
    icon: LayoutDashboard,
  },
  {
    href: '/department/overview',
    label: 'Department Lead',
    title: 'Coordinate without chat chaos.',
    text: 'Keep teams, coaches, sessions and shared resources aligned.',
    icon: Building2,
  },
  {
    href: '/coach/today',
    label: 'Coach',
    title: 'Run today with better context.',
    text: 'Availability, attendance and load signals live in one coaching view.',
    icon: CalendarDays,
  },
  {
    href: '/athlete/home',
    label: 'Athlete',
    title: 'Report fast. Stay aligned.',
    text: 'Athletes submit availability and load without message noise.',
    icon: Zap,
  },
];
