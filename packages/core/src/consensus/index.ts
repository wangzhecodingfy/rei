import { ConsensusEngine, ConsensusEngineConstructor, ConsensusEngineOptions } from './consensusEngine';
import { CliqueConsensusEngine } from './clique';
import { ReimintConsensusEngine } from './reimint';
import { ConsensusType } from './types';

export * from './consensusEngine';
export * from './types';

const engines = new Map<ConsensusType, ConsensusEngineConstructor>([
  [ConsensusType.Clique, CliqueConsensusEngine],
  [ConsensusType.Reimint, ReimintConsensusEngine]
]);

export function createEnginesByConsensusTypes(types: ConsensusType[], options: ConsensusEngineOptions) {
  return new Map<ConsensusType, ConsensusEngine>(types.map((type) => [type, new (engines.get(type)!)(options)]));
}
