'use client';

/**
 * Settings → Phone calendar: the two optional ways to get sessions into a
 * phone's calendar, in one place so it is clear which one to use.
 * - Apple Calendar (piece 20): on iPhone, iPad and Mac it comes first.
 * - The calendar link (piece 19): for Google, Outlook, Android and others;
 *   first on those devices. With Apple connected the link says it is not
 *   needed (both in one calendar app would show every session twice).
 * Signed in only for Apple; the demo club only explains the link.
 */

import { useEffect, useState } from 'react';

import { CoachSection } from '@/features/role-workspaces/RoleShell';
import { isAppleDevice } from '@/features/install/installPrompt';

import { AppleCalendarPanel } from './AppleCalendarPanel';
import { CalendarLinkPanel } from './CalendarLinkPanel';

export function PhoneCalendarSection({ remote, canRead }: { remote: boolean; canRead: boolean }) {
  const [apple, setApple] = useState(false);
  const [appleConnected, setAppleConnected] = useState(false);
  useEffect(() => setApple(isAppleDevice()), []);

  const applePanel = remote ? <AppleCalendarPanel canRead={canRead} onConnectedChange={setAppleConnected} /> : null;
  const linkPanel = <CalendarLinkPanel remote={remote} appleConnected={appleConnected} />;
  const divider = remote ? <hr className="border-slate-800" /> : null;

  return (
    <CoachSection
      title="Phone calendar"
      description="Optional: your team sessions (and your own training) in your phone’s calendar, always up to date. Pick one way."
      className="scroll-mt-24"
    >
      <div id="phone-calendar" className="grid gap-5">
        {apple ? <>{applePanel}{divider}{linkPanel}</> : <>{linkPanel}{divider}{applePanel}</>}
      </div>
    </CoachSection>
  );
}
