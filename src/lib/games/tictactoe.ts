// Compatible-by-design with the KiwiIRC tic-tac-toe plugin
// (https://github.com/ItsOnlyBinary/kiwiirc-plugin-tictactoe).
//
// All exchanges are IRC TAGMSGs to the opponent's nick carrying a single
// client-only message tag, `+kiwiirc.com/ttt`, whose value is a JSON object.

export const TTT_TAG = "+kiwiirc.com/ttt";

export type Cell = "" | "X" | "O";
export type Board = Cell[][]; // 3x3

// Wire commands.
export type TttMessage =
  | { cmd: "invite" }
  | { cmd: "invite_received" }
  | { cmd: "invite_accepted"; startPlayer: string }
  | { cmd: "invite_declined" }
  | { cmd: "action"; clicked: [number, number]; turn: number }
  | { cmd: "error"; message: string }
  | { cmd: "terminate" };

export interface GameSnapshot {
  serverId: string;
  localPlayer: string;
  remotePlayer: string;
  startPlayer: string | null;
  board: Board;
  turn: number; // increments each move, starts at 1
  gameOver: boolean;
  winner: "X" | "O" | "draw" | null;
  winLine: Array<[number, number]> | null;
  // UI state
  invitePending: boolean; // we sent invite, awaiting their response
  inviteIncoming: boolean; // they sent invite, awaiting our response
  active: boolean; // game accepted and in progress
  terminated: boolean; // explicitly ended (by them or us)
  statusMessage: string;
}

const WIN_LINES: Array<Array<[number, number]>> = [
  // rows
  [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  [
    [2, 0],
    [2, 1],
    [2, 2],
  ],
  // columns
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  // diagonals
  [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
];

export function emptyBoard(): Board {
  return [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ];
}

export function makeGame(
  serverId: string,
  localPlayer: string,
  remotePlayer: string,
): GameSnapshot {
  return {
    serverId,
    localPlayer,
    remotePlayer,
    startPlayer: null,
    board: emptyBoard(),
    turn: 1,
    gameOver: false,
    winner: null,
    winLine: null,
    invitePending: false,
    inviteIncoming: false,
    active: false,
    terminated: false,
    statusMessage: "",
  };
}

export function markerForTurn(turn: number): "X" | "O" {
  return turn % 2 === 1 ? "X" : "O";
}

// The starter is X.  Whoever the accepter chose as startPlayer takes the
// first move; subsequent turns alternate.
export function isLocalTurn(g: GameSnapshot): boolean {
  if (!g.active || g.gameOver) return false;
  // turn 1 is the start player.  start === local => local plays on odd turns.
  const odd = g.turn % 2 === 1;
  return g.startPlayer === g.localPlayer ? odd : !odd;
}

// Apply a move (idempotent against an already-occupied cell -> returns false).
// Caller is expected to already have validated whose turn it is.
export function applyMove(g: GameSnapshot, row: number, col: number): boolean {
  if (row < 0 || row > 2 || col < 0 || col > 2) return false;
  if (g.board[row][col] !== "") return false;
  g.board[row][col] = markerForTurn(g.turn);
  g.turn += 1;
  evaluate(g);
  return true;
}

// Check for win or draw and update game state accordingly.
export function evaluate(g: GameSnapshot): void {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const va = g.board[a[0]][a[1]];
    const vb = g.board[b[0]][b[1]];
    const vc = g.board[c[0]][c[1]];
    if (va !== "" && va === vb && vb === vc) {
      g.gameOver = true;
      g.winner = va;
      g.winLine = line;
      return;
    }
  }
  if (g.board.every((row) => row.every((c) => c !== ""))) {
    g.gameOver = true;
    g.winner = "draw";
    g.winLine = null;
  }
}

export function isWinningCell(
  g: GameSnapshot,
  row: number,
  col: number,
): boolean {
  if (!g.winLine) return false;
  return g.winLine.some(([r, c]) => r === row && c === col);
}

// Whose nick goes first when both peers agree on a flip.  Either side is
// fine -- we randomise on the accepter side and tell the inviter via
// `invite_accepted`.
export function pickStartPlayer(local: string, remote: string): string {
  return Math.random() < 0.5 ? local : remote;
}
