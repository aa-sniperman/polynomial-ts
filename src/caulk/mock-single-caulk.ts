import {
  calculatePedersenProof,
  commitPedersen,
  verifyPedersen,
} from "./pedersen";
import {
  Commitment,
  Evaluations,
  G1Point,
  G2Point,
  KZGParameters,
  PedersenProof,
  PesersenParameters,
} from "../global";
import { randomFr } from "../utils";
import { calculate_S2, calculate_T1, calculate_Z2, calculate_zX } from "./single-caulk";

export interface MockSingleCaulkProof{
    Z2: G2Point;
    T1: G2Point;
    S2: G2Point;
    pi_ped: PedersenProof;
    cm: G1Point;
}
export async function calculateMockSingleCaulkProof(
  kzgParams: KZGParameters,
  pParams: PesersenParameters,
  evaluations: Evaluations,
  index: number
): Promise<MockSingleCaulkProof> {
  const a = randomFr();
  const s = randomFr();
  const r = randomFr();
  const zX = calculate_zX(kzgParams, index, a);
  const Z2 = calculate_Z2(kzgParams, zX);
  const T1 = await calculate_T1(kzgParams, pParams, evaluations, a, index, s);
  const S2 = calculate_S2(r, s, Z2);
  const cm = commitPedersen(pParams, evaluations[index], r);
  const pi_ped = calculatePedersenProof(pParams, evaluations[index], r);
  return {
    Z2,
    T1,
    S2,
    pi_ped,
    cm,
  };
}

export async function verifyMockSingleCaulkOpening(
  pParams: PesersenParameters,
  C: Commitment,
  proof: MockSingleCaulkProof
): Promise<boolean> {
  const isPedersenValid = verifyPedersen(pParams, proof.cm, proof.pi_ped);
  if (!isPedersenValid) return false;
  console.log("pedersen commitment is valid")
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
