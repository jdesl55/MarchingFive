import { useEffect, useReducer, useRef, useState } from 'react';
import {
  TOURNAMENT_YEARS,
  getPlayersByYearAndPosition,
  getTeamLogoUrl,
  type TournamentPlayer
} from '../data/tournamentPlayerData';

type Screen = 'landing' | 'game';
type GamePhase = 'idle' | 'spinning' | 'selecting_slot' | 'selecting_player' | 'revealing' | 'complete';
type SlotPosition = 'Point Guard' | 'Shooting Guard' | 'Forward' | 'Center';

interface FilledSlot {
  position: SlotPosition;
  year: number;
  player: TournamentPlayer;
}

interface GameState {
  screen: Screen;
  phase: GamePhase;
  activeSlotIndex: number | null;
  slots: Array<FilledSlot | null>;
  currentYear: number | null;
  displayedTotal: number;
  actualTotal: number;
  highScore: number | null;
  drawnYears: Array<number | null>;
}

type Action =
  | { type: 'START_GAME' }
  | { type: 'GO_HOME' }
  | { type: 'START_SPIN'; year: number }
  | { type: 'FINISH_SPIN' }
  | { type: 'START_PLAYER_SELECTION'; slotIndex: number }
  | {
      type: 'BEGIN_REVEAL';
      slotIndex: number;
      filledSlot: FilledSlot;
      nextDrawnYears: Array<number | null>;
      nextActualTotal: number;
    }
  | { type: 'SET_DISPLAYED_TOTAL'; value: number }
  | { type: 'END_REVEAL'; complete: boolean }
  | { type: 'RETURN_TO_SLOT_SELECTION' }
  | { type: 'SET_HIGH_SCORE'; score: number }
  | { type: 'RESET_ROUND' };

const SLOT_CONFIG = [
  { short: 'PG', long: 'Point Guard', position: 'Point Guard' as const },
  { short: 'SG', long: 'Shooting Guard', position: 'Shooting Guard' as const },
  { short: 'F', long: 'Forward', position: 'Forward' as const },
  { short: 'F', long: 'Forward', position: 'Forward' as const },
  { short: 'C', long: 'Center', position: 'Center' as const }
];

const YEAR_ITEM_WIDTH = 72;
const REEL_BLOCKS = 7;
const REEL_BASE_BLOCK = Math.floor(REEL_BLOCKS / 2);
const SPIN_DURATION_MS = 2500;
const REVEAL_DURATION_MS = 1200;
const FINAL_PAUSE_MS = 1500;
const LANDING_TRANSITION_MS = 300;

const REPEATED_YEARS = Array.from({ length: REEL_BLOCKS }, (_, blockIndex) =>
  TOURNAMENT_YEARS.map((year, yearIndex) => ({
    year,
    key: `${blockIndex}-${year}-${yearIndex}`
  }))
).flat();

function createEmptySlots(): Array<FilledSlot | null> {
  return SLOT_CONFIG.map(() => null);
}

function createEmptyYears(): Array<number | null> {
  return SLOT_CONFIG.map(() => null);
}

function createZeroPoints(): number[] {
  return SLOT_CONFIG.map(() => 0);
}

function createRoundState(screen: Screen, highScore: number | null): GameState {
  return {
    screen,
    phase: 'idle',
    activeSlotIndex: null,
    slots: createEmptySlots(),
    currentYear: null,
    displayedTotal: 0,
    actualTotal: 0,
    highScore,
    drawnYears: createEmptyYears()
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START_GAME':
      return createRoundState('game', state.highScore);
    case 'GO_HOME':
      return createRoundState('landing', state.highScore);
    case 'START_SPIN':
      return {
        ...state,
        phase: 'spinning',
        activeSlotIndex: null,
        currentYear: action.year
      };
    case 'FINISH_SPIN':
      return {
        ...state,
        phase: 'selecting_slot',
        activeSlotIndex: null
      };
    case 'START_PLAYER_SELECTION':
      return {
        ...state,
        phase: 'selecting_player',
        activeSlotIndex: action.slotIndex
      };
    case 'BEGIN_REVEAL': {
      const nextSlots = [...state.slots];
      nextSlots[action.slotIndex] = action.filledSlot;

      return {
        ...state,
        phase: 'revealing',
        slots: nextSlots,
        drawnYears: action.nextDrawnYears,
        actualTotal: action.nextActualTotal
      };
    }
    case 'SET_DISPLAYED_TOTAL':
      return {
        ...state,
        displayedTotal: action.value
      };
    case 'END_REVEAL':
      return {
        ...state,
        phase: action.complete ? 'complete' : 'idle',
        activeSlotIndex: null,
        currentYear: action.complete ? state.currentYear : null
      };
    case 'RETURN_TO_SLOT_SELECTION':
      return {
        ...state,
        phase: 'selecting_slot',
        activeSlotIndex: null
      };
    case 'SET_HIGH_SCORE':
      return {
        ...state,
        highScore: state.highScore === null ? action.score : Math.max(state.highScore, action.score)
      };
    case 'RESET_ROUND':
      return createRoundState('game', state.highScore);
    default:
      return state;
  }
}

const INITIAL_STATE = createRoundState('landing', null);

function getPlayerKey(player: TournamentPlayer): string {
  return `${player.year}-${player.playerName}-${player.teamFull}-${player.espnId ?? 'na'}`;
}

function getFirstEmptySlotIndex(slots: Array<FilledSlot | null>): number | null {
  const index = slots.findIndex((slot) => slot === null);
  return index === -1 ? null : index;
}

function shufflePlayers(players: TournamentPlayer[]): TournamentPlayer[] {
  const shuffled = [...players];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function getAvailablePlayersForSlot(
  year: number,
  slotIndex: number,
  slots: Array<FilledSlot | null>
): TournamentPlayer[] {
  const position = SLOT_CONFIG[slotIndex].position;
  let players = getPlayersByYearAndPosition(year, position).filter((player) => player.totalTournamentPts > 0);

  if (position === 'Forward') {
    const otherForwardIndex = slotIndex === 2 ? 3 : slotIndex === 3 ? 2 : null;
    const otherForward = otherForwardIndex === null ? null : slots[otherForwardIndex];

    if (otherForward && otherForward.position === 'Forward' && otherForward.year === year) {
      const usedKey = getPlayerKey(otherForward.player);
      players = players.filter((player) => getPlayerKey(player) !== usedKey);
    }
  }

  return shufflePlayers(players);
}

function getBestPossibleScore(drawnYears: Array<number | null>): number {
  const usedForwardKeys = new Set<string>();

  return drawnYears.reduce<number>((sum, year, slotIndex) => {
    if (year === null) {
      return sum;
    }

    const position = SLOT_CONFIG[slotIndex].position;
    let players = getPlayersByYearAndPosition(year, position).filter((player) => player.totalTournamentPts > 0);

    if (position === 'Forward') {
      players = players.filter((player) => !usedForwardKeys.has(getPlayerKey(player)));
    }

    const bestPlayer = players[0];

    if (!bestPlayer) {
      return sum;
    }

    if (position === 'Forward') {
      usedForwardKeys.add(getPlayerKey(bestPlayer));
    }

    return sum + bestPlayer.totalTournamentPts;
  }, 0);
}

function getScoreTier(total: number) {
  if (total >= 600) {
    return {
      label: 'LEGENDARY',
      textColor: 'var(--gold-jackpot)',
      className: 'tier-badge--legendary'
    };
  }

  if (total >= 500) {
    return {
      label: 'ELITE EIGHT',
      textColor: 'var(--basketball-orange)',
      className: ''
    };
  }

  if (total >= 400) {
    return {
      label: 'SWEET SIXTEEN',
      textColor: 'var(--text-primary)',
      className: ''
    };
  }

  if (total >= 300) {
    return {
      label: 'FIRST ROUND',
      textColor: 'var(--text-secondary)',
      className: ''
    };
  }

  return {
    label: 'BUBBLE TEAM',
    textColor: 'var(--text-dim)',
    className: ''
  };
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function normalizeReelIndex(yearIndex: number): number {
  return REEL_BASE_BLOCK * TOURNAMENT_YEARS.length + yearIndex;
}

function getLogoUrl(player: TournamentPlayer): string | null {
  if (player.logoUrl) {
    return player.logoUrl;
  }

  if (player.espnId) {
    return getTeamLogoUrl(player.espnId);
  }

  return null;
}

function MarchingFive() {
  const [game, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [screenFading, setScreenFading] = useState(false);
  const [selectionOptions, setSelectionOptions] = useState<TournamentPlayer[]>([]);
  const [displayedSlotPoints, setDisplayedSlotPoints] = useState<number[]>(createZeroPoints);
  const [revealingSlotIndex, setRevealingSlotIndex] = useState<number | null>(null);
  const [landedYearPulse, setLandedYearPulse] = useState(false);
  const [highScorePulse, setHighScorePulse] = useState(false);
  const [showFinalBadge, setShowFinalBadge] = useState(false);
  const [showPlayAgain, setShowPlayAgain] = useState(false);
  const [completionPulse, setCompletionPulse] = useState(false);
  const [reelTransitionMs, setReelTransitionMs] = useState(0);
  const [reelVisualIndex, setReelVisualIndex] = useState(normalizeReelIndex(0));

  const timeoutIdsRef = useRef<number[]>([]);
  const revealFrameRef = useRef<number | null>(null);
  const spinFrameRef = useRef<number | null>(null);
  const reelCenterIndexRef = useRef(normalizeReelIndex(0));

  const allSlotsFilled = game.slots.every((slot) => slot !== null);
  const scoreTier = getScoreTier(game.actualTotal);
  const bestPossibleScore = getBestPossibleScore(game.drawnYears);

  function clearTimeouts() {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }

  function clearFrames() {
    if (revealFrameRef.current !== null) {
      window.cancelAnimationFrame(revealFrameRef.current);
      revealFrameRef.current = null;
    }

    if (spinFrameRef.current !== null) {
      window.cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
    }
  }

  function schedule(callback: () => void, delay: number) {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((id) => id !== timeoutId);
      callback();
    }, delay);

    timeoutIdsRef.current.push(timeoutId);
  }

  function resetTransientUi() {
    clearTimeouts();
    clearFrames();
    setSelectionOptions([]);
    setDisplayedSlotPoints(createZeroPoints());
    setRevealingSlotIndex(null);
    setLandedYearPulse(false);
    setShowFinalBadge(false);
    setShowPlayAgain(false);
    setCompletionPulse(false);
    setReelTransitionMs(0);
    setReelVisualIndex(normalizeReelIndex(0));
    reelCenterIndexRef.current = normalizeReelIndex(0);
  }

  useEffect(() => {
    return () => {
      clearTimeouts();
      clearFrames();
    };
  }, []);

  function handlePlay() {
    if (screenFading) {
      return;
    }

    setScreenFading(true);
    schedule(() => {
      resetTransientUi();
      dispatch({ type: 'START_GAME' });
      setScreenFading(false);
    }, LANDING_TRANSITION_MS);
  }

  function handleReturnHome() {
    resetTransientUi();
    dispatch({ type: 'GO_HOME' });
  }

  function handleSelectSlot(slotIndex: number) {
    if (game.phase !== 'selecting_slot' || game.slots[slotIndex] !== null || game.currentYear === null) {
      return;
    }

    const players = getAvailablePlayersForSlot(game.currentYear, slotIndex, game.slots);
    setSelectionOptions(players);
    dispatch({ type: 'START_PLAYER_SELECTION', slotIndex });
  }

  function handleSpin() {
    if (game.phase !== 'idle') {
      return;
    }

    const targetYear = TOURNAMENT_YEARS[Math.floor(Math.random() * TOURNAMENT_YEARS.length)];
    const targetYearIndex = TOURNAMENT_YEARS.indexOf(targetYear);
    const normalizedCurrent = normalizeReelIndex(mod(reelCenterIndexRef.current, TOURNAMENT_YEARS.length));
    const extraLoops = TOURNAMENT_YEARS.length * 2;
    const relativeDistance = mod(targetYearIndex - mod(normalizedCurrent, TOURNAMENT_YEARS.length), TOURNAMENT_YEARS.length);
    const visualTarget = normalizedCurrent + extraLoops + relativeDistance;

    clearTimeouts();
    clearFrames();
    setSelectionOptions([]);
    setLandedYearPulse(false);
    setReelTransitionMs(0);
    setReelVisualIndex(normalizedCurrent);
    reelCenterIndexRef.current = normalizedCurrent;
    dispatch({ type: 'START_SPIN', year: targetYear });

    schedule(() => {
      spinFrameRef.current = window.requestAnimationFrame(() => {
        setReelTransitionMs(SPIN_DURATION_MS);
        setReelVisualIndex(visualTarget);
      });
    }, 20);

    schedule(() => {
      const settledIndex = normalizeReelIndex(targetYearIndex);

      setReelTransitionMs(0);
      setReelVisualIndex(settledIndex);
      reelCenterIndexRef.current = settledIndex;
      setLandedYearPulse(true);
      dispatch({ type: 'FINISH_SPIN' });

      schedule(() => {
        setLandedYearPulse(false);
      }, 300);
    }, SPIN_DURATION_MS + 60);
  }

  function animateReveal(
    slotIndex: number,
    playerPoints: number,
    previousTotal: number,
    nextTotal: number,
    isFinalPick: boolean
  ) {
    const startedAt = performance.now();

    setDisplayedSlotPoints((currentPoints) => {
      const nextPoints = [...currentPoints];
      nextPoints[slotIndex] = 0;
      return nextPoints;
    });

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / REVEAL_DURATION_MS);
      const slotPoints = progress === 1 ? playerPoints : Math.round(playerPoints * progress);
      const runningTotal =
        progress === 1 ? nextTotal : Math.round(previousTotal + (nextTotal - previousTotal) * progress);

      setDisplayedSlotPoints((currentPoints) => {
        const nextPoints = [...currentPoints];
        nextPoints[slotIndex] = slotPoints;
        return nextPoints;
      });
      dispatch({ type: 'SET_DISPLAYED_TOTAL', value: runningTotal });

      if (progress < 1) {
        revealFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      revealFrameRef.current = null;
      setRevealingSlotIndex(null);

      if (!isFinalPick) {
        dispatch({ type: 'END_REVEAL', complete: false });
        return;
      }

      schedule(() => {
        setCompletionPulse(true);

        if (game.highScore === null || nextTotal > game.highScore) {
          dispatch({ type: 'SET_HIGH_SCORE', score: nextTotal });
          setHighScorePulse(true);
          schedule(() => {
            setHighScorePulse(false);
          }, 400);
        }

        dispatch({ type: 'END_REVEAL', complete: true });
        schedule(() => {
          setShowFinalBadge(true);
        }, 300);
        schedule(() => {
          setShowPlayAgain(true);
        }, 500);
        schedule(() => {
          setCompletionPulse(false);
        }, 500);
      }, FINAL_PAUSE_MS);
    };

    revealFrameRef.current = window.requestAnimationFrame(step);
  }

  function handleSelectPlayer(player: TournamentPlayer) {
    if (game.phase !== 'selecting_player' || game.activeSlotIndex === null || game.currentYear === null) {
      return;
    }

    const slotIndex = game.activeSlotIndex;
    const nextDrawnYears = [...game.drawnYears];
    const previousTotal = game.actualTotal;
    const nextTotal = previousTotal + player.totalTournamentPts;
    const filledSlot: FilledSlot = {
      position: SLOT_CONFIG[slotIndex].position,
      year: game.currentYear,
      player
    };

    nextDrawnYears[slotIndex] = game.currentYear;

    clearTimeouts();
    clearFrames();
    setSelectionOptions([]);
    setRevealingSlotIndex(slotIndex);
    dispatch({
      type: 'BEGIN_REVEAL',
      slotIndex,
      filledSlot,
      nextDrawnYears,
      nextActualTotal: nextTotal
    });

    const isFinalPick = game.slots.filter((slot) => slot !== null).length === SLOT_CONFIG.length - 1;
    animateReveal(slotIndex, player.totalTournamentPts, previousTotal, nextTotal, isFinalPick);
  }

  function handleReturnToSlotSelection() {
    setSelectionOptions([]);
    dispatch({ type: 'RETURN_TO_SLOT_SELECTION' });
  }

  function handlePlayAgain() {
    resetTransientUi();
    dispatch({ type: 'RESET_ROUND' });
  }

  if (game.screen === 'landing') {
    return (
      <main
        className={`game-shell flex min-h-screen items-center justify-center px-6 transition-opacity duration-300 ${
          screenFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="court-lines" />
        <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center text-center">
          <span className="mb-3 rounded-full border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-[var(--text-secondary)]">
            Slot Machine Basketball
          </span>
          <h1
            className="font-display text-[clamp(3.25rem,10vw,4.5rem)] uppercase leading-none tracking-[0.04em] text-[var(--basketball-orange)]"
            style={{ textShadow: '0 0 40px rgba(232, 93, 38, 0.3)' }}
          >
            MarchingFive
          </h1>
          <p className="mt-4 max-w-md text-base text-[var(--text-primary)] md:text-lg">
            Spin the year. Pick your player. Chase the high score.
          </p>
          <button
            type="button"
            onClick={handlePlay}
            className="spin-button font-display mt-10 min-h-[52px] min-w-[220px] rounded-full px-10 py-3 text-[1.55rem] uppercase tracking-[0.18em]"
          >
            Play
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <div className="court-lines" />

      <header className="glass-panel sticky top-0 z-20 rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <button
            type="button"
            onClick={handleReturnHome}
            className="font-display cursor-pointer text-2xl uppercase tracking-[0.08em] text-[var(--basketball-orange)] transition-opacity hover:opacity-80"
          >
            MarchingFive
          </button>
          <div className="text-right">
            <div className="font-body text-[10px] uppercase tracking-[0.3em] text-[var(--text-secondary)]">
              High Score
            </div>
            <div
              className={`font-display text-xl tracking-[0.08em] ${
                highScorePulse ? 'high-score-flash' : ''
              }`}
              style={{ color: game.highScore === null ? 'var(--text-dim)' : 'var(--gold-jackpot)' }}
            >
              {game.highScore === null ? '---' : game.highScore}
            </div>
          </div>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-[480px] px-4 pb-8 pt-4">
        {game.phase === 'selecting_slot' ? (
          <p className="mb-3 text-center text-[13px] text-[var(--text-secondary)]">Pick a position</p>
        ) : null}

        <div className="space-y-2">
          {SLOT_CONFIG.map((slot, index) => {
            const filledSlot = game.slots[index];
            const isInteractive = game.phase === 'selecting_slot' && filledSlot === null;
            const isSelectedForDropdown = game.phase === 'selecting_player' && game.activeSlotIndex === index && !filledSlot;
            const logoUrl = filledSlot ? getLogoUrl(filledSlot.player) : null;
            const points = filledSlot ? displayedSlotPoints[index] : 0;

            return (
              <button
                key={`${slot.short}-${index}`}
                type="button"
                onClick={() => handleSelectSlot(index)}
                disabled={!isInteractive}
                className={`glass-panel slot-card flex min-h-[58px] w-full items-center px-3 py-2 text-left ${
                  isSelectedForDropdown ? 'slot-card--active' : ''
                } ${filledSlot ? 'slot-card--filled' : ''} ${
                  revealingSlotIndex === index ? 'slot-card--revealing' : ''
                } ${!isInteractive ? 'cursor-default' : 'cursor-pointer'}`}
                style={
                  isInteractive
                    ? {
                        borderColor: 'rgba(232, 93, 38, 0.35)',
                        boxShadow: '0 0 14px rgba(232, 93, 38, 0.12)'
                      }
                    : undefined
                }
              >
                {!filledSlot ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-display shrink-0 text-[1.6rem] leading-none"
                          style={{ color: isInteractive ? 'var(--basketball-orange)' : 'var(--text-dim)' }}
                        >
                          {slot.short}
                        </span>
                        <span className="text-[13px] text-[var(--text-secondary)]">- {slot.long}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] italic text-[var(--text-dim)]">— empty —</div>
                    </div>
                    {game.phase === 'idle' ? (
                      <div className="ml-3 shrink-0 text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]">
                        Spin first
                      </div>
                    ) : null}
                    {isInteractive ? (
                      <div className="ml-3 shrink-0 rounded-full border border-[var(--glass-border-active)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--basketball-orange)]">
                        Pick
                      </div>
                    ) : null}
                    {isSelectedForDropdown ? (
                      <div className="ml-3 shrink-0 rounded-full bg-[rgba(232,93,38,0.12)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--basketball-orange)]">
                        Active
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[rgba(255,255,255,0.05)]">
                      {logoUrl ? (
                        <img src={logoUrl} alt={filledSlot.player.teamFull} className="h-9 w-9 object-contain" />
                      ) : (
                        <span className="font-display text-xl text-[var(--text-secondary)]">{slot.short}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="font-display text-lg leading-none text-[var(--text-secondary)]">{slot.short}</span>
                        <span className="rounded-full bg-[var(--bg-surface-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          {filledSlot.year}
                        </span>
                      </div>
                      <div className="truncate text-[14px] font-bold text-[var(--text-primary)]">
                        {filledSlot.player.playerName}
                      </div>
                      <div className="truncate text-[11px] text-[var(--text-secondary)]">{filledSlot.player.teamFull}</div>
                    </div>

                    <div className="ml-3 shrink-0 text-right">
                      <div
                        className={`font-display text-[1.65rem] leading-none text-[var(--basketball-orange)] ${
                          revealingSlotIndex === index ? 'pulse-scale' : ''
                        }`}
                      >
                        {points}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">pts</div>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 text-center">
          <div className="text-[11px] uppercase tracking-[0.35em] text-[var(--text-secondary)]">Total</div>
          <div
            className={`font-display relative mt-1 inline-block text-[3rem] leading-none text-[var(--basketball-orange)] ${
              completionPulse ? 'pulse-scale' : ''
            } ${game.actualTotal >= 500 && game.phase === 'complete' ? 'score-shimmer' : ''}`}
            style={{ textShadow: '0 0 20px rgba(232, 93, 38, 0.2)' }}
          >
            {game.displayedTotal}
          </div>

          {game.phase === 'complete' && showFinalBadge ? (
            <div className="fade-enter mt-4">
              <div
                className={`tier-badge glass-panel inline-flex min-h-10 items-center rounded-full px-5 py-2 font-display text-xl uppercase tracking-[0.16em] ${scoreTier.className}`}
                style={{ color: scoreTier.textColor }}
              >
                {scoreTier.label}
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Best possible with your years: {bestPossibleScore}
              </p>
              {showPlayAgain ? (
                <button
                  type="button"
                  onClick={handlePlayAgain}
                  className="spin-button font-display mt-5 min-h-[48px] rounded-full px-8 py-2.5 text-[1.35rem] uppercase tracking-[0.14em]"
                >
                  Play Again
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!allSlotsFilled ? (
          <div className="mt-5 space-y-3">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-[0.35em] text-[var(--text-secondary)]">Year Spinner</div>
            </div>

            <div className="glass-panel spinner-shell px-3 py-2.5">
              <div className={`spinner-window ${landedYearPulse ? 'spinner-window--landed' : ''}`}>
                <div className="pointer-events-none absolute left-1/2 top-1 z-[3] h-1 w-8 -translate-x-1/2 rounded-full bg-[var(--basketball-orange)] shadow-[0_0_18px_rgba(232,93,38,0.45)]" />
                <div className="pointer-events-none absolute bottom-1 left-1/2 z-[3] h-1 w-8 -translate-x-1/2 rounded-full bg-[var(--basketball-orange)] shadow-[0_0_18px_rgba(232,93,38,0.45)]" />
                <div className="spinner-fade spinner-fade--left" />
                <div className="spinner-fade spinner-fade--right" />
                <div
                  className="spinner-strip"
                  style={{
                    transform: `translateX(calc(50% - ${(reelVisualIndex * YEAR_ITEM_WIDTH) + YEAR_ITEM_WIDTH / 2}px))`,
                    transitionProperty: 'transform',
                    transitionDuration: `${reelTransitionMs}ms`,
                    transitionTimingFunction: 'cubic-bezier(0.15, 0.85, 0.35, 1)'
                  }}
                >
                  {REPEATED_YEARS.map(({ year, key }, index) => (
                    <div
                      key={key}
                      className="spinner-year"
                      style={{
                        fontSize:
                          reelTransitionMs === 0 && index === reelVisualIndex
                            ? '3.1rem'
                            : Math.abs(index - reelVisualIndex) === 1
                              ? '1.8rem'
                              : '1.35rem',
                        color:
                          reelTransitionMs === 0 && index === reelVisualIndex
                            ? '#E85D26'
                            : 'rgba(74, 74, 82, 0.92)',
                        opacity:
                          reelTransitionMs === 0 && index === reelVisualIndex
                            ? 1
                            : Math.abs(index - reelVisualIndex) === 1
                              ? 0.42
                              : 0.15,
                        textShadow:
                          reelTransitionMs === 0 && index === reelVisualIndex
                            ? '0 0 20px rgba(232, 93, 38, 0.6), 0 0 40px rgba(232, 93, 38, 0.3)'
                            : 'none',
                        transform:
                          reelTransitionMs === 0 && index === reelVisualIndex
                            ? `scale(${landedYearPulse ? 1.15 : 1})`
                            : 'scale(1)',
                        transition:
                          'transform 300ms ease-out, opacity 120ms ease-out, color 120ms ease-out, font-size 120ms ease-out'
                      }}
                    >
                      {year}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {game.phase === 'selecting_player' ? (
              <div className="dropdown-shell glass-panel overflow-hidden">
                {selectionOptions.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">
                    <p>No eligible players were found for this draw.</p>
                    <button
                      type="button"
                      onClick={handleReturnToSlotSelection}
                      className="spin-button font-display mt-4 rounded-full px-5 py-2 text-lg uppercase tracking-[0.12em]"
                    >
                      Choose Position
                    </button>
                  </div>
                ) : (
                  selectionOptions.map((player, index) => (
                    <button
                      key={getPlayerKey(player)}
                      type="button"
                      onClick={() => handleSelectPlayer(player)}
                      className={`dropdown-option flex min-h-[56px] w-full items-center justify-between border-l-2 border-l-transparent px-4 py-3 text-left ${
                        index < selectionOptions.length - 1 ? 'border-b border-b-[var(--glass-border)]' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-bold text-[var(--text-primary)]">
                          {player.playerName}
                        </div>
                        <div className="truncate text-xs text-[var(--text-secondary)]">{player.teamFull}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {game.phase === 'idle' || game.phase === 'spinning' ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleSpin}
                  disabled={game.phase === 'spinning'}
                  className={`spin-button font-display min-h-[48px] w-full max-w-[320px] rounded-full px-8 py-2.5 text-[1.35rem] uppercase tracking-[0.16em] ${
                    game.phase === 'spinning' ? 'spin-button--disabled' : ''
                  }`}
                >
                  {game.phase === 'spinning' ? 'Spinning...' : 'Spin'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default MarchingFive;
