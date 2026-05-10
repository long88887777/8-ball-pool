import type { Vector } from '../constants';
import type { BallGroup, PlayerIndex } from '../eightBallRules';

export type ShotType = 'pot' | 'safety' | 'kick' | 'break_cluster';

export type ShotCandidate = {
  targetBallId: number;
  pocketIndex: number;
  direction: Vector;
  power: number;
  spin: Vector;
  type: ShotType;
  ghostBallPos: Vector;
};

export type TableState = {
  ballPositions: Map<number, Vector>;
  pocketedBallIds: number[];
  currentPlayer: PlayerIndex;
  playerGroups: [BallGroup | null, BallGroup | null];
};

export type FastSimResult = {
  ballPositions: Map<number, Vector>;
  pocketedBalls: number[];
  cueBallPocketed: boolean;
  firstContact: number | null;
  cushionAfterContact: boolean;
};

export type MCTSConfig = {
  timeBudgetMs: number;
  maxDepth: number;
  explorationConstant: number;
};

export type MCTSNode = {
  state: TableState;
  shot: ShotCandidate | null;
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  totalValue: number;
  untriedShots: ShotCandidate[];
};

export type AIDecision = {
  shot: ShotCandidate;
  placementPosition?: Vector;
};

export type PositionTarget = {
  ballId: number;
  pocketIndex: number;
  idealZone: Vector;
  zoneRadius: number;
  shotQuality: number;
};
