import { Block } from '@gxchain2/block';
import { Blockchain } from '@gxchain2/blockchain';

import VM from './index';

/**
 * @ignore
 */
export default async function runBlockchain(this: VM, blockchain?: Blockchain) {
  let headBlock: Block;
  let parentState: Buffer;

  blockchain = blockchain || this.blockchain;

  await blockchain.iterator('vm', async (block: Block, reorg: boolean) => {
    // determine starting state for block run
    // if we are just starting or if a chain re-org has happened
    if (!headBlock || reorg) {
      const parentBlock = await blockchain!.getBlock(block.header.parentHash);
      parentState = parentBlock.header.stateRoot;
      // generate genesis state if we are at the genesis block
      // we don't have the genesis state
      if (!headBlock) {
        // It has been manually generated.
        // await this.stateManager.generateCanonicalGenesis();
      } else {
        parentState = headBlock.header.stateRoot;
      }
    }

    // run block, update head if valid
    try {
      await this.runBlock({ block, root: parentState, skipBlockValidation: true, generate: true });
      // set as new head block
      headBlock = block;
    } catch (error) {
      // remove invalid block
      await blockchain!.delBlock(block.header.hash());
      throw error;
    }
  });
}
