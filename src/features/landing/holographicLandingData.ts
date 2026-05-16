import { BarChart3, Building2, CalendarDays, CheckCircle2, LayoutDashboard, Users, Zap } from 'lucide-react';

export const trustItems = ['No login required', 'Demo data stays local', 'Same flow as real setup'];
export const capabilities = ['Club setup', 'Departments', 'Teams', 'Facilities', 'Availability', 'Attendance', 'Load history', 'Role workspaces'];

export const heroMetrics = [
  { label: 'Departments', value: '4', icon: Building2 },
  { label: 'Teams', value: '18', icon: Users },
  { label: 'Ready today', value: '86%', icon: CheckCircle2 },
];

export const storySteps = [
  {
    eyebrow: '01 · Structure',
    title: 'One club model.',
    text: 'Departments, teams, facilities and roles are connected before daily operations start.',
    icon: Building2,
  },
  {
    eyebrow: '02 · Attendance',
    title: 'Know who shows up.',
    text: 'Availability and attendance states are visible before the session starts.',
    icon: CheckCircle2,
  },
  {
    eyebrow: '03 · Sessions & facilities',
    title: 'Plan where work happens.',
    text: 'Facilities and sessions stay visible together, so planning is easier to trust.',
    icon: CalendarDays,
  },
  {
    eyebrow: '04 · Load',
    title: 'Create the data foundation.',
    text: 'Attendance and sessions become load history for clearer planning.',
    icon: BarChart3,
  },
  {
    eyebrow: '05 · Roles',
    title: 'One system. Different views.',
    text: 'Each role works from the same operating model with the right level of context.',
    icon: Users,
  },
];

export const roleCards = [
  {
    href: '/admin/setup',
    label: 'Admin',
    title: 'Build the club structure.',
    text: 'Create departments, teams, roles and facilities without losing control in chats or spreadsheets.',
    icon: LayoutDashboard,
  },
  {
    href: '/department/overview',
    label: 'Department Lead',
    title: 'Coordinate people and locations.',
    text: 'Manage teams, coaches, shared resources and department facilities from one workspace.',
    icon: Building2,
  },
  {
    href: '/coach/today',
    label: 'Coach',
    title: 'Know who is ready today.',
    text: 'See availability, attendance and load signals before training and game-day decisions.',
    icon: CalendarDays,
  },
  {
    href: '/athlete/home',
    label: 'Athlete',
    title: 'Report fast. Stay aligned.',
    text: 'Check your calendar, submit availability and report load without digging through messages.',
    icon: Zap,
  },
];
