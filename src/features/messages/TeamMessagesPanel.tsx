'use client';

/**
 * Messages in a team's workspace (pieces 17, B): write with this team already
 * in "To:" (more teams, groups or a department can be added, as far as the
 * writer may), and the messages that went to this team or its groups, with
 * how many have read them, reminders, polls and deleting.
 */

import { getActivePerson, messagesForTeam, useLocalDatabase } from '@/shared/data';
import { useT } from '@/shared/i18n';

import { MomentTip } from '@/features/onboarding/MomentTip';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

export function TeamMessagesPanel({ teamId }: { teamId: string }) {
  const t = useT();
  const { database } = useLocalDatabase();
  if (!database) return null;
  const person = getActivePerson(database);
  return (
    <div className="grid gap-4">
      <MomentTip id="messages" />
      <MessageComposer initialTeamIds={[teamId]} />
      <MessageList database={database} messages={messagesForTeam(database, teamId)} viewerId={person?.id ?? null} emptyText={t('teamMessages.none')} />
    </div>
  );
}
