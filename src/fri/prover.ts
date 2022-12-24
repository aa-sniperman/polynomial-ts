import { log2 } from "../advance-crypto/ffjavascript/utils.js";
import MerkleTree from "../fixed-merkle-tree";
import {
  Fr,
  FRILayer,
  FRIParameters,
  FRIProof,
  FRIProofLayer,
  FRIProver,
} from "../global";
import { hashMerkleTree, hashPointAndScalarList } from "../hash-to-scalar";
import {
  flatten,
  foldEvaluations,
  foldPositions,
  groupSlice,
  transpose,
} from "./folding";
import { getNumFRILayer } from "./params";

export function buildFRILayer(transposedVector: Array<Fr[]>): FRILayer {
  const hashes = transposedVector.map((chunk) =>
    hashPointAndScalarList([], chunk)
  );
  const treeDepth = log2(hashes.length);
  const merkleTree = new MerkleTree(
    treeDepth,
    hashes,
    hashMerkleTree,
    bn128.Fr.zero
  );
  const evaluations = flatten(transposedVector);
  return {
    evaluations,
    merkleTree,
  };
}

export async function buildFRIProver(
  params: FRIParameters,
  evaluations: Fr[]
): Promise<FRIProver> {
  const domainSize = evaluations.length;
  const numFriLayer = getNumFRILayer(params, domainSize);
  const layers = [];
  const currentSeeds = [];

  let curOffset = params.domainOffset;
  for (let i = 0; i < numFriLayer; i++) {
    const transposedVector = transpose(evaluations, params.foldingFactor);
    const layer = buildFRILayer(transposedVector);
    layers.push(layer);
    currentSeeds.push(layer.merkleTree.root);
    const alpha = hashPointAndScalarList([], currentSeeds);

    evaluations = await foldEvaluations(
      evaluations,
      curOffset,
      alpha,
      params.foldingFactor
    );

    curOffset = bn128.Fr.exp(curOffset, params.foldingFactor);
  }

  return { layers, remainder: evaluations };
}

export function queryFRILayer(
  params: FRIParameters,
  layer: FRILayer,
  positions: number[]
): FRIProofLayer {
  const queryValues = [];
  const evaluations = groupSlice(layer.evaluations, params.foldingFactor);
  for (let i = 0; i < positions.length; i++) {
    queryValues.push(evaluations[positions[i]]);
  }
  const merkleProof = layer.merkleTree.batchProof(positions);
  return {
    queryValues,
    merkleProof,
  };
}

export function buildFRICommitment(friLayers: Array<FRILayer>): Fr[] {
  const result = [];
  for (let i = 0; i < friLayers.length; i++) {
    result.push(friLayers[i].merkleTree.root);
  }
  return result;
}

export function buildFRIProof(
  params: FRIParameters,
  friProver: FRIProver,
  positions: number[],
  sourceDomainSize: number
): FRIProof {
  let curDomainSize = sourceDomainSize;
  let curPositions = positions;
  const layers = [];
  for (let i = 0; i < friProver.layers.length; i++) {
    curPositions = foldPositions(
      curPositions,
      curDomainSize,
      params.foldingFactor
    );
    console.log("create layer " + i);
    const proofLayer = queryFRILayer(params, friProver.layers[i], curPositions);
    layers.push(proofLayer);
    curDomainSize /= params.foldingFactor;
  }
  return {
    remainder: friProver.remainder,
    layers,
  };
}
