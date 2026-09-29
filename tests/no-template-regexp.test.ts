import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// The production minifier rewrites a template-string RegExp with escapes
// (new RegExp(`...\\b...`)) into a plain string where "\b" becomes a
// backspace. The dev server and tests run the source, so only a deployed
// server breaks. Build dynamic patterns with regex literals or plain strings.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

test('no RegExp is built from a template string with backslash escapes', () => {
  const offenders = files('src').filter((file) => /new RegExp\(`[^`]*\\\\/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
