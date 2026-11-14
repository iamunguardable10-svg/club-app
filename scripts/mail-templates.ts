/** Generate all Supabase account mails from the four app catalogs. */
import fs from 'node:fs';
import path from 'node:path';
import { LOCALES } from '../src/shared/i18n/locales';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'docs/mail-templates');
const catalogs = Object.fromEntries(LOCALES.map(({ code }) => [code, JSON.parse(fs.readFileSync(path.join(root, `src/shared/i18n/messages/${code}.json`), 'utf8')) as Record<string, string>]));
const MAILS = [
  { file: 'confirm-signup', key: 'mail.confirm', kind: 'link', dashboard: 'confirm-sign-up', requestLanguage: true, notes: ['mail.confirm.validity', 'mail.ignore'] },
  { file: 'invite-user', key: 'mail.invite', kind: 'link', dashboard: 'invite-user', requestLanguage: false, notes: ['mail.reset.validity', 'mail.ignore'] },
  { file: 'magic-link', key: 'mail.magic', kind: 'link', dashboard: 'magic-link-or-otp', requestLanguage: true, notes: ['mail.reset.validity', 'mail.ignore'] },
  { file: 'change-email', key: 'mail.change', kind: 'link', dashboard: 'change-email-address', requestLanguage: true, notes: ['mail.change.validity', 'mail.ignore'] },
  { file: 'reset-password', key: 'mail.reset', kind: 'link', dashboard: 'reset-password', requestLanguage: true, notes: ['mail.reset.validity', 'mail.reset.ignore'] },
  { file: 'reauthentication', key: 'mail.reauth', kind: 'code', dashboard: 'reauthentication', requestLanguage: false, notes: ['mail.codeSafety'] },
  { file: 'password-changed', key: 'mail.passwordChanged', kind: 'notice', dashboard: 'password-changed', requestLanguage: false, notes: ['mail.securityUnexpected'] },
  { file: 'email-address-changed', key: 'mail.emailChanged', kind: 'notice', dashboard: 'email-address-changed', requestLanguage: false, notes: ['mail.securityUnexpected'] },
  { file: 'phone-number-changed', key: 'mail.phoneChanged', kind: 'notice', dashboard: 'phone-number-changed', requestLanguage: false, notes: ['mail.securityUnexpected'] },
  { file: 'sign-in-method-linked', key: 'mail.identityLinked', kind: 'notice', dashboard: 'sign-in-method-linked', requestLanguage: false, notes: ['mail.securityUnexpected'] },
  { file: 'sign-in-method-removed', key: 'mail.identityUnlinked', kind: 'notice', dashboard: 'sign-in-method-removed', requestLanguage: false, notes: ['mail.securityUnexpected'] },
  { file: 'mfa-method-added', key: 'mail.mfaAdded', kind: 'notice', dashboard: 'mfa-method-added', requestLanguage: false, notes: ['mail.securityUnexpected'] },
  { file: 'mfa-method-removed', key: 'mail.mfaRemoved', kind: 'notice', dashboard: 'mfa-method-removed', requestLanguage: false, notes: ['mail.securityUnexpected'] },
] as const;
const VARIABLES: Record<string, string> = { email: 'Email', newEmail: 'NewEmail', oldEmail: 'OldEmail', phone: 'Phone', oldPhone: 'OldPhone', provider: 'Provider' };
function text(code: string, key: string) {
  const value = catalogs[code]?.[key] ?? catalogs.en[key];
  if (value === undefined) throw new Error(`Missing mail text: ${code}/${key}`);
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\{(\w+)\}/g, (match, name: string) => VARIABLES[name] ? `{{ .${VARIABLES[name]} }}` : match);
}
function byLanguage(render: (code: string) => string, selector = '$locale', omitEnglishDuplicates = false) {
  const translations = LOCALES.filter(({ code }) => code !== 'en' && (!omitEnglishDuplicates || render(code) !== render('en')));
  if (!translations.length) return render('en');
  return [
    ...translations.map(({ code }, i) => `{{ ${i === 0 ? 'if' : 'else if'} eq ${selector} "${code}" }}\n${render(code)}`),
    `{{ else }}\n${render('en')}\n{{ end }}`,
  ].join('\n');
}
// The language parameter is last, whether introduced by ? or &. Padding also
// handles empty/missing redirects. A missing or unsupported hint keeps account locale.
const requestLocale = '{{$locale:=.Data.locale}}{{$u:=print "???????" (or .RedirectTo "")}}{{$q:=slice $u (len (slice $u 7))}}{{if eq (slice $q 0 5) "lang="}}{{$locale = slice $q 5}}{{end}}';
// Only an explicit trailing lang= hint overrides metadata. A domain ending in
// .de is not a language request. Supabase redirect URLs are absolute (or absent).
// The root variable is local to the subject template; using it keeps the source
// within the hosted dashboard's 255-character limit, including the fallback.
const subjectRequestLocale = '{{$:=.Data.locale}}{{with .RedirectTo}}{{$s:=slice . (len (slice . 7))}}{{if eq (slice $s 0 5) "lang="}}{{$ =slice $s 5}}{{end}}{{end}}';
const compact = (s: string) => s.replace(/\n/g, '').replace(/{{ /g, '{{').replace(/ }}/g, '}}');
function body(code: string, mail: (typeof MAILS)[number]) {
  const action = mail.kind === 'link'
    ? `<p style="margin:0 0 24px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#6ee7b7;border-radius:8px;color:#052e22;font-size:16px;font-weight:700;text-decoration:none">${text(code, `${mail.key}.button`)}</a></p>`
    : mail.kind === 'code'
      ? '<p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>'
      : '';
  return `<table role="presentation" lang="${code}" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#16212e;line-height:1.6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 28px;font-size:20px;font-weight:800;letter-spacing:1px;color:#16212e">CLUB OS</p>
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25">${text(code, `${mail.key}.heading`)}</h1>
<p style="margin:0 0 24px;font-size:16px">${text(code, `${mail.key}.text`)}</p>
${action}
${mail.notes.map((note, i) => `<p style="margin:0 0 ${i === mail.notes.length - 1 ? 24 : 16}px;font-size:14px;color:#475569">${text(code, note)}</p>`).join('\n')}
<p style="margin:0;font-size:16px">${text(code, 'mail.reset.signoff')}</p>
</td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
<p style="margin:0 0 6px">${text(code, 'mail.reset.support')}</p>
<p style="margin:0">Club OS · clubos.hebinova.de</p>
</td></tr></table>
</td></tr></table>`;
}
const files: Record<string, string> = {};
for (const mail of MAILS) {
  const prefix = mail.requestLanguage ? requestLocale : '{{$locale:=.Data.locale}}';
  files[`${mail.file}.html`] = `<!-- Generated by npm run mail-templates. -->\n${prefix}${byLanguage((code) => body(code, mail))}\n`;
  const subject = `${mail.requestLanguage ? subjectRequestLocale : ''}${mail.requestLanguage ? 'Club OS: ' : 'Club OS – '}${compact(byLanguage((code) => text(code, `${mail.key}.subject`).replace(/^Club OS(?: – |: )/, ''), mail.requestLanguage ? '$' : '.Data.locale', true))}`;
  if (subject.length > 255) throw new Error(`${mail.file} subject template: ${subject.length} characters, maximum 255`);
  files[`${mail.file}.subject.txt`] = `${subject}\n`;
}
files['manifest.json'] = `${JSON.stringify(MAILS, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([name, value]) => !fs.existsSync(path.join(outDir, name)) || fs.readFileSync(path.join(outDir, name), 'utf8') !== value);
  if (stale.length) throw new Error(`Mail templates out of date: ${stale.map(([name]) => name).join(', ')}; run npm run mail-templates`);
  console.log('all 13 account mail templates up to date');
} else {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), value);
  console.log(`wrote ${MAILS.length} account mail templates in ${LOCALES.length} languages`);
}
