/**
 * Builds the Supabase auth mail templates in every app language
 * (docs/mail-templates/, docs/i18n.md area 6b). Supabase has one template
 * per mail; each file here picks the text by the account's language
 * (`.Data.locale`, set by the app at sign-up and when the language changes)
 * and falls back to English. Paste them in the Supabase dashboard:
 * Authentication → Emails → Templates. `--check` fails when a file is out of
 * date (`npm run check:i18n`).
 */

import fs from 'node:fs';
import path from 'node:path';

import { LOCALES } from '../src/shared/i18n/locales';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const messagesDir = path.join(root, 'src/shared/i18n/messages');
const outDir = path.join(root, 'docs/mail-templates');

const MAILS = [
  { file: 'confirm-signup', key: 'mail.confirm' },
  { file: 'reset-password', key: 'mail.reset' },
  { file: 'change-email', key: 'mail.change' },
] as const;

/** `{email}` in a text becomes the template variable. */
const GO_VARIABLES: Record<string, string> = { email: '{{ .Email }}', newEmail: '{{ .NewEmail }}' };

const catalogs = Object.fromEntries(
  LOCALES.map(({ code }) => [code, JSON.parse(fs.readFileSync(path.join(messagesDir, `${code}.json`), 'utf8')) as Record<string, string>]),
);
const english = catalogs.en;

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function text(code: string, key: string) {
  const value = catalogs[code]?.[key] ?? english[key];
  if (value === undefined) throw new Error(`${key} is missing in en.json`);
  return escapeHtml(value).replace(/\{(\w+)\}/g, (match, name: string) => GO_VARIABLES[name] ?? match);
}

function body(code: string, key: string) {
  return [
    `<h2>${text(code, `${key}.heading`)}</h2>`,
    `<p>${text(code, `${key}.text`)}</p>`,
    `<p><a href="{{ .ConfirmationURL }}">${text(code, `${key}.button`)}</a></p>`,
    `<p>${text(code, 'mail.ignore')}</p>`,
  ].join('\n');
}

/** English last, as the fallback for every other or unknown language. */
function byLanguage(render: (code: string) => string, locale = ".Data.locale", valuePrefix = "") {
  const others = LOCALES.map(({ code }) => code).filter((code) => code !== 'en');
  if (others.length === 0) return render('en');
  return [
    ...others.map((code, index) => `{{ ${index === 0 ? 'if' : 'else if'} eq ${locale} "${valuePrefix}${code}" }}\n${render(code)}`),
    `{{ else }}\n${render('en')}\n{{ end }}`,
  ].join('\n');
}

/** Read the supported lang suffix without assuming a host. Padding makes empty redirects safe. */
const resetLocale = [
  '{{ $locale := .Data.locale }}{{$url := print "????????" .RedirectTo}}{{$query := slice $url (len (slice $url 8))}}',
  ...LOCALES.map(({ code }, index) => `{{ ${index === 0 ? 'if' : 'else if'} eq $query "?lang=${code}" }}{{ $locale = "${code}" }}`),
  '{{ end }}',
].join('');

// Supabase limits the subject template itself to 255 characters. Share the brand
// prefix and use compact Go actions; old/unknown redirects keep an English subject.
const resetSubjectLocale = '{{$u:=print "????????" .RedirectTo}}{{$l:=slice $u (len (slice $u 8))}}';

function resetBody(code: string) {
  return `<table role="presentation" lang="${code}" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#16212e;line-height:1.6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 28px;font-size:20px;font-weight:800;letter-spacing:1px;color:#16212e">CLUB OS</p>
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25">${text(code, 'mail.reset.heading')}</h1>
<p style="margin:0 0 24px;font-size:16px">${text(code, 'mail.reset.text')}</p>
<p style="margin:0 0 24px"><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 22px;background:#6ee7b7;border-radius:8px;color:#052e22;font-size:16px;font-weight:700;text-decoration:none">${text(code, 'mail.reset.button')}</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#475569">${text(code, 'mail.reset.validity')}</p>
<p style="margin:0 0 24px;font-size:14px;color:#475569">${text(code, 'mail.reset.ignore')}</p>
<p style="margin:0;font-size:16px">${text(code, 'mail.reset.signoff')}</p>
</td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569">
<p style="margin:0 0 6px">${text(code, 'mail.reset.support')}</p>
<p style="margin:0">Club OS · clubos.hebinova.de</p>
</td></tr></table>
</td></tr></table>`;
}

const files: Record<string, string> = {};
for (const mail of MAILS) {
  const reset = mail.file === 'reset-password';
  const prefix = reset ? resetLocale : '';
  const selector = reset ? '$locale' : '.Data.locale';
  files[`${mail.file}.html`] = `<!-- Generated by \`npm run mail-templates\` from the app texts (${mail.key}.*). Paste into Supabase → Authentication → Emails. -->\n${prefix}${byLanguage((code) => reset ? resetBody(code) : body(code, mail.key), selector)}\n`;
  const subject = reset
    ? `${resetSubjectLocale}Club OS – ${byLanguage((code) => text(code, `${mail.key}.subject`).replace(/^Club OS – /, ''), '$l', '?lang=').replace(/\n/g, '').replace(/{{ /g, '{{').replace(/ }}/g, '}}')}`
    : byLanguage((code) => text(code, `${mail.key}.subject`), selector).replace(/\n/g, '');
  if (reset && subject.length > 255) throw new Error(`${mail.file} subject template exceeds Supabase's 255-character limit`);
  files[`${mail.file}.subject.txt`] = `${subject}\n`;
}

if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([name, content]) => {
    const full = path.join(outDir, name);
    return !fs.existsSync(full) || fs.readFileSync(full, 'utf8') !== content;
  });
  if (stale.length > 0) {
    console.log(`FAIL  docs/mail-templates is out of date (${stale.map(([name]) => name).join(', ')}): run \`npm run mail-templates\` and paste the changed templates into Supabase.`);
    process.exit(1);
  }
  console.log('mail templates up to date');
} else {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), content);
  console.log(`wrote ${Object.keys(files).length} files to docs/mail-templates`);
}
