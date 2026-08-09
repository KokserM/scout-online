export interface RandomSource {
  nextUint32(): number;
}

const UINT32_RANGE = 0x1_0000_0000;

export class CryptoRandomSource implements RandomSource {
  public nextUint32(): number {
    if (typeof globalThis.crypto === "undefined") {
      throw new Error("A Web Crypto CSPRNG is required");
    }
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    const result = value[0];
    if (result === undefined) {
      throw new Error("CSPRNG failed to produce a value");
    }
    return result;
  }
}

/** Deterministic test/simulation RNG. It is not cryptographically secure. */
export class SeededRandomSource implements RandomSource {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x9e37_79b9;
    }
  }

  public nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }
}

export class SequenceRandomSource implements RandomSource {
  private index = 0;

  public constructor(private readonly values: readonly number[]) {
    if (values.length === 0) {
      throw new RangeError("At least one deterministic value is required");
    }
  }

  public nextUint32(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    if (value === undefined) {
      throw new Error("Deterministic random sequence is unexpectedly empty");
    }
    return value >>> 0;
  }
}

export function randomInt(rng: RandomSource, exclusiveMaximum: number): number {
  if (!Number.isSafeInteger(exclusiveMaximum) || exclusiveMaximum <= 0) {
    throw new RangeError("exclusiveMaximum must be a positive safe integer");
  }
  if (exclusiveMaximum > UINT32_RANGE) {
    throw new RangeError("exclusiveMaximum must not exceed 2^32");
  }

  const rejectionLimit =
    UINT32_RANGE - (UINT32_RANGE % exclusiveMaximum);
  let value = rng.nextUint32();
  while (value >= rejectionLimit) {
    value = rng.nextUint32();
  }
  return value % exclusiveMaximum;
}

export function shuffle<T>(
  values: readonly T[],
  rng: RandomSource,
): readonly T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = randomInt(rng, index + 1);
    const value = shuffled[index];
    const otherValue = shuffled[other];
    if (value === undefined || otherValue === undefined) {
      throw new Error("Shuffle index escaped array bounds");
    }
    shuffled[index] = otherValue;
    shuffled[other] = value;
  }
  return shuffled;
}
