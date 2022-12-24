import { Fr, FRIParameters } from "../global";

export function setupFRIParams(
  domainOffset: Fr,
  maxRemainderSize: number,
  foldingFactor: number
): FRIParameters {
  if (![2, 4, 8, 16].includes(foldingFactor)) {
    throw new Error("not supported folding factor");
  }
  if (maxRemainderSize < foldingFactor) {
    throw new Error(
      "max remainder size must be at least folding factor"
    );
  }
  return {
    domainOffset,
    maxRemainderSize,
    foldingFactor,
  };
}

export function getNumFRILayer(
  params: FRIParameters,
  domainSize: number
): number {
  let numFriLayer = 0;
  let curDomainSize = domainSize;
  while (curDomainSize > params.maxRemainderSize) {
    curDomainSize /= params.foldingFactor;
    numFriLayer++;
  }
  return numFriLayer;
}

export function getRemainderSize(
  params: FRIParameters,
  domainSize: number
): number{
  let curDomainSize = domainSize;
  while(curDomainSize > params.maxRemainderSize){
    curDomainSize /= params.foldingFactor;
  }
  return curDomainSize;
}

