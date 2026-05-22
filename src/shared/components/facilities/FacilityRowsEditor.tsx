'use client';

export type FacilityDraftRow = {
  id: string;
  name: string;
  address: string;
};

type FacilityRowsEditorProps = {
  facilities: FacilityDraftRow[];
  onChange: (facilities: FacilityDraftRow[]) => void;
  addressRequired?: boolean;
};

function createFacilityDraftRow(): FacilityDraftRow {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `facility-${Date.now()}-${Math.random()}`,
    name: '',
    address: '',
  };
}

export function createInitialFacilityDraftRows(rows: Array<{ name: string; address?: string }>): FacilityDraftRow[] {
  return rows.map((row, index) => ({
    id: `initial-facility-${index}`,
    name: row.name,
    address: row.address ?? '',
  }));
}

export function getCompletedFacilityDraftRows(rows: FacilityDraftRow[]) {
  return rows
    .map((row) => ({
      ...row,
      name: row.name.trim(),
      address: row.address.trim(),
    }))
    .filter((row) => row.name);
}

export function FacilityRowsEditor({ facilities, onChange, addressRequired = false }: FacilityRowsEditorProps) {
  function updateFacility(id: string, updates: Partial<Pick<FacilityDraftRow, 'name' | 'address'>>) {
    onChange(facilities.map((facility) => (facility.id === id ? { ...facility, ...updates } : facility)));
  }

  function addFacility() {
    onChange([...facilities, createFacilityDraftRow()]);
  }

  function removeFacility(id: string) {
    if (facilities.length <= 1) {
      onChange([createFacilityDraftRow()]);
      return;
    }

    onChange(facilities.filter((facility) => facility.id !== id));
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-3">
        {facilities.map((facility, index) => (
          <div key={facility.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 ring-1 ring-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Facility {index + 1}</p>
              <button type="button" onClick={() => removeFacility(facility.id)} className="text-xs font-black text-red-300 hover:text-red-200">
                Remove
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[0.85fr_1.15fr]">
              <label className="block">
                <span className="os-label">Internal hall name</span>
                <input
                  required
                  value={facility.name}
                  onChange={(event) => updateFacility(facility.id, { name: event.target.value })}
                  placeholder="Main Hall"
                  className="os-field focus:border-emerald-400 focus:ring-emerald-400/10"
                />
                <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">Use the name your club or department uses internally.</span>
              </label>
              <label className="block">
                <span className="os-label">Address or official place{addressRequired ? '' : ' optional'}</span>
                <input
                  required={addressRequired}
                  value={facility.address}
                  onChange={(event) => updateFacility(facility.id, { address: event.target.value })}
                  placeholder="Street, city"
                  className="os-field focus:border-emerald-400 focus:ring-emerald-400/10"
                />
                <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">Search by hall name, school, venue or street address. This does not change the internal name.</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={addFacility} className="rounded-xl border border-emerald-500/50 bg-emerald-300/5 px-4 py-3 text-sm font-black text-emerald-200 transition hover:border-emerald-300/70 hover:bg-emerald-300/10">
        + Add facility
      </button>
    </div>
  );
}
