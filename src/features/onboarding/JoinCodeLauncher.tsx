'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function JoinCodeLauncher() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode) return;
    router.push(`/join/${encodeURIComponent(cleanCode)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <label className="block">
        <span className="sr-only">Team code</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Team code"
          className="os-field mt-0"
        />
      </label>
      <button type="submit" className="os-primary justify-center">
        Join team
      </button>
    </form>
  );
}
