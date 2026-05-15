'use client';

import { useEffect, useState } from 'react';
import { AppConfirmDialog } from '@/shared/components/AppConfirmDialog';
import { getDemoClubSetup, getDemoTeams, saveDemoTeams } from '@/shared/dev/demoStorage';
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client';

const DELETE_BUTTON_ATTRIBUTE = 'data-club-app-team-delete-button';

type PendingTeamDelete = {
  teamName: string;
  departmentKey: string;
  mode: 'real' | 'demo';
};

function isDepartmentWorkspace() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/admin/departments/') && !window.location.pathname.endsWith('/admin/departments');
}

function isEditModeActive() {
  return Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Done editing');
}

function getDepartmentKey(mode: 'real' | 'demo') {
  if (mode === 'demo') return decodeURIComponent(window.location.pathname.split('/demo/admin/departments/')[1]?.split('/')[0] ?? '');
  return window.location.pathname.split('/admin/departments/')[1]?.split('/')[0] ?? '';
}

function getTeamArticles() {
  const teamsHeading = Array.from(document.querySelectorAll('h2')).find((heading) => heading.textContent?.trim() === 'Department teams');
  const teamsSection = teamsHeading?.closest('section');
  if (!teamsSection) return [];
  return Array.from(teamsSection.querySelectorAll<HTMLElement>('article'));
}

export function TeamDeleteEnhancer({ mode = 'real' }: { mode?: 'real' | 'demo' }) {
  const [pendingDelete, setPendingDelete] = useState<PendingTeamDelete | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function enhance() {
      if (!isDepartmentWorkspace() || !isEditModeActive()) return;
      const departmentKey = getDepartmentKey(mode);
      if (!departmentKey) return;

      for (const article of getTeamArticles()) {
        if (article.querySelector(`[${DELETE_BUTTON_ATTRIBUTE}="true"]`)) continue;
        const teamName = article.querySelector('h3')?.textContent?.trim();
        if (!teamName) continue;

        const actions = article.querySelector('div.grid.gap-3.rounded-2xl') ?? article;
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute(DELETE_BUTTON_ATTRIBUTE, 'true');
        button.className = 'mt-2 rounded-lg border border-red-500/60 px-2.5 py-1.5 text-xs font-black text-red-200 transition hover:bg-red-950/40';
        button.textContent = 'Delete team';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          setError(null);
          setPendingDelete({ teamName, departmentKey, mode });
        });
        actions.appendChild(button);
      }
    }

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mode]);

  async function deleteDemoTeam(teamName: string, departmentName: string) {
    const setup = getDemoClubSetup();
    const teams = getDemoTeams(setup);
    saveDemoTeams(teams.filter((team) => !(team.department === departmentName && team.name === teamName)));
    window.location.reload();
  }

  async function deleteRealTeam(teamName: string, departmentId: string) {
    const supabase = createBrowserSupabaseClient();
    const { data: team, error: teamError } = await supabase.from('teams').select('id').eq('department_id', departmentId).eq('name', teamName).maybeSingle();
    if (teamError) throw teamError;
    const teamId = (team as { id: string } | null)?.id;
    if (!teamId) throw new Error('Team could not be found. Reload the page and try again.');

    const invitesDelete = await supabase.from('invites').delete().eq('team_id', teamId);
    if (invitesDelete.error) throw invitesDelete.error;

    const sessionsDelete = await supabase.from('sessions').delete().eq('team_id', teamId);
    if (sessionsDelete.error) throw sessionsDelete.error;

    const membershipsDelete = await supabase.from('team_memberships').delete().eq('team_id', teamId);
    if (membershipsDelete.error) throw membershipsDelete.error;

    const teamDelete = await supabase.from('teams').delete().eq('id', teamId);
    if (teamDelete.error) throw teamDelete.error;

    window.location.reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError(null);

    try {
      if (pendingDelete.mode === 'demo') {
        await deleteDemoTeam(pendingDelete.teamName, pendingDelete.departmentKey);
      } else {
        await deleteRealTeam(pendingDelete.teamName, pendingDelete.departmentKey);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete team.');
      setIsDeleting(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-red-900/70 bg-red-950 px-4 py-3 text-sm font-bold text-red-100 shadow-2xl">
          {error}
        </div>
      ) : null}
      <AppConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.teamName ?? 'team'}?`}
        description="This removes the team and its team-specific memberships, invites and scheduled sessions. This cannot be undone."
        confirmLabel="Delete team"
        cancelLabel="Keep team"
        tone="danger"
        isConfirming={isDeleting}
        onCancel={() => {
          if (isDeleting) return;
          setPendingDelete(null);
          setError(null);
        }}
        onConfirm={confirmDelete}
      />
    </>
  );
}
