'use client';

import { useEffect } from 'react';
import { getFacilityAccent } from '@/shared/lib/facilities/accent';

const ENHANCED_ATTRIBUTE = 'data-club-app-facility-accent-enhanced';
const FACILITY_PATH_PATTERN = /\/facilities\/([^/?#]+)\/calendar/;

function getFacilitySeedFromHref(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(FACILITY_PATH_PATTERN);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    const match = href.match(FACILITY_PATH_PATTERN);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  }
}

function getReadableFacilityLabel(anchor: HTMLAnchorElement, fallbackSeed: string) {
  const firstText = anchor.querySelector('p, span')?.textContent?.trim();
  return firstText || anchor.textContent?.trim() || fallbackSeed;
}

function getNearestDepartmentLabel(anchor: HTMLAnchorElement) {
  const explicitContext = anchor.closest('[data-department-id], [data-demo-department]');
  const explicitDepartmentId = explicitContext?.getAttribute('data-department-id');
  const explicitDemoDepartment = explicitContext?.getAttribute('data-demo-department');

  if (explicitDepartmentId || explicitDemoDepartment) {
    return { departmentId: explicitDepartmentId, departmentName: explicitDemoDepartment };
  }

  const departmentSection = anchor.closest('section');
  const sectionDepartmentLabel = departmentSection?.querySelector('button .block.font-black')?.textContent?.trim();
  if (sectionDepartmentLabel && !sectionDepartmentLabel.toLowerCase().includes('facility')) {
    return { departmentId: null, departmentName: sectionDepartmentLabel };
  }

  const pageDepartmentTitle = document.querySelector('h1')?.textContent?.trim();
  if (pageDepartmentTitle && !pageDepartmentTitle.toLowerCase().includes('facilities')) {
    return { departmentId: null, departmentName: pageDepartmentTitle };
  }

  return { departmentId: null, departmentName: null };
}

function appendContextToFacilityLink(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute('href');
  if (!href) return;
  if (!href.includes('/facilities/') || !href.includes('/calendar')) return;

  const { departmentId, departmentName } = getNearestDepartmentLabel(anchor);
  if (!departmentId && !departmentName) return;

  const url = new URL(href, window.location.origin);
  if (departmentId && !url.searchParams.has('departmentId')) url.searchParams.set('departmentId', departmentId);
  if (departmentName && !url.searchParams.has('departmentName')) url.searchParams.set('departmentName', departmentName);

  anchor.setAttribute('href', `${url.pathname}${url.search}`);
}

function getAccentTarget(anchor: HTMLAnchorElement): HTMLElement {
  const anchorClass = anchor.getAttribute('class') ?? '';
  const anchorIsCard = anchorClass.includes('rounded') && anchorClass.includes('border');
  if (anchorIsCard) return anchor;

  const parentCard = anchor.closest<HTMLElement>('article.rounded-xl, div.rounded-xl, div.rounded-2xl, article.rounded-2xl');
  return parentCard ?? anchor;
}

function applyAccent(target: HTMLElement, seed: string, label: string) {
  if (target.getAttribute(ENHANCED_ATTRIBUTE) === 'true') return;

  const accent = getFacilityAccent(seed || label);
  target.setAttribute(ENHANCED_ATTRIBUTE, 'true');
  target.setAttribute('data-facility-accent', accent.name);
  target.style.borderColor = `${accent.hex}66`;
  target.style.background = `linear-gradient(90deg, ${accent.softHex}, rgba(15, 23, 42, 0.58))`;
  target.style.boxShadow = `inset 3px 0 0 ${accent.hex}`;
}

function enhanceFacilityAnchor(anchor: HTMLAnchorElement) {
  if (anchor.getAttribute(ENHANCED_ATTRIBUTE) === 'true') return;

  const href = anchor.getAttribute('href') ?? '';
  const seed = getFacilitySeedFromHref(href);
  if (!seed) return;

  anchor.setAttribute(ENHANCED_ATTRIBUTE, 'true');
  appendContextToFacilityLink(anchor);

  const label = getReadableFacilityLabel(anchor, seed);
  const target = getAccentTarget(anchor);
  applyAccent(target, seed || label, label);
}

function enhanceFacilityLabels() {
  document.querySelectorAll<HTMLLabelElement>('label').forEach((label) => {
    if (label.getAttribute(ENHANCED_ATTRIBUTE) === 'true') return;
    if (!label.querySelector('input[type="checkbox"]')) return;

    const titleElement = label.querySelector('span span');
    const subtitleElement = titleElement?.nextElementSibling;
    const title = titleElement?.textContent?.trim();

    if (!title || !subtitleElement?.textContent?.trim()) return;
    applyAccent(label, title, title);
  });
}

function enhanceCurrentFacilityReferences() {
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/facilities/"][href*="/calendar"]').forEach(enhanceFacilityAnchor);
  enhanceFacilityLabels();
}

export function FacilityAccentEnhancer() {
  useEffect(() => {
    enhanceCurrentFacilityReferences();
    const observer = new MutationObserver(enhanceCurrentFacilityReferences);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
