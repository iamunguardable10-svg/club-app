'use client';
import { useState } from 'react';
import { AGE_GROUPS, defaultLoadForAge, updateTeamHealthSettings, type AgeGroup, type Team } from '@/shared/data';
import { errorText, useT } from '@/shared/i18n';
export function AgeLoadFields({ ageGroup, load, onChange }: { ageGroup: AgeGroup | null; load: boolean; onChange: (age: AgeGroup | null, load: boolean) => void }) {
  const t = useT();
  return <div className="grid min-w-0 gap-3" data-testid="age-load-fields"><label className="grid gap-1 text-sm font-bold text-slate-200">{t('consent.ageGroup')}<select className="os-field" value={ageGroup ?? ''} onChange={(e) => { const age = (e.target.value || null) as AgeGroup | null; onChange(age, defaultLoadForAge(age)); }}><option value="">{t('consent.unknown')}</option>{AGE_GROUPS.map((age) => <option key={age} value={age}>{age === 'adults' ? t('consent.adults') : age === 'mixed' ? t('consent.mixed') : age}</option>)}</select></label><label className="flex items-center gap-3 text-sm text-slate-200"><input type="checkbox" checked={load} onChange={(e) => onChange(ageGroup,e.target.checked)} className="h-4 w-4" />{t('consent.loadToggle')}</label><p className="text-xs text-slate-400">{t('consent.loadHint')}</p></div>;
}
export function TeamHealthSettings({ team }: { team: Team }) {
  const t = useT(); const [age, setAge] = useState<AgeGroup | null>(team.ageGroup ?? null); const [load, setLoad] = useState(team.features.includes('load')); const [error, setError] = useState<unknown>(null);
  return <form className="os-panel grid gap-3 p-4" onSubmit={(e) => { e.preventDefault(); setError(null); try { updateTeamHealthSettings(team.id,age,load); } catch(e) { setError(e); } }}><AgeLoadFields ageGroup={age} load={load} onChange={(a,l) => { setAge(a); setLoad(l); }} /><button disabled={age === (team.ageGroup ?? null) && load === team.features.includes('load')} className="os-secondary justify-center disabled:opacity-50">{t('consent.saveTeam')}</button>{error ? <p role="alert" className="text-xs text-red-200">{errorText(t,error)}</p> : null}</form>;
}
