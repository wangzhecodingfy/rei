import { TxOptions, Transaction } from '@ethereumjs/tx';
import { BN, bufferToHex, bnToHex, intToHex, rlp } from 'ethereumjs-util';
import { BaseTrie as Trie } from 'merkle-patricia-tree';
import { Block } from './block';

/**
 * Calculate the size of the transaction
 * @param tx Transaction
 * @returns Total length of all row transaction
 */
export function txSize(tx: Transaction) {
  const raw = tx.raw();
  let size = 0;
  for (const b of raw) {
    if (b instanceof Buffer) {
      size += b.length;
    }
  }
  return size;
}

/**
 * Generate transaction object by given values
 * @param values Given values
 * @param opts The options for initializing a Transaction.
 * @returns A new transaction object
 */
export function mustParseTransction(values: Buffer[], opts?: TxOptions) {
  if (values.length === 6 || values.length === 9) {
    return Transaction.fromValuesArray(values, opts);
  }
  throw new Error('invalid tx data');
}

/**
 * WrappedBlock based Ethereum transaction.
 */
export class WrappedTransaction {
  public readonly transaction: Transaction;

  constructor(transaction: Transaction) {
    this.transaction = transaction;
  }

  extension: {
    blockHash?: Buffer;
    blockNumber?: BN;
    transactionIndex?: number;
    size?: number;
  } = {};

  /**
   * Get the size of the total transaction
   */
  get size() {
    if (this.extension.size) {
      return this.extension.size;
    }
    this.extension.size = txSize(this.transaction);
    return this.extension.size;
  }

  /**
   * Assign attribute according to the given value
   * @param block Block
   * @param transactionIndex Transaction index
   * @returns The transction object
   */
  installProperties(block: Block, transactionIndex: number): this {
    this.extension.blockHash = block.hash();
    this.extension.blockNumber = block.header.number;
    this.extension.transactionIndex = transactionIndex;
    return this;
  }

  /**
   * Convert the transaction into json form so that can be transported by rpc port
   * @returns Converted Json object
   */
  toRPCJSON() {
    return {
      blockHash: this.extension.blockHash ? bufferToHex(this.extension.blockHash) : null,
      blockNumber: this.extension.blockNumber ? bnToHex(this.extension.blockNumber) : null,
      from: bufferToHex(this.transaction.getSenderAddress().toBuffer()),
      gas: bnToHex(this.transaction.gasLimit),
      gasPrice: bnToHex(this.transaction.gasPrice),
      hash: bufferToHex(this.transaction.hash()),
      input: bufferToHex(this.transaction.data),
      nonce: bnToHex(this.transaction.nonce),
      to: this.transaction.to !== undefined ? this.transaction.to.toString() : null,
      transactionIndex: this.extension.transactionIndex !== undefined ? intToHex(this.extension.transactionIndex) : null,
      value: bnToHex(this.transaction.value),
      v: this.transaction.v !== undefined ? bnToHex(this.transaction.v) : undefined,
      r: this.transaction.r !== undefined ? bnToHex(this.transaction.r) : undefined,
      s: this.transaction.s !== undefined ? bnToHex(this.transaction.s) : undefined
    };
  }
}

export const emptyTxTrie = Buffer.from('56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421', 'hex');

/**
 * Generate transaction Trie based on given transactions
 * @param transactions
 * @returns The root transaction trie
 */
export async function calculateTransactionTrie(transactions: Transaction[]): Promise<Buffer> {
  if (transactions.length === 0) {
    return emptyTxTrie;
  }
  const txTrie = new Trie();
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const key = rlp.encode(i);
    const value = tx.serialize();
    await txTrie.put(key, value);
  }
  return txTrie.root;
}

/**
 * Computes the 'intrinsic gas' for the transactions
 * @param tx Transaction
 * @returns Gas amount
 */
export function calculateIntrinsicGas(tx: Transaction) {
  const gas = tx.toCreationAddress() ? new BN(53000) : new BN(21000);
  const nz = new BN(0);
  const z = new BN(0);
  for (const b of tx.data) {
    (b !== 0 ? nz : z).iaddn(1);
  }
  gas.iadd(nz.muln(16));
  gas.iadd(z.muln(4));
  return gas;
}

export * from '@ethereumjs/tx';