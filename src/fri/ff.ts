import { log2 } from "../advance-crypto/ffjavascript/utils.js";
import { Fr } from "../global";

export function getRootOfUnity(domainSize: number): Fr {
  const bits = log2(domainSize - 1) + 1;
  return bn128.Fr.w[bits];
}

export function getDomainSize(num: number): number {
  return 1 << (log2(num - 1) + 1);
}

export function getDomainWithFoldingFactor(
  foldDomainSize: number,
  domainOffset: Fr,
  foldingFactor: number
): Fr[] {
  const w = getRootOfUnity(foldDomainSize * foldingFactor);
  let acc = domainOffset;
  const result = [];
  for (let i = 0; i < foldDomainSize; i++) {
    result.push(acc);
    acc = bn128.Fr.mul(acc, w);
  }
  return result;
}

export function getDomain(domainSize: number, domainOffset: Fr): Fr[] {
  const w = getRootOfUnity(domainSize);
  let acc = domainOffset;
  const result = [];
  for (let i = 0; i < domainSize; i++) {
    result.push(acc);
    acc = bn128.Fr.mul(acc, w);
  }
  return result;
}
