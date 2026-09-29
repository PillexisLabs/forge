import assert from 'node:assert/strict';
import test from 'node:test';
import { csvUrlFor, parseCsv, rowsFromCsv } from '../src/modules/sheets/sheets-intake';

test('a normal Google Sheets link becomes its CSV export link', () => {
  assert.equal(
    csvUrlFor('https://docs.google.com/spreadsheets/d/1AbC_x-9/edit#gid=123'),
    'https://docs.google.com/spreadsheets/d/1AbC_x-9/export?format=csv&gid=123',
  );
  assert.equal(csvUrlFor('https://docs.google.com/spreadsheets/d/1AbC/edit'), 'https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=0');
});

test('CSV with quoted commas, doubled quotes and CRLF', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('Google Form headers map to enquiry fields, and quantity and pincode join the message', () => {
  const csv = 'Timestamp,Your name,WhatsApp number,Company name,What do you need?,Quantity,Delivery pincode\n'
    + '29/09/2026 10:02,Rahul,98450 11223,Mehta Namkeen,Stand-up pouch 250 ml 2 colour,5000,560058\n';
  const { rows } = rowsFromCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Rahul');
  assert.equal(rows[0].phone, '98450 11223');
  assert.equal(rows[0].company, 'Mehta Namkeen');
  assert.equal(rows[0].message, 'Stand-up pouch 250 ml 2 colour. Quantity 5000. Delivery pincode 560058');
  // The same row always gets the same key, so a re-read never duplicates it.
  assert.equal(rowsFromCsv(csv).rows[0].key, rows[0].key);
});
