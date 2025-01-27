import type Web3 from 'web3';
import { assert, expect } from 'chai';
import { BN } from 'ethereumjs-util';

declare var artifacts: any;
declare var web3: Web3;

const Config = artifacts.require('Config_devnet');
const Prison = artifacts.require('Prison');

type MissRecord = [string, number];
type Miner = {
  jailed: boolean;
  address: string;
  missedRoundNumberPeriod: number;
  lastUnjailedBlockNumber: number;
};

class RecordQueue {
  lowestRecordBlockNumber: number = 0;
  recordsAmountPeriod: number;
  jailThreshold: number;
  minerMap: Map<string, Miner> = new Map<string, Miner>();
  missRecords: Map<number, MissRecord[]> = new Map<number, MissRecord[]>();

  constructor(recordsAmountPeriod: number, jailThreshold: number) {
    this.recordsAmountPeriod = recordsAmountPeriod;
    this.jailThreshold = jailThreshold;
  }

  resetJailThreshold(newThreshold: number) {
    this.jailThreshold = newThreshold;
  }

  push(blockNumber: number, record: MissRecord[]) {
    if (blockNumber >= this.recordsAmountPeriod) {
      const blockNumberToDelete = blockNumber - this.recordsAmountPeriod;
      for (let i = this.lowestRecordBlockNumber; i <= blockNumberToDelete; i++) {
        const missRecord = this.missRecords.get(i);
        if (missRecord) {
          for (let j = 0; j < missRecord.length; j++) {
            const miner = this.minerMap.get(missRecord[j][0])!;
            if (miner.lastUnjailedBlockNumber > i || miner.jailed) {
              continue;
            } else {
              miner.missedRoundNumberPeriod -= missRecord[j][1];
            }
          }
        }
        this.missRecords.delete(i);
      }
      this.lowestRecordBlockNumber = blockNumberToDelete + 1;
    }
    this.missRecords.set(blockNumber, record);
    record.forEach((item) => {
      const miner = this.minerMap.get(item[0]);
      if (!miner) {
        this.minerMap.set(item[0], {
          jailed: false,
          address: item[0],
          missedRoundNumberPeriod: item[1],
          lastUnjailedBlockNumber: 0
        });
      } else if (!miner.jailed) {
        miner.missedRoundNumberPeriod += item[1];
        if (miner.missedRoundNumberPeriod >= this.jailThreshold) {
          miner.jailed = true;
          miner.missedRoundNumberPeriod = 0;
        }
      }
    });
  }

  getMissRecordsNumber(address: string) {
    return this.minerMap.get(address)?.missedRoundNumberPeriod || 0;
  }

  resetRecordsAmountPeriod(newLength: number) {
    this.recordsAmountPeriod = newLength;
  }

  unjail(blockNumber: number, address: string) {
    const miner = this.minerMap.get(address);
    if (miner) {
      miner.jailed = false;
      miner.lastUnjailedBlockNumber = blockNumber;
    }
  }
}

async function checkMissRecord(queue: RecordQueue, prison: any) {
  const minerAddressArray = Array.from(queue.minerMap.keys());
  for (let i = 0; i < minerAddressArray.length; i++) {
    const minerAddress = minerAddressArray[i];
    const miner = queue.minerMap.get(minerAddress)!;
    const minerState = await prison.methods.miners(minerAddress).call();
    expect(minerState.miner, 'Miner address should be equal').to.equal(minerAddress);
    expect(minerState.missedRoundNumberPeriod, 'Missed round number this block should be equal').to.equal(miner.missedRoundNumberPeriod.toString());
    expect(minerState.jailed, 'Jailed state should be equal').to.equal(miner.jailed);
    expect(minerState.lastUnjailedBlockNumber, 'Unjailed block number should be equal').to.equal(miner.lastUnjailedBlockNumber.toString());
  }
}

describe('Prison', () => {
  let config: any;
  let prison: any;
  let deployer: any;
  let user1: any;
  let recordAmountPeriod: number;
  let recordQueue: RecordQueue;
  let missedRecordSkip: MissRecord[];

  before(async () => {
    const accounts = await web3.eth.getAccounts();
    deployer = accounts[0];
    user1 = accounts[1];
    missedRecordSkip = [
      [deployer, 0],
      [user1, 0]
    ];
  });

  it('should deploy succeed', async () => {
    // Update block number
    for (let i = 0; i < 10; i++) {
      await web3.eth.sendTransaction({ from: deployer, to: user1, value: web3.utils.toWei('1', 'ether') });
    }

    config = new web3.eth.Contract(Config.abi, (await Config.new()).address, { from: deployer });
    await config.methods.setSystemCaller(deployer).send();
    await config.methods.setStakeManager(deployer).send();
    await config.methods.setJailThreshold(10).send();

    prison = new web3.eth.Contract(Prison.abi, (await Prison.new(config.options.address)).address, { from: deployer });
    const lowestRecordBlockNumber = await prison.methods.lowestRecordBlockNumber().call();
    expect(lowestRecordBlockNumber, 'Lowest record block number should be equal').to.equal((await web3.eth.getBlockNumber()).toString());
    recordAmountPeriod = 3;
    await config.methods.setRecordsAmountPeriod(recordAmountPeriod).send();

    const missedRecord: MissRecord[] = [];
    const checkTimes = 10;
    for (let i = 0; i < recordAmountPeriod - 1 + checkTimes; i++) {
      await prison.methods.addMissRecord(missedRecord).send();
      const oldLowestRecordBlockNumber = await prison.methods.lowestRecordBlockNumber().call({ blockNumber: (await web3.eth.getBlockNumber()) - 1 });
      const newLowestRecordBlockNumber = (await web3.eth.getBlockNumber()) - 1 - recordAmountPeriod + 1;
      const lowestRecordBlockNumberExpect = newLowestRecordBlockNumber > oldLowestRecordBlockNumber ? newLowestRecordBlockNumber : oldLowestRecordBlockNumber;
      expect(lowestRecordBlockNumberExpect, 'Lowest record block number should be equal').to.equal(await prison.methods.lowestRecordBlockNumber().call());
    }

    const jailThreshold = await config.methods.jailThreshold().call();
    recordQueue = new RecordQueue(recordAmountPeriod, jailThreshold);
    expect(await config.methods.recordsAmountPeriod().call(), 'Record amount period should be equal').to.equal(recordAmountPeriod.toString());
  });

  it('add missRecord scucessfully', async () => {
    const missedRecord1: MissRecord[] = [[deployer, 1]];
    await prison.methods.addMissRecord(missedRecord1).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecord1);
    await checkMissRecord(recordQueue, prison);

    const missedRecord2: MissRecord[] = [
      [deployer, 2],
      [user1, 2]
    ];
    await prison.methods.addMissRecord(missedRecord2).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecord2);
    await checkMissRecord(recordQueue, prison);

    const missedRecord3: MissRecord[] = [
      [deployer, 3],
      [user1, 3]
    ];
    await prison.methods.addMissRecord(missedRecord3).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecord3);
    await checkMissRecord(recordQueue, prison);

    const missedRecord4 = [];
    await prison.methods.addMissRecord(missedRecord4).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecord4);
    await checkMissRecord(recordQueue, prison);
  });

  it('should jail miner sucessfully', async () => {
    const jailedState = (await prison.methods.miners(deployer).call()).jailed;
    expect(jailedState, 'Jailed state should be false').to.equal(false);
    const missedRecord5: MissRecord[] = [
      [deployer, 7],
      [user1, 3]
    ];
    await prison.methods.addMissRecord(missedRecord5).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecord5);
    await checkMissRecord(recordQueue, prison);
    const jailedStateAfter = (await prison.methods.miners(deployer).call()).jailed;
    expect(jailedStateAfter, 'Jailed state should be true').to.equal(true);
    const blockNumberTofind = (await web3.eth.getBlockNumber()) - 1;
    const jailedMinerLength = await prison.methods.getJaiedMinersLengthByBlockNumber(blockNumberTofind).call();
    expect(jailedMinerLength, 'Jailed miner length should be 1').to.equal('1');
    const jailedMiner = await prison.methods.jailedRecords(blockNumberTofind, 0).call();
    expect(jailedMiner, 'Jailed miner should be equal').to.equal(deployer);
  });

  it('should unjail miner failed', async () => {
    let failed = false;
    const forfeitAmount = await config.methods.forfeit().call();
    const deployerJailed = (await prison.methods.miners(deployer).call()).jailed;
    const user1Jailed = (await prison.methods.miners(user1).call()).jailed;
    expect(deployerJailed, 'Jailed state should be true').to.equal(true);
    expect(user1Jailed, 'Jailed state should be false').to.equal(false);

    try {
      await prison.methods.unjail(deployer).send({ value: new BN(forfeitAmount).subn(1) });
      failed = true;
    } catch (err) {}
    if (failed) {
      assert.fail('Unjail should failed');
    }
    await checkMissRecord(recordQueue, prison);

    try {
      await prison.methods.unjail(user1).send({ value: forfeitAmount });
      failed = true;
    } catch (err) {}
    if (failed) {
      assert.fail('Unjail should failed');
    }
    await checkMissRecord(recordQueue, prison);
  });

  it('should get jialed miners successfully', async () => {
    const miner = await prison.methods.miners(deployer).call();
    const jailedMinerAmount = await prison.methods.getJailedMinersLength().call();
    expect(jailedMinerAmount, 'Jailed miner amount should be equal').to.equal('1');
    const jailedAddress1 = await prison.methods.getJailedMinersById(miner.id).call();
    const jailedAddress2 = await prison.methods.getJailedMinersByIndex(0).call();
    expect(jailedAddress1, 'jailed miner address1 should be equal').equal(deployer.toString());
    expect(jailedAddress2, 'jailed miner address2 should be equal').equal(deployer.toString());
  });

  it('should unjail miner successfully', async () => {
    expect((await web3.eth.getBalance(prison.options.address)).toString(), 'Prison balance should be zero').to.equal('0');
    const forfeitAmount = await config.methods.forfeit().call();
    await prison.methods.unjail(deployer).send({ value: forfeitAmount });
    recordQueue.unjail(await web3.eth.getBlockNumber(), deployer);
    expect((await prison.methods.miners(deployer).call()).jailed, 'Miner should be unjailed').be.equal(false);
    expect((await web3.eth.getBalance(prison.options.address)).toString(), 'Prison balance should be equal').to.equal(forfeitAmount);
    await prison.methods.addMissRecord(missedRecordSkip).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecordSkip);
    await checkMissRecord(recordQueue, prison);
  });

  it('should reduce miss record successfully with blocks gone', async () => {
    const missedRecordNew: MissRecord[] = [
      [deployer, 2],
      [user1, 1]
    ];
    for (let i = 0; i < recordAmountPeriod; i++) {
      await prison.methods.addMissRecord(missedRecordNew).send();
      recordQueue.push(await web3.eth.getBlockNumber(), missedRecordNew);
      await checkMissRecord(recordQueue, prison);
    }
    const deployerMissedNumber = (await prison.methods.miners(deployer).call()).missedRoundNumberPeriod;
    const user1MissedNumber = (await prison.methods.miners(user1).call()).missedRoundNumberPeriod;
    expect(deployerMissedNumber, 'Missed number should be equal').to.equal((2 * recordAmountPeriod).toString());
    expect(user1MissedNumber, 'Missed number should be equal').to.equal((1 * recordAmountPeriod).toString());
    for (let i = 0; i < recordAmountPeriod; i++) {
      await prison.methods.addMissRecord(missedRecordSkip).send();
      recordQueue.push(await web3.eth.getBlockNumber(), missedRecordSkip);
      await checkMissRecord(recordQueue, prison);
      expect((await prison.methods.miners(deployer).call()).missedRoundNumberPeriod, 'Missed number should be equal').to.equal((deployerMissedNumber - 2 * (i + 1)).toString());
      expect((await prison.methods.miners(user1).call()).missedRoundNumberPeriod, 'Missed number should be equal').to.equal((user1MissedNumber - 1 * (i + 1)).toString());
    }
  });

  it('should run correctly after enlarged record amount period', async () => {
    const missedRecord7: MissRecord[] = [
      [deployer, 1],
      [user1, 2]
    ];
    for (let i = 0; i < recordAmountPeriod; i++) {
      await prison.methods.addMissRecord(missedRecord7).send();
      recordQueue.push(await web3.eth.getBlockNumber(), missedRecord7);
      await checkMissRecord(recordQueue, prison);
    }
    recordAmountPeriod = 5;
    await config.methods.setRecordsAmountPeriod(recordAmountPeriod).send();
    expect(await config.methods.recordsAmountPeriod().call(), 'Record amount period should be equal').to.equal(recordAmountPeriod.toString());
    recordQueue.resetRecordsAmountPeriod(recordAmountPeriod);
    await checkMissRecord(recordQueue, prison);

    for (let i = 0; i < recordAmountPeriod; i++) {
      await prison.methods.addMissRecord(missedRecord7).send();
      recordQueue.push(await web3.eth.getBlockNumber(), missedRecord7);
      await checkMissRecord(recordQueue, prison);
    }
  });

  it('should run correctly after narrowed record amount period', async () => {
    recordAmountPeriod = 2;
    await config.methods.setRecordsAmountPeriod(recordAmountPeriod).send();
    expect(await config.methods.recordsAmountPeriod().call(), 'Record amount period should be equal').to.equal(recordAmountPeriod.toString());
    recordQueue.resetRecordsAmountPeriod(recordAmountPeriod);
    const missedRecord8: MissRecord[] = [
      [deployer, 8],
      [user1, 7]
    ];
    await prison.methods.addMissRecord(missedRecord8).send();
    recordQueue.push(await web3.eth.getBlockNumber(), missedRecord8);
    await checkMissRecord(recordQueue, prison);
  });
});
