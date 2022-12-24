import { Commitment, Evaluations, Fr, KZGParameters } from "../global";
import { hashPointAndScalarList } from "../hash-to-scalar";
import { calculateQuotient, commitEvaluations } from "../kzg/kzg";

export const calculateGx = (
  params: KZGParameters,
  rs: Fr[],
  Fxs: Evaluations[],
  indexes: number[]
): Evaluations => {
  const Fr = bn128.Fr;
  let Gx: Evaluations = new Array(params.depth);
  for (let i = 0; i < params.depth; i++) {
    Gx[i] = Fr.zero;
  }
  for (let index = 0; index < indexes.length; index++) {
    const Q_index = calculateQuotient(params, Fxs[index], indexes[index]);
    const r_index = rs[index];
    for (let i = 0; i < params.depth; i++) {
      Gx[i] = Fr.add(Gx[i], Fr.mul(r_index, Q_index[i]));
    }
  }
  return Gx;
};

// rtz[i] = rs[i] / (t - z[i])
export const calculate_rtz = (
  params: KZGParameters,
  rs: Fr[],
  indexes: number[],
  t: Fr
): Fr[] => {
  const Fr = bn128.Fr;
  let rtz: Fr[] = new Array(rs.length);
  for (let i = 0; i < rs.length; i++) {
    rtz[i] = Fr.div(rs[i], Fr.sub(t, params.Domain[indexes[i]]));
  }
  return rtz;
};

export const calculateHx = (
  params: KZGParameters,
  Fxs: Evaluations[],
  rtz: Fr[]
): Evaluations => {
  const Fr = bn128.Fr;
  let Hx: Evaluations = new Array(params.depth);
  for (let i = 0; i < params.depth; i++) {
    Hx[i] = Fr.zero;

    for (let index = 0; index < Fxs.length; index++) {
      Hx[i] = Fr.add(Hx[i], Fr.mul(rtz[index], Fxs[index][i]));
    }
  }
  return Hx;
};

export const calculatePi = async (
  params: KZGParameters,
  Hx: Evaluations,
  Gx: Evaluations,
  G2t: Fr,
  t: Fr
): Promise<Commitment> => {
  let pi_evals: Evaluations = new Array(params.depth);
  const Fr = bn128.Fr;
  for (let i = 0; i < params.depth; i++) {
    const numerator = Fr.sub(Fr.sub(Hx[i], Gx[i]), G2t);
    const denominator = Fr.sub(params.Domain[i], t);
    pi_evals[i] = Fr.div(numerator, denominator);
  }
  return await commitEvaluations(params, pi_evals);
};

export const calculateE = (Cs: Commitment[], rtz: Fr[]): Commitment => {
  const G1 = bn128.G1;
  let E: Commitment = G1.zero;
  for (let i = 0; i < Cs.length; i++) E = G1.add(E, G1.timesFr(Cs[i], rtz[i]));
  return E;
};

export const calculateG2t = (ys: Fr[], rtz: Fr[]): Fr => {
  const Fr = bn128.Fr;
  let G2t = Fr.zero;
  for (let i = 0; i < ys.length; i++) {
    G2t = Fr.add(G2t, Fr.mul(ys[i], rtz[i]));
  }
  return G2t;
};

export interface PCSMultiproofs {
  Pi: Commitment;
  D: Commitment;
}
export const calculatePCSMultiproofs = async (
  params: KZGParameters,
  rs: Fr[],
  Fxs: Evaluations[],
  indexes: number[]
): Promise<PCSMultiproofs> => {
  const Gx = calculateGx(params, rs, Fxs, indexes);
  const D = await commitEvaluations(params, Gx);
  const t = hashPointAndScalarList([D], [rs[1]]);

  const rtz = calculate_rtz(params, rs, indexes, t);
  const Hx = calculateHx(params, Fxs, rtz);

  let ys: Fr[] = new Array(Fxs.length);
  for (let i = 0; i < Fxs.length; i++) {
    ys[i] = Fxs[i][indexes[i]];
  }
  const G2t = calculateG2t(ys, rtz);

  const Pi = await calculatePi(params, Hx, Gx, G2t, t);

  return {
    Pi,
    D,
  };
};

export const calculate_rs = (
  params: KZGParameters,
  indexes: number[],
  ys: Fr[],
  Cs: Commitment[]
): Fr[] => {
  let scalars: Fr[] = [];
  for (let i = 0; i < ys.length; i++) {
    scalars.push(ys[i]);
  }
  for (let i = 0; i < indexes.length; i++) {
    scalars.push(params.Domain[indexes[i]]);
  }

  const r = hashPointAndScalarList(Cs, scalars);

  const Fr = bn128.Fr;
  let acc: Fr = Fr.one;
  let rs: Fr[] = [];
  for (let i = 0; i < indexes.length; i++) {
    rs.push(acc);
    acc = Fr.mul(acc, r);
  }
  return rs;
};
export const verifyPCSMultiproofs = (
  params: KZGParameters,
  indexes: number[],
  ys: Fr[],
  Cs: Commitment[],
  proof: PCSMultiproofs
): boolean => {
  const rs = calculate_rs(params, indexes, ys, Cs);
  const t = hashPointAndScalarList([proof.D], [rs[1]]);

  const rtz = calculate_rtz(params, rs, indexes, t);
  const G2t = calculateG2t(ys, rtz);

  const E = calculateE(Cs, rtz);

  const G1 = bn128.G1;
  const G2 = bn128.G2;

  const Y = G1.timesFr(G1.one, G2t);

  // e(E - D - Y, G2.g)
  const left = bn128.pairing(G1.sub(G1.sub(E, proof.D), Y), G2.one);

  const tG2 = G2.timesFr(G2.one, t);
  // e(pi, (s - t) * G2.g)
  const right = bn128.pairing(proof.Pi, G2.sub(params.SRS_2[1], tG2));

  return bn128.F12.eq(left, right);
};
