export type DailyTaskId = 'play_match' | 'win_match' | 'daily_check_in' | 'pass_challenge';

export type DailyTaskDefinition = {
  id: DailyTaskId;
  title: string;
  rewardCoins: number;
};

export type DailyTaskStatus = {
  completed: boolean;
  completedAt: string | null;
  claimedCoins: number;
};

export type DailyTaskState = {
  dateKey: string;
  tasks: Record<DailyTaskId, DailyTaskStatus>;
};

export const DAILY_TASKS: DailyTaskDefinition[] = [
  { id: 'play_match', title: '完成 1 局', rewardCoins: 60 },
  { id: 'win_match', title: '赢 1 局', rewardCoins: 90 },
  { id: 'daily_check_in', title: '每日签到', rewardCoins: 40 },
  { id: 'pass_challenge', title: '通过 1 个挑战关', rewardCoins: 80 },
];

export function createDailyTaskState(dateKey: string): DailyTaskState {
  return {
    dateKey,
    tasks: Object.fromEntries(
      DAILY_TASKS.map((task) => [
        task.id,
        { completed: false, completedAt: null, claimedCoins: 0 },
      ]),
    ) as Record<DailyTaskId, DailyTaskStatus>,
  };
}

export function completeDailyTask(
  state: DailyTaskState,
  taskId: DailyTaskId,
  completedAt = new Date().toISOString(),
): { state: DailyTaskState; completedNow: boolean; coinReward: number } {
  const definition = DAILY_TASKS.find((task) => task.id === taskId);
  const current = state.tasks[taskId];
  if (!definition || current?.completed) {
    return { state, completedNow: false, coinReward: 0 };
  }

  return {
    state: {
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: {
          completed: true,
          completedAt,
          claimedCoins: definition.rewardCoins,
        },
      },
    },
    completedNow: true,
    coinReward: definition.rewardCoins,
  };
}

export function summarizeDailyTasks(state: DailyTaskState): {
  completed: number;
  total: number;
  unclaimedCoins: number;
} {
  const statuses = Object.values(state.tasks);
  return {
    completed: statuses.filter((task) => task.completed).length,
    total: DAILY_TASKS.length,
    unclaimedCoins: 0,
  };
}

export function sanitizeDailyTaskState(
  value: Partial<DailyTaskState> | null | undefined,
  dateKey: string,
): DailyTaskState {
  const base = createDailyTaskState(dateKey);
  if (!value || value.dateKey !== dateKey || !value.tasks || typeof value.tasks !== 'object') {
    return base;
  }

  return {
    dateKey,
    tasks: Object.fromEntries(
      DAILY_TASKS.map((task) => {
        const status = value.tasks?.[task.id] as Partial<DailyTaskStatus> | undefined;
        return [
          task.id,
          {
            completed: status?.completed === true,
            completedAt: typeof status?.completedAt === 'string' ? status.completedAt : null,
            claimedCoins: typeof status?.claimedCoins === 'number' && Number.isFinite(status.claimedCoins)
              ? Math.max(0, Math.floor(status.claimedCoins))
              : 0,
          },
        ];
      }),
    ) as Record<DailyTaskId, DailyTaskStatus>,
  };
}
