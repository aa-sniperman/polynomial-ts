import { Coefficients, Evaluations, Fr } from "../global";
import { log2 } from "../advance-crypto/ffjavascript/utils";
import { convertCoeffToEval, convertEvalToCoeff } from "./kzg";

export function calculateDomainSize(numCoeffs: number): number {
  const bits = log2(numCoeffs - 1) + 1;
  return 1 << bits;
}
export async function lagrangeBase(
  depth: number,
  index: number
): Promise<Coefficients> {
  const lagrangeBaseEval: Evaluations = new Array(depth);
  for (let i = 0; i < depth; i++) {
    if (i === index) lagrangeBaseEval[i] = bn128.Fr.one;
    else lagrangeBaseEval[i] = bn128.Fr.zero;
  }
  return await convertEvalToCoeff(lagrangeBaseEval);
}
export async function lagrangePolynomial(
  points: Fr[],
  i: number
): Promise<Coefficients> {
  const Fr = bn128.Fr;
  let result: Coefficients = [Fr.one];
  for (let j = 0; j < points.length; j++) {
    if (j !== i) {
      const multiplier = Fr.inv(Fr.sub(points[i], points[j]));
      result = await mulPolynomials(result, [
        Fr.mul(Fr.neg(multiplier), points[j]),
        multiplier,
      ]);
    }
  }
  return result
}

export async function interpolate(xs: Fr[], ys: Fr[]): Promise<Fr[]> {
  if (xs.length !== ys.length) {
    throw new Error("xs and ys length mismatch");
  }
  const Fr = bn128.Fr;
  let result: Fr[] = [Fr.zero];
  for (let i = 0; i < xs.length; i++) {
    const lagrange = await lagrangePolynomial(xs, i);
    result = addPolynomials(result, mulPolynomialWithScalar(lagrange, ys[i]));
  }
  return result;
}
export function vanishingPolynomial(depth: number): Coefficients {
  const Fr = bn128.Fr;
  let poly: Coefficients = new Array(depth + 1);
  poly[0] = Fr.negone;
  poly[depth] = Fr.one;
  for (let i = 1; i < depth; i++) poly[i] = Fr.zero;

  return poly;
}
export async function vanishingPolynomialAtPoints(
  points: Fr[]
): Promise<Coefficients> {
  const Fr = bn128.Fr;
  let poly: Coefficients = [Fr.one];
  for (let i = 0; i < points.length; i++) {
    poly = await mulPolynomials(poly, [Fr.neg(points[i]), Fr.one]);
  }
  return poly;
}

export function mulPolynomialWithScalar(
  pol: Coefficients,
  scalar: Fr
): Coefficients {
  const result: Coefficients = new Array(pol.length);
  for (let i = 0; i < pol.length; i++) {
    result[i] = bn128.Fr.mul(pol[i], scalar);
  }
  return result;
}

export async function mulPolynomials(
  polA: Coefficients,
  polB: Coefficients
): Promise<Coefficients> {
  const Fr = bn128.Fr;
  const degA = polA.length - 1;
  const degB = polB.length - 1;
  const degM = degA + degB;
  const depth = calculateDomainSize(degM + 1);
  const extended_polA: Coefficients = new Array(depth);
  const extended_polB: Coefficients = new Array(depth);
  for (let i = 0; i < depth; i++) {
    extended_polA[i] = i >= polA.length ? Fr.zero : polA[i];
    extended_polB[i] = i >= polB.length ? Fr.zero : polB[i];
  }

  const extended_polA_eval = await convertCoeffToEval(extended_polA);
  const extended_polB_eval = await convertCoeffToEval(extended_polB);
  const result_eval: Evaluations = new Array(depth);
  for (let i = 0; i < depth; i++) {
    result_eval[i] = Fr.mul(extended_polA_eval[i], extended_polB_eval[i]);
  }
  const result = await convertEvalToCoeff(result_eval);
  return result.slice(0, degM + 1);
}

export function addPolynomials(
  polA: Coefficients,
  polB: Coefficients
): Coefficients {
  const Fr = bn128.Fr;
  const resLen = polA.length > polB.length ? polA.length : polB.length;
  const result: Coefficients = new Array(resLen);
  for (let i = 0; i < resLen; i++) {
    if (i >= polA.length) {
      result[i] = polB[i];
    } else if (i >= polB.length) {
      result[i] = polA[i];
    } else {
      result[i] = Fr.add(polA[i], polB[i]);
    }
  }
  return result;
}

export function subPolynomials(
  polA: Coefficients,
  polB: Coefficients
): Coefficients {
  const Fr = bn128.Fr;
  const resLen = polA.length > polB.length ? polA.length : polB.length;
  const result: Coefficients = new Array(resLen);
  for (let i = 0; i < resLen; i++) {
    if (i >= polA.length) {
      result[i] = Fr.neg(polB[i]);
    } else if (i >= polB.length) {
      result[i] = polA[i];
    } else {
      result[i] = Fr.sub(polA[i], polB[i]);
    }
  }
  return result;
}

export function divVanishing(pol: Coefficients, degV: number): Coefficients {
  const Fr = bn128.Fr;
  const deg = pol.length - 1;
  const degQ = deg - degV;
  const polQ: Coefficients = new Array(degQ + 1);

  const polR: Coefficients = new Array(deg + 1);
  for (let i = 0; i <= deg; i++) {
    polR[i] = pol[i];
  }

  for (let i = degQ; i >= 0; i--) {
    polQ[i] = polR[i + degV];
    polR[i] = Fr.add(polR[i], polQ[i]);
  }

  return polQ;
}

export function div1Degree(pol: Coefficients, point: Fr): Coefficients {
  const Fr = bn128.Fr;
  const deg = pol.length - 1;
  const degQ = deg - 1;
  const polQ: Coefficients = new Array(degQ + 1);

  const polR: Coefficients = new Array(deg + 1);
  for (let i = 0; i <= deg; i++) {
    polR[i] = pol[i];
  }

  for (let i = degQ; i >= 0; i--) {
    polQ[i] = polR[i + 1];
    polR[i] = Fr.add(polR[i], Fr.mul(polQ[i], point));
  }

  return polQ;
}

export function evaluate(pol: Coefficients, point: Fr): Fr {
  const Fr = bn128.Fr;
  let result: Fr = Fr.zero;
  for (let i = pol.length - 1; i >= 0; i--) {
    result = Fr.add(Fr.mul(result, point), pol[i]);
  }
  return result;
}

export function getDegree(pol: Coefficients): number {
  let degree = pol.length - 1;
  while (bn128.Fr.isZero(pol[degree])) {
    degree--;
    if (degree == 0) return 0;
  }
  return degree;
}

export async function fftWithInversedDomain(
  coeffs: Coefficients
): Promise<Evaluations> {
  const transformedCoeffs = [coeffs[0]];
  for (let i = coeffs.length - 1; i > 0; i--) {
    transformedCoeffs.push(coeffs[i]);
  }
  return await convertCoeffToEval(transformedCoeffs);
}
