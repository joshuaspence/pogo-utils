/**
 * The worker pool's two failure paths, which the corpus cannot reach: a real Tesseract neither traps on a capture nor
 * fails to load its model there. tesseract.js is stood in for, so these are claims about the pool and not the engine.
 */

import { afterEach, expect, test, vi } from 'vitest';

const { createWorker } = vi.hoisted(() => ({ createWorker: vi.fn() }));

vi.mock('tesseract.js', () => ({ createWorker, OEM: { LSTM_ONLY: 1 } }));

const { MODEL_SHA256, tesseractWasm } = await import('./ocr-wasm.mts');

/** The digest `crypto.subtle` answers for the model the check expects, or for one it does not. */
const digestOf = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)).buffer;

/** A stand-in worker whose model hashes as asked and whose reads do as `recognize` says. */
const worker = (recognize: () => Promise<unknown>) => ({
  FS: () => Promise.resolve({ data: new Uint8Array(1) }),
  recognize,
  terminate: () => Promise.resolve(),
});

const image = { width: 1, height: 1, data: new Uint8Array(4) };

afterEach(() => {
  vi.restoreAllMocks();
  createWorker.mockReset();
});

/**
 * One worker, two reads: the second waits on the first's worker. The first traps, which replaces the worker for the
 * read waiting on it — and where that replacement cannot be made, the waiting read has to fail rather than wait on a
 * worker that will never come.
 */
test('a read waiting on a worker that traps and cannot be replaced fails rather than hangs', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(digestOf(MODEL_SHA256));

  // A holder rather than a `let`, which the compiler would narrow to the `null` it starts as, the closure being opaque.
  const read: { trap?: (error: Error) => void } = {};
  createWorker
    .mockResolvedValueOnce(worker(() => new Promise((_, reject) => (read.trap = reject))))
    .mockRejectedValueOnce(new Error('the worker script did not load'));

  const engine = tesseractWasm({ langPath: '.', workers: 1, cache: false });
  const first = engine.tsv(image, 7);

  // The first read has to have reached its worker, past the model's check, before there is a read to trap.
  await vi.waitFor(() => expect(read.trap).toBeDefined());
  const second = engine.tsv(image, 7);

  read.trap?.(new Error('RuntimeError: divide by zero'));

  await expect(first, 'a trap no longer reads as nothing read').resolves.toBe('');
  await expect(second).rejects.toThrow(/the worker script did not load/);
});

test('a model that is not the pinned one is refused before anything is read with it', async () => {
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(digestOf('00'.repeat(32)));
  createWorker.mockResolvedValue(worker(() => Promise.resolve({ data: { tsv: 'read' } })));

  const engine = tesseractWasm({ langPath: 'somewhere', workers: 1, cache: true });

  await expect(engine.tsv(image, 7)).rejects.toThrow(/somewhere is not tessdata_fast 4.1.0's/);
  // Kept and then fetched again once, `refresh` replacing whatever was kept, before it is refused.
  expect(createWorker.mock.calls.map((call) => (call[2] as { cacheMethod: string }).cacheMethod)).toStrictEqual([
    'write',
    'refresh',
  ]);
});
