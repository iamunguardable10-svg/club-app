import { redirect } from 'next/navigation';

/** News became part of Messages (2026-10-02); older pushes and links still land here. */
export default function News() {
  redirect('/messages');
}
