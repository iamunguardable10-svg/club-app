/**
 * What is open over the page, in the order it was opened.
 *
 * Every sheet and dialog registers its "close" here (through `useEscape`), so
 * one place can close the top one: the Escape key, the phone's "back", and a
 * swipe down. No React and no state of its own beyond the list.
 */

type Entry = { close: () => void };

const stack: Entry[] = [];

export function openSheet(entry: Entry): () => void {
  stack.push(entry);
  return () => {
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
  };
}

export function isTopSheet(entry: Entry): boolean {
  return stack[stack.length - 1] === entry;
}

export function openSheetCount(): number {
  return stack.length;
}

/** Closes what is on top. Returns whether there was something to close. */
export function closeTopSheet(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
