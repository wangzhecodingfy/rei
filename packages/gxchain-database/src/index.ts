import { DBManager, CacheMap } from '@ethereumjs/blockchain/dist/db/manager';
import { DBOp, DBTarget, DatabaseKey, DBOpData } from '@ethereumjs/blockchain/dist/db/operation';
import { BN, rlp, toBuffer } from 'ethereumjs-util';
import { Block, BlockHeader } from '@gxchain2/block';
import { Transaction, WrappedTransaction } from '@gxchain2/tx';
import { Receipt } from '@gxchain2/receipt';
const level = require('level-mem');

// constants for txLookup and receipts
const RECEIPTS_PREFIX = Buffer.from('r');
const TX_LOOKUP_PREFIX = Buffer.from('l');
const bufBE8 = (n: BN) => n.toArrayLike(Buffer, 'be', 8);
const receiptsKey = (n: BN, hash: Buffer) => Buffer.concat([RECEIPTS_PREFIX, bufBE8(n), hash]);
const txLookupKey = (hash: Buffer) => Buffer.concat([TX_LOOKUP_PREFIX, hash]);

// helpers for txLookup and receipts.
const DBTarget_Receipts = 100;
const DBTarget_TxLookup = 101;

function new_DBOp(operationTarget: DBTarget, key?: DatabaseKey): DBOp {
  const op: {
    operationTarget: DBTarget;
    baseDBOp: DBOpData;
    cacheString: string;
    updateCache(cacheMap: CacheMap): void;
  } = {
    operationTarget,
    cacheString: operationTarget === DBTarget_Receipts ? 'receipts' : 'txLookup',
    baseDBOp: {
      key: operationTarget === DBTarget_Receipts ? receiptsKey(key!.blockNumber!, key!.blockHash!) : txLookupKey((key! as any).txHash!),
      keyEncoding: 'binary',
      valueEncoding: 'binary'
    },
    updateCache(cacheMap: CacheMap) {
      if (op.cacheString && cacheMap[op.cacheString] && Buffer.isBuffer(op.baseDBOp.value)) {
        if (op.baseDBOp.type == 'put') {
          cacheMap[op.cacheString].set(op.baseDBOp.key, op.baseDBOp.value);
        } else if (op.baseDBOp.type == 'del') {
          cacheMap[op.cacheString].del(op.baseDBOp.key);
        } else {
          throw new Error('unsupported db operation on cache');
        }
      }
    }
  };
  return op;
}

export function DBOp_get(operationTarget: DBTarget, key?: DatabaseKey): DBOp {
  if (operationTarget !== DBTarget_Receipts && operationTarget !== DBTarget_TxLookup) {
    return DBOp.get(operationTarget, key);
  } else {
    return new_DBOp(operationTarget, key);
  }
}

export function DBOp_set(operationTarget: DBTarget, value: Buffer | object, key?: DatabaseKey): DBOp {
  if (operationTarget !== DBTarget_Receipts && operationTarget !== DBTarget_TxLookup) {
    return DBOp.set(operationTarget, value, key);
  } else {
    const dbOperation = new_DBOp(operationTarget, key);
    dbOperation.baseDBOp.value = value;
    dbOperation.baseDBOp.type = 'put';

    if (operationTarget == DBTarget.Heads) {
      dbOperation.baseDBOp.valueEncoding = 'json';
    } else {
      dbOperation.baseDBOp.valueEncoding = 'binary';
    }

    return dbOperation;
  }
}

export function DBOp_del(operationTarget: DBTarget, key?: DatabaseKey): DBOp {
  if (operationTarget !== DBTarget_Receipts && operationTarget !== DBTarget_TxLookup) {
    return DBOp.del(operationTarget, key);
  } else {
    const dbOperation = new_DBOp(operationTarget, key);
    dbOperation.baseDBOp.type = 'del';
    return dbOperation;
  }
}

export function DBSetBlockOrHeader(blockBody: Block | BlockHeader): DBOp[] {
  const header: BlockHeader = blockBody instanceof Block ? blockBody.header : blockBody;
  const dbOps: DBOp[] = [];

  const blockNumber = header.number;
  const blockHash = header.hash();

  const headerValue = header.serialize();
  dbOps.push(
    DBOp.set(DBTarget.Header, headerValue, {
      blockNumber,
      blockHash
    })
  );

  const isGenesis = header.number.eqn(0);

  if (isGenesis || (blockBody instanceof Block && (blockBody.transactions.length || blockBody.uncleHeaders.length))) {
    const bodyValue = rlp.encode(blockBody.raw().slice(1));
    dbOps.push(
      DBOp.set(DBTarget.Body, bodyValue, {
        blockNumber,
        blockHash
      })
    );
  }

  if (blockBody instanceof Block) {
    for (const tx of blockBody.transactions) {
      dbOps.push(
        DBOp_set(DBTarget_TxLookup, toBuffer(blockNumber), {
          txHash: tx.hash()
        } as any)
      );
    }
  }

  return dbOps;
}

export function DBSaveReceipts(receipts: Receipt[], blockHash: Buffer, blockNumber: BN) {
  return DBOp_set(DBTarget_Receipts, rlp.encode(receipts.map((r) => r.raw())), {
    blockHash,
    blockNumber
  });
}

export class Database extends DBManager {
  async get(dbOperationTarget: DBTarget, key?: DatabaseKey): Promise<any> {
    const dbGetOperation = DBOp_get(dbOperationTarget, key);

    const cacheString = dbGetOperation.cacheString;
    const dbKey = dbGetOperation.baseDBOp.key;
    const dbOpts = dbGetOperation.baseDBOp;

    const self: any = this;
    if (cacheString) {
      if (!self._cache[cacheString]) {
        throw new Error(`Invalid cache: ${cacheString}`);
      }

      let value = self._cache[cacheString].get(dbKey);
      if (!value) {
        value = <Buffer>await self._db.get(dbKey, dbOpts);
        self._cache[cacheString].set(dbKey, value);
      }

      return value;
    }

    return self._db.get(dbKey, dbOpts);
  }

  async getTransaction(txHash: Buffer): Promise<Transaction> {
    const blockHeightBuffer = await this.get(DBTarget_TxLookup, { txHash } as any);
    const blockHeihgt = new BN(blockHeightBuffer);
    const block = await this.getBlock(blockHeihgt);
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      if (tx.hash().equals(txHash)) {
        return tx;
      }
    }
    throw new level.errors.NotFoundError();
  }

  async getWrappedTransaction(txHash: Buffer): Promise<WrappedTransaction> {
    const blockHeightBuffer = await this.get(DBTarget_TxLookup, { txHash } as any);
    const blockHeihgt = new BN(blockHeightBuffer);
    const block = await this.getBlock(blockHeihgt);
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      if (tx.hash().equals(txHash)) {
        return new WrappedTransaction(tx).installProperties(block, i);
      }
    }
    throw new level.errors.NotFoundError();
  }

  async getReceipt(txHash: Buffer): Promise<Receipt> {
    const blockHeightBuffer = await this.get(DBTarget_TxLookup, { txHash } as any);
    const blockHeihgt = new BN(blockHeightBuffer);
    const block = await this.getBlock(blockHeihgt);
    const rawArr: Buffer[][] = rlp.decode(await this.get(DBTarget_Receipts, { blockHash: block.hash(), blockNumber: blockHeihgt })) as any;
    const cumulativeGasUsed = new BN(0);
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      const raw = rawArr[i];
      const receipt = Receipt.fromValuesArray(raw);
      cumulativeGasUsed.iadd(new BN(receipt.gasUsed));
      if (tx.hash().equals(txHash)) {
        receipt.installProperties(block, tx, cumulativeGasUsed, i);
        return receipt;
      }
    }
    throw new level.errors.NotFoundError();
  }
}

import levelUp from 'levelup';
import levelDown from 'leveldown';
import encoding from 'encoding-down';

export const createLevelDB = (path: string) => {
  return levelUp(encoding(levelDown(path)));
};

export { DBSetTD, DBSetHashToNumber, DBSaveLookups } from '@ethereumjs/blockchain/dist/db/helpers';
export { DBTarget, DBOp };
