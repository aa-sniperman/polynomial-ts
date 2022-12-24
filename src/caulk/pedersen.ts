import { randomFr } from "../utils";
import { Fr, G1Point, PedersenProof, PesersenParameters } from "../global";
import { hashPointAndScalarList } from "../hash-to-scalar";

export function commitPedersen(params: PesersenParameters, v: Fr, r: Fr): G1Point {
  const G1 = bn128.G1;
  return G1.add(G1.timesFr(G1.one, v), G1.timesFr(params.H, r));
}

export function calculatePedersenProof(
  params: PesersenParameters,
  v: Fr,
  r: Fr
): PedersenProof {
  const Fr = bn128.Fr;
  const s1 = randomFr();
  const s2 = randomFr();
  const R = commitPedersen(params, s1, s2);
  const cm = commitPedersen(params, v, r);
  const c = hashPointAndScalarList([cm, R], []);
  const t1 = Fr.add(s1, Fr.mul(v, c));
  const t2 = Fr.add(s2, Fr.mul(r, c));
  return {
    R,
    t1,
    t2,
  };
}

export function verifyPedersen(
  params: PesersenParameters,
  cm: G1Point,
  proof: PedersenProof
): boolean {
  const G1 = bn128.G1;
  const c = hashPointAndScalarList([cm, proof.R], []);
  const leaf = commitPedersen(params, proof.t1, proof.t2);
  const right = G1.add(proof.R, G1.timesFr(cm, c));
  return G1.eq(leaf, right);
}
