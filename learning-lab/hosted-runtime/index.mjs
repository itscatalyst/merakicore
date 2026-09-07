const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const durable = { revision: 0, value: 0, receipts: new Map() };

const read = () => ({ revision: durable.revision, value: durable.value });

const handle = async ({ idempotencyKey, expectedRevision, delta }) => {
  const prior = durable.receipts.get(idempotencyKey);
  if (prior) return { ...prior, replayed: true };
  if (expectedRevision !== durable.revision) throw new Error("REVISION_CONFLICT");
  const next = { revision: durable.revision + 1, value: durable.value + delta };
  durable.revision = next.revision;
  durable.value = next.value;
  durable.receipts.set(idempotencyKey, next);
  return { ...next, replayed: false };
};

const instanceA = { name: "A", read, handle };
const instanceB = { name: "B", read, handle };

const initial = instanceA.read();
const committed = await instanceA.handle({ idempotencyKey: "one", expectedRevision: initial.revision, delta: 1 });
assert(committed.revision === 1 && committed.value === 1, "first commit failed");
assert(instanceB.read().value === 1, "second stateless instance missed durable state");

const replay = await instanceB.handle({ idempotencyKey: "one", expectedRevision: 0, delta: 1 });
assert(replay.replayed && replay.revision === 1, "retry was not idempotent");

try {
  await instanceA.handle({ idempotencyKey: "two", expectedRevision: 0, delta: 1 });
  throw new Error("expected revision conflict");
} catch (error) {
  assert(error.message === "REVISION_CONFLICT", "wrong conflict result");
}

console.log(JSON.stringify({ instances: [instanceA.name, instanceB.name], state: read(), replay }));
