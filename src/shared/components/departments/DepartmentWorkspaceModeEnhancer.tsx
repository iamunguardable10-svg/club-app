'use client';

import { useEffect } from 'react';

function isDepartmentWorkspace() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes('/admin/departments/') && !window.location.pathname.endsWith('/admin/departments');
}

function focusTarget(focus: string | null) {
  if (!focus) return;
  const targetTitle = focus === 'teams' ? 'Department teams' : focus === 'facilities' ? 'Department halls' : '';
  if (!targetTitle) return;

  const heading = Array.from(document.querySelectorAll('h2')).find((element) => element.textContent?.trim() === targetTitle);
  heading?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DepartmentWorkspaceModeEnhancer() {
  useEffect(() => {
    if (!isDepartmentWorkspace()) return;

    const params = new URLSearchParams(window.location.search);
    const requestedEditMode = params.get('mode') === 'edit';
    const requestedFocus = params.get('focus');

    const timeout = window.setTimeout(() => {
      if (requestedEditMode) {
        const editButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'Edit department');
        editButton?.click();
      }
      focusTarget(requestedFocus);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, []);

  return null;
}
