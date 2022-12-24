import { Coefficients, Commitment, Evaluations, Fr, G1Point, KZGParameters } from "../global";
import { BigBuffer } from "../advance-crypto/ffjavascript.js";

export const convertCoeffToEval = async (
  coefficients: Coefficients
): Promise<Evaluations> => {
  const evaluations = await bn128.Fr.fft(coefficients);
  return evaluations;
};

export const convertEvalToCoeff = async (
  evaluations: Evaluations
): Promise<Coefficients> => {
  const coefficients = await bn128.Fr.ifft(evaluations);
  return coefficients;
};

export const commitEvaluations = async (
  params: KZGParameters,
  evaluations: Evaluations
): Promise<Commitment> => {
  const Fr = bn128.Fr;

  const eval_buff = new BigBuffer(evaluations.length * Fr.n8);

  for (let i = 0; i < evaluations.length; i++) {
    eval_buff.set(Fr.fromMontgomery(evaluations[i]), i * Fr.n8);
  }
  const commitment = await bn128.G1.multiExp(
    params.Aux_BUFF.slice(0, eval_buff.byteLength * 3),
    eval_buff
  );
  return commitment;
};

export const commitCoefficients = async (
  params: KZGParameters,
  coefficients: Coefficients
): Promise<Commitment> => {
  const commitment = await polyCommitCoefficients(params, coefficients);
  return commitment;
};

const polyCommitCoefficients = async (
  params: KZGParameters,
  coefficients: Coefficients
): Promise<Commitment> => {
  const Fr = bn128.Fr;

  const coeff_buff = new BigBuffer(coefficients.length * Fr.n8);

  for (let i = 0; i < coefficients.length; i++) {
    coeff_buff.set(Fr.fromMontgomery(coefficients[i]), i * Fr.n8);
  }
  const commitment = await bn128.G1.multiExp(
    params.SRS_1_BUFF.slice(0, coeff_buff.byteLength * 3),
    coeff_buff
  );
  return commitment;
};

export const evaluate = (coefficients: Coefficients, x: Fr): Fr => {
  const Fr = bn128.Fr;
  let result = Fr.zero;

  for (let j = 0; j < coefficients.length; j++) {
    const term = Fr.mul(coefficients[j], Fr.exp(x, j));
    result = Fr.add(result, term);
  }
  return result;
};

export const calculateQuotient = (
  params: KZGParameters,
  evaluations: Evaluations,
  index: number
): Evaluations => {
  const Fr = bn128.Fr;

  let q: Evaluations = new Array(params.depth);
  q[index] = Fr.zero;

  for (let i = 0; i < params.depth; i++) {
    if (i === index) continue;

    // q_i = (f_i - f_index) / (x_i - x_index)
    //     = (f_i - f_index) * x[-i] * inv(1 - x[index - i])
    q[i] = Fr.mul(
      Fr.sub(evaluations[i], evaluations[index]),
      Fr.mul(
        params.Domain[i === 0 ? 0 : params.depth - i],
        params.InvDomain[index > i ? index - i : index - i + params.depth]
      )
    );

    // (f_i - f_index) * A'(x_index) / A'(x_i) * 1 / (x_index - x_i)
    // = (f_i - f_index) * w^-index / w^-i * 1 / (x_index - x_i)
    // = (f_i - f_index) * w^i / w^index * (x_index - x_i)
    // = (f_i - f_index) * x_i / x_index * (x_index - x_i)
    // = - q_i * x_i / x_index
    // = - q_i * x[i - index]

    q[index] = Fr.sub(
      q[index],
      Fr.mul(
        q[i],
        params.Domain[i > index ? i - index : i - index + params.depth]
      )
    );
  }

  return q;
};

export const proveEvaluations = async (
  params: KZGParameters,
  evaluations: Evaluations,
  index: number
): Promise<G1Point> => {
  const quotient = calculateQuotient(params, evaluations, index);
  const proof = await commitEvaluations(params, quotient);
  return proof;
};

export const proveCoefficients = async (
  params: KZGParameters,
  coefficients: Coefficients,
  index: number
): Promise<G1Point> => {
  const evaluations = await convertCoeffToEval(coefficients);
  const quotient = calculateQuotient(params, evaluations, index);
  const proof = await commitEvaluations(params, quotient);
  return proof;
};

export const verify = (
  params: KZGParameters,
  proof: G1Point,
  commitment: Commitment,
  index: number,
  evaluation: Fr
): boolean => {
  const G2 = bn128.G2;
  const z2 = G2.timesFr(G2.one, params.Domain[index]);
  const s_minus_z_2 = G2.sub(params.SRS_2[1], z2);
  const G1 = bn128.G1;
  const y1 = G1.timesFr(G1.one, evaluation);
  const C_minus_y_1 = G1.sub(commitment, y1);

  const left = bn128.pairing(proof, s_minus_z_2);
  const right = bn128.pairing(C_minus_y_1, G2.one);
  return bn128.F12.eq(left, right);
};
