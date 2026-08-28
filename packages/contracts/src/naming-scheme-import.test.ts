// T-338 — the schema import's diff, which is the function that decides whether
// an owner's schema survives an import.
//
// The ticket's own reasoning is the test plan: *"`Reset to Infora default`
// already sits beside it, and an import that quietly wiped a schema in progress
// is the same accident with a worse cause."* So the cases that matter are the
// ones where a naive merge would lose something — the coded reference's
// settings, a renamed field arriving twice, and a field the sheet simply does
// not mention.
import { describe, expect, it } from 'vitest';
import type { NamingSchemeField } from './endpoints';
import { applyNamingSchemeImport, diffNamingSchemeFields } from './endpoints';

const field = (f: Partial<NamingSchemeField> & { key: string; label: string }): NamingSchemeField => f;

const CURRENT: NamingSchemeField[] = [
  field({
    key: 'discipline',
    label: 'Discipline',
    type: 'select',
    inCode: true,
    required: true,
    isOriginator: true,
    allowedValues: ['ECV'],
    allowedValueLabels: { ECV: 'Engineering – Civils' },
  }),
  field({ key: 'sequence', label: 'Sequence', type: 'serial', inCode: true, isSerial: true, width: 6 }),
  field({ key: 'lead_reviewer', label: 'Lead reviewer', type: 'person', role: 'lead_reviewer' }),
];

describe('diffNamingSchemeFields (T-338)', () => {
  it('adds what the sheet has and the schema does not', () => {
    const diff = diffNamingSchemeFields(CURRENT, [
      field({ key: 'zone', label: 'Zone', type: 'select', allowedValues: ['Z1', 'Z2'] }),
    ]);
    expect(diff.add.map((f) => f.key)).toEqual(['zone']);
    expect(diff.change).toEqual([]);
    // everything the sheet did not mention is REPORTED, not removed
    expect(diff.drop.map((f) => f.key)).toEqual(['discipline', 'sequence', 'lead_reviewer']);
  });

  it('reports a changed label and a changed option list, and says which', () => {
    const diff = diffNamingSchemeFields(CURRENT, [
      field({
        key: 'discipline',
        label: 'Discipline / Role',
        type: 'select',
        allowedValues: ['ECV', 'EGE'],
        allowedValueLabels: { ECV: 'Engineering – Civils', EGE: 'Engineering – Geotechnics' },
      }),
    ]);
    expect(diff.add).toEqual([]);
    expect(diff.change).toHaveLength(1);
    expect(diff.change[0]!.what.join(' | ')).toContain('label');
    expect(diff.change[0]!.what.join(' | ')).toContain('options 1 → 2');
  });

  it('an identical sheet is no change at all — the import is not a no-op that looks like work', () => {
    const diff = diffNamingSchemeFields(CURRENT, [
      field({
        key: 'discipline',
        label: 'Discipline',
        type: 'select',
        allowedValues: ['ECV'],
        allowedValueLabels: { ECV: 'Engineering – Civils' },
      }),
    ]);
    expect(diff.add).toEqual([]);
    expect(diff.change).toEqual([]);
  });

  it('matches on the LABEL when the key differs — a renamed field is not a new one', () => {
    // the parse derives a key from the sheet's own field name, so a firm that
    // renamed a label without renaming the key would otherwise end up with two
    // copies of the same field
    const current = [field({ key: 'disc', label: 'Discipline', type: 'select', inCode: true })];
    const diff = diffNamingSchemeFields(current, [
      field({ key: 'discipline', label: 'Discipline', type: 'select', allowedValues: ['ECV'] }),
    ]);
    expect(diff.add).toEqual([]);
    expect(diff.change).toHaveLength(1);
    expect(diff.change[0]!.current.key).toBe('disc');
  });
});

describe('applyNamingSchemeImport (T-338)', () => {
  it('KEEPS every setting a spreadsheet has no view on', () => {
    // the accident the ticket names, arriving through a merge instead of a
    // replace: flattening these would silently unmake the coded reference
    const incoming = [
      field({ key: 'discipline', label: 'Discipline', type: 'select', allowedValues: ['ECV', 'EGE'] }),
    ];
    const next = applyNamingSchemeImport(
      CURRENT,
      diffNamingSchemeFields(CURRENT, incoming),
      false,
    );
    const discipline = next.find((f) => f.key === 'discipline')!;
    expect(discipline.inCode).toBe(true);
    expect(discipline.required).toBe(true);
    expect(discipline.isOriginator).toBe(true);
    expect(discipline.allowedValues).toEqual(['ECV', 'EGE']);
    // and the serial field's width and the role slot are untouched
    expect(next.find((f) => f.key === 'sequence')!.width).toBe(6);
    expect(next.find((f) => f.key === 'lead_reviewer')!.role).toBe('lead_reviewer');
  });

  it('keeps unmentioned fields unless dropping is explicitly asked for', () => {
    const incoming = [field({ key: 'zone', label: 'Zone', type: 'select', allowedValues: ['Z1'] })];
    const diff = diffNamingSchemeFields(CURRENT, incoming);
    expect(applyNamingSchemeImport(CURRENT, diff, false).map((f) => f.key)).toEqual([
      'discipline',
      'sequence',
      'lead_reviewer',
      'zone',
    ]);
    expect(applyNamingSchemeImport(CURRENT, diff, true).map((f) => f.key)).toEqual(['zone']);
  });

  it('adds arrive at the end — order is the owner’s, because it orders the reference', () => {
    const incoming = [field({ key: 'zone', label: 'Zone', type: 'select', allowedValues: ['Z1'] })];
    const next = applyNamingSchemeImport(
      CURRENT,
      diffNamingSchemeFields(CURRENT, incoming),
      false,
    );
    expect(next.at(-1)!.key).toBe('zone');
  });

  it('writes nothing and mutates nothing — the existing PUT is still what commits', () => {
    const before = JSON.stringify(CURRENT);
    const incoming = [field({ key: 'discipline', label: 'Renamed', type: 'select', allowedValues: ['X'] })];
    applyNamingSchemeImport(CURRENT, diffNamingSchemeFields(CURRENT, incoming), true);
    expect(JSON.stringify(CURRENT)).toBe(before);
  });
});
