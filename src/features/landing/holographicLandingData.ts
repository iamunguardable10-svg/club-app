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
    title: 'Build one club operating model.',
    text: 'Departments, teams, coaches, athletes and facilities become connected product data instead of separate chat threads.',
    icon: Building2,
  },
  {
    eyebrow: '02 · Attendance',
    title: 'Know who is actually coming.',
    text: 'Expected, late and missing players become visible before coaches prepare the session.',
    icon: CheckCircle2,
  },
  {
    eyebrow: '03 · Sessions',
    title: 'Connect sessions with facilities.',
    text: 'Training times, halls and ownership stay visible across the club, so planning is easier to trust.',
    icon: CalendarDays,
  },
  {
    eyebrow: '04 · Load',
    title: 'Turn daily activity into load history.',
    text: 'Every completed session contributes to a clearer readiness and load picture.',
    icon: BarChart3,
  },
  {
    eyebrow: '05 · Roles',
    title: 'Give each role the right workspace.',
    text: 'Admins, department leads, coaches and athletes use the same system from different perspectives.',
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
