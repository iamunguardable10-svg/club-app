'use client';
import { useState } from 'react';
import { AGE_GROUPS, defaultLoadForAge, teamFeatureChoices, updateTeamHealthSettings, type AgeGroup, type LocalDatabase, type Team } from '@/shared/data';
import { TeamFeatureSwitches } from '@/features/teams/FeatureSwitches';
import { errorText, useT } from '@/shared/i18n';
export function AgeLoadFields({ ageGroup, load, onChange }: { ageGroup: AgeGroup | null; load: boolean; onChange: (age: AgeGroup | null, load: boolean) => void }) {
  const t = useT();
  return <div className="grid min-w-0 gap-3" data-testid="age-load-fields"><label className="grid gap-1 text-sm font-bold text-slate-200">{t('consent.ageGroup')}<select className="os-field" value={ageGroup ?? ''} onChange={(e) => { const age = (e.target.value || null) as AgeGroup | null; onChange(age, defaultLoadForAge(age)); }}><option value="">{t('consent.unknown')}</option>{AGE_GROUPS.map((age) => <option key={age} value={age}>{age === 'adults' ? t('consent.adults') : age === 'mixed' ? t('consent.mixed') : age}</option>)}</select></label><label className="flex items-center gap-3 text-sm text-slate-200"><input type="checkbox" checked={load} onChange={(e) => onChange(ageGroup,e.target.checked)} className="h-4 w-4" />{t('consent.loadToggle')}</label><p className="text-xs text-slate-400">{t('consent.loadHint')}</p></div>;
}
/**
 * A team's settings for whoever may configure it (manageStaff): the age group
 * (it decides who needs a parent's consent) and the features the team uses.
 */
export function TeamHealthSettings({ database, team }: { database: LocalDatabase; team: Team }) {
  const t = useT(); const [age, setAge] = useState<AgeGroup | null>(team.ageGroup ?? null); const [error, setError] = useState<unknown>(null);
  return <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); setError(null); try { updateTeamHealthSettings(team.id, age, teamFeatureChoices(team).includes('load')); } catch(e) { setError(e); } }}><label className="grid gap-3 text-sm font-black text-slate-100">{t('consent.ageGroup')}<select className="os-field font-bold" value={age ?? ''} onChange={(e) => setAge((e.target.value || null) as AgeGroup | null)}><option value="">{t('consent.unknown')}</option>{AGE_GROUPS.map((value) => <option key={value} value={value}>{value === 'adults' ? t('consent.adults') : value === 'mixed' ? t('consent.mixed') : value}</option>)}</select></label>{age !== (team.ageGroup ?? null) ? <button className="os-secondary justify-center">{t('consent.saveAgeGroup')}</button> : null}{error ? <p role="alert" className="text-xs text-red-200">{errorText(t,error)}</p> : null}</form><div className="border-t border-slate-800 pt-4"><TeamFeatureSwitches database={database} team={team} /></div></div>;
}
