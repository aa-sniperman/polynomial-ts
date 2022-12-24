import { domain } from "../kzg/srs/trusted-setup";
import MerkleTree, { LeafWithIndex } from "../fixed-merkle-tree";
import { Fr, FRIParameters, FRIProof, FRIProofLayer } from "../global";
import { hashMerkleTree, hashPointAndScalarList } from "../hash-to-scalar";
import { evaluate, getDegree, interpolate } from "../kzg/polynomial";
import { getDomainSize } from "./ff";
import { foldPositions } from "./folding";
import { getNumFRILayer } from "./params";
import { convertEvalToCoeff } from "../kzg/kzg";

export async function verifyRemainder(
  remainder: Fr[],
  maxDegree: number
): Promise<boolean> {
  if (maxDegree >= remainder.length - 1) {
    return true;
  }

  const poly = await convertEvalToCoeff(remainder);
  const remainderDegree = getDegree(poly);
  return remainderDegree <= maxDegree;
}

export async function verifyLayer(
  params: FRIParameters,
  sourceDomainSize: number,
  evaluations: Fr[],
  positions: number[],
  layerCommitment: Fr,
  proofLayer: FRIProofLayer
): Promise<boolean> {
  const foldPos = foldPositions(
    positions,
    sourceDomainSize,
    params.foldingFactor
  );
  if (foldPos.length !== proofLayer.queryValues.length) return false;

  const leaves: LeafWithIndex[] = [];
  for (let i = 0; i < foldPos.length; i++) {
    const expected_leaf = hashPointAndScalarList([], proofLayer.queryValues[i]);
    leaves.push({ index: foldPos[i], data: expected_leaf });
  }
  if (
    !MerkleTree.batchVerify(
      proofLayer.merkleProof,
      layerCommitment,
      leaves,
      hashMerkleTree
    )
  )
    return false;

  const queryValues = getQueryValues(
    proofLayer.queryValues,
    positions,
    foldPos,
    sourceDomainSize
  );

  for (let i = 0; i < evaluations.length; i++) {
    if (!bn128.Fr.eq(evaluations[i], queryValues[i])) {
      return false;
    }
  }
  return true;
}

export function getQueryValues(
  queryValues: Array<Fr[]>,
  positions: number[],
  foldPositions: number[],
  sourceDomainSize: number
): Fr[] {
  const result = [];
  const foldingFactor = queryValues[0].length;
  const targetDomainSize = sourceDomainSize / foldingFactor;
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    const foldPos = position % targetDomainSize;
    const foldIndex = foldPositions.indexOf(foldPos);

    const localIndex = (position - foldPos) / targetDomainSize;
    result.push(queryValues[foldIndex][localIndex]);
  }
  return result;
}

export function foldDomain(w: Fr[], foldingFactor: number): Fr[] {
  const foldDomainSize = w.length / foldingFactor;
  const result = [];
  for (let i = 0; i < foldDomainSize; i++) {
    result.push(w[i * foldingFactor]);
  }
  return result;
}

export async function getFoldQueryValues(
  currentOffset: Fr,
  currentW: Fr[],
  foldRoots: Fr[],
  foldPositions: number[],
  alpha: Fr,
  queryValues: Array<Fr[]>
): Promise<Fr[]> {
  const result: Fr[] = [];
  const Fr = bn128.Fr;

  for (let i = 0; i < foldPositions.length; i++) {
    const ys = queryValues[i];
    const pos = foldPositions[i];
    const xe = Fr.mul(currentW[pos], currentOffset);
    const xs = foldRoots.map((root) => Fr.mul(root, xe));
    const poly = await interpolate(xs, ys);
    result.push(evaluate(poly, alpha));
  }
  return result;
}

export async function verifyFRI(
  params: FRIParameters,
  evaluations: Fr[],
  positions: number[],
  maxDegree: number,
  commitment: Fr[],
  proof: FRIProof
): Promise<boolean> {
  if (evaluations.length !== positions.length) {
    throw new Error("evaluations size and positions size mismatch");
  }

  const maxDegreePlus1 = maxDegree + 1;

  const domainSize = getDomainSize(maxDegreePlus1);
  let currentW = domain(domainSize);
  let currentOffset = params.domainOffset;
  let currentDomainSize = domainSize;
  let currentMaxDegreePlus1 = maxDegreePlus1;

  let currentSeeds = [];
  const alphas: Fr[] = [];

  const Fr = bn128.Fr;
  const foldRoots = domain(params.foldingFactor);
  const numFriLayer = getNumFRILayer(params, domainSize);

  let d = maxDegreePlus1;
  for (let i = 0; i < numFriLayer; i++) {
    if (d % params.foldingFactor !== 0) {
      throw new Error("max degree " + maxDegree + " is not supported");
    } else {
      d /= params.foldingFactor;
    }
  }

  if (proof.layers.length !== numFriLayer) {
    return false;
  }
  // validate maxdegree

  for (let i = 0; i < numFriLayer; i++) {
    currentSeeds.push(commitment[i]);
    alphas.push(hashPointAndScalarList([], currentSeeds));
  }
  for (let i = 0; i < numFriLayer; i++) {
    console.log("verify layer " + i);
    const validLayer = await verifyLayer(
      params,
      currentDomainSize,
      evaluations,
      positions,
      commitment[i],
      proof.layers[i]
    );
    if (!validLayer) return false;
    positions = foldPositions(
      positions,
      currentDomainSize,
      params.foldingFactor
    );
    evaluations = await getFoldQueryValues(
      currentOffset,
      currentW,
      foldRoots,
      positions,
      alphas[i],
      proof.layers[i].queryValues
    );
    currentDomainSize /= params.foldingFactor;
    currentW = foldDomain(currentW, params.foldingFactor);
    currentOffset = Fr.exp(currentOffset, params.foldingFactor);
    currentMaxDegreePlus1 /= params.foldingFactor;
  }

  for (let i = 0; i < positions.length; i++) {
    if (!Fr.eq(proof.remainder[positions[i]], evaluations[i])) return false;
  }

  const validRemainder = await verifyRemainder(
    proof.remainder,
    currentMaxDegreePlus1 - 1
  );
  if (!validRemainder) return false;
  return true;
}
