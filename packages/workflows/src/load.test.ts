// T-264 — the loader: the directory, the two lifetimes, and the draft rule.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkflows, WorkflowValidationError } from './load';
import type { KnownWorkers } from './validate';

// every worker the shipped definitions name — `document_builder` since T-309
const workers: KnownWorkers = {
  has: (worker) => ['corpus_retrieval', 'extractor', 'document_builder'].includes(worker),
  list: () => ['corpus_retrieval', 'extractor', 'document_builder'],
};

const dirs: string[] = [];

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'infora-workflows-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, 'utf8');
  return dir;
}

function workflowFile(id: string, status = 'active', version = 1): string {
  return `id: ${id}
version: ${version}
label: ${id}
description: A fixture workflow.
status: ${status}
parameters:
  - name: question
    type: string
    required: true
    description: The question to answer.
output_schema:
  answer: the grounded answer
steps:
  - id: retrieve
    stage: search_corpus
    worker: corpus_retrieval
    inputs:
      query: '{{parameters.question}}'
    depends_on: []
requires_workers:
  - corpus_retrieval
writes: none
`;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the workflow loader (T-264)', () => {
  it('reads every definition in the directory, keyed by id', () => {
    const dir = fixtureDir({ 'a.yaml': workflowFile('a'), 'b.yaml': workflowFile('b') });
    const registry = loadWorkflows({ dir, workers });
    expect(registry.list().map((workflow) => workflow.id)).toEqual(['a', 'b']);
    expect(registry.has('a')).toBe(true);
    expect(registry.get('b')?.label).toBe('b');
  });

  it('summaries carry what a picker needs and never the step inputs', () => {
    const dir = fixtureDir({ 'a.yaml': workflowFile('a') });
    const [summary] = loadWorkflows({ dir, workers }).summaries();
    expect(Object.keys(summary!).sort()).toEqual([
      'description',
      'id',
      'label',
      'version',
      'writes',
    ]);
  });

  it('a definition that does not validate is a BUILD FAILURE, not a quiet drop', () => {
    // the failure mode this guards: a declared workflow silently missing means
    // the run falls through to model-chosen and nobody is told why
    const dir = fixtureDir({
      'a.yaml': workflowFile('a').replace('corpus_retrieval\n    inputs', 'nope\n    inputs'),
    });
    expect(() => loadWorkflows({ dir, workers })).toThrow(WorkflowValidationError);
  });

  it('a draft is ABSENT in production, and present outside it — never disabled', () => {
    const dir = fixtureDir({ 'a.yaml': workflowFile('a'), 'b.yaml': workflowFile('b', 'draft') });
    expect(loadWorkflows({ dir, workers }).list().map((w) => w.id)).toEqual(['a']);
    expect(
      loadWorkflows({ dir, workers, production: false })
        .list()
        .map((w) => w.id),
    ).toEqual(['a', 'b']);
  });

  it('production reads once — a workflow cannot change under a run recording its version', () => {
    const dir = fixtureDir({ 'a.yaml': workflowFile('a', 'active', 1) });
    const registry = loadWorkflows({ dir, workers });
    expect(registry.get('a')?.version).toBe(1);
    writeFileSync(join(dir, 'a.yaml'), workflowFile('a', 'active', 2), 'utf8');
    expect(registry.get('a')?.version).toBe(1);
  });

  it('non-production re-reads, so an author sees an edit without a restart', () => {
    const dir = fixtureDir({ 'a.yaml': workflowFile('a', 'active', 1) });
    const registry = loadWorkflows({ dir, workers, production: false });
    expect(registry.get('a')?.version).toBe(1);
    writeFileSync(join(dir, 'a.yaml'), workflowFile('a', 'active', 2), 'utf8');
    expect(registry.get('a')?.version).toBe(2);
  });

  it('production defaults to TRUE — forgetting the flag loses hot reload, never gains drafts', () => {
    const dir = fixtureDir({ 'b.yaml': workflowFile('b', 'draft') });
    expect(loadWorkflows({ dir, workers }).list()).toEqual([]);
  });

  it('two files claiming one id fail to load', () => {
    const dir = fixtureDir({ 'a.yaml': workflowFile('a'), 'a.yml': workflowFile('a') });
    expect(() => loadWorkflows({ dir, workers })).toThrow(/declared by more than one file/);
  });

  it('a file that is not YAML fails to load, naming the file', () => {
    const dir = fixtureDir({ 'a.yaml': 'id: a\n  version: [' });
    expect(() => loadWorkflows({ dir, workers })).toThrow(/a\.yaml: is not valid YAML/);
  });
});
