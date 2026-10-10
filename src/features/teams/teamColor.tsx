/**
 * A stable colour per team, so a coach with several teams can tell them apart
 * at a glance. Derived from the team id alone (no stored field), from a small
 * palette that reads on the dark UI. Shown only when the coach has more than
 * one team; `TeamDot` renders nothing otherwise.
 */

const TEAM_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9'] as const;

export function teamColor(teamId: string): string {
  let hash = 5381;
  for (let index = 0; index < teamId.length; index += 1) hash = (hash * 33 + teamId.charCodeAt(index)) >>> 0;
  return TEAM_COLORS[hash % TEAM_COLORS.length];
}

/** The small dot before a team name. `show` is false for single-team coaches. */
export function TeamDot({ teamId, show = true, className = '' }: { teamId: string; show?: boolean; className?: string }) {
  if (!show) return null;
  return <span aria-hidden className={`mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle ${className}`} style={{ backgroundColor: teamColor(teamId) }} />;
}
