import process from 'process';
import path from 'path';
import fs from 'fs';

import prompts from 'prompts';
import PeerId from 'peer-id';
import Multiaddr from 'multiaddr';
import BN from 'bn.js';
import streamToIterator from 'stream-to-iterator';
import { Account, Address } from 'ethereumjs-util';

import { Node } from '@gxchain2/core';
import { RpcServer } from '@gxchain2/rpc';
import { constants } from '@gxchain2/common';
import { Block } from '@gxchain2/block';
import { Transaction } from '@gxchain2/tx';
import { hexStringToBuffer } from '@gxchain2/utils';

const args = process.argv.slice(2);

const accounts = ['0x3289621709f5b35d09b4335e129907ac367a0593', '0xd1e52f6eacbb95f5f8512ff129cbd6360e549b0b'];
const keyPair = {
  '0x3289621709f5b35d09b4335e129907ac367a0593': Buffer.from('d8ca4883bbf62202904e402750d593a297b5640dea80b6d5b239c5a9902662c0', 'hex'),
  '0xd1e52f6eacbb95f5f8512ff129cbd6360e549b0b': Buffer.from('db0558cc5f24dd09c390a25c7958a678e7efa0f286053da5df53dcecdba2a13c', 'hex')
};

const getPrivateKey = (address: string): Buffer => {
  return keyPair[address];
};

function getRandomIntInclusive(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const startPrompts = async (node: Node) => {
  while (true) {
    const response = await prompts({
      type: 'text',
      name: 'cmd',
      message: '> '
    });

    if (response.cmd === undefined || response.cmd === 'exit' || response.cmd === 'q' || response.cmd === 'quit') {
      process.exit(0);
    }

    const arr = (response.cmd as string).split(' ');
    if (!Array.isArray(arr)) {
      console.warn('$ Invalid command');
      continue;
    }

    if (arr[0] === 'add' || arr[0] === 'a') {
      const pos = arr[1].indexOf('/p2p/');
      node.peerpool.nodes[0].peerStore.addressBook.set(PeerId.createFromB58String(arr[1].substr(pos + 5)), [new Multiaddr(arr[1].substr(0, pos))]);
    } else if (arr[0] === 'batchadd' || arr[0] === 'ba') {
      const add = (str: string) => {
        const pos = str.indexOf('/p2p/');
        node.peerpool.nodes[0].peerStore.addressBook.set(PeerId.createFromB58String(str.substr(pos + 5)), [new Multiaddr(str.substr(0, pos))]);
      };
      for (const str of arr[1].split(';')) {
        add(str);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } else if (arr[0] === 'send' || arr[0] === 's') {
      const peer = node.peerpool.nodes[0].getPeer(arr[1]);
      if (peer) {
        peer.send(constants.GXC2_ETHWIRE, 'Echo', arr[2]);
      } else {
        console.warn('$ Can not find peer');
      }
    } else if (arr[0] === 'lsp2p') {
      console.log('peers:');
      for (const [peerIdString] of node.peerpool.nodes[0].peerStore.peers.entries()) {
        console.log(peerIdString);
      }
    } else if (arr[0] === 'batchmine' || arr[0] === 'bm') {
      try {
        const count = Number.isInteger(Number(arr[1])) ? Number(arr[1]) : 1000;
        for (let i = 0; i < count; i++) {
          const flag = getRandomIntInclusive(1, 2) == 1;
          const fromIndex = flag ? 0 : 1;
          const toIndex = !flag ? 0 : 1;
          const account = await (await node.getStateManager(node.blockchain.latestBlock.header.stateRoot)).getAccount(Address.fromString(accounts[fromIndex]));
          const unsignedTx = Transaction.fromTxData(
            {
              gasLimit: '0x5208',
              gasPrice: '0x01',
              nonce: account.nonce,
              to: accounts[toIndex],
              value: '0x01'
            },
            { common: node.common }
          );
          await node.addPendingTxs([unsignedTx.sign(getPrivateKey(accounts[fromIndex]))]);
          const block = await node.miner.worker.getPendingBlock();
          await node.newBlock(await node.processBlock(block));
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      } catch (err) {
        console.error('Run block error', err);
      }
    } else if (arr[0] === 'lsreceipt') {
      try {
        const receipt = await node.db.getReceipt(hexStringToBuffer(arr[1]));
        console.log(receipt.toRPCJSON());
      } catch (err) {
        console.error('Get receipt error', err);
      }
    } else if (arr[0] === 'lstx') {
      try {
        const tx = await node.db.getWrappedTransaction(hexStringToBuffer(arr[1]));
        console.log(tx.toRPCJSON());
      } catch (err) {
        if (err.type === 'NotFoundError') {
          continue;
        }
        console.error('Get transaction error', err);
      }
    } else if (arr[0] === 'lsblock') {
      const printBlock = async (key: number | Buffer): Promise<boolean> => {
        try {
          const block = await node.db.getBlock(key);
          console.log('block', '0x' + block.hash().toString('hex'), 'on height', block.header.number.toString(), ':', block.toJSON());
          for (const tx of block.transactions) {
            console.log('tx', '0x' + tx.hash().toString('hex'));
          }
          console.log('---------------');
        } catch (err) {
          if (err.type === 'NotFoundError') {
            return false;
          }
          throw err;
        }
        return true;
      };
      if (arr[1]) {
        await printBlock(arr[1].indexOf('0x') !== 0 ? Number(arr[1]) : hexStringToBuffer(arr[1]));
      } else {
        for (let h = 0; await printBlock(h); h++) {}
      }
    } else if (arr[0] === 'lsheight') {
      const height = node.blockchain.latestHeight;
      const hash = node.blockchain.latestHash;
      console.log('local height:', height, 'hash:', hash);
    } else if (arr[0] === 'getblock' || arr[0] === 'gb') {
      try {
        const block = await node.blockchain.getBlock(Number(arr[1]));
        console.log('0x' + block.header.hash().toString('hex'), block.toJSON());
      } catch (err) {
        console.error('Get block error:', err);
      }
    } else if (arr[0] === 'puttx') {
      const unsignedTx = Transaction.fromTxData(
        {
          gasLimit: new BN(21000),
          gasPrice: new BN(arr[4] || 1),
          nonce: new BN(arr[3] || 0),
          to: arr[2],
          value: '0x01'
        },
        { common: node.common }
      );
      const tx = unsignedTx.sign(getPrivateKey(arr[1]));
      console.log('puttx 0x' + tx.hash().toString('hex'));
      await node.addPendingTxs([tx]);
    } else if (arr[0] === 'lstxpool') {
      await node.txPool.ls();
    } else if (arr[0] === 'pending' || arr[0] === 'p') {
      try {
        const block = await node.miner.worker.getPendingBlock();
        await node.newBlock(await node.processBlock(block));
      } catch (err) {
        console.error('Run block error', err);
      }
    } else {
      console.warn('$ Invalid command');
      continue;
    }
  }
};

(async () => {
  try {
    const dirName = args[0] || 'test-node-01';
    const rpcPort = Number(args[1]) || 12358;
    const testdir = path.join(__dirname, './test-dir');
    if (!fs.existsSync(testdir)) {
      fs.mkdirSync(testdir);
    }
    const dir = path.join(testdir, dirName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    const node = new Node({ databasePath: dir });
    await node.init();
    const rpcServer = new RpcServer(rpcPort, '::1', node).on('error', (err: any) => {
      console.error('rpc server error', err);
      process.exit(1);
    });
    await rpcServer.start();
    await startPrompts(node);
  } catch (err) {
    console.error('Catch error', err);
    process.exit(1);
  }
})();
