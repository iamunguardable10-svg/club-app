'use client';

import { useEffect } from 'react';

const LINKED_ATTRIBUTE = 'data-club-app-team-default-facility-linked';
const INLINE_SELECT_ATTRIBUTE = 'data-club-app-inline-default-facility-select';
const SELECT_CHANGE_ATTRIBUTE = 'data-club-app-default-facility-change-bound';
const CLEANED_CONTAINER_ATTRIBUTE = 'data-club-app-default-facility-container-cleaned';

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

function createDefaultFacilityLink(label: string, href: string, source: Element, teamName: string) {
  const link = document.createElement('a');
  link.href = addContext(href, source, teamName);
  link.textContent = label;
  link.className = 'rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs font-black text-slate-100 transition hover:border-white/30';
  link.setAttribute(LINKED_ATTRIBUTE, 'true');
  return link;
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

    span.replaceWith(createDefaultFacilityLink(label, href, span, teamName));
  });
}

function isDefaultFacilitySelect(select: HTMLSelectElement) {
  const optionText = Array.from(select.options)
    .map((option) => option.textContent?.trim().toLowerCase() ?? '')
    .join(' ');
  const localText = select.closest('div, article')?.textContent?.toLowerCase() ?? '';
  return optionText.includes('default facility') || optionText.includes('set default') || localText.includes('default facility');
}

function getDefaultFacilitySelects(article: HTMLElement) {
  return Array.from(article.querySelectorAll<HTMLSelectElement>('select')).filter(isDefaultFacilitySelect);
}

function isInsideMetaLine(article: HTMLElement, select: HTMLSelectElement) {
  const metaLine = article.querySelector('h3 + p');
  return Boolean(metaLine?.contains(select));
}

function styleInlineSelect(select: HTMLSelectElement) {
  select.setAttribute(INLINE_SELECT_ATTRIBUTE, 'true');
  select.className = 'rounded-lg border border-emerald-500/50 bg-slate-950 px-2.5 py-1 text-xs font-black text-emerald-200 outline-none focus:border-emerald-300 disabled:opacity-60';
}

function replaceSelectWithSelectedFacility(select: HTMLSelectElement) {
  const selectedFacilityName = select.options[select.selectedIndex]?.textContent?.trim();
  const selectedValue = select.value;
  if (!selectedValue || !selectedFacilityName || selectedFacilityName === 'Set default facility' || selectedFacilityName === 'No default facility') return;

  const article = select.closest('article');
  const teamName = article?.querySelector('h3')?.textContent?.trim();
  if (!teamName) return;

  const href = readFacilityLinks().get(selectedFacilityName);
  if (href) {
    select.replaceWith(createDefaultFacilityLink(selectedFacilityName, href, select, teamName));
  } else {
    const chip = document.createElement('span');
    chip.textContent = selectedFacilityName;
    chip.className = 'rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs font-black text-slate-100';
    chip.setAttribute(LINKED_ATTRIBUTE, 'true');
    select.replaceWith(chip);
  }
}

function bindImmediateSelectUpdate(select: HTMLSelectElement) {
  if (select.getAttribute(SELECT_CHANGE_ATTRIBUTE) === 'true') return;
  select.setAttribute(SELECT_CHANGE_ATTRIBUTE, 'true');
  select.addEventListener('change', () => {
    window.setTimeout(() => replaceSelectWithSelectedFacility(select), 0);
  });
}

function findDefaultFacilityPlaceholder(article: HTMLElement) {
  return Array.from(article.querySelectorAll<HTMLSpanElement>('h3 + p span')).find((span) => span.textContent?.trim() === 'No default facility');
}

function cleanOldSelectContainer(select: HTMLSelectElement) {
  const container = select.closest<HTMLElement>('.mt-3.flex, div.grid.gap-3.rounded-2xl, div.rounded-2xl');
  if (!container || container.getAttribute(CLEANED_CONTAINER_ATTRIBUTE) === 'true') return;

  container.setAttribute(CLEANED_CONTAINER_ATTRIBUTE, 'true');

  Array.from(container.querySelectorAll<HTMLElement>('p, label, span')).forEach((element) => {
    if (element.textContent?.trim().toLowerCase() === 'default facility') {
      element.style.display = 'none';
    }
  });

  const hasDeleteButton = Boolean(container.querySelector('[data-club-app-team-delete-button="true"]'));
  const hasOtherInputs = Array.from(container.querySelectorAll('input, textarea, button')).some((element) => element.getAttribute('data-club-app-team-delete-button') !== 'true');

  if (!hasDeleteButton && !hasOtherInputs) {
    container.style.display = 'none';
  }
}

function removeDuplicateSelect(article: HTMLElement, select: HTMLSelectElement, keepSelect: HTMLSelectElement) {
  if (select === keepSelect) return;
  const container = select.closest<HTMLElement>('.mt-3.flex, div.grid.gap-3.rounded-2xl, div.rounded-2xl');
  select.remove();
  if (container) {
    const hasVisibleControls = Array.from(container.querySelectorAll<HTMLElement>('select, input, textarea, button')).some((element) => element.offsetParent !== null || element.getAttribute('data-club-app-team-delete-button') === 'true');
    const hasDeleteButton = Boolean(container.querySelector('[data-club-app-team-delete-button="true"]'));
    if (!hasVisibleControls && !hasDeleteButton) container.style.display = 'none';
  }
}

function cleanDefaultFacilityActionLabels(article: HTMLElement) {
  article.querySelectorAll<HTMLElement>('div.grid.gap-3.rounded-2xl, div.rounded-2xl').forEach((container) => {
    const hasDefaultSelect = getDefaultFacilitySelects(container as HTMLElement).length > 0;
    const hasDeleteButton = Boolean(container.querySelector('[data-club-app-team-delete-button="true"]'));
    if (hasDefaultSelect || !hasDeleteButton) return;

    Array.from(container.querySelectorAll<HTMLElement>('p, label, span')).forEach((element) => {
      if (element.textContent?.trim().toLowerCase() === 'default facility') {
        element.style.display = 'none';
      }
    });
  });
}

function inlineMissingDefaultFacilitySelectors() {
  document.querySelectorAll<HTMLElement>('article').forEach((article) => {
    const defaultFacilitySelects = getDefaultFacilitySelects(article);
    if (defaultFacilitySelects.length === 0) {
      cleanDefaultFacilityActionLabels(article);
      return;
    }

    const alreadyInline = defaultFacilitySelects.find((select) => isInsideMetaLine(article, select));
    const selectToKeep = alreadyInline ?? defaultFacilitySelects[0];
    bindImmediateSelectUpdate(selectToKeep);
    styleInlineSelect(selectToKeep);

    const placeholder = findDefaultFacilityPlaceholder(article);
    if (placeholder && !isInsideMetaLine(article, selectToKeep)) {
      const originalParent = selectToKeep.parentElement;
      placeholder.replaceWith(selectToKeep);
      if (originalParent instanceof HTMLElement) cleanOldSelectContainer(originalParent as unknown as HTMLSelectElement);
    }

    defaultFacilitySelects.forEach((select) => removeDuplicateSelect(article, select, selectToKeep));
    cleanDefaultFacilityActionLabels(article);
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
