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

function ensureAccentDot(anchor: HTMLAnchorElement, color: string) {
  if (anchor.querySelector('[data-club-app-facility-accent-dot="true"]')) return;

  const dot = document.createElement('span');
  dot.setAttribute('data-club-app-facility-accent-dot', 'true');
  dot.className = 'mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle';
  dot.style.backgroundColor = color;
  dot.style.boxShadow = `0 0 18px ${color}`;

  const title = anchor.querySelector('p, span');
  if (title) {
    title.prepend(dot);
  } else {
    anchor.prepend(dot);
  }
}

function appendContextToFacilityLink(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute('href');
  if (!href) return;
  if (!href.includes('/facilities/') || !href.includes('/calendar')) return;

  const closestDepartment = anchor.closest('[data-department-id], [data-demo-department]');
  const departmentId = closestDepartment?.getAttribute('data-department-id');
  const demoDepartment = closestDepartment?.getAttribute('data-demo-department');

  if (!departmentId && !demoDepartment) return;

  const url = new URL(href, window.location.origin);
  if (departmentId && !url.searchParams.has('departmentId')) url.searchParams.set('departmentId', departmentId);
  if (demoDepartment && !url.searchParams.has('department')) url.searchParams.set('department', demoDepartment);

  anchor.setAttribute('href', `${url.pathname}${url.search}`);
}

function enhanceFacilityAnchor(anchor: HTMLAnchorElement) {
  if (anchor.getAttribute(ENHANCED_ATTRIBUTE) === 'true') return;

  const href = anchor.getAttribute('href') ?? '';
  const seed = getFacilitySeedFromHref(href);
  if (!seed) return;

  anchor.setAttribute(ENHANCED_ATTRIBUTE, 'true');
  appendContextToFacilityLink(anchor);

  const label = getReadableFacilityLabel(anchor, seed);
  const accent = getFacilityAccent(seed || label);

  anchor.style.borderColor = `${accent.hex}66`;
  anchor.style.background = `linear-gradient(90deg, ${accent.softHex}, rgba(15, 23, 42, 0.58))`;
  anchor.style.boxShadow = `inset 3px 0 0 ${accent.hex}`;
  anchor.setAttribute('data-facility-accent', accent.name);
  ensureAccentDot(anchor, accent.hex);
}

function enhanceFacilityLabels() {
  document.querySelectorAll<HTMLLabelElement>('label').forEach((label) => {
    if (label.getAttribute(ENHANCED_ATTRIBUTE) === 'true') return;
    if (!label.querySelector('input[type="checkbox"]')) return;

    const title = label.querySelector('span span, span')?.textContent?.trim();
    if (!title) return;

    const lower = title.toLowerCase();
    if (lower.includes('department') || lower.includes('basketball') || lower.includes('football')) return;

    const accent = getFacilityAccent(title);
    label.setAttribute(ENHANCED_ATTRIBUTE, 'true');
    label.style.borderColor = `${accent.hex}55`;
    label.style.background = `linear-gradient(90deg, ${accent.softHex}, rgba(15, 23, 42, 0.52))`;
    label.style.boxShadow = `inset 3px 0 0 ${accent.hex}`;
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
