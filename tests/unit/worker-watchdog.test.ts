import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createWorkerLeaseRenewal, createWorkerWatchdog, type WorkerStage, type WorkerStallReport} from '../../lib/server/worker-watchdog';

test('a worker without progress is stopped once after five minutes, with only fixed operational metadata', t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let elapsed = 0;
  const reports: WorkerStallReport[] = [];
  const watchdog = createWorkerWatchdog({now: () => elapsed, onStall: report => reports.push(report)});
  elapsed = 299_999;
  t.mock.timers.tick(299_999);
  assert.deepEqual(reports, []);
  elapsed = 300_000;
  t.mock.timers.tick(1);
  assert.deepEqual(reports, [{code: 'worker-stalled', stage: 'archive-initialization', elapsed_ms: 300_000}]);
  elapsed += 600_000;
  watchdog.progress('claim');
  t.mock.timers.tick(600_000);
  assert.equal(reports.length, 1);
  watchdog.stop();
});

test('successful owned-job progress keeps a long job alive and a later silent stall identifies its stage', t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let elapsed = 0;
  const reports: WorkerStallReport[] = [];
  const watchdog = createWorkerWatchdog({now: () => elapsed, onStall: report => reports.push(report)});
  watchdog.progress('job');
  // Successful lease renewals are progress even when the task takes longer than five minutes.
  for (let renewal = 0; renewal < 30; renewal++) {
    elapsed += 20_000;
    watchdog.progress('job');
    t.mock.timers.tick(20_000);
  }
  assert.deepEqual(reports, []);
  watchdog.progress('orphan-cleanup');
  elapsed += 299_999;
  t.mock.timers.tick(299_999);
  assert.deepEqual(reports, []);
  elapsed += 1;
  t.mock.timers.tick(1);
  assert.deepEqual(reports, [{code: 'worker-stalled', stage: 'orphan-cleanup', elapsed_ms: 300_000}]);
  watchdog.stop();
});

test('stopping the watchdog cancels pending checks and later progress cannot restart it', t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let elapsed = 0, reads = 0;
  const reports: WorkerStallReport[] = [];
  const watchdog = createWorkerWatchdog({now: () => {reads++; return elapsed;}, onStall: report => reports.push(report)});
  elapsed = 270_000;
  t.mock.timers.tick(270_000);
  watchdog.stop();
  const priorReads = reads;
  elapsed += 600_000;
  watchdog.progress('shutdown');
  t.mock.timers.tick(600_000);
  assert.deepEqual(reports, []);
  assert.equal(reads, priorReads);
});

test('custom deadlines are checked within thirty seconds and untrusted stages never enter diagnostics', t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let elapsed = 0;
  const reports: WorkerStallReport[] = [];
  const watchdog = createWorkerWatchdog({timeoutMs: 45_000, now: () => elapsed, onStall: report => reports.push(report)});
  watchdog.progress('storage');
  const secret = 'private@example.invalid api-key-marker';
  assert.throws(() => watchdog.progress(secret as WorkerStage), error => error instanceof TypeError && !error.message.includes(secret));
  elapsed = 44_999;
  t.mock.timers.tick(44_999);
  assert.deepEqual(reports, []);
  elapsed = 60_000;
  t.mock.timers.tick(15_001);
  assert.deepEqual(reports, [{code: 'worker-stalled', stage: 'storage', elapsed_ms: 60_000}]);
  assert.equal(JSON.stringify(reports).includes(secret), false);
  assert.deepEqual(Object.keys(reports[0]), ['code', 'stage', 'elapsed_ms']);
  watchdog.stop();
});

test('invalid deadlines fail before starting a timer', () => {
  for (const timeoutMs of [0, -1, NaN, Infinity]) assert.throws(() => createWorkerWatchdog({timeoutMs}), TypeError);
});

test('the default stall handler logs its operational report and exits unsuccessfully for supervisor recovery', t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let elapsed = 0;
  const lines: string[] = [], exits: (number | string | null | undefined)[] = [];
  t.mock.method(console, 'error', (line: string) => {lines.push(line);});
  t.mock.method(process, 'exit', ((code?: number | string | null) => {exits.push(code);}) as typeof process.exit);
  const watchdog = createWorkerWatchdog({now: () => elapsed});
  watchdog.progress('sponsor-scheduler');
  elapsed = 300_000;
  t.mock.timers.tick(300_000);
  assert.deepEqual(lines.map(line => JSON.parse(line)), [{code: 'worker-stalled', stage: 'sponsor-scheduler', elapsed_ms: 300_000}]);
  assert.deepEqual(exits, [1]);
  watchdog.stop();
});

async function settleRenewal() {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

test('only a completed owned renewal reports job progress, with one renewal in flight', async t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let calls = 0;
  const first = Promise.withResolvers<{length: number}>(), second = Promise.withResolvers<{length: number}>();
  const stages: WorkerStage[] = [];
  const renewal = createWorkerLeaseRenewal(() => {calls++; return calls === 1 ? first.promise : second.promise;}, stage => stages.push(stage));
  t.mock.timers.tick(19_999);
  await settleRenewal();
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  await settleRenewal();
  assert.equal(calls, 1);
  assert.deepEqual(stages, []);
  t.mock.timers.tick(120_000);
  await settleRenewal();
  assert.equal(calls, 1, 'a stalled renewal must not accumulate more pending database requests');
  first.resolve({length: 1});
  await settleRenewal();
  assert.deepEqual(stages, ['job']);
  t.mock.timers.tick(20_000);
  await settleRenewal();
  assert.equal(calls, 2);
  second.resolve({length: 2});
  await settleRenewal();
  assert.deepEqual(stages, ['job', 'job']);
  renewal.stop();
});

test('rejected, synchronously thrown, and unowned renewals never report progress and permit a later retry', async t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let calls = 0;
  const stages: WorkerStage[] = [];
  const renewal = createWorkerLeaseRenewal(() => {
    calls++;
    if (calls === 1) throw new Error('synchronous database error');
    if (calls === 2) return Promise.reject(new Error('asynchronous database error'));
    return Promise.resolve({length: calls === 3 ? 0 : 1});
  }, stage => stages.push(stage));
  for (let attempt = 1; attempt <= 3; attempt++) {
    t.mock.timers.tick(20_000);
    await settleRenewal();
    assert.equal(calls, attempt);
    assert.deepEqual(stages, []);
  }
  t.mock.timers.tick(20_000);
  await settleRenewal();
  assert.equal(calls, 4);
  assert.deepEqual(stages, ['job']);
  renewal.stop();
});

test('stopping a lease renewal cancels future requests and ignores owned responses arriving after the job finishes', async t => {
  t.mock.timers.enable({apis: ['setInterval']});
  let calls = 0;
  const pending = Promise.withResolvers<{length: number}>(), stages: WorkerStage[] = [];
  const renewal = createWorkerLeaseRenewal(() => {calls++; return pending.promise;}, stage => stages.push(stage));
  t.mock.timers.tick(20_000);
  await settleRenewal();
  assert.equal(calls, 1);
  renewal.stop();
  pending.resolve({length: 1});
  await settleRenewal();
  t.mock.timers.tick(120_000);
  await settleRenewal();
  assert.equal(calls, 1);
  assert.deepEqual(stages, []);
});
