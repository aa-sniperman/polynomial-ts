import { calculateQuotient, commitEvaluations } from "../kzg/kzg";
import {
  calculatePedersenProof,
  commitPedersen,
  verifyPedersen,
} from "./pedersen";
import {
  Coefficients,
  Commitment,
  Evaluations,
  Fr,
  G1Point,
  G2Point,
  KZGParameters,
  PesersenParameters,
  SingleCaulkProof,
  UnityParameters,
} from "../global";
import {
  calculateUnityProof,
  verifyUnityProof,
} from "./unity";
import { randomFr } from "../utils";

export async function calculate_T1(
  kzgParams: KZGParameters,
  pParams: PesersenParameters,
  evaluations: Evaluations,
  a: Fr,
  index: number,
  s: Fr
): Promise<G1Point> {
  const G1 = bn128.G1;
  const Fr = bn128.Fr;
  const Hs = G1.timesFr(pParams.H, s);
  const qX = calculateQuotient(kzgParams, evaluations, index);
  const Q = await commitEvaluations(kzgParams, qX);
  return G1.add(G1.timesFr(Q, Fr.inv(a)), Hs);
}

export function calculate_zX(
  kzgParams: KZGParameters,
  index: number,
  a: Fr
): Coefficients {
  const Fr = bn128.Fr;
  const root = kzgParams.Domain[index];
  const b = Fr.mul(a, root);
  return [Fr.neg(b), a];
}

export function calculate_Z2(
  kzgParams: KZGParameters,
  zX: Coefficients
): G2Point {
  const G2 = bn128.G2;
  const Z2 = G2.add(
    G2.timesFr(kzgParams.SRS_2[1], zX[1]),
    G2.timesFr(G2.one, zX[0])
  );
  return Z2;
}

export function calculate_S2(r: Fr, s: Fr, Z2: G2Point): G2Point {
  const G2 = bn128.G2;
  const Fr = bn128.Fr;
  return G2.sub(G2.timesFr(G2.one, Fr.neg(r)), G2.timesFr(Z2, s));
}


export async function calculateSingleCaulkProof(
  kzgParams: KZGParameters,
  pParams: PesersenParameters,
  uParams: UnityParameters,
  evaluations: Evaluations,
  alpha: Fr,
  index: number
): Promise<SingleCaulkProof> {
  const a = randomFr();
  const s = randomFr();
  const r = randomFr();
  const zX = calculate_zX(kzgParams, index, a);
  const Z2 = calculate_Z2(kzgParams, zX);
  const T1 = await calculate_T1(kzgParams, pParams, evaluations, a, index, s);
  const S2 = calculate_S2(r, s, Z2);
  const cm = commitPedersen(pParams, evaluations[index], r);
  const pi_ped = calculatePedersenProof(pParams, evaluations[index], r);
  const pi_unity = await calculateUnityProof(kzgParams, uParams, zX, alpha);
  return {
    Z2,
    T1,
    S2,
    pi_ped,
    pi_unity,
    cm,
  };
}

export async function verifySingleCaulkOpening(
  kzgParams: KZGParameters,
  pParams: PesersenParameters,
  uParams: UnityParameters,
  C: Commitment,
  alpha: Fr,
  proof: SingleCaulkProof
): Promise<boolean> {
  const isPedersenValid = verifyPedersen(pParams, proof.cm, proof.pi_ped);
  if (!isPedersenValid) return false;
  const isUnityValid = verifyUnityProof(
    kzgParams,
    uParams,
    alpha,
    proof.Z2,
    proof.pi_unity
  );
  if (!isUnityValid) return false;
  const G1 = bn128.G1;
  const G2 = bn128.G2;
  return await bn128.pairingEq(
    G1.sub(C, proof.cm),
    G2.one,
    G1.neg(proof.T1),
    proof.Z2,
    G1.neg(pParams.H),
    proof.S2
  );
}
