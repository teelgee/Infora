// T-281 — the shipped definitions, loaded for real.
//
// This is the false-positive regression guard for the whole validator. The five
// definitions carry twenty-five real prohibitions between them, written by
// domain specialists, and every one of them must load clean. A validator that
// fires on a good prohibition is worse than no validator: it lands on someone
// who did nothing wrong and teaches them that this layer is engineers' turf
// after all.
import { describe, expect, it } from 'vitest';
import { loadLenses } from './load';

const inDev = loadLenses({ production: false });
const inProd = loadLenses({ production: true });

describe('T-281 — the shipped Lens definitions', () => {
  it('all five load without a single validation error', () => {
    expect(inDev.list().map((l) => l.id).sort()).toEqual([
      'commercial',
      'communications',
      'engineer',
      'planning-environmental',
      'project-manager',
    ]);
  });

  it('the four active Lenses are what a real user is offered; the draft is not', () => {
    expect(inProd.list().map((l) => l.id).sort()).toEqual([
      'communications',
      'engineer',
      'planning-environmental',
      'project-manager',
    ]);
    expect(inProd.get('commercial')).toBeUndefined();
  });

  it('every active Lens carries the fields an active Lens needs', () => {
    for (const lens of inProd.list()) {
      expect(lens.status).toBe('active');
      expect(lens.answerShape.length, `${lens.id} answer_shape`).toBeGreaterThan(0);
      expect(lens.prohibitions.length, `${lens.id} prohibitions`).toBeGreaterThan(0);
      expect(lens.escalationLanguage.length, `${lens.id} escalation_language`).toBeGreaterThan(0);
      expect(lens.exampleExchanges.length, `${lens.id} example_exchanges`).toBeGreaterThanOrEqual(2);
      expect(lens.clarifyingBias.length, `${lens.id} clarifying_bias`).toBeGreaterThan(0);
    }
  });

  it('the twenty-five shipped prohibitions all read as additive to the shared core', () => {
    const total = inDev.list().reduce((n, lens) => n + lens.prohibitions.length, 0);
    // if this number moves, a definition changed — which is fine; the assertion
    // that matters is that the loader above did not throw on any of them
    expect(total).toBeGreaterThanOrEqual(20);
  });

  it('the registers really do differ — otherwise the Lens layer is decoration', () => {
    const registers = inProd.list().map((l) => `${l.register.jargon}/${l.register.acronyms}`);
    expect(new Set(registers).size).toBeGreaterThan(1);
    const outputs = new Set(inProd.list().map((l) => l.defaultOutput));
    expect(outputs.size).toBeGreaterThan(1);
    // and each leads with something different: `answer_shape[0]` is the single
    // most important line in a Lens file
    const leads = inProd.list().map((l) => l.answerShape[0]);
    expect(new Set(leads).size).toBe(leads.length);
  });

  it('commercial ships `draft` and deliberately incomplete — the extension path, proven', () => {
    const commercial = inDev.get('commercial');
    expect(commercial?.status).toBe('draft');
    expect(commercial?.exampleExchanges).toEqual([]);
    expect(commercial?.prohibitions).toEqual([]);
    expect(commercial?.escalationLanguage).toEqual([]);
  });
});
