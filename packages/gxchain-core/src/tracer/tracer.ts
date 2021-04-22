import util from 'util';
import { Address } from 'ethereumjs-util';
import { OpcodeList } from '@ethereumjs/vm/dist/evm/opcodes';
import { Block } from '@gxchain2/block';
import { IDebug } from '@gxchain2/vm';
import { hexStringToBN, hexStringToBuffer } from '@gxchain2/utils';
import { Node } from '../node';
import { StructLogDebug, JSDebug } from './debug';
import { toAsync } from './toasync';
import { tracers } from './tracers';

export interface IDebugImpl extends IDebug {
  result(): any;
}

export interface TraceConfig {
  disableStorage?: boolean;
  disableMemory?: boolean;
  disableStack?: boolean;
  tracer?: string;
  timeout?: string;
  // Use ast to convert synchronous functions to asynchronous, default `true`.
  toAsync?: boolean;
}

export class Tracer {
  private readonly node: Node;

  constructor(node: Node) {
    this.node = node;
  }

  private createDebugImpl(opcodes: OpcodeList, reject: (reason?: any) => void, config?: TraceConfig, hash?: Buffer): IDebugImpl {
    if (config?.tracer) {
      if (tracers.has(config.tracer)) {
        config.tracer = tracers.get(config.tracer)!;
        config.toAsync = true;
      }
      return new JSDebug(this.node, opcodes, reject, Object.assign({ ...config }, { tracer: config.toAsync === false ? `const obj = ${config.tracer}` : toAsync(`const obj = ${config.tracer}`) }));
    } else {
      return new StructLogDebug(config, hash);
    }
  }

  traceBlock(block: Block | Buffer, config?: TraceConfig, hash?: Buffer) {
    block = block instanceof Block ? block : Block.fromRLPSerializedBlock(block, { common: this.node.common });
    if (block.header.number.eqn(0)) {
      throw new Error('invalid block number, 0');
    }
    return new Promise<any>(async (resolve, reject) => {
      try {
        block = block as Block;
        const parent = await this.node.db.getBlockByHashAndNumber(block.header.parentHash, block.header.number.subn(1));
        const wvm = await this.node.getWrappedVM(parent.header.stateRoot);
        const debug = this.createDebugImpl((wvm.vm as any)._opcodes, reject, config, hash);
        await wvm.runBlock({ block, debug });
        const result = debug.result();
        resolve(util.types.isPromise(result) ? await result : result);
      } catch (err) {
        reject(err);
      }
    });
  }

  async traceBlockByHash(hash: Buffer, config?: TraceConfig) {
    return await this.traceBlock(await this.node.db.getBlock(hash), config);
  }

  async traceTx(hash: Buffer, config?: TraceConfig) {
    const wtx = await this.node.db.getWrappedTransaction(hash);
    return await this.traceBlock(await this.node.db.getBlockByHashAndNumber(wtx.extension.blockHash!, wtx.extension.blockNumber!), config, hash);
  }

  async traceCall(
    data: {
      from?: string;
      to?: string;
      gas?: string;
      gasPrice?: string;
      value?: string;
      data?: string;
    },
    block: Block,
    config?: TraceConfig
  ) {
    if (block.header.number.eqn(0)) {
      throw new Error('invalid block number, 0');
    }
    return new Promise<any>(async (resolve, reject) => {
      try {
        const parent = await this.node.db.getBlockByHashAndNumber(block.header.parentHash, block.header.number.subn(1));
        const wvm = await this.node.getWrappedVM(parent.header.stateRoot);
        const debug = this.createDebugImpl((wvm.vm as any)._opcodes, reject, config);
        await wvm.runCall({
          block,
          debug,
          gasPrice: data.gasPrice ? hexStringToBN(data.gasPrice) : undefined,
          origin: data.from ? Address.fromString(data.from) : Address.zero(),
          caller: data.from ? Address.fromString(data.from) : Address.zero(),
          gasLimit: data.gas ? hexStringToBN(data.gas) : undefined,
          to: data.to ? Address.fromString(data.to) : undefined,
          value: data.value ? hexStringToBN(data.value) : undefined,
          data: data.data ? hexStringToBuffer(data.data) : undefined
        });
        const result = debug.result();
        resolve(util.types.isPromise(result) ? await result : result);
      } catch (err) {
        reject(err);
      }
    });
  }
}