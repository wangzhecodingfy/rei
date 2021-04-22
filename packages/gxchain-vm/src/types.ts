import { BN } from 'ethereumjs-util';
import { InterpreterStep } from '@ethereumjs/vm/dist/evm/interpreter';
import { StateManager } from '@ethereumjs/vm/dist/state';

/**
 * Options for debugging.
 */
export interface IDebug {
  /**
   * Target transaction hash
   */
  hash?: Buffer;
  /**
   * Called when the transaction starts processing
   */
  captureStart(from: undefined | Buffer, to: undefined | Buffer, create: boolean, input: Buffer, gas: BN, gasPrice: BN, intrinsicGas: BN, value: BN, number: BN, stateManager: StateManager): Promise<void>;
  /**
   * Called at every step of processing a transaction
   */
  captureState(step: InterpreterStep, cost: BN): Promise<void>;
  /**
   * Called when a transaction processing error
   */
  captureFault(step: InterpreterStep, cost: BN, err: any): Promise<void>;
  /**
   * Called when the transaction is processed
   */
  captureEnd(output: Buffer, gasUsed: BN, time: number): Promise<void>;
}