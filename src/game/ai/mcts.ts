import type { BallGroup, PlayerIndex } from '../eightBallRules';
import type { Vector } from '../constants';
import type { MCTSConfig, MCTSNode, ShotCandidate, TableState, FastSimResult } from './types';
import { generateShotCandidates } from './shotGenerator';
import { simulateProShot as simulateShot } from './proPhysicsSimulator';
import { evaluateState } from './evaluator';

const DEFAULT_CONFIG: MCTSConfig = {
  timeBudgetMs: 100,
  maxDepth: 3,
  explorationConstant: 1.41,
};

export function createRootNode(
  state: TableState,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  candidateLimit?: number,
): MCTSNode {
  const candidates = generateShotCandidates(state.ballPositions, aiGroup, pocketedBallIds, state.ruleset);
  const sorted = limitCandidates(sortCandidates(candidates), candidateLimit);
  return {
    state,
    shot: null,
    parent: null,
    children: [],
    visits: 0,
    totalValue: 0,
    untriedShots: sorted.reverse(),
  };
}

export function selectBestChild(node: MCTSNode): MCTSNode {
  let best: MCTSNode | null = null;
  let bestAvg = -Infinity;
  for (const child of node.children) {
    if (child.visits === 0) continue;
    const avg = child.totalValue / child.visits;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = child;
    }
  }
  return best || node.children[0];
}

export function mctsSearch(
  state: TableState,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
  pocketedBallIds: number[],
  config: MCTSConfig = DEFAULT_CONFIG,
): ShotCandidate | null {
  const root = createRootNode(state, aiGroup, pocketedBallIds, config.candidateLimit);

  if (root.untriedShots.length === 0) return null;
  if (root.untriedShots.length === 1) return root.untriedShots[0];

  const deadline = performance.now() + config.timeBudgetMs;
  const iterationBudget = config.iterationBudget ?? Infinity;
  let iterations = 0;

  while (performance.now() < deadline && iterations < iterationBudget) {
    iterations++;
    let node = root;

    // Selection
    while (node.untriedShots.length === 0 && node.children.length > 0) {
      node = selectChild(node, config.explorationConstant);
    }

    // Expansion
    if (node.untriedShots.length > 0) {
      const shot = node.untriedShots.pop()!;
      const simResult = simulateShot(node.state.ballPositions, shot.direction, shot.power, shot.spin);
      const childState = buildNextState(node.state, simResult, pocketedBallIds);
      const childCandidates = generateShotCandidates(
        childState.ballPositions,
        aiGroup,
        childState.pocketedBallIds,
        childState.ruleset,
      );
      const child: MCTSNode = {
        state: childState,
        shot,
        parent: node,
        children: [],
        visits: 0,
        totalValue: 0,
        untriedShots: limitCandidates(sortCandidates(childCandidates), config.candidateLimit).reverse(),
      };
      node.children.push(child);
      node = child;

      // Rollout
      const value = rollout(node.state, aiPlayer, aiGroup, simResult, config.maxDepth - 1);
      backpropagate(node, value);
    }
  }

  if (root.children.length === 0) return root.untriedShots[0] || null;
  const bestChild = selectBestChild(root);
  return bestChild.shot;
}


function selectChild(node: MCTSNode, C: number): MCTSNode {
  let best: MCTSNode | null = null;
  let bestUcb = -Infinity;
  const logParent = Math.log(node.visits);

  for (const child of node.children) {
    if (child.visits === 0) return child;
    const exploitation = child.totalValue / child.visits;
    const exploration = C * Math.sqrt(logParent / child.visits);
    const ucb = exploitation + exploration;
    if (ucb > bestUcb) {
      bestUcb = ucb;
      best = child;
    }
  }
  return best || node.children[0];
}

function rollout(
  state: TableState,
  aiPlayer: PlayerIndex,
  aiGroup: BallGroup | null,
  lastSimResult: FastSimResult,
  depth: number,
): number {
  const baseScore = evaluateState(state, lastSimResult, aiPlayer, aiGroup);

  if (depth <= 0) return baseScore;
  if (lastSimResult.cueBallPocketed) return baseScore;
  if (lastSimResult.firstContact === null) return baseScore;

  const ownPotted = lastSimResult.pocketedBalls.length > 0 && !lastSimResult.cueBallPocketed;
  if (!ownPotted) return baseScore;

  const candidates = generateShotCandidates(state.ballPositions, aiGroup, state.pocketedBallIds, state.ruleset);
  if (candidates.length === 0) return baseScore;

  const top = sortCandidates(candidates).slice(0, Math.min(10, candidates.length));
  let pick = top[0];
  let bestScore = -Infinity;
  for (const candidate of top) {
    const candidateResult = simulateShot(state.ballPositions, candidate.direction, candidate.power, candidate.spin);
    const candidateScore = evaluateState(state, candidateResult, aiPlayer, aiGroup) - candidate.power * 0.02;
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      pick = candidate;
    }
  }

  const simResult = simulateShot(state.ballPositions, pick.direction, pick.power, pick.spin);
  const nextState = buildNextState(state, simResult, state.pocketedBallIds);
  const nextScore = rollout(nextState, aiPlayer, aiGroup, simResult, depth - 1);

  return baseScore * 0.6 + nextScore * 0.4;
}


function backpropagate(node: MCTSNode | null, value: number): void {
  while (node !== null) {
    node.visits++;
    node.totalValue += value;
    node = node.parent;
  }
}

function buildNextState(
  prevState: TableState,
  simResult: FastSimResult,
  prevPocketedIds: number[],
): TableState {
  const newPocketed = [...prevPocketedIds, ...simResult.pocketedBalls];
  const ballPositions = new Map<number, Vector>();
  for (const [id, pos] of simResult.ballPositions) {
    ballPositions.set(id, { x: pos.x, y: pos.y });
  }
  if (simResult.cueBallPocketed) {
    ballPositions.set(0, { x: 250, y: 320 });
  }
  return {
    ballPositions,
    pocketedBallIds: newPocketed,
    currentPlayer: prevState.currentPlayer,
    playerGroups: prevState.playerGroups,
    ruleset: prevState.ruleset,
  };
}

function sortCandidates(candidates: ShotCandidate[]): ShotCandidate[] {
  return candidates.slice().sort((a, b) => {
    if (a.type === 'pot' && b.type !== 'pot') return -1;
    if (a.type !== 'pot' && b.type === 'pot') return 1;
    return 0;
  });
}

function limitCandidates(candidates: ShotCandidate[], candidateLimit?: number): ShotCandidate[] {
  if (!candidateLimit || candidateLimit <= 0) return candidates;
  return candidates.slice(0, candidateLimit);
}
