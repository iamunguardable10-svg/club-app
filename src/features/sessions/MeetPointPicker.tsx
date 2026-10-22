'use client';

/**
 * Where the car leaves from, like picking a pickup point in a ride app: search
 * an address or tap the map, then drag the pin to the exact spot. The label
 * stays editable ("School car park"). Loaded only when a driver edits a ride
 * (Leaflet and the map tiles, which come through `/api/tiles`).
 */

import 'leaflet/dist/leaflet.css';
import L, { type Map as LeafletMap, type Marker } from 'leaflet';
import { useEffect, useRef } from 'react';

import { AddressField } from '@/features/facilities/AddressField';
import { fetchAddressAt, fetchAddressSuggestions, type AddressSuggestion } from '@/features/facilities/addressAutocomplete';
import { useLocale, useT } from '@/shared/i18n';

export type MeetPin = { label: string; lat: number | null; lng: number | null };

const GERMANY: [number, number] = [51.16, 10.45];
const MAX_LABEL = 120;

const PIN = L.divIcon({
  className: '',
  html: '<div class="h-7 w-7 -translate-y-0.5 rotate-[-45deg] rounded-full rounded-bl-none border-[3px] border-white bg-emerald-400 shadow-lg"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function labelOf(place: AddressSuggestion): string {
  return (place.name ? `${place.name}, ${place.address}` : place.address).slice(0, MAX_LABEL);
}

export default function MeetPointPicker({ value, onChange, centerHint }: { value: MeetPin; onChange: (value: MeetPin) => void; centerHint?: string | null }) {
  const t = useT();
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  // The handlers below are set up once; they read the latest value from here.
  const latest = useRef({ value, onChange, locale });
  latest.current = { value, onChange, locale };
  // The label the map filled in last; a name the driver typed is not replaced.
  const autoLabel = useRef<string | null>(null);

  function place(lat: number, lng: number, lookUp: boolean) {
    const target = map.current;
    if (!target) return;
    if (marker.current) marker.current.setLatLng([lat, lng]);
    else {
      marker.current = L.marker([lat, lng], { icon: PIN, draggable: true, keyboard: false }).addTo(target);
      marker.current.on('dragend', () => {
        const at = marker.current!.getLatLng();
        place(at.lat, at.lng, true);
      });
    }
    latest.current.onChange({ ...latest.current.value, lat, lng });
    if (!lookUp) return;
    void fetchAddressAt(lat, lng, { lang: latest.current.locale }).then((found) => {
      const current = latest.current.value.label.trim();
      if (!found || (current && current !== autoLabel.current)) return;
      autoLabel.current = labelOf(found);
      latest.current.onChange({ label: autoLabel.current, lat, lng });
    }).catch(() => undefined);
  }

  useEffect(() => {
    if (!container.current) return;
    const start = latest.current.value;
    const target = L.map(container.current, { zoomControl: true, attributionControl: true });
    map.current = target;
    L.tileLayer('/api/tiles/{z}/{x}/{y}', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(target);
    target.attributionControl.setPrefix(false);
    target.on('click', (event) => place(event.latlng.lat, event.latlng.lng, true));
    if (start.lat !== null && start.lng !== null) {
      target.setView([start.lat, start.lng], 16);
      place(start.lat, start.lng, false);
    } else {
      target.setView(GERMANY, 5);
      // Start near the game (its hall or the away address) when known.
      if (centerHint) {
        void fetchAddressSuggestions(centerHint, { lang: latest.current.locale }).then(([first]) => {
          if (first?.lat !== undefined && first.lon !== undefined && !marker.current) target.setView([first.lat, first.lon], 13);
        }).catch(() => undefined);
      }
    }
    return () => { target.remove(); map.current = null; marker.current = null; };
    // Set up once; `place` reads the latest props through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-2">
      <AddressField
        value={value.label}
        onChange={(label) => onChange({ ...value, label: label.slice(0, MAX_LABEL) })}
        onPick={(found) => {
          if (found.lat === undefined || found.lon === undefined) return;
          // The search finds the area; the exact spot is a tap on the map.
          // Only a building or named place is precise enough for the pin.
          if (found.precision === 'spot') {
            map.current?.setView([found.lat, found.lon], 18);
            place(found.lat, found.lon, false);
            autoLabel.current = labelOf(found);
            onChange({ label: autoLabel.current, lat: found.lat, lng: found.lon });
            return;
          }
          map.current?.setView([found.lat, found.lon], found.precision === 'street' ? 17 : 14);
          marker.current?.remove();
          marker.current = null;
          // The search text stays until the driver taps the spot (then the address there is filled in).
          autoLabel.current = labelOf(found);
          onChange({ label: autoLabel.current, lat: null, lng: null });
        }}
        label={t('carpools.meetPoint')}
        placeholder={t('carpools.meetPointSearch')}
      />
      <div ref={container} className="isolate h-52 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-800" />
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{value.lat === null ? (value.label ? t('carpools.mapTapHint') : t('carpools.mapHint')) : t('carpools.mapDragHint')}</span>
        {value.lat !== null ? (
          <button
            type="button"
            onClick={() => { marker.current?.remove(); marker.current = null; onChange({ ...value, lat: null, lng: null }); }}
            className="shrink-0 font-bold text-slate-300 underline"
          >
            {t('carpools.removePin')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
