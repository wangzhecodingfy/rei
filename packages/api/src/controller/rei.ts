import { bnToHex, Address, intToHex } from 'ethereumjs-util';
import { hexStringToBN } from '@rei-network/utils';
import { Controller } from './base';

/**
 * Rei api Controller
 */
export class ReiController extends Controller {
  /**
   * Get client version
   * @returns Client version
   */
  getVersion() {
    return this.server.version;
  }

  /**
   * Estimate user available crude
   * @param address - Target address
   * @param tag - Block tag
   * @returns Available crude
   */
  async getCrude([address, tag]: [string, string]) {
    const block = await this.getBlockByTag(tag);
    const common = block._common;
    const strDailyFee = common.param('vm', 'dailyFee');
    if (typeof strDailyFee !== 'string') {
      return null;
    }

    const state = await this.node.getStateManager(block.header.stateRoot, common);
    const faddr = Address.fromString(common.param('vm', 'faddr'));
    const totalAmount = (await state.getAccount(faddr)).balance;
    const timestamp = block.header.timestamp.toNumber();
    const dailyFee = hexStringToBN(strDailyFee);

    const account = await state.getAccount(Address.fromString(address));
    const stakeInfo = account.getStakeInfo();
    return bnToHex(stakeInfo.estimateFee(timestamp, totalAmount, dailyFee));
  }

  /**
   * Estimate user used crude
   * @param address - Target address
   * @param tag - Block tag
   * @returns Used crude
   */
  async getUsedCrude([address, tag]: [string, string]) {
    const block = await this.getBlockByTag(tag);
    const timestamp = block.header.timestamp.toNumber();
    const state = await this.node.getStateManager(block.header.stateRoot, block._common);
    const account = await state.getAccount(Address.fromString(address));
    const stakeInfo = account.getStakeInfo();
    return bnToHex(stakeInfo.estimateUsage(timestamp));
  }

  /**
   * Get the total deposit amount of the user
   * @param address - Target address
   * @param tag - Block tag
   * @returns Total deposit amount
   */
  async getTotalAmount([address, tag]: [string, string]) {
    const stateManager = await this.getStateManagerByTag(tag);
    const account = await stateManager.getAccount(Address.fromString(address));
    const stakeInfo = account.getStakeInfo();
    return bnToHex(stakeInfo.total);
  }

  /**
   * Read "dailyFee" settings from common
   * @param tag - Block tag
   * @returns Daily fee
   */
  async getDailyFee([tag]: [string]) {
    const num = await this.getBlockNumberByTag(tag);
    const common = this.node.getCommon(num);
    const strDailyFee = common.param('vm', 'dailyFee');
    if (typeof strDailyFee !== 'string') {
      return null;
    }
    return bnToHex(hexStringToBN(strDailyFee));
  }

  /**
   * Read "minerRewardFactor" settings from common
   * @param tag - Block tag
   * @returns Miner reward factor
   */
  async getMinerRewardFactor([tag]: [string]) {
    const num = await this.getBlockNumberByTag(tag);
    const common = this.node.getCommon(num);
    const factor = common.param('vm', 'minerRewardFactor');
    if (typeof factor !== 'number' || factor < 0 || factor > 100) {
      return null;
    }
    return intToHex(factor);
  }
}
