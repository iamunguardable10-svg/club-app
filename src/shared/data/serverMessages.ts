/**
 * Texts the server writes (database functions, the Apple Calendar function)
 * are English. Known ones carry a text key here, so the interface can show
 * them in the app language (docs/i18n.md, rule 9); unknown ones stay as they
 * are. A new `raise exception` on the server gets its line here and in
 * `en.json`.
 */

import type { MessageKey } from '@/shared/i18n/translate';
import { LocalDataError } from './schema';

export const SERVER_MESSAGES: Record<string, MessageKey> = {
  "A role cannot be locked afterwards.": 'server.aRoleCannotBeLocked',
  "A squad can only be picked for a game.": 'server.aSquadCanOnlyBe',
  "Attendance can only be confirmed for players of the team.": 'server.attendanceCanOnlyBeConfirmed',
  "Attendance can only be confirmed once the session has started.": 'server.attendanceCanOnlyBeConfirmed2',
  "Club, department, team and your name are required.": 'server.clubDepartmentTeamAndYour',
  "First and last name are required.": 'server.firstAndLastNameAre',
  "Invitations are only for members of the staff.": 'server.invitationsAreOnlyForMembers',
  "Not allowed.": 'server.notAllowed',
  "Not signed in.": 'server.notSignedIn',
  "Only a department without teams can be deleted.": 'server.onlyADepartmentWithoutTeams',
  "Only operators can change reports.": 'server.onlyOperatorsCanChangeReports',
  "Only operators can see reports.": 'server.onlyOperatorsCanSeeReports',
  "Only players of the team can be picked.": 'server.onlyPlayersOfTheTeam',
  "Only players of the team can report for this session.": 'server.onlyPlayersOfTheTeam2',
  "Only the club admin or the department lead may rename or archive a team.": 'server.onlyTheClubAdminOr',
  "Players were already reminded of this message.": 'server.playersWereAlreadyRemindedOf',
  "Please describe the problem in a few words.": 'server.pleaseDescribeTheProblemIn',
  "Sign in first.": 'server.signInFirst',
  "The Head Coach role always has every right and cannot be changed.": 'server.theHeadCoachRoleAlways',
  "The Head Coach role cannot be deleted.": 'server.theHeadCoachRoleCannot',
  "The club needs at least one admin.": 'server.theClubNeedsAtLeast',
  "The groups must belong to the team.": 'server.theGroupsMustBelongTo',
  "The team needs at least one person who may manage staff and roles.": 'server.theTeamNeedsAtLeast',
  "This department belongs to another club.": 'server.thisDepartmentBelongsToAnother',
  "This founding code does not exist.": 'server.thisFoundingCodeDoesNot',
  "This founding code has already been used.": 'server.thisFoundingCodeHasAlready',
  "This hall is not shared with the team": 'server.thisHallIsNotShared',
  "This invitation has already been accepted.": 'server.thisInvitationHasAlreadyBeen',
  "This invitation is no longer valid.": 'server.thisInvitationIsNoLonger',
  "This is not a valid push subscription.": 'server.thisIsNotAValid',
  "This join code does not exist.": 'server.thisJoinCodeDoesNot',
  "This person already has an account.": 'server.thisPersonAlreadyHasAn',
  "This person belongs to another club.": 'server.thisPersonBelongsToAnother',
  "This role belongs to another team.": 'server.thisRoleBelongsToAnother',
  "This team is no longer active.": 'server.thisTeamIsNoLonger',
  "Too many reports right now. Please try again later.": 'server.tooManyReportsRightNow',
  "Unknown kind.": 'server.unknownKind',
  "Unknown load entry.": 'server.unknownLoadEntry',
  "You are the only admin of your club. Add another admin first (Club → Club admins → Add admin), then delete your account.": 'server.youAreTheOnlyAdmin',
  "You can only say you did not take part once the session has started.": 'server.youCanOnlySayYou',
  "You sent many reports today. Please try again tomorrow.": 'server.youSentManyReportsToday',
  "Your account already belongs to a club.": 'server.yourAccountAlreadyBelongsTo',
  "Your account already belongs to another club.": 'server.yourAccountAlreadyBelongsTo2',
  "Not connected.": 'server.notConnected',
  "Please sign in again.": 'server.pleaseSignInAgain',
  "Too many tries. Wait an hour, then check the Apple ID and make a new app-specific password.": 'server.tooManyTriesWaitAn',
  "Enter your Apple ID and the app-specific password.": 'server.enterYourAppleIdAnd',
  "Could not save the connection.": 'server.couldNotSaveTheConnection',
  "Synced a lot just now. Try again in a few minutes.": 'server.syncedALotJustNow',
  "Unknown action.": 'server.unknownAction',
  "Apple did not accept the Apple ID or the app-specific password.": 'server.appleDidNotAcceptThe',
  "Too many redirects.": 'server.tooManyRedirects',
  "Could not find the calendar account.": 'server.couldNotFindTheCalendar',
  "Could not find the calendars.": 'server.couldNotFindTheCalendars',
  "Apple Calendar is not available right now.": 'server.appleCalendarIsNotAvailable',
};

const PATTERNS: [RegExp, MessageKey][] = [
  [/^Could not create the calendar \((\d+)\)\.$/, 'server.couldNotCreateCalendar'],
  [/^Could not save an event \((\d+)\)\.$/, 'server.couldNotSaveEvent'],
  [/^Could not delete an event \((\d+)\)\.$/, 'server.couldNotDeleteEvent'],
  [/^Could not read a calendar \((\d+)\)\.$/, 'server.couldNotReadCalendar'],
  // Row-level security or a missing grant refused a write.
  [/row-level security|permission denied/i, 'server.rlsRefused'],
];

/** The text key and values for a server text, when it is a known one. */
export function serverMessageKey(message: string): { key: MessageKey; params?: Record<string, string> } | null {
  const text = message.trim();
  const exact = SERVER_MESSAGES[text];
  if (exact) return { key: exact };
  for (const [pattern, key] of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return { key, params: match[1] !== undefined ? { status: match[1] } : undefined };
  }
  return null;
}

/** A server text as an error the interface can translate. */
export function serverError(message: string, cause?: unknown): LocalDataError {
  const known = serverMessageKey(message);
  return new LocalDataError(message, cause, known?.key, known?.params);
}
