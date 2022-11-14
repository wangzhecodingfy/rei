import { Address, BN } from 'ethereumjs-util';
import { PostByzantiumTxReceipt, TxReceipt } from '@rei-network/vm/dist/types';
import { Common } from '@rei-network/common';
import { CLIQUE_EXTRA_VANITY, Receipt, Log } from '@rei-network/structure';
import { hexStringToBN } from '@rei-network/utils';

export const EMPTY_HASH = Buffer.alloc(32);
export const EMPTY_ADDRESS = Address.zero();
export const EMPTY_EXTRA_DATA = Buffer.alloc(CLIQUE_EXTRA_VANITY);
export const EMPTY_MIX_HASH = Buffer.alloc(32);
export const EMPTY_NONCE = Buffer.alloc(8);

export const MAX_UINT64 = new BN(Buffer.from('ffffffffffffffff', 'hex'));

export function isEmptyAddress(address: Address) {
  return address.equals(EMPTY_ADDRESS);
}

export function isEmptyHash(hash: Buffer) {
  return hash.equals(EMPTY_HASH);
}

export function postByzantiumTxReceiptsToReceipts(receipts: TxReceipt[]) {
  return (receipts as PostByzantiumTxReceipt[]).map(
    (r) =>
      new Receipt(
        r.gasUsed,
        r.bitvector,
        r.logs.map((l) => new Log(l[0], l[1], l[2])),
        r.status
      )
  );
}

export function getGasLimitByCommon(common: Common): BN {
  const limit = common.param('gasConfig', 'gasLimit');
  return hexStringToBN(limit === null ? common.genesis().gasLimit : limit);
}

/**
 * encode validators id  and priority to buffer
 * @param validators - validators id list
 * @param priorities - validators priority list
 * @returns buffer
 */
export function validatorsEncode(ids: number[], priorities: BN[]): Buffer {
  if (ids.length !== priorities.length) {
    throw new Error('validators length not equal priorities length');
  }
  const buffer: Buffer[] = [];
  for (let i = 0; i < ids.length; i++) {
    //encode validator index
    const item = ids[i];
    let bytes: number[];
    if (item >= 223) {
      const data = intToBytesBigEndian(item);
      const length = data.length;
      bytes = [255 - length, ...data];
    } else {
      bytes = [item];
    }
    //encode priority
    const priority = priorities[i];
    const priorityBytes = priority.toBuffer();
    const length = priorityBytes.length;
    const isNegative = priority.isNeg() ? 128 : 0;
    buffer.push(Buffer.from(bytes), Buffer.from([isNegative + length]), priorityBytes);
  }
  return Buffer.concat([...buffer]);
}

/**
 * decode buffer to validators id list
 * @param buffer - buffer
 * @returns validators id list and validators priority list
 */
export function validatorsDecode(data: Buffer) {
  const ids: number[] = [];
  const priorities: BN[] = [];
  for (let i = 0; i < data.length; i++) {
    //decode validator index
    const item = data[i];
    if (item >= 223) {
      const length = 255 - item;
      const bytes = data.slice(i + 1, i + 1 + length);
      ids.push(bytesToIntBigEndian(bytes));
      i += length;
    } else {
      ids.push(item);
    }
    //decode priority
    const prioritySign = data[i + 1];
    const isNeg = prioritySign >> 7 === 1;
    const length = isNeg ? prioritySign - 128 : prioritySign;
    const priorityBytes = data.slice(i + 2, i + 2 + length);
    let bn = new BN(priorityBytes);
    if (isNeg) bn = bn.neg();
    priorities.push(bn);
    i += length + 1;
  }
  return { ids, priorities };
}

function intToBytesBigEndian(number: number) {
  const bytes: number[] = [];
  let i = 32;
  do {
    bytes[--i] = number & 255;
    number = number >> 8;
  } while (i);
  let start: number = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) {
      start = i;
      break;
    }
  }
  return bytes.slice(start);
}

function bytesToIntBigEndian(bytes: Buffer) {
  let val = 0;
  for (let i = 0; i < bytes.length; ++i) {
    val += bytes[i];
    if (i < bytes.length - 1) {
      val = val << 8;
    }
  }
  return val;
}
