import { expect } from "chai";
import { Coefficients, Commitment, Evaluations, Fr, G1Point, KZGParameters, setupParams } from "./global";
// @ts-ignore
import { ethers } from "hardhat";
import { Verifier, Pairing } from "./typechain-types/KZGVerifier.sol/Verifier";

import {
  calculateQuotient,
  commitCoefficients,
  commitEvaluations,
  convertCoeffToEval,
  convertEvalToCoeff,
  evaluate,
  proveEvaluations,
  verify,
} from "./kzg/kzg";

import { G1Calldata } from "./utils";
import { TestVerifiers } from "./typechain-types/TestVerifiers.sol";
import { importSRS, toJSON, toSolidity, trustedSetup } from "./kzg/srs/trusted-setup";

describe("Test KZG", async () => {
  it("setup params", async () => {
    await setupParams();
  });
  it("test pairing", () => {
    const Fr = bn128.Fr;
    const G1 = bn128.G1;
    const G2 = bn128.G2;

    const a = Fr.fromObject(BigInt(300));
    const b = Fr.fromObject(BigInt(400));
    const c = Fr.fromObject(BigInt(200));
    const d = Fr.fromObject(BigInt(600));

    expect(Fr.eq(Fr.mul(a, b), Fr.mul(c, d))).to.be.true;

    const aG1 = G1.timesFr(G1.one, a);
    const bG2 = G2.timesFr(G2.one, b);

    const cG1 = G1.timesFr(G1.one, c);
    const dG2 = G2.timesFr(G2.one, d);

    const p1 = bn128.pairing(aG1, bG2);
    const p2 = bn128.pairing(cG1, dG2);

    expect(bn128.F12.eq(p1, p2)).to.be.true;
  });

  let params: KZGParameters;
  let depth = 256;
  let s: Fr;
  it("trusted setup", async () => {
    s = bn128.Fr.e("99999999999911111");
    params = trustedSetup(s, depth);
  });

  it("test vanishing polynomial", async () => {
    const Fr = bn128.Fr;
    let vanishingCoeff: Coefficients = new Array(2);
    vanishingCoeff[0] = Fr.one;
    vanishingCoeff[1] = Fr.one;
    const vanishingEval = await convertCoeffToEval(vanishingCoeff);
    console.log(Fr.toObject(vanishingEval[0]));
    console.log(Fr.toObject(vanishingEval[1]));
  });
  it.skip("import from json", () => {
    params = importSRS("src/srs/srs.json");
  });

  it.skip("validate srs", () => {
    let G2 = params.SRS_2[0];
    let s_G2 = params.SRS_2[1];
    for (let i = 0; i < depth - 1; i++) {
      let s_i_G1 = params.SRS_1[i];
      let s_i_next_G1 = params.SRS_1[i + 1];
      // check that e(s_i_G1, s_G2) === e(s_i_next_G1, G2)
      let left = bn128.pairing(s_i_G1, s_G2);
      let right = bn128.pairing(s_i_next_G1, G2);
      expect(bn128.F12.eq(left, right)).to.be.true;
    }
  }).timeout(20000);

  it.skip("validate roots of unity", () => {
    const Fr = bn128.Fr;
    for (let i = 0; i < depth; i++) {
      for (let j = 0; j < depth; j++) {
        if (i !== j) {
          expect(Fr.eq(params.Domain[i], params.Domain[j])).to.be.false;
          const expected = Fr.div(params.Domain[i], params.Domain[j]);
          if (i > j) expect(Fr.eq(params.Domain[i - j], expected)).to.be.true;
          else expect(Fr.eq(params.Domain[i - j + depth], expected)).to.be.true;
        }
      }
    }

    for (let i = 0; i < depth; i++) {
      expect(Fr.eq(Fr.one, Fr.exp(params.Domain[i], depth))).to.be.true;
    }
  }).timeout(20000);

  let evaluations: Evaluations;
  let coefficients: Coefficients;
  it("calculate polynomial", async () => {
    const Fr = bn128.Fr;

    evaluations = new Array(depth);
    for (let i = 0; i < depth; i++) {
      evaluations[i] = Fr.e(11 * i * i + 7 * i + 3);
    }
    coefficients = await convertEvalToCoeff(evaluations);
  });
  it.skip("test fft", async () => {
    const Fr = bn128.Fr;
    for (let i = 0; i < depth; i++) {
      // calculate p(omega_i)
      const x = params.Domain[i];
      let p_i = evaluate(coefficients, x);

      expect(Fr.eq(p_i, evaluations[i])).to.be.true;
    }

    const expected_evals = await convertCoeffToEval(coefficients);
    for (let i = 0; i < depth; i++) {
      expect(Fr.eq(evaluations[i], expected_evals[i])).to.be.true;
    }
  }).timeout(20000);

  let commitment: Commitment;
  it("test commitment", async () => {
    const G1 = bn128.G1;
    commitment = await commitEvaluations(params, evaluations);
    let expected_commitment = G1.zero;
    for (let i = 0; i < params.depth; i++) {
      expected_commitment = G1.add(
        expected_commitment,
        G1.timesFr(params.SRS_1[i], coefficients[i])
      );
    }
    expect(G1.eq(commitment, expected_commitment));
  });

  let index = 5;
  let proof: G1Point;
  it.skip("test quotient", async () => {
    const Fr = bn128.Fr;
    const quotientEvals = calculateQuotient(params, evaluations, index);
    const quotientCoeffs = await convertEvalToCoeff(quotientEvals);

    for (let i = 0; i < depth; i++) {
      if (i !== index) {
        const expected_q_i = Fr.div(
          Fr.sub(evaluations[i], evaluations[index]),
          Fr.sub(params.Domain[i], params.Domain[index])
        );
        expect(Fr.eq(quotientEvals[i], expected_q_i));
      }
    }

    for (let i = 0; i < depth; i++) {
      if (i !== index) {
        const expected_q_i = evaluate(quotientCoeffs, params.Domain[i]);
        expect(Fr.eq(quotientEvals[i], expected_q_i));
      }
    }

    const quo_x = evaluate(quotientCoeffs, s);
    const f_x = evaluate(coefficients, s);
    const f_x_minus_y = Fr.sub(f_x, evaluations[index]);
    const x_minus_z = Fr.sub(s, params.Domain[index]);

    expect(Fr.eq(f_x_minus_y, Fr.mul(quo_x, x_minus_z))).to.be.true;

    const G1 = bn128.G1;
    const quo_xG1 = G1.timesFr(G1.one, quo_x);
    const f_x_minus_yG1 = G1.timesFr(G1.one, f_x_minus_y);

    const G2 = bn128.G2;
    const x_minus_zG2 = G2.timesFr(G2.one, x_minus_z);

    const left = bn128.pairing(f_x_minus_yG1, G2.one);
    const right = bn128.pairing(quo_xG1, x_minus_zG2);

    expect(bn128.F12.eq(left, right)).to.be.true;

    proof = await commitCoefficients(params, quotientCoeffs);

    // const expected_quoG1 = await commitCoefficients(params, quotientCoeffs);

    // proof = await proveEvaluations(params, evaluations, index);
    // expect(G1.eq(quo_commitment, proof)).to.be.true;

    expect(G1.eq(proof, quo_xG1)).to.be.true;
    // expect(G1.eq(quo_commitment, expected_quoG1)).to.be.true;

    const f_xG1 = G1.timesFr(G1.one, f_x);
    const yG1 = G1.timesFr(G1.one, evaluations[index]);

    expect(G1.eq(G1.sub(f_xG1, yG1), f_x_minus_yG1)).to.be.true;
    expect(G1.eq(commitment, f_xG1)).to.be.true;

    const C_minus_yG1 = G1.sub(commitment, yG1);
    expect(G1.eq(f_x_minus_yG1, C_minus_yG1)).to.be.true;
  }).timeout(20000);

  it("benchmark proving time", async () => {
    proof = await proveEvaluations(params, evaluations, index);
  });

  it("test verify kzg", async () => {
    const result = verify(params, proof, commitment, index, evaluations[index]);
    expect(result).to.be.true;
  });

  it("export json", () => {
    toJSON(params, "src/srs/srs.json");
  });

  it.skip("export solidity", () => {
    toSolidity(
      params,
      "src/srs/Constants.sol.template",
      "contracts/Constants.sol"
    );
  });

  let verifier: Verifier;
  let testVerifiers: TestVerifiers;
  it("test solidity verifier", async () => {
    const VerifierFactory = await ethers.getContractFactory("Verifier");
    verifier = await VerifierFactory.deploy();
    await verifier.deployed();

    const commitmentArg: Pairing.G1PointStruct = G1Calldata(commitment);
    const proofArg: Pairing.G1PointStruct = G1Calldata(proof);
    const value = bn128.Fr.toObject(evaluations[index]).toString();
    const valid = await verifier.verify(commitmentArg, proofArg, index, value);
    expect(valid).to.be.true;
  });

  it("benchmark KZG verify gas", async () => {
    const TestVerifiersFactory = await ethers.getContractFactory(
      "TestVerifiers"
    );
    testVerifiers = await TestVerifiersFactory.deploy(
      verifier.address,
      verifier.address
    );
    await testVerifiers.deployed();

    const commitmentArg: Pairing.G1PointStruct = G1Calldata(commitment);
    const proofArg: Pairing.G1PointStruct = G1Calldata(proof);
    const value = bn128.Fr.toObject(evaluations[index]).toString();

    const tx = await testVerifiers.kzgVerify(
      commitmentArg,
      proofArg,
      index,
      value
    );
    await tx.wait();
  });
});
