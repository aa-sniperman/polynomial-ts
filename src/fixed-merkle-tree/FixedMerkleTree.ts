import { HashFunction, ProofPath, SerializedTreeState, TreeEdge, TreeSlice } from './index';
import { BaseTree } from './BaseTree';
import { Fr } from 'src/global';

export default class MerkleTree extends BaseTree {
  constructor(levels: number, elements: Fr[] = [], hashFunction: HashFunction, zeroElement: Fr) {
    super();
    this.levels = levels;
    if (elements.length > this.capacity) {
      throw new Error('Tree is full');
    }
    this._zeroElement = zeroElement;
    this._hashFn = hashFunction;
    this._layers = [];
    const leaves = elements.slice();
    this._layers = [leaves];
    this._buildZeros();
    this._buildHashes();
  }

  private _buildHashes() {
    for (let layerIndex = 1; layerIndex <= this.levels; layerIndex++) {
      const nodes = this._layers[layerIndex - 1];
      this._layers[layerIndex] = this._processNodes(nodes, layerIndex);
    }
  }

  /**
   * Insert multiple Elements into the tree.
   * @param {Array} elements Elements to insert
   */
  bulkInsert(elements: Fr[]): void {
    if (!elements.length) {
      return;
    }

    if (this._layers[0].length + elements.length > this.capacity) {
      throw new Error('Tree is full');
    }
    // First we insert all Elements except the last one
    // updating only full subtree hashes (all layers where inserted Element has odd index)
    // the last Element will update the full path to the root making the tree consistent again
    for (let i = 0; i < elements.length - 1; i++) {
      this._layers[0].push(elements[i]);
      let level = 0;
      let index = this._layers[0].length - 1;
      while (index % 2 === 1) {
        level++;
        index >>= 1;
        this._layers[level][index] = this._hashFn(
          this._layers[level - 1][index * 2],
          this._layers[level - 1][index * 2 + 1]
        );
      }
    }
    this.insert(elements[elements.length - 1]);
  }

  indexOf(element: Fr, fromIndex?: number, comparator?: <T>(arg0: T, arg1: T) => boolean): number {
    return BaseTree.indexOf(this._layers[0], element, fromIndex ?? 0, comparator);
  }

  proof(element: Fr, fromIndex?: number): ProofPath {
    const index = this.indexOf(element, fromIndex);
    return this.path(index);
  }

  getTreeEdge(edgeIndex: number): TreeEdge {
    const edgeElement = this._layers[0][edgeIndex];
    if (edgeElement === undefined) {
      throw new Error('Element not found');
    }
    const edgePath = this.path(edgeIndex);
    return { edgePath, edgeElement, edgeIndex, edgeElementsCount: this._layers[0].length };
  }

  /**
   * 🪓
   * @param count
   */
  getTreeSlices(count = 4): TreeSlice[] {
    const length = this._layers[0].length;
    let size = Math.ceil(length / count);
    if (size % 2) size++;
    const slices: TreeSlice[] = [];
    for (let i = 0; i < length; i += size) {
      const edgeLeft = i;
      const edgeRight = i + size;
      slices.push({ edge: this.getTreeEdge(edgeLeft), Elements: this.elements.slice(edgeLeft, edgeRight) });
    }
    return slices;
  }

  /**
   * Serialize entire tree state including intermediate layers into a plain object
   * Deserializing it back will not require to recompute any hashes
   * Elements are not converted to a plain type, this is responsibility of the caller
   */
  serialize(): SerializedTreeState {
    return {
      levels: this.levels,
      _zeros: this._zeros,
      _layers: this._layers,
    };
  }

  /**
   * Deserialize data into a MerkleTree instance
   * Make sure to provide the same hashFunction as was used in the source tree,
   * otherwise the tree state will be invalid
   */
  static deserialize(data: SerializedTreeState, hashFunction: HashFunction): MerkleTree {
    const instance: MerkleTree = Object.assign(Object.create(this.prototype), data);
    instance._hashFn = hashFunction;
    instance._zeroElement = instance._zeros[0];
    return instance;
  }

  toString() {
    return JSON.stringify(this.serialize());
  }
}
