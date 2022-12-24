import {
  detranspose,
  foldEvaluations,
  foldPositions,
  transpose,
} from "./fri/folding";
import { Fr, setupParams } from "./global";
import { convertCoeffToEval, convertEvalToCoeff } from "./kzg/kzg";
import { randomFr } from "./utils";
import { expect } from "chai";
import { domain } from "./kzg/srs/trusted-setup";
import {
  evaluate,
  fftWithInversedDomain,
  interpolate,
  lagrangePolynomial,
} from "./kzg/polynomial";
import { setupFRIParams } from "./fri/params";
import {
  buildFRICommitment,
  buildFRILayer,
  buildFRIProof,
  buildFRIProver,
  queryFRILayer,
} from "./fri/prover";
import {
  foldDomain,
  getFoldQueryValues,
  verifyFRI,
  verifyLayer,
} from "./fri/verifier";
import MerkleTree, { LeafWithIndex } from "./fixed-merkle-tree";
import { hashMerkleTree } from "./hash-to-scalar";
import { getDomainSize } from "./fri/ff";

describe("test fri protocol", async () => {
  it("setup params", async () => {
    await setupParams();
  });
  it.skip("test roots of unity", async () => {
    const Fr = bn128.Fr;
    const domainSize = 2 ** 10;

    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(Fr.e(i * 11 + 11));
    }

    const w = domain(domainSize);

    expect(Fr.eq(w[domainSize / 2], Fr.negone)).to.be.true;
    const P = await convertEvalToCoeff(F);
    for (let i = 0; i < domainSize; i++) {
      expect(Fr.eq(F[i], evaluate(P, w[i])));
    }
    for (let i = 0; i < domainSize / 2; i++) {
      expect(
        Fr.eq(evaluate(P, Fr.neg(w[i])), evaluate(P, w[i + domainSize / 2]))
      );
    }

    const offset = randomFr();
    const offsetW = [];
    for (let i = 0; i < domainSize; i++) {
      offsetW.push(Fr.mul(offset, w[i]));
    }
    for (let i = 0; i < domainSize / 2; i++) {
      expect(
        Fr.eq(
          evaluate(P, Fr.neg(offsetW[i])),
          evaluate(P, offsetW[i + domainSize / 2])
        )
      );
    }
  }).timeout(20000);

  it.skip("test fft with inversed domain", async () => {
    const Fr = bn128.Fr;
    const domainSize = 2 ** 10;

    const P: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      P.push(Fr.e(i * 11 + 11));
    }

    const w = domain(domainSize);
    const F = await fftWithInversedDomain(P);
    for (let i = 0; i < domainSize; i++) {
      const expected_Fi = evaluate(P, w[(domainSize - i) % domainSize]);
      expect(Fr.eq(expected_Fi, F[i])).to.be.true;
    }
  });
  it.skip("test transpose vector", async () => {
    const Fr = bn128.Fr;
    const domainSize = 1 << 10;
    const foldingFactor = 16;
    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(Fr.e(i * 11 + 11));
    }
    const transposedF = transpose(F, foldingFactor);
    const detransposedF = detranspose(transposedF);
    for (let i = 0; i < F.length; i++) {
      expect(Fr.eq(F[i], detransposedF[i])).to.be.true;
    }
  });
  it.skip("test folding", async () => {
    const Fr = bn128.Fr;
    const domainSize = 1 << 8;
    const foldingFactor = 16;
    const P: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      P.push(Fr.e(i * 11 + 1));
    }

    const w = domain(domainSize);
    const alpha = randomFr();
    const offset = randomFr();
    const offsetW = [];
    for (let i = 0; i < domainSize; i++) {
      offsetW.push(Fr.mul(offset, w[i]));
    }

    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(evaluate(P, offsetW[i]));
    }
    const transposedF = transpose(F, foldingFactor);

    const foldDomainSize = domainSize / foldingFactor;
    const foldOffsetW = [];
    for (let i = 0; i < foldDomainSize; i++) {
      foldOffsetW.push(Fr.exp(offsetW[i], foldingFactor));
    }

    const P0 = [];
    for (let i = 0; i < foldDomainSize; i++) {
      P0.push(P[i * foldingFactor]);
    }

    for (let i = 0; i < foldDomainSize; i++) {
      const P0x = evaluate(P0, foldOffsetW[i]);
      let expected_P0x = Fr.zero;
      for (let j = 0; j < foldingFactor; j++) {
        expected_P0x = Fr.add(expected_P0x, transposedF[i][j]);
      }
      expected_P0x = Fr.div(expected_P0x, Fr.e(foldingFactor));
      expect(Fr.eq(P0x, expected_P0x)).to.be.true;
    }

    function foldCoefficients(
      coeffs: Fr[],
      alpha: Fr,
      foldingFactor: number
    ): Fr[] {
      const result = [];
      const foldDomainSize = coeffs.length / foldingFactor;
      for (let i = 0; i < foldDomainSize; i++) {
        const poly = coeffs.slice(i * foldingFactor, (i + 1) * foldingFactor);
        result.push(evaluate(poly, alpha));
      }
      return result;
    }

    const foldP = foldCoefficients(P, alpha, foldingFactor);
    const foldF = await foldEvaluations(F, offset, alpha, foldingFactor);
    for (let i = 0; i < foldDomainSize; i++) {
      const expected_Fi = evaluate(foldP, foldOffsetW[i]);
      expect(Fr.eq(expected_Fi, foldF[i])).to.be.true;
    }
  });

  it.skip("test lagrange polynomial", async () => {
    const Fr = bn128.Fr;
    const domainSize = 1 << 10;
    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(Fr.e(i * 11 + 11));
    }
    const pos = 101;
    const lagrange = await lagrangePolynomial(F, pos);

    const Fpos = evaluate(lagrange, F[pos]);
    expect(Fr.eq(Fpos, Fr.one)).to.be.true;
    for (let i = 0; i < domainSize; i++) {
      if (i !== pos) expect(Fr.isZero(evaluate(lagrange, F[i]))).to.be.true;
    }
  }).timeout(10000);

  it.skip("test interpolation", async () => {
    const Fr = bn128.Fr;
    const domainSize = 1 << 10;
    const foldingFactor = 16;
    const foldRoots = domain(foldingFactor);
    const w = domain(domainSize);
    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(Fr.e(i * 11 + 11));
    }
    const offset = randomFr();
    const alpha = randomFr();
    const foldF = await foldEvaluations(F, offset, alpha, foldingFactor);
    const pos = 50;
    const transposedF = transpose(F, foldingFactor);
    const ys = transposedF[pos];
    const offsetW = [];
    for (let i = 0; i < domainSize; i++) {
      offsetW.push(Fr.mul(offset, w[i]));
    }
    const offsetWPos = offsetW[pos];
    const xs = foldRoots.map((root) => Fr.mul(root, offsetWPos));
    const poly = await interpolate(xs, ys);

    for (let i = 0; i < foldingFactor; i++) {
      expect(Fr.eq(ys[i], evaluate(poly, xs[i]))).to.be.true;
    }
    const expectedValue = evaluate(poly, alpha);
    expect(Fr.eq(expectedValue, foldF[pos])).to.be.true;
  });

  it.skip("test merkle tree proof", async () => {
    const Fr = bn128.Fr;
    const numLeaves = 1 << 10;
    const leaves: Fr[] = [];
    for (let i = 0; i < numLeaves; i++) {
      leaves.push(Fr.e(i * 11 + 11));
    }
    const merkleTree = new MerkleTree(10, leaves, hashMerkleTree, Fr.zero);
    const pos = 127;
    const proof = merkleTree.path(pos);
    const expected_leaf = leaves[pos];
    const valid = MerkleTree.verify(
      proof,
      merkleTree.root,
      pos,
      expected_leaf,
      hashMerkleTree
    );

    expect(valid).to.be.true;
  });
  it.skip("test merkle tree batch proof", async () => {
    const Fr = bn128.Fr;
    const numLeaves = 1 << 10;
    const leaves: Fr[] = [];
    for (let i = 0; i < numLeaves; i++) {
      leaves.push(Fr.e(i * 11 + 11));
    }
    const merkleTree = new MerkleTree(10, leaves, hashMerkleTree, Fr.zero);

    const indexes: number[] = [];
    for (let i = 0; i < 200; i++) {
      const index = (i * 13) % numLeaves;
      if (!indexes.includes(index)) {
        indexes.push(index);
      }
    }

    const proof = merkleTree.batchProof(indexes);
    const queries: LeafWithIndex[] = [];
    for (let i = 0; i < indexes.length; i++) {
      queries.push({
        index: indexes[i],
        data: leaves[indexes[i]],
      });
    }
    const valid = MerkleTree.batchVerify(
      proof,
      merkleTree.root,
      queries,
      hashMerkleTree
    );
    expect(valid).to.be.true;
  });
  it.skip("test fri layer", async () => {
    const Fr = bn128.Fr;
    const domainSize = 1 << 10;
    const foldingFactor = 16;
    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(Fr.e(i * 11 + 11));
    }
    const domainOffset = randomFr();
    const maxRemainderSize = 17;
    const params = setupFRIParams(
      domainOffset,
      maxRemainderSize,
      foldingFactor
    );
    const transposedF = transpose(F, foldingFactor);

    const layer = buildFRILayer(transposedF);

    const positions = [];
    for (let i = 0; i < 400; i++) {
      positions.push((i * 13 + 13) % domainSize);
    }
    const evaluations = [];
    for (let i = 0; i < 400; i++) {
      evaluations.push(F[positions[i]]);
    }

    const foldPos = foldPositions(positions, domainSize, foldingFactor);
    const proof = queryFRILayer(params, layer, foldPos);

    const valid = await verifyLayer(
      params,
      domainSize,
      evaluations,
      positions,
      layer.merkleTree.root,
      proof
    );
    expect(valid).to.be.true;
  });
  it.skip("test fold query values", async () => {
    const Fr = bn128.Fr;
    const domainSize = 1 << 12;
    const foldingFactor = 16;
    const domainOffset = randomFr();

    const F: Fr[] = [];
    for (let i = 0; i < domainSize; i++) {
      F.push(Fr.e(i * 11 + 11));
    }

    let positions = [];
    for (let i = 0; i < 1000; i++) {
      positions.push((i * 13 + 13) % domainSize);
    }
    let evaluations = [];
    for (let i = 0; i < 1000; i++) {
      evaluations.push(F[positions[i]]);
    }

    let curF = F;
    const numFriLayer = 2;
    let curDomainSize = domainSize;
    let curW = domain(domainSize);
    let curOffset = domainOffset;
    const foldRoots = domain(foldingFactor);
    for (let i = 0; i < numFriLayer; i++) {
      const alpha = randomFr();

      const foldPos = foldPositions(positions, curDomainSize, foldingFactor);
      const foldF = await foldEvaluations(
        curF,
        curOffset,
        alpha,
        foldingFactor
      );
      const transposedF = transpose(curF, foldingFactor);
      const queries = [];
      for (let i = 0; i < foldPos.length; i++) {
        queries.push(transposedF[foldPos[i]]);
      }
      const foldQueries = await getFoldQueryValues(
        curOffset,
        curW,
        foldRoots,
        foldPos,
        alpha,
        queries
      );

      for (let i = 0; i < foldPos.length; i++) {
        expect(Fr.eq(foldQueries[i], foldF[foldPos[i]])).to.be.true;
      }

      positions = foldPos;
      evaluations = foldQueries;
      curF = foldF;

      curDomainSize /= foldingFactor;
      curW = foldDomain(curW, foldingFactor);
      curOffset = Fr.exp(curOffset, foldingFactor);
    }

    const remainder = curF;
    for (let i = 0; i < positions.length; i++) {
      expect(Fr.eq(remainder[positions[i]], evaluations[i])).to.be.true;
    }
  }).timeout(10000);
  it("test fri prover", async () => {
    const Fr = bn128.Fr;
    const foldingFactor = 4;
    const domainOffset = randomFr();
    const maxRemainderSize = 17;
    const params = setupFRIParams(
      domainOffset,
      maxRemainderSize,
      foldingFactor
    );
    const maxDegree = 7 * (1 << 16) - 1;
    const pDegree = 6 * (1 << 16);
    const P: Fr[] = [];
    for (let i = 0; i < pDegree; i++) {
      P.push(Fr.e(i * 11 + 11));
    }

    const domainSize = getDomainSize(maxDegree + 1);
    console.log(domainSize);
    for (let i = pDegree; i < domainSize; i++) {
      P.push(Fr.zero);
    }

    const F = await convertCoeffToEval(P);

    const positions = [];
    for (let i = 0; i < 50; i++) {
      positions.push((i * 111 + 143215) % domainSize);
    }

    const evaluations = [];
    for (let i = 0; i < 50; i++) {
      evaluations.push(F[positions[i]]);
    }
    let t = Date.now();
    const prover = await buildFRIProver(params, F);
    console.log("built fri prover in " + (Date.now() - t) + "ms");
    t = Date.now();
    const proof = buildFRIProof(params, prover, positions, domainSize);
    console.log("built fri proof in " + (Date.now() - t) + "ms");
    
    const commitment = buildFRICommitment(prover.layers);

    t = Date.now()
    const valid = await verifyFRI(
      params,
      evaluations,
      positions,
      maxDegree,
      commitment,
      proof
    );
    expect(valid).to.be.true;

    console.log("verified fri proof in " + (Date.now() - t) + "ms");
  }).timeout(100000);
});
