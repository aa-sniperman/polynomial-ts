import { Fr } from "src/global";
import { default as MerkleTree } from "./FixedMerkleTree";
export { MerkleTree };
export default MerkleTree;
export type HashFunction = {
  (left: Fr, right: Fr): Fr;
};

export type SerializedTreeState = {
  levels: number;
  _zeros: Array<Fr>;
  _layers: Array<Fr[]>;
};

export type SerializedPartialTreeState = {
  levels: number;
  _layers: Fr[][];
  _zeros: Array<Fr>;
  _edgeLeafProof: ProofPath;
  _edgeLeaf: LeafWithIndex;
};

export type ProofPath = {
  pathElements: Fr[];
  pathIndices: number[];
  pathPositions: number[];
  pathRoot: Fr;
};

export type BatchProof = Array<Fr[]>;
export type TreeEdge = {
  edgeElement: Fr;
  edgePath: ProofPath;
  edgeIndex: number;
  edgeElementsCount: number;
};

export type TreeSlice = { edge: TreeEdge; Elements: Fr[] };
export type LeafWithIndex = { index: number; data: Fr };
