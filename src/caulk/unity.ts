import {
  addPolynomials,
  calculateDomainSize,
  divVanishing,
  evaluate,
  lagrangeBase,
  mulPolynomials,
  mulPolynomialWithScalar,
  subPolynomials,
  vanishingPolynomial,
  vanishingPolynomialAtPoints,
} from "../kzg/polynomial";
import { commitCoefficients, convertEvalToCoeff } from "../kzg/kzg";
import {
  singleOpening,
  twiceOpening,
  verifyTwiceOpening,
} from "../kzg/outside-domain-kzg";
import { randomFr } from "../utils";
import {
  Coefficients,
  Evaluations,
  Fr,
  G2Point,
  KZGParameters,
  UnityParameters,
  UnityPhase1Proof,
  UnityPhase2Proof,
  UnityProof,
} from "../global";
import { domain } from "../kzg/srs/trusted-setup";

export async function setupUnityParams(logN: number): Promise<UnityParameters> {
  const vnSize = calculateDomainSize(logN + 6);

  const Fr = bn128.Fr;
  const domainVn = domain(vnSize);
  let domainVnScalars: Fr[] = new Array(vnSize);
  for (let i = 0; i < vnSize; i++) {
    domainVnScalars[i] = Fr.one;
    for (let j = 0; j < vnSize; j++) {
      if (j === i) continue;
      domainVnScalars[i] = Fr.mul(
        domainVnScalars[i],
        Fr.sub(domainVn[i], domainVn[j])
      );
    }
    domainVnScalars[i] = Fr.inv(domainVnScalars[i]);
  }

  let rhos: Coefficients[] = [];
  for (let i = 0; i < vnSize; i++) {
    const rho = await lagrangeBase(vnSize, i);
    rhos.push(rho);
  }
  const prod_points: Fr[] = [];
  for (let i = 0; i < vnSize; i++) {
    if (i < 5 || i > logN + 4) {
      prod_points.push(domainVn[i]);
    }
  }
  const prod = await vanishingPolynomialAtPoints(prod_points);
  return {
    logN,
    domainVn,
    rhos,
    prod,
    domainVnScalars,
  };
}

export async function calculateUnityProof(
  kzgParams: KZGParameters,
  uParams: UnityParameters,
  zX: Coefficients,
  alpha: Fr
): Promise<UnityProof> {
  const fX = await calculate_fX(uParams, zX);
  const pX = await calculate_pX(uParams, fX, zX);
  const h = await calculate_h(kzgParams, uParams, pX, zX);
  const h_hatX = h[0];
  const hX = h[1];
  const proof1 = await calculatePhase1Proof(kzgParams, hX, fX);
  const proof2 = await calculatePhase2Proof(
    kzgParams,
    uParams,
    h_hatX,
    fX,
    zX,
    alpha
  );
  return { proof1, proof2 };
}

export async function calculate_fX(
  uParams: UnityParameters,
  zX: Coefficients
): Promise<Coefficients> {
  const Fr = bn128.Fr;
  const r0 = randomFr();
  const r1 = randomFr();
  const r2 = randomFr();
  const r3 = randomFr();

  const a = zX[1];
  const b = Fr.neg(zX[0]);
  const sigma = uParams.domainVn[1];

  const rX: Coefficients = [r1, r2, r3];
  const vnSize = uParams.domainVn.length;
  const zVn = vanishingPolynomial(vnSize);

  const a_div_b_vec: Fr[] = new Array(uParams.logN + 1);
  let a_div_b = Fr.div(a, b);
  for (let i = 0; i <= uParams.logN; i++) {
    a_div_b_vec[i] = a_div_b;
    a_div_b = Fr.mul(a_div_b, a_div_b);
  }
  let fX_Eval: Evaluations = new Array(vnSize);
  fX_Eval[0] = Fr.sub(a, b);
  fX_Eval[1] = Fr.sub(Fr.mul(a, sigma), b);
  fX_Eval[2] = a;
  fX_Eval[3] = b;
  for (let i = 0; i <= uParams.logN; i++) {
    fX_Eval[4 + i] = a_div_b_vec[i];
  }
  fX_Eval[uParams.logN + 5] = r0;
  for (let i = uParams.logN + 6; i < vnSize; i++) {
    fX_Eval[i] = Fr.zero;
  }

  let fX_Coeff = await convertEvalToCoeff(fX_Eval);
  const blinding = await mulPolynomials(rX, zVn);
  fX_Coeff = addPolynomials(fX_Coeff, blinding);

  return fX_Coeff;
}

export async function calculate_pX(
  uParams: UnityParameters,
  fX: Coefficients,
  zX: Coefficients
): Promise<Coefficients> {
  const Fr = bn128.Fr;

  const vnSize = uParams.domainVn.length;
  const fXSize = fX.length;
  const fXShift1: Coefficients = new Array(fXSize);
  const fXShift2: Coefficients = new Array(fXSize);

  const sigma = uParams.domainVn[1];

  let shift1Value = Fr.one;
  let shift2Value = Fr.one;
  for (let i = 0; i < fXSize; i++) {
    fXShift1[i] = Fr.mul(fX[i], shift1Value);
    fXShift2[i] = Fr.mul(fX[i], shift2Value);
    shift1Value = Fr.mul(shift1Value, uParams.domainVn[vnSize - 1]);
    shift2Value = Fr.mul(shift2Value, uParams.domainVn[vnSize - 2]);
  }

  let pXTerms: Coefficients[] = new Array(6);

  pXTerms[0] = await mulPolynomials(
    subPolynomials(fX, zX),
    addPolynomials(uParams.rhos[0], uParams.rhos[1])
  );

  pXTerms[1] = await mulPolynomials(
    addPolynomials(
      subPolynomials(
        mulPolynomialWithScalar(fX, Fr.sub(Fr.one, sigma)),
        fXShift2
      ),
      fXShift1
    ),
    uParams.rhos[2]
  );

  pXTerms[2] = await mulPolynomials(
    subPolynomials(
      addPolynomials(fX, fXShift2),
      mulPolynomialWithScalar(fXShift1, sigma)
    ),
    uParams.rhos[3]
  );

  const fX_mul_fXShift1 = await mulPolynomials(fX, fXShift1);
  pXTerms[3] = await mulPolynomials(
    subPolynomials(fX_mul_fXShift1, fXShift2),
    uParams.rhos[4]
  );

  const fXShift1_square = await mulPolynomials(fXShift1, fXShift1);
  pXTerms[4] = await mulPolynomials(
    subPolynomials(fX, fXShift1_square),
    uParams.prod
  );

  pXTerms[5] = await mulPolynomials(
    subPolynomials(fXShift1, [Fr.one]),
    uParams.rhos[uParams.logN + 5]
  );

  let pX: Coefficients = pXTerms[0];
  for (let i = 1; i <= 5; i++) {
    pX = addPolynomials(pX, pXTerms[i]);
  }
  return pX;
}

export async function calculate_h(
  kzgParams: KZGParameters,
  uParams: UnityParameters,
  pX: Coefficients,
  zX: Coefficients
): Promise<[Coefficients, Coefficients]> {
  const Fr = bn128.Fr;
  const h_hatX = divVanishing(pX, uParams.domainVn.length);
  const depth = kzgParams.depth;
  const degree_check_poly: Coefficients = new Array(depth);
  for (let i = 0; i < depth - 1; i++) {
    degree_check_poly[i] = Fr.zero;
  }
  degree_check_poly[depth - 1] = Fr.one;

  const degree_check_poly_zX = await mulPolynomials(degree_check_poly, zX);
  const hX = addPolynomials(h_hatX, degree_check_poly_zX);
  return [h_hatX, hX];
}

export async function calculatePhase1Proof(
  kzgParams: KZGParameters,
  hX: Coefficients,
  fX: Coefficients
): Promise<UnityPhase1Proof> {
  const F1 = await commitCoefficients(kzgParams, fX);
  const H1 = await commitCoefficients(kzgParams, hX);

  return {
    F1,
    H1,
  };
}

export async function calculate_pAlpha(
  uParams: UnityParameters,
  h_hatX: Coefficients,
  fX: Coefficients,
  zX: Coefficients,
  alpha: Fr
): Promise<Coefficients> {
  const Fr = bn128.Fr;
  const vnSize = uParams.domainVn.length;
  const sigma = uParams.domainVn[1];
  const alpha_1 = Fr.mul(alpha, uParams.domainVn[vnSize - 1]);
  const alpha_2 = Fr.mul(alpha, uParams.domainVn[vnSize - 2]);

  const v1 = evaluate(fX, alpha_1);
  const v2 = evaluate(fX, alpha_2);

  const zVn_alpha = Fr.sub(Fr.exp(alpha, vnSize), Fr.one);
  const rho0_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[0]),
    Fr.sub(alpha, uParams.domainVn[0])
  );
  const rho1_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[1]),
    Fr.sub(alpha, uParams.domainVn[1])
  );
  const rho2_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[2]),
    Fr.sub(alpha, uParams.domainVn[2])
  );
  const rho3_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[3]),
    Fr.sub(alpha, uParams.domainVn[3])
  );
  const rho4_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[4]),
    Fr.sub(alpha, uParams.domainVn[4])
  );
  const rhon_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[uParams.logN + 5]),
    Fr.sub(alpha, uParams.domainVn[uParams.logN + 5])
  );
  const prod_alpha = evaluate(uParams.prod, alpha);
  const p_alpha_Terms: Coefficients[] = new Array(7);

  p_alpha_Terms[0] = mulPolynomialWithScalar(h_hatX, Fr.neg(zVn_alpha));
  p_alpha_Terms[1] = mulPolynomialWithScalar(
    subPolynomials(fX, zX),
    Fr.add(rho0_alpha, rho1_alpha)
  );
  p_alpha_Terms[2] = mulPolynomialWithScalar(
    addPolynomials(mulPolynomialWithScalar(fX, Fr.sub(Fr.one, sigma)), [
      Fr.sub(v1, v2),
    ]),
    rho2_alpha
  );
  p_alpha_Terms[3] = mulPolynomialWithScalar(
    addPolynomials(fX, [Fr.sub(v2, Fr.mul(sigma, v1))]),
    rho3_alpha
  );
  p_alpha_Terms[4] = mulPolynomialWithScalar(
    subPolynomials(fX, [Fr.mul(v1, v1)]),
    prod_alpha
  );
  p_alpha_Terms[5] = mulPolynomialWithScalar(
    subPolynomials(mulPolynomialWithScalar(fX, v1), [v2]),
    rho4_alpha
  );
  p_alpha_Terms[6] = [Fr.mul(Fr.sub(v1, Fr.one), rhon_alpha)];
  let p_alpha: Coefficients = p_alpha_Terms[0];
  for (let i = 1; i <= 6; i++) {
    p_alpha = addPolynomials(p_alpha, p_alpha_Terms[i]);
  }

  return p_alpha;
}

export async function calculatePhase2Proof(
  kzgParams: KZGParameters,
  uParams: UnityParameters,
  h_hatX: Coefficients,
  fX: Coefficients,
  zX: Coefficients,
  alpha: Fr
): Promise<UnityPhase2Proof> {
  const Fr = bn128.Fr;
  const vnSize = uParams.domainVn.length;
  const sigma = uParams.domainVn[1];
  const alpha_1 = Fr.mul(alpha, uParams.domainVn[vnSize - 1]);
  const alpha_2 = Fr.mul(alpha, uParams.domainVn[vnSize - 2]);

  const fXOpening = await twiceOpening(kzgParams, fX, alpha_1, alpha_2);

  const pi1 = fXOpening.proof;
  const v1 = fXOpening.eval1;
  const v2 = fXOpening.eval2;

  const zVn_alpha = Fr.sub(Fr.exp(alpha, vnSize), Fr.one);
  const rho0_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[0]),
    Fr.sub(alpha, uParams.domainVn[0])
  );
  const rho1_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[1]),
    Fr.sub(alpha, uParams.domainVn[1])
  );
  const rho2_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[2]),
    Fr.sub(alpha, uParams.domainVn[2])
  );
  const rho3_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[3]),
    Fr.sub(alpha, uParams.domainVn[3])
  );
  const rho4_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[4]),
    Fr.sub(alpha, uParams.domainVn[4])
  );
  const rhon_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[uParams.logN + 5]),
    Fr.sub(alpha, uParams.domainVn[uParams.logN + 5])
  );
  const prod_alpha = evaluate(uParams.prod, alpha);
  const p_alpha_Terms: Coefficients[] = new Array(7);

  p_alpha_Terms[0] = mulPolynomialWithScalar(h_hatX, Fr.neg(zVn_alpha));
  p_alpha_Terms[1] = mulPolynomialWithScalar(
    subPolynomials(fX, zX),
    Fr.add(rho0_alpha, rho1_alpha)
  );
  p_alpha_Terms[2] = mulPolynomialWithScalar(
    addPolynomials(mulPolynomialWithScalar(fX, Fr.sub(Fr.one, sigma)), [
      Fr.sub(v1, v2),
    ]),
    rho2_alpha
  );
  p_alpha_Terms[3] = mulPolynomialWithScalar(
    addPolynomials(fX, [Fr.sub(v2, Fr.mul(sigma, v1))]),
    rho3_alpha
  );
  p_alpha_Terms[4] = mulPolynomialWithScalar(
    subPolynomials(fX, [Fr.mul(v1, v1)]),
    prod_alpha
  );
  p_alpha_Terms[5] = mulPolynomialWithScalar(
    subPolynomials(mulPolynomialWithScalar(fX, v1), [v2]),
    rho4_alpha
  );
  p_alpha_Terms[6] = [Fr.mul(Fr.sub(v1, Fr.one), rhon_alpha)];
  let p_alpha: Coefficients = p_alpha_Terms[0];
  for (let i = 1; i <= 6; i++) {
    p_alpha = addPolynomials(p_alpha, p_alpha_Terms[i]);
  }

  const p_alphaOpening = await singleOpening(kzgParams, p_alpha, alpha);
  const pi2 = p_alphaOpening.proof;

  return {
    v1,
    v2,
    pi1,
    pi2,
  };
}

export async function verifyUnityProof(
  kzgParams: KZGParameters,
  uParams: UnityParameters,
  alpha: Fr,
  Z2: G2Point,
  proof: UnityProof
): Promise<boolean> {
  const Fr = bn128.Fr;
  const G1 = bn128.G1;
  const G2 = bn128.G2;
  const { proof1, proof2 } = proof;
  const vnSize = uParams.domainVn.length;
  const sigma = uParams.domainVn[1];
  const alpha_1 = Fr.mul(alpha, uParams.domainVn[vnSize - 1]);
  const alpha_2 = Fr.mul(alpha, uParams.domainVn[vnSize - 2]);
  const isValidF = await verifyTwiceOpening(
    kzgParams,
    proof1.F1,
    alpha_1,
    alpha_2,
    {
      eval1: proof2.v1,
      eval2: proof2.v2,
      proof: proof2.pi1,
    }
  );

  if (!isValidF) return false;

  const zVn_alpha = Fr.sub(Fr.exp(alpha, vnSize), Fr.one);
  const rho0_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[0]),
    Fr.sub(alpha, uParams.domainVn[0])
  );
  const rho1_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[1]),
    Fr.sub(alpha, uParams.domainVn[1])
  );
  const rho2_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[2]),
    Fr.sub(alpha, uParams.domainVn[2])
  );
  const rho3_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[3]),
    Fr.sub(alpha, uParams.domainVn[3])
  );
  const rho4_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[4]),
    Fr.sub(alpha, uParams.domainVn[4])
  );
  const rhon_alpha = Fr.div(
    Fr.mul(zVn_alpha, uParams.domainVnScalars[uParams.logN + 5]),
    Fr.sub(alpha, uParams.domainVn[uParams.logN + 5])
  );
  const prod_alpha = evaluate(uParams.prod, alpha);

  // calculate P1
  const term0 = G1.timesFr(proof1.H1, Fr.neg(zVn_alpha));
  const term1 = G1.timesFr(proof1.F1, Fr.add(rho0_alpha, rho1_alpha));
  const term2 = G1.timesFr(
    G1.add(
      G1.timesFr(proof1.F1, Fr.sub(Fr.one, sigma)),
      G1.timesFr(G1.one, Fr.sub(proof2.v1, proof2.v2))
    ),
    rho2_alpha
  );
  const term3 = G1.timesFr(
    G1.add(
      proof1.F1,
      G1.timesFr(G1.one, Fr.sub(proof2.v2, Fr.mul(proof2.v1, sigma)))
    ),
    rho3_alpha
  );
  const term4 = G1.timesFr(
    G1.sub(G1.timesFr(proof1.F1, proof2.v1), G1.timesFr(G1.one, proof2.v2)),
    rho4_alpha
  );
  const term5 = G1.timesFr(
    G1.one,
    Fr.mul(rhon_alpha, Fr.sub(proof2.v1, Fr.one))
  );
  const term6 = G1.timesFr(
    G1.sub(proof1.F1, G1.timesFr(G1.one, Fr.mul(proof2.v1, proof2.v1))),
    prod_alpha
  );

  let P1 = term0;
  P1 = G1.add(P1, term1);
  P1 = G1.add(P1, term2);
  P1 = G1.add(P1, term3);
  P1 = G1.add(P1, term4);
  P1 = G1.add(P1, term5);
  P1 = G1.add(P1, term6);

  const a1 = P1;
  const a2 = G2.one;
  const b1 = G1.sub(
    G1.timesFr(kzgParams.SRS_1[kzgParams.depth - 1], zVn_alpha),
    G1.timesFr(G1.one, Fr.add(rho0_alpha, rho1_alpha))
  );
  const b2 = Z2;
  const c1 = G1.neg(proof2.pi2);
  const c2 = G2.sub(kzgParams.SRS_2[1], G2.timesFr(G2.one, alpha));

  return await bn128.pairingEq(a1, a2, b1, b2, c1, c2);
}
