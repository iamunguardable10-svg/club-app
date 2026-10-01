/**
 * One inbox (piece C): a person's team messages (piece 17, players only) and
 * club or department news, newest first. Important ones stay on top while
 * pinned. Used by the player's messages page, the card on Today and the
 * counts on the tabs.
 */

import {
  isMessageRead,
  isNewsRead,
  messagePinnedUntil,
  messagesForPlayer,
  newsForPerson,
  newsPinnedUntil,
  type ClubNews,
  type LocalDatabase,
  type TeamMessage,
} from '@/shared/data';

export type InboxItem =
  | { kind: 'message'; id: string; message: TeamMessage; createdAt: string; important: boolean; pinnedUntil: string | null }
  | { kind: 'news'; id: string; news: ClubNews; createdAt: string; important: boolean; pinnedUntil: string | null };

export function inboxFor(database: LocalDatabase, personId: string): InboxItem[] {
  const isPlayer = database.memberships.some((membership) => membership.personId === personId && membership.role === 'athlete');
  const messages: InboxItem[] = isPlayer
    ? messagesForPlayer(database, personId).map((message) => ({
        kind: 'message', id: message.id, message, createdAt: message.createdAt, important: message.important, pinnedUntil: messagePinnedUntil(message),
      }))
    : [];
  const news: InboxItem[] = newsForPerson(database, personId).map((item) => ({
    kind: 'news', id: item.id, news: item, createdAt: item.createdAt, important: item.important, pinnedUntil: newsPinnedUntil(item),
  }));
  return [...messages, ...news].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isInboxUnread(database: LocalDatabase, personId: string, item: InboxItem): boolean {
  if (item.kind === 'message') return !isMessageRead(database, item.id, personId);
  // One's own news is never "new".
  return item.news.authorId !== personId && !isNewsRead(database, item.id, personId);
}

export function isInboxPinned(item: InboxItem, now = Date.now()): boolean {
  return item.pinnedUntil !== null && Date.parse(item.pinnedUntil) > now;
}

export function unreadInbox(database: LocalDatabase, personId: string): InboxItem[] {
  return inboxFor(database, personId).filter((item) => isInboxUnread(database, personId, item));
}
