import { expect } from "chai";
import { Coefficients, Commitment, Evaluations, Fr, KZGParameters, setupParams } from "./global";
import { PCSMultiproofs as PCSMultiproofsSol } from "./typechain-types/PCSMultiproofs";
// @ts-ignore
import { ethers } from "hardhat";

import {
  calculateG2t,
  calculateGx,
  calculateHx,
  calculatePCSMultiproofs,
  calculate_rs,
  calculate_rtz,
  PCSMultiproofs,
  verifyPCSMultiproofs,
} from "./pcs-multiproofs/pcs-multiproofs";
import {
  calculateQuotient,
  commitEvaluations,
  convertEvalToCoeff,
  evaluate,
} from "./kzg/kzg";
import { hashPointAndScalarList } from "./hash-to-scalar";
import { G1Calldata } from "./utils";
import { TestVerifiers } from "./typechain-types";
import { trustedSetup } from "./kzg/srs/trusted-setup";

describe("Test PCS Multiproofs", async () => {
  it("setup params", async () => {
    await setupParams();
  });

  let params: KZGParameters;
  let depth = 1 << 8;
  let pcs_length = 4;
  let indexes = [7, 101, 199, 201];
  let rs: Fr[];
  let t: Fr;
  let s: Fr;
  it("trusted setup", async () => {
    s = bn128.Fr.e("99999999999911111");
    params = trustedSetup(s, depth);
  });

  let Fxs: Evaluations[];
  let Fx_coeffs: Coefficients[];
  it("calculate polynomials", async () => {
    const Fr = bn128.Fr;
    Fxs = new Array(pcs_length);
    Fx_coeffs = new Array(pcs_length);

    for (let i = 0; i < pcs_length; i++) {
      Fxs[i] = new Array(depth);
      for (let j = 0; j < depth; j++) {
        Fxs[i][j] = Fr.e(11 * i * j + 71 * i + 399 * j);
      }
      Fx_coeffs[i] = await convertEvalToCoeff(Fxs[i]);
    }
  });
  let Cs: Commitment[];
  it("commit Fxs", async () => {
    Cs = new Array(pcs_length);
    for (let i = 0; i < pcs_length; i++) {
      Cs[i] = await commitEvaluations(params, Fxs[i]);
    }
  }).timeout(20000);

  let ys: Fr[];
  it("calculate rs", () => {
    ys = new Array(pcs_length);
    for (let i = 0; i < pcs_length; i++) {
      ys[i] = Fxs[i][indexes[i]];
    }
    rs = calculate_rs(params, indexes, ys, Cs);
  });

  let proof: PCSMultiproofs;
  it("benchmark proving time", async () => {
    proof = await calculatePCSMultiproofs(params, rs, Fxs, indexes);
  });

  let rtz: Fr[];

  let Hx: Evaluations;
  let Gx: Evaluations;
  let G2t: Fr;
  let Ht: Fr;
  let Gt: Fr;
  let Fts: Fr[];
  it("evaluate g(x), h(x), g2(x), Fxs at t", async () => {
    t = hashPointAndScalarList([proof.D], [rs[1]]);
    rtz = calculate_rtz(params, rs, indexes, t);
    Hx = calculateHx(params, Fxs, rtz);
    Gx = calculateGx(params, rs, Fxs, indexes);
    G2t = calculateG2t(ys, rtz);

    const Hx_coeffs = await convertEvalToCoeff(Hx);
    Ht = evaluate(Hx_coeffs, t);
    const Gx_coeffs = await convertEvalToCoeff(Gx);
    Gt = evaluate(Gx_coeffs, t);

    Fts = new Array(pcs_length);
    for (let i = 0; i < pcs_length; i++) {
      Fts[i] = evaluate(Fx_coeffs[i], t);
    }

    const Fr = bn128.Fr;
    const result = Fr.sub(Fr.sub(Ht, Gt), G2t);
    expect(Fr.isZero(result)).to.be.true;
  });

  it("check that rtz is correct", async () => {
    for (let i = 0; i < pcs_length; i++) {
      const Fr = bn128.Fr;
      const expected_rtz = Fr.div(rs[i], Fr.sub(t, params.Domain[indexes[i]]));
      expect(Fr.eq(expected_rtz, rtz[i])).to.be.true;
    }
  });

  it("check that h(x) is correct at t", async () => {
    const Fr = bn128.Fr;
    let expected_Ht = Fr.zero;
    for (let i = 0; i < pcs_length; i++) {}

    let expected_Ht1 = Fr.zero;
    for (let i = 0; i < pcs_length; i++) {
      const ht = Fr.div(
        Fr.mul(Fts[i], rs[i]),
        Fr.sub(t, params.Domain[indexes[i]])
      );
      const ht1 = Fr.mul(Fts[i], rtz[i]);
      expect(Fr.eq(ht, ht1)).to.be.true;
      expected_Ht = Fr.add(expected_Ht, ht);
      expected_Ht1 = Fr.add(expected_Ht1, ht1);
    }

    expect(Fr.eq(expected_Ht, expected_Ht1)).to.be.true;
    expect(Fr.eq(Ht, expected_Ht)).to.be.true;
  });

  it("check that g(x) is correct at t", async () => {
    const Fr = bn128.Fr;
    let expected_Gt = Fr.zero;
    for (let i = 0; i < pcs_length; i++) {
      const Q = calculateQuotient(params, Fxs[i], indexes[i]);
      const Q_coeff = await convertEvalToCoeff(Q);
      const Qt = evaluate(Q_coeff, t);
      const expected_Qt = Fr.div(
        Fr.sub(Fts[i], ys[i]),
        Fr.sub(t, params.Domain[indexes[i]])
      );
      expect(Fr.eq(Qt, expected_Qt)).to.be.true;
      expected_Gt = Fr.add(expected_Gt, Fr.mul(rs[i], expected_Qt));
    }

    expect(Fr.eq(Gt, expected_Gt)).to.be.true;
  });

  it("test verify", () => {
    const valid = verifyPCSMultiproofs(params, indexes, ys, Cs, proof);
    expect(valid).to.be.true;
  });

  let PCSContract: PCSMultiproofsSol;
  let TestVerifiers: TestVerifiers;
  it("Deploy contracts", async () => {
    const PCSFactory = await ethers.getContractFactory("PCSMultiproofs");
    PCSContract = await PCSFactory.deploy();
    await PCSContract.deployed();

    const TestVerifiersFactory = await ethers.getContractFactory(
      "TestVerifiers"
    );
    TestVerifiers = await TestVerifiersFactory.deploy(
      PCSContract.address,
      PCSContract.address
    );
    await TestVerifiers.deployed();
  });

  it("test solidity verifier", async () => {
    const Fr = bn128.Fr;
    const ysCalldata = ys.map((y) => Fr.toObject(y).toString());
    const CsCalldata = Cs.map((c) => G1Calldata(c));
    const PiCalldata = G1Calldata(proof.Pi);
    const DCalldata = G1Calldata(proof.D);

    const valid = await PCSContract.verifyPCS(
      indexes,
      ysCalldata,
      CsCalldata,
      PiCalldata,
      DCalldata
    );
    expect(valid).to.be.true;
  });

  it("benchmark verify gas", async () => {
    const Fr = bn128.Fr;
    const ysCalldata = ys.map((y) => Fr.toObject(y).toString());
    const CsCalldata = Cs.map((c) => G1Calldata(c));
    const PiCalldata = G1Calldata(proof.Pi);
    const DCalldata = G1Calldata(proof.D);

    const tx = await TestVerifiers.pcsVerify(
      indexes,
      ysCalldata,
      CsCalldata,
      PiCalldata,
      DCalldata
    );
    await tx.wait();

    const tx1 = await TestVerifiers.getWhiteList(84329);
    await tx1.wait();
  });
});
