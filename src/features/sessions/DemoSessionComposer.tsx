'use client';

import { SessionComposer, type SessionComposerPayload, type SessionComposerTeam } from './SessionComposer';

type DemoSessionComposerProps = {
  open: boolean;
  teams: SessionComposerTeam[];
  facilities: { id: string; name: string }[];
  initialTeamId?: string | null;
  initialFacilityId?: string | null;
  initialStartsAt?: string | null;
  initialEndsAt?: string | null;
  lockedTeamId?: string | null;
  lockedFacilityId?: string | null;
  onClose: () => void;
  onSubmit: (payload: SessionComposerPayload) => Promise<void>;
};

export function DemoSessionComposer(props: DemoSessionComposerProps) {
  return <SessionComposer {...props} title="Create demo session" />;
}
