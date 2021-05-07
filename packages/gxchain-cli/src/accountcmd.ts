import { KeyStorePassphrase } from './passphrase';
import { KeyStore } from './keystore';
import { Address } from 'ethereumjs-util';
import { Accountinfo } from './accounts';
import { keyFileName } from './key';

const web3 = require('web3-eth-accounts');
const web3account = new web3();
const utils = require('web3-utils');

export function accountCreate(path: string, password: string) {
  const ks = new KeyStorePassphrase(path);
  const store = new KeyStore(path, ks);
  const account = store.newaccount(password);
  console.log('Your new key was generated');
  console.log('Public address of the key :', utils.toChecksumAddress(account.address.toString()));
  console.log('Path of the secret key file:', account.url.Path);
  console.log('- You can share your public address with anyone. Others need it to interact with you.');
  console.log('- You must NEVER share the secret key with anyone! The key controls access to your funds!');
  console.log("- You must BACKUP your key file! Without the key, it's impossible to access account funds!");
  console.log("- You must REMEMBER your password! Without the password, it's impossible to decrypt the key!");
}

export function accountUpdate(path: string, addr: Accountinfo, oldpassword: string, newpassword: string) {
  const ks = new KeyStorePassphrase(path);
  const store = new KeyStore(path, ks);
  store.update(addr, oldpassword, newpassword);
}

export function accountList(path: string) {
  const ks = new KeyStorePassphrase(path);
  const store = new KeyStore(path, ks);
  const accounts = store.cache.accounts();
  for (let i = 0; i < accounts.length; i++) {
    console.log('Account #', i, ': {', accounts[i].address.toString(), '}', accounts[i].url.Scheme, ':', accounts[i].url.Path);
  }
}

export function accountUnlock(path: string, addr: string, password: string) {
  const ks = new KeyStorePassphrase(path);
  const store = new KeyStore(path, ks);
  const accounts = store.cache.accounts();
  for (const a of accounts) {
    if (a.address.toString() === addr) {
      try {
        store.unlock(a, password);
      } catch (err) {
        return;
      }
      console.log('Unlocked account', utils.toChecksumAddress(a.address.toString()));
      return a;
    }
  }
}

export function accoumtImport(path: string, privatekey: string, auth: string) {
  const ks = new KeyStorePassphrase(path);
  const store = new KeyStore(path, ks);
  const keyjson = web3account.encrypt(privatekey, auth);
  const addr = Address.fromString('0x' + keyjson.address);
  const account: Accountinfo = { address: addr, url: { Path: store.storage.joinPath(keyFileName(addr)), Scheme: 'keystore' } };
  ks.storekey(account.url.Path, { address: addr.toString(), privateKey: privatekey }, auth);
  return utils.toChecksumAddress(account.address.toString());
}

export function hasAddress(path: string, privatekey: string) {
  const ks = new KeyStorePassphrase(path);
  const store = new KeyStore(path, ks);
  const accounts = store.cache.accounts();
  const addr = web3account.privateKeyToAccount(privatekey).address;
  for (const a of accounts) {
    if (a.address.toString() === addr.toLowerCase()) {
      return true;
    }
  }
  return false;
}
