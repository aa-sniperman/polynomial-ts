import { calculate_Z2, calculate_zX } from "./caulk/single-caulk";
import {
  calculateUnityProof,
  calculate_fX,
  calculate_h,
  calculate_pAlpha,
  calculate_pX,
  setupUnityParams,
  verifyUnityProof,
} from "./caulk/unity";
import {
  Coefficients,
  Fr,
  KZGParameters,
  setupParams,
  UnityParameters,
} from "./global";
import { trustedSetup } from "./kzg/srs/trusted-setup";
import { randomFr } from "./utils";
import { expect } from "chai";
import { evaluate } from "./kzg/polynomial";

describe("test outside domain kzg", async () => {
  it("setup params", async () => {
    await setupParams();
  });
  let logN = 8;
  let depth = 1 << logN;
  let s: Fr;
  let kzgParams: KZGParameters;
  let uParams: UnityParameters;
  it("trusted setup", async () => {
    s = randomFr();
    kzgParams = trustedSetup(s, depth);
    uParams = await setupUnityParams(logN);
  });
  let zX: Coefficients;
  let a: Fr;
  it("define zX", () => {
    const Fr = bn128.Fr;
    let index = 111;
    a = randomFr();
    zX = calculate_zX(kzgParams, index, a);
    expect(Fr.eq(a, zX[1]));
    expect(Fr.eq(Fr.mul(a, kzgParams.Domain[index]), Fr.neg(zX[0])));
  });
  let fX: Coefficients;
  let pX: Coefficients;
  it("validate fX, pX", async () => {
    const Fr = bn128.Fr;
    fX = await calculate_fX(uParams, zX);
    expect(Fr.eq(evaluate(fX, uParams.domainVn[uParams.logN + 4]), Fr.one)).to
      .be.true;
    pX = await calculate_pX(uParams, fX, zX);
    const vnSize = uParams.domainVn.length;
    for (let i = 0; i < vnSize; i++) {
      expect(Fr.isZero(evaluate(pX, uParams.domainVn[i]))).to.be.true;
    }
  });

  it("validate pAlpha", async () => {
    const Fr = bn128.Fr;
    const alpha = randomFr();
    const hs = await calculate_h(kzgParams, uParams, pX, zX)
    const h_hatX = hs[0];
    
    const p_alpha = await calculate_pAlpha(uParams, h_hatX, fX, zX, alpha);
    expect(Fr.isZero(evaluate(p_alpha, alpha))).to.be.true;
  })
  it("verify unity proof", async () => {
    const alpha = randomFr();
    const proof = await calculateUnityProof(kzgParams, uParams, zX, alpha);
    const Z2 = calculate_Z2(kzgParams, zX);
    const valid = await verifyUnityProof(kzgParams, uParams, alpha, Z2, proof);
    expect(valid).to.be.true;
  });
});
