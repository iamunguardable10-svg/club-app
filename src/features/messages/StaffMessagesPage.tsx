'use client';

/**
 * Messages for coaches and club roles (step 2 of the messages plan), reached
 * from the message icon in the header (club roles: their Messages tab): write
 * to any teams, groups, departments or the club the role allows, and read
 * everything sent to you or that you manage, newest first. Having the page
 * open marks what is shown as read. Players have their own page.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { ActiveRoleShell, ClubShell } from '@/features/role-workspaces/RoleShell';
import {
  getActivePerson,
  isMessageRead,
  markMessagesRead,
  messageRecipientIds,
  messagesVisibleTo,
  useLocalDatabase,
} from '@/shared/data';
import { useT } from '@/shared/i18n';

import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

export function StaffMessagesPage() {
  const t = useT();
  const router = useRouter();
  const { database } = useLocalDatabase();
  const person = database ? getActivePerson(database) : null;
  const personId = person?.id ?? null;
  const role = database?.activeIdentity?.role ?? null;
  const messages = database ? messagesVisibleTo(database, personId) : [];
  const unreadKey = database && personId
    ? messages.filter((message) => messageRecipientIds(database, message).includes(personId) && !isMessageRead(database, message.id, personId)).map((message) => message.id).join(',')
    : '';

  // Players read theirs on their own page.
  useEffect(() => {
    if (role === 'athlete') router.replace('/athlete/messages');
  }, [role, router]);

  // Seen = read. After the first paint, so the "new" marks are visible once.
  useEffect(() => {
    if (!personId || unreadKey === '') return;
    const timer = window.setTimeout(() => markMessagesRead(personId, unreadKey.split(',')), 800);
    return () => window.clearTimeout(timer);
  }, [personId, unreadKey]);

  if (!database || role === 'athlete') return null;
  const content = (
    <>
      <MessageComposer />
      <MessageList database={database} messages={messages} viewerId={personId} emptyText={t('staffMessages.empty')} />
    </>
  );
  return role === 'club'
    ? <ClubShell active="messages" title={t('staffMessages.title')} subtitle={t('staffMessages.subtitle')}>{content}</ClubShell>
    : <ActiveRoleShell title={t('staffMessages.title')} subtitle={t('staffMessages.subtitle')} tip="club.messages">{content}</ActiveRoleShell>;
}
