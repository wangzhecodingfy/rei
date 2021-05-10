import { Wallet, Accountinfo, addrtype } from './accounts';
import { keccak256, Address, hashPersonalMessage } from 'ethereumjs-util';
import { AccountManger } from './keystore';
import { Transaction } from '@ethereumjs/tx';

export class KeystoreWallet implements Wallet {
  account: Accountinfo;
  keystore: AccountManger;

  constructor(account: Accountinfo, ks: AccountManger) {
    this.account = account;
    this.keystore = ks;
  }

  path() {
    return this.account.path;
  }

  status(): string {
    const status = this.keystore.unlocked.get(this.account.address.toBuffer());
    if (status) {
      return 'Unlocked';
    }
    return 'Locked';
  }

  accounts(): Accountinfo[] {
    return [this.account];
  }

  contain(account: Accountinfo): boolean {
    return account.address.equals(this.account.address);
  }

  signHash(addr: addrtype, hash: Buffer) {
    this.keystore.cache.scanAccounts();
    const accountinfo = this.keystore.cache.byAddr.get(dealAddrToBuffer(addr))![0];
    if (!this.contain(accountinfo)) {
      throw new Error('unknown account');
    }
    return this.keystore.signHash(accountinfo, hash);
  }

  signData(addr: addrtype, mimeType: string, data: Buffer) {
    return this.signHash(addr, keccak256(data));
  }

  signDataWithPassphrase(addr: addrtype, passphrase, mimeType: string, data: Buffer) {
    const accountinfo = this.keystore.cache.byAddr.get(dealAddrToBuffer(addr))![0];
    if (!this.contain(accountinfo)) {
      throw new Error('unknown account');
    }
    return this.keystore.signHashWithPassphrase(accountinfo, passphrase, keccak256(data));
  }

  signText(addr: addrtype, text: Buffer) {
    return this.signHash(addr, hashPersonalMessage(text));
  }

  signTextWithPassphrase(addr: addrtype, passphrase: string, text: Buffer) {
    const accountinfo = this.keystore.cache.byAddr.get(dealAddrToBuffer(addr));
    if (!accountinfo) {
      throw new Error('unknown account');
    }
    if (!this.contain(accountinfo)) {
      throw new Error('unknown account');
    }
    return this.keystore.signHashWithPassphrase(accountinfo, passphrase, hashPersonalMessage(text));
  }

  signTx(addr: addrtype, tx: Transaction, chainID: number): Transaction {
    const accountinfo = this.keystore.cache.byAddr.get(dealAddrToBuffer(addr));
    if (!accountinfo) {
      throw new Error('unknown account');
    }
    if (!this.contain(accountinfo)) {
      throw new Error('unknown account');
    }
    return this.keystore.signTx(accountinfo, tx);
  }

  signTxWithPassphrase(addr: addrtype, passphrase: string, tx: Transaction, chainID: number): Transaction {
    const accountinfo = this.keystore.cache.byAddr.get(dealAddrToBuffer(addr));
    if (!accountinfo) {
      throw new Error('unknown account');
    }
    if (!this.contain(accountinfo)) {
      throw new Error('unknown account');
    }
    return this.keystore.signTxWithPassphrase(accountinfo, passphrase, tx);
  }
}

function dealAddrToBuffer(addr: addrtype) {
  if (Buffer.isBuffer(addr)) {
    addr = Address.fromPublicKey(addr).toBuffer();
  } else {
    addr = typeof addr === 'object' ? addr.toBuffer() : Address.fromString(addr).toBuffer();
  }
  return addr;
}
