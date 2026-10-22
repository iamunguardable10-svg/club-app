'use client';

/**
 * Where the car leaves from, picked like a pickup point in a ride app: the
 * pin stays in the middle and the map moves under it (drag to move, pinch to
 * zoom; no buttons). A search jumps close to the street or place first. When
 * the map stops, the spot under the pin is the meeting point and its address
 * fills the label, unless the driver typed a name ("School car park").
 * Loaded only when a driver edits a ride (Leaflet; the map tiles come
 * through `/api/tiles`).
 */

import 'leaflet/dist/leaflet.css';
import L, { type Map as LeafletMap } from 'leaflet';
import { useEffect, useRef, useState } from 'react';

import { AddressField } from '@/features/facilities/AddressField';
import { fetchAddressAt, fetchAddressSuggestions, type AddressSuggestion } from '@/features/facilities/addressAutocomplete';
import { useLocale, useT } from '@/shared/i18n';

export type MeetPin = { label: string; lat: number | null; lng: number | null };

const GERMANY: [number, number] = [51.16, 10.45];
const MAX_LABEL = 120;
const LOOKUP_DELAY_MS = 400;

function labelOf(place: AddressSuggestion): string {
  return (place.name ? `${place.name}, ${place.address}` : place.address).slice(0, MAX_LABEL);
}

export default function MeetPointPicker({ value, onChange, centerHint }: { value: MeetPin; onChange: (value: MeetPin) => void; centerHint?: string | null }) {
  const t = useT();
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [moving, setMoving] = useState(false);
  // The handlers below are set up once; they read the latest value from here.
  const latest = useRef({ value, onChange, locale });
  latest.current = { value, onChange, locale };
  // The label the map filled in last; a name the driver typed is not replaced.
  const autoLabel = useRef<string | null>(null);
  // A move made by the app (the first view near the game) sets no meeting point.
  const quietMove = useRef(false);
  const lookup = useRef<number | undefined>(undefined);

  /** Moves the map without taking the spot (Leaflet reports an unanimated move at once). */
  function quietView(center: [number, number], zoom: number) {
    quietMove.current = true;
    map.current?.setView(center, zoom, { animate: false });
    quietMove.current = false;
  }

  /** The spot under the pin becomes the meeting point; its address follows shortly. */
  function takeCenter(label?: string) {
    const target = map.current;
    if (!target) return;
    const { lat, lng } = target.getCenter();
    const current = latest.current.value;
    if (label !== undefined) autoLabel.current = label;
    latest.current.onChange({ label: label ?? current.label, lat, lng });
    window.clearTimeout(lookup.current);
    if (label !== undefined) return;
    lookup.current = window.setTimeout(() => {
      void fetchAddressAt(lat, lng, { lang: latest.current.locale }).then((found) => {
        const typed = latest.current.value.label.trim();
        if (!found || (typed && typed !== autoLabel.current)) return;
        autoLabel.current = labelOf(found);
        latest.current.onChange({ label: autoLabel.current, lat, lng });
      }).catch(() => undefined);
    }, LOOKUP_DELAY_MS);
  }

  useEffect(() => {
    if (!container.current) return;
    const start = latest.current.value;
    // Pinch and drag; no zoom buttons.
    // Zooming keeps the middle in place, so the spot under the pin stays put.
    const target = L.map(container.current, {
      zoomControl: false, attributionControl: true, bounceAtZoomLimits: false,
      touchZoom: 'center', scrollWheelZoom: 'center', doubleClickZoom: 'center',
    });
    map.current = target;
    L.tileLayer('/api/tiles/{z}/{x}/{y}', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(target);
    target.attributionControl.setPrefix(false);
    target.on('movestart', () => setMoving(true));
    target.on('moveend', () => {
      setMoving(false);
      if (!quietMove.current) takeCenter();
    });
    if (start.lat !== null && start.lng !== null) {
      quietView([start.lat, start.lng], 17);
    } else {
      quietView(GERMANY, 5);
      // Start near the game (its hall or the away address) when known.
      if (centerHint) {
        void fetchAddressSuggestions(centerHint, { lang: latest.current.locale }).then(([first]) => {
          if (first?.lat === undefined || first.lon === undefined || latest.current.value.lat !== null) return;
          quietView([first.lat, first.lon], 14);
        }).catch(() => undefined);
      }
    }
    return () => { window.clearTimeout(lookup.current); target.remove(); map.current = null; };
    // Set up once; the handlers read the latest props through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placed = value.lat !== null;
  return (
    <div className="grid gap-2">
      <AddressField
        value={value.label}
        onChange={(label) => onChange({ ...value, label: label.slice(0, MAX_LABEL) })}
        onPick={(found) => {
          if (found.lat === undefined || found.lon === undefined || !map.current) return;
          // Close to the place; the driver then moves the map to the exact spot.
          const zoom = found.precision === 'spot' ? 18 : found.precision === 'street' ? 17 : 14;
          quietView([found.lat, found.lon], zoom);
          takeCenter(labelOf(found));
        }}
        label={t('carpools.meetPoint')}
        placeholder={t('carpools.meetPointSearch')}
      />
      <div className="relative isolate h-60 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        <div ref={container} className="h-full w-full" />
        {/* The pin stays in the middle; it lifts while the map moves, its tip marks the spot. */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
          <div className={`flex flex-col items-center transition-transform duration-150 ${moving ? '-translate-y-2' : ''} ${placed || moving ? '' : 'opacity-70'}`}>
            <div className="grid h-8 w-8 place-items-center rounded-full border-[3px] border-white bg-slate-950 shadow-lg">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
            </div>
            <div className="h-4 w-[3px] rounded-b bg-slate-950 shadow" />
          </div>
          <div className={`mx-auto -mt-0.5 h-1.5 w-3 rounded-full bg-black/40 transition-all duration-150 ${moving ? 'w-4 opacity-50' : ''}`} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{placed ? t('carpools.mapMoveHint') : t('carpools.mapHint')}</span>
        {placed ? (
          <button type="button" onClick={() => { autoLabel.current = null; onChange({ label: value.label, lat: null, lng: null }); }} className="shrink-0 font-bold text-slate-300 underline">
            {t('carpools.removePin')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
