'use client';

import { useEffect } from 'react';

const LINKED_ATTRIBUTE = 'data-club-app-team-default-facility-linked';
const INLINE_SELECT_ATTRIBUTE = 'data-club-app-inline-default-facility-select';

function readFacilityLinks() {
  const links = new Map<string, string>();

  document.querySelectorAll<HTMLAnchorElement>('a[href*="/facilities/"][href*="/calendar"]').forEach((anchor) => {
    const title = anchor.querySelector('p, span')?.textContent?.trim() || anchor.textContent?.trim();
    const href = anchor.getAttribute('href');
    if (title && href) links.set(title, href);
  });

  return links;
}

function addContext(href: string, source: Element, teamName: string) {
  const url = new URL(href, window.location.origin);
  url.searchParams.set('from', 'team');
  url.searchParams.set('teamName', teamName);

  const departmentName = document.querySelector('h1')?.textContent?.trim();
  if (departmentName && !departmentName.toLowerCase().includes('facilities')) {
    url.searchParams.set('departmentName', departmentName);
  }

  const explicitDepartment = source.closest('[data-department-id]')?.getAttribute('data-department-id');
  if (explicitDepartment) url.searchParams.set('departmentId', explicitDepartment);

  return `${url.pathname}${url.search}`;
}

function linkDefaults() {
  const links = readFacilityLinks();
  if (links.size === 0) return;

  document.querySelectorAll<HTMLSpanElement>('article h3 + p span').forEach((span) => {
    if (span.closest('a')) return;
    if (span.getAttribute(LINKED_ATTRIBUTE) === 'true') return;

    const label = span.textContent?.trim();
    const href = label ? links.get(label) : null;
    if (!label || !href || label === 'No default facility') return;

    const article = span.closest('article');
    const teamName = article?.querySelector('h3')?.textContent?.trim();
    if (!teamName) return;

    const link = document.createElement('a');
    link.href = addContext(href, span, teamName);
    link.textContent = label;
    link.className = `${span.className} rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs font-black text-slate-100 transition hover:border-white/30`.trim();
    link.setAttribute(LINKED_ATTRIBUTE, 'true');

    span.replaceWith(link);
  });
}

function inlineMissingDefaultFacilitySelectors() {
  document.querySelectorAll<HTMLElement>('article').forEach((article) => {
    const select = article.querySelector<HTMLSelectElement>('select');
    if (!select) return;
    if (select.getAttribute(INLINE_SELECT_ATTRIBUTE) === 'true') return;

    const defaultFacilitySpan = Array.from(article.querySelectorAll<HTMLSpanElement>('h3 + p span')).find(
      (span) => span.textContent?.trim() === 'No default facility',
    );
    if (!defaultFacilitySpan) return;

    select.setAttribute(INLINE_SELECT_ATTRIBUTE, 'true');
    select.className = 'rounded-lg border border-emerald-500/50 bg-slate-950 px-2.5 py-1 text-xs font-black text-emerald-200 outline-none focus:border-emerald-300 disabled:opacity-60';
    defaultFacilitySpan.replaceWith(select);

    const oldContainer = article.querySelector<HTMLElement>('.mt-3.flex');
    if (oldContainer && oldContainer.children.length === 0) {
      oldContainer.style.display = 'none';
    }
  });
}

function enhanceTeamFacilityReferences() {
  inlineMissingDefaultFacilitySelectors();
  linkDefaults();
}

export function TeamDefaultFacilityLinkEnhancer() {
  useEffect(() => {
    enhanceTeamFacilityReferences();
    const observer = new MutationObserver(enhanceTeamFacilityReferences);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
