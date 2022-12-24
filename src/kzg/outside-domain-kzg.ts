import { Coefficients, Commitment, Fr, G1Point, KZGParameters } from "../global";
import { commitCoefficients } from "./kzg";
import {
  div1Degree,
  evaluate,
  subPolynomials,
} from "./polynomial";

export interface SingleOpening {
  eval: Fr;
  proof: G1Point;
}

export async function singleOpening(
  params: KZGParameters,
  polynomial: Coefficients,
  point: Fr
): Promise<SingleOpening> {
  const e = evaluate(polynomial, point);
  const quotient = div1Degree(subPolynomials(polynomial, [e]), point);
  const proof = await commitCoefficients(params, quotient);
  return {
    eval: e,
    proof,
  };
}

export interface TwiceOpening {
  eval1: Fr;
  eval2: Fr;
  proof: G1Point;
}
export async function twiceOpening(
  params: KZGParameters,
  polynomial: Coefficients,
  point1: Fr,
  point2: Fr
): Promise<TwiceOpening> {
  const single1 = await singleOpening(params, polynomial, point1);
  const single2 = await singleOpening(params, polynomial, point2);

  const Fr = bn128.Fr;
  const G1 = bn128.G1;

  // H12 = (H1 - H2)(point1 - point2)
  const multiplier = Fr.inv(Fr.sub(point1, point2));
  const proof = G1.timesFr(G1.sub(single1.proof, single2.proof), multiplier);
  return {
    proof,
    eval1: single1.eval,
    eval2: single2.eval,
  };
}

export async function verifySingleOpening(
  params: KZGParameters,
  C: Commitment,
  point: Fr,
  opening: SingleOpening
): Promise<boolean> {
  // e(C - opening.eval * G1.g, G2.g) == e(proof, x2 - point * G2.g)
  // e(C - opening.eval * G1.g, G2.g, -proof, x2 - point.G2.g) == 1
  const G1 = bn128.G1;
  const G2 = bn128.G2;
  return await bn128.pairingEq(
    G1.sub(C, G1.timesFr(G1.one, opening.eval)),
    G2.one,
    G1.neg(opening.proof),
    G2.sub(params.SRS_2[1], G2.timesFr(G2.one, point))
  );
}

export async function verifyTwiceOpening(
  params: KZGParameters,
  C: Commitment,
  point1: Fr,
  point2: Fr,
  opening: TwiceOpening
): Promise<boolean> {
  const Fr = bn128.Fr;
  const G1 = bn128.G1;
  const G2 = bn128.G2;
  // calculate cI
  const multiplier = Fr.inv(Fr.sub(point1, point2));
  const term0 = Fr.mul(
    Fr.sub(Fr.mul(point1, opening.eval2), Fr.mul(point2, opening.eval1)),
    multiplier
  );
  const term1 = Fr.mul(Fr.sub(opening.eval1, opening.eval2), multiplier);
  const CI = G1.add(
    G1.timesFr(G1.one, term0),
    G1.timesFr(params.SRS_1[1], term1)
  );

  const a = Fr.add(point1, point2);
  const b = Fr.mul(point1, point2);
  // e(C - CI, G2.g) == e(proof, X^2 - aX + b)
  // e(C - CI, G2.g) == e(proof, X^2) * e(-a * proof, X) * e(b * proof, G2.g)
  // e(C - CI - b * proof, G2.g) * e(-proof, X^2) * e(a * proof, X)

  const a1 = G1.sub(G1.sub(C, CI), G1.timesFr(opening.proof, b));
  const a2 = G2.one;
  const b1 = G1.neg(opening.proof);
  const b2 = params.SRS_2[2];
  const c1 = G1.timesFr(opening.proof, a);
  const c2 = params.SRS_2[1];

  return await bn128.pairingEq(a1, a2, b1, b2, c1, c2);
}
