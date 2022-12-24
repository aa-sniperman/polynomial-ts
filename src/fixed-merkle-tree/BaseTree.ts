import { Fr } from "src/global";
import { BatchProof, HashFunction, LeafWithIndex, ProofPath } from "./index";

export class BaseTree {
  levels: number = 0;
  protected _hashFn: HashFunction = (_left, _right) => bn128.Fr.zero;
  protected _zeros: Fr[] = [];
  protected _layers: Array<Fr[]> = [];
  protected _zeroElement: Fr = bn128.Fr.zero;

  get capacity() {
    return 2 ** this.levels;
  }

  get layers(): Array<Fr[]> {
    return this._layers.slice();
  }

  get zeros(): Fr[] {
    return this._zeros.slice();
  }

  get elements(): Fr[] {
    return this._layers[0].slice();
  }

  get root(): Fr {
    return this._layers[this.levels][0] ?? this._zeros[this.levels];
  }

  /**
   * Find an element in the tree
   * @param elements elements of tree
   * @param element An element to find
   * @param comparator A function that checks leaf value equality
   * @param fromIndex The index to start the search at. If the index is greater than or equal to the array's length, -1 is returned
   * @returns {number} Index if element is found, otherwise -1
   */
  static indexOf(
    elements: Fr[],
    element: Fr,
    fromIndex?: number,
    comparator?: <T>(arg0: T, arg1: T) => boolean
  ): number {
    if (comparator) {
      return elements.findIndex((el) => comparator<Fr>(element, el));
    } else {
      return elements.indexOf(element, fromIndex);
    }
  }

  /**
   * Insert new element into the tree
   * @param element Fr to insert
   */
  insert(element: Fr) {
    if (this._layers[0].length >= this.capacity) {
      throw new Error("Tree is full");
    }
    this.update(this._layers[0].length, element);
  }

  /*
   * Insert multiple elements into the tree.
   * @param {Array} elements Frs to insert
   */
  bulkInsert(elements: Fr[]): void {
    if (!elements.length) {
      return;
    }

    if (this._layers[0].length + elements.length > this.capacity) {
      throw new Error("Tree is full");
    }
    // First we insert all elements except the last one
    // updating only full subtree hashes (all layers where inserted element has odd index)
    // the last element will update the full path to the root making the tree consistent again
    for (let i = 0; i < elements.length - 1; i++) {
      this._layers[0].push(elements[i]);
      let level = 0;
      let index = this._layers[0].length - 1;
      while (index % 2 === 1) {
        level++;
        index >>= 1;
        const left = this._layers[level - 1][index * 2];
        const right = this._layers[level - 1][index * 2 + 1];
        this._layers[level][index] = this._hashFn(left, right);
      }
    }
    this.insert(elements[elements.length - 1]);
  }

  /**
   * Change an element in the tree
   * @param {number} index Index of element to change
   * @param element Updated element value
   */
  update(index: number, element: Fr) {
    if (
      isNaN(Number(index)) ||
      index < 0 ||
      index > this._layers[0].length ||
      index >= this.capacity
    ) {
      throw new Error("Insert index out of bounds: " + index);
    }
    this._layers[0][index] = element;
    this._processUpdate(index);
  }

  /**
   * Get merkle path to a leaf
   * @param {number} index Leaf index to generate path for
   * @returns {{pathElements: Object[], pathIndex: number[]}} An object containing adjacent elements and left-right index
   */
  path(index: number): ProofPath {
    if (isNaN(Number(index)) || index < 0 || index >= this._layers[0].length) {
      throw new Error("Index out of bounds: " + index);
    }
    let elIndex = +index;
    const pathElements: Fr[] = [];
    const pathIndices: number[] = [];
    const pathPositions: number[] = [];
    for (let level = 0; level < this.levels; level++) {
      pathIndices[level] = elIndex % 2;
      const leafIndex = elIndex ^ 1;

      if (leafIndex < this._layers[level].length) {
        pathElements[level] = this._layers[level][leafIndex];
        pathPositions[level] = leafIndex;
      } else {
        pathElements[level] = this._zeros[level];
        pathPositions[level] = 0;
      }
      elIndex >>= 1;
    }
    return {
      pathElements,
      pathIndices,
      pathPositions,
      pathRoot: this.root,
    };
  }

  batchProof(indexes: number[]): BatchProof {
    console.log(indexes);
    let curIndexes = indexes.slice()
    curIndexes = curIndexes.sort((a, b) => a - b);
    const proof: BatchProof = [];
    for (let level = 0; level < this.levels; level++) {
      const proofLayer: Fr[] = [];
      for (let i = 0; i < curIndexes.length; i++) {
        const siblingIndex = curIndexes[i] ^ 1;
        if (
          (i === 0 || curIndexes[i - 1] !== siblingIndex) &&
          (i === curIndexes.length - 1 || curIndexes[i + 1] !== siblingIndex)
        ) {
          proofLayer.push(this._layers[level][siblingIndex]);
        }
      }
      proof.push(proofLayer);

      if (level < this.levels - 1) {
        const newIndexes: number[] = [];
        for (let i = 0; i < curIndexes.length; i++) {
          const newIndex = curIndexes[i] >> 1;
          if (i === 0 || newIndexes[newIndexes.length - 1] !== newIndex) {
            newIndexes.push(newIndex);
          }
        }

        curIndexes = newIndexes;
      }
    }
    console.log(indexes);
    return proof;
  }

  static verify(
    proof: ProofPath,
    root: Fr,
    index: number,
    leaf: Fr,
    hashFn: HashFunction
  ): boolean {
    let depth = proof.pathIndices.length;
    let curHash = leaf;
    if (!bn128.Fr.eq(proof.pathRoot, root)) return false;
    let curIndex = index;
    for (let level = 0; level < depth; level++) {
      const lrBit = proof.pathIndices[level];
      const expectedBit = curIndex % 2;
      if (lrBit !== expectedBit) return false;
      curIndex >>= 1;
      if (lrBit === 0) {
        curHash = hashFn(curHash, proof.pathElements[level]);
      } else {
        curHash = hashFn(proof.pathElements[level], curHash);
      }
    }
    return bn128.Fr.eq(curHash, proof.pathRoot);
  }

  static batchVerify(
    proof: BatchProof,
    root: Fr,
    leaves: LeafWithIndex[],
    hashFn: HashFunction
  ): boolean {
    let curNodes = leaves;
    curNodes = curNodes.sort((a, b) => a.index - b.index);

    const depth = proof.length;
    for (let level = 0; level < depth; level++) {
      const proofLayer = proof[level];
      const parentNodes: LeafWithIndex[] = [];
      let curNodeIndex = 0;
      let curProofLayerIndex = 0;
      while (curNodeIndex < curNodes.length) {
        const curNode = curNodes[curNodeIndex];
        const layerIndex = curNode.index;
        const siblingIndex = layerIndex ^ 1;
        const parentNodeIndex = layerIndex >> 1;
        let parentNodeData: Fr;
        if (
          curNodeIndex < curNodes.length - 1 &&
          curNodes[curNodeIndex + 1].index === siblingIndex
        ) {
          parentNodeData = hashFn(
            curNode.data,
            curNodes[curNodeIndex + 1].data
          );
          curNodeIndex += 2;
        } else {
          if (layerIndex % 2 === 0) {
            parentNodeData = hashFn(
              curNode.data,
              proofLayer[curProofLayerIndex]
            );
          } else {
            parentNodeData = hashFn(
              proofLayer[curProofLayerIndex],
              curNode.data
            );
          }
          curNodeIndex++;
          curProofLayerIndex++;
        }

        parentNodes.push({
          index: parentNodeIndex,
          data: parentNodeData,
        });
      }
      curNodes = parentNodes;
    }
    return bn128.Fr.eq(curNodes[0].data, root);
  }

  protected _buildZeros() {
    this._zeros = [this._zeroElement];
    for (let i = 1; i <= this.levels; i++) {
      this._zeros[i] = this._hashFn(this._zeros[i - 1], this._zeros[i - 1]);
    }
  }

  protected _processNodes(nodes: Fr[], layerIndex: number) {
    const length = nodes.length;
    let currentLength = Math.ceil(length / 2);
    const currentLayer = new Array(currentLength);
    currentLength--;
    const starFrom = length - (length % 2 ^ 1);
    let j = 0;
    for (let i = starFrom; i >= 0; i -= 2) {
      if (nodes[i - 1] === undefined) break;
      const left = nodes[i - 1];
      const right =
        i === starFrom && length % 2 === 1
          ? this._zeros[layerIndex - 1]
          : nodes[i];
      currentLayer[currentLength - j] = this._hashFn(left, right);
      j++;
    }
    return currentLayer;
  }

  protected _processUpdate(index: number) {
    for (let level = 1; level <= this.levels; level++) {
      index >>= 1;
      const left = this._layers[level - 1][index * 2];
      const right =
        index * 2 + 1 < this._layers[level - 1].length
          ? this._layers[level - 1][index * 2 + 1]
          : this._zeros[level - 1];
      this._layers[level][index] = this._hashFn(left, right);
    }
  }
}
