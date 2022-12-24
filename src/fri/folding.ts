import { Fr } from "../global";
import { evaluate, fftWithInversedDomain } from "../kzg/polynomial";
import { getDomainWithFoldingFactor } from "./ff";

export function transpose(vector: Fr[], foldingFactor: number): Array<Fr[]> {
  const domainSize = vector.length;
  const numberOfRows = domainSize / foldingFactor;
  const result: Array<Fr[]> = new Array(numberOfRows);
  for (let i = 0; i < numberOfRows; i++) {
    result[i] = new Array(foldingFactor);
  }
  for (let i = 0; i < numberOfRows; i++) {
    for (let j = 0; j < foldingFactor; j++) {
      result[i][j] = vector[j * numberOfRows + i];
    }
  }

  return result;
}

export function detranspose(transposedVector: Array<Fr[]>): Fr[] {
  const numberOfRows = transposedVector.length;
  const foldingFactor = transposedVector[0].length;
  const result = new Array(numberOfRows * foldingFactor);
  for (let i = 0; i < numberOfRows; i++) {
    for (let j = 0; j < foldingFactor; j++) {
      result[j * numberOfRows + i] = transposedVector[i][j];
    }
  }
  return result;
}

export function groupSlice(vector: Fr[], foldingFactor: number): Array<Fr[]> {
  const result = [];
  const numberOfGroup = vector.length / foldingFactor;
  for (let i = 0; i < numberOfGroup; i++) {
    result.push(vector.slice(i * foldingFactor, (i + 1) * foldingFactor));
  }
  return result;
}

export function flatten(groupVector: Array<Fr[]>): Fr[] {
  const foldingFactor = groupVector[0].length;
  const numberOfGroup = groupVector.length;
  let result = new Array(foldingFactor * numberOfGroup);
  for (let i = 0; i < numberOfGroup; i++) {
    for (let j = 0; j < foldingFactor; j++) {
      result[i * foldingFactor + j] = groupVector[i][j];
    }
  }
  return result;
}

export async function foldEvaluations(
  vector: Fr[],
  domainOffset: Fr,
  alpha: Fr,
  foldingFactor: number
): Promise<Fr[]> {
  const Fr = bn128.Fr;

  const transposedVector = transpose(vector, foldingFactor);
  const foldDomainSize = transposedVector.length;

  const result = new Array(foldDomainSize);
  const offsetDomain = getDomainWithFoldingFactor(
    foldDomainSize,
    domainOffset,
    foldingFactor
  );
  const invFoldingFactor = Fr.inv(Fr.e(foldingFactor));
  for (let i = 0; i < foldDomainSize; i++) {
    let poly = await fftWithInversedDomain(transposedVector[i]);
    result[i] = Fr.mul(
      evaluate(poly, Fr.div(alpha, offsetDomain[i])),
      invFoldingFactor
    );
  }

  return result;
}

export function foldPositions(
  positions: number[],
  sourceDomainSize: number,
  foldingFactor: number
): number[] {
  const result: number[] = [];
  const targetDomainSize = sourceDomainSize / foldingFactor;
  for (let i = 0; i < positions.length; i++) {
    const foldPos = positions[i] % targetDomainSize;
    if (!result.includes(foldPos)) {
      result.push(foldPos);
    }
  }
  return result;
}
