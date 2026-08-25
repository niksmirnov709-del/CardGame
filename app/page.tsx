'use client';

import { useState, type CSSProperties } from 'react';

type Suit = 'circulo' | 'triangulo' | 'cuadrado' | 'rombo';
type Phase = 'attack' | 'defend' | 'chain' | 'penalty' | 'result';
type CardKind = 'number' | 'king' | 'pawn' | 'draw';

type Card = {
  id: string;
  kind: CardKind;
  suit: Suit | 'rey' | 'peon' | 'mas4';
  value: number;
  title: string;
};

type Player = {
  name: string;
  hand: Card[];
};

type Game = {
  players: [Player, Player];
  deck: Card[];
  trump: Suit;
  round: number;
  exchange: number;
  attacker: number;
  viewer: number;
  phase: Phase;
  attacks: Card[];
  defenses: Card[];
  defenseIndex: number;
  secretAttack: boolean;
  secretUsed: [boolean, boolean];
  pickedUp: boolean;
  discardCount: number;
  nextAttacker: number;
  result: string;
  resultDetail: string;
  drawPenalty: number;
  winner: number | null;
};

const MAX_ATTACKS = 6;

const SUITS: Suit[] = ['circulo', 'triangulo', 'cuadrado', 'rombo'];
const SUIT_DATA: Record<Card['suit'], { label: string; symbol: string }> = {
  circulo: { label: 'Círculo', symbol: '●' },
  triangulo: { label: 'Triángulo', symbol: '▲' },
  cuadrado: { label: 'Cuadrado', symbol: '■' },
  rombo: { label: 'Rombo', symbol: '◆' },
  rey: { label: 'Rey', symbol: '♔' },
  peon: { label: 'Peón', symbol: '♟' },
  mas4: { label: '+4', symbol: '+4' },
};

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function createDeck(): Card[] {
  const numbers = SUITS.flatMap((suit) =>
    Array.from({ length: 8 }, (_, index) => {
      const value = index + 2;
      return {
        id: `${suit}-${value}`,
        kind: 'number' as const,
        suit,
        value,
        title: `${value}`,
      };
    }),
  );
  const specials: Card[] = [
    ...Array.from({ length: 2 }, (_, index) => ({ id: `rey-${index}`, kind: 'king' as const, suit: 'rey' as const, value: 10, title: 'Rey' })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `peon-${index}`, kind: 'pawn' as const, suit: 'peon' as const, value: 1, title: 'Peón' })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `mas4-${index}`, kind: 'draw' as const, suit: 'mas4' as const, value: 4, title: '+4' })),
  ];
  return shuffle([...numbers, ...specials]);
}

function drawToLimit(hand: Card[], deck: Card[], limit = 8) {
  const nextHand = [...hand];
  while (nextHand.length < limit && deck.length > 0) {
    const drawn = deck.shift();
    if (drawn) nextHand.push(drawn);
  }
  return nextHand;
}

function newGame(): Game {
  const deck = createDeck();
  const firstHand = drawToLimit([], deck);
  const secondHand = drawToLimit([], deck);
  return {
    players: [
      { name: 'Jugador 1', hand: firstHand },
      { name: 'Jugador 2', hand: secondHand },
    ],
    deck,
    trump: SUITS[Math.floor(Math.random() * SUITS.length)],
    round: 1,
    exchange: 0,
    attacker: 0,
    viewer: 0,
    phase: 'attack',
    attacks: [],
    defenses: [],
    defenseIndex: 0,
    secretAttack: false,
    secretUsed: [false, false],
    pickedUp: false,
    discardCount: 0,
    nextAttacker: 0,
    result: '',
    resultDetail: '',
    drawPenalty: 0,
    winner: null,
  };
}

function isAttackCard(card: Card) {
  return ['number', 'king', 'pawn', 'draw'].includes(card.kind);
}

function canDefend(card: Card, attack: Card, trump: Suit) {
  if (card.kind === 'king' || card.kind === 'pawn' || card.kind === 'draw') return true;
  if (card.kind !== 'number') return false;
  if (attack.kind !== 'number') return card.suit === trump;
  if (attack.suit === trump) return card.suit === trump && card.value > attack.value;
  return (card.suit === attack.suit && card.value > attack.value) || card.suit === trump;
}

function canThrowIn(card: Card, attacks: Card[], defenses: Card[]) {
  if (card.kind !== 'number') return false;
  return [...attacks, ...defenses].some((tableCard) => tableCard.kind === 'number' && tableCard.value === card.value);
}

function playTone(kind: 'card' | 'block' | 'hit' | 'start', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies = { card: 240, block: 520, hit: 100, start: 340 };
  oscillator.frequency.setValueAtTime(frequencies[kind], context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 55 : frequencies[kind] * 1.35, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.08, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.17);
}

function CardFace({ card, compact = false, selected = false, disabled = false, index = 0, fanOffset = 0, onClick, table = false }: {
  card: Card;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  index?: number;
  fanOffset?: number;
  onClick?: () => void;
  table?: boolean;
}) {
  const data = SUIT_DATA[card.suit];
  const ability = card.kind === 'king' ? 'Cancela' : card.kind === 'pawn' ? 'Reversa' : card.kind === 'draw' ? 'Roba 4' : null;
  const special = card.kind !== 'number';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`game-card card-${card.suit} ${compact ? 'compact-card' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''} ${table ? 'table-card' : ''}`}
      style={{ '--card-index': index, '--deal-index': Math.min(index, 12), '--fan-offset': fanOffset } as CSSProperties}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick ? selected : undefined}
      aria-label={card.kind === 'number' ? `Número ${card.value} de ${data.label}` : `${card.title}: ${ability}`}
    >
      <span className="card-edge" aria-hidden="true" />
      <span className="corner-value">{special ? data.symbol : card.value}</span>
      <span className="card-art" aria-hidden="true"><i>{data.symbol}</i><em /></span>
      <span className="card-copy"><strong>{card.title}</strong><small>{ability ?? data.label}</small></span>
      <span className="corner-value corner-bottom">{special ? data.symbol : card.value}</span>
    </Tag>
  );
}

function CardBack({ index = 0, fanOffset = 0, small = false }: { index?: number; fanOffset?: number; small?: boolean }) {
  return (
    <span className={`card-back ${small ? 'small-back' : ''}`} style={{ '--card-index': index, '--deal-index': Math.min(index, 9), '--fan-offset': fanOffset } as CSSProperties}>
      <i>P</i>
    </span>
  );
}

function PlayerStatus({ player, side }: { player: Player; side: 'self' | 'opponent' }) {
  return (
    <div className={`player-badge ${side}`}>
      <div className="avatar" aria-hidden="true"><span>{player.name.slice(-1)}</span></div>
      <div className="player-stats">
        <div className="name-row"><strong>{side === 'self' ? 'TÚ' : 'RIVAL'}</strong><span>{player.hand.length} cartas</span></div>
        <div className="card-count-row" aria-label={`${player.hand.length} cartas`}>
          {Array.from({ length: Math.min(player.hand.length, 8) }, (_, index) => <i key={index} />)}
          {player.hand.length > 8 && <b>+{player.hand.length - 8}</b>}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<'menu' | 'game' | 'winner'>('menu');
  const [game, setGame] = useState<Game | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [passTo, setPassTo] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [impact, setImpact] = useState<'hit' | 'block' | ''>('');
  const [secretChoice, setSecretChoice] = useState(false);

  const begin = () => {
    const created = newGame();
    setGame(created);
    setScreen('game');
    setSelected(null);
    setSecretChoice(false);
    setPassTo(0);
    playTone('start', soundOn);
  };

  const triggerImpact = (kind: 'hit' | 'block') => {
    setImpact(kind);
    window.setTimeout(() => setImpact(''), 520);
    if ('vibrate' in navigator) navigator.vibrate(kind === 'hit' ? [45, 35, 70] : 30);
  };

  const playAttack = () => {
    if (!game || !['attack', 'chain'].includes(game.phase) || !selected) return;
    const card = game.players[game.attacker].hand.find((item) => item.id === selected);
    const playable = card && isAttackCard(card);
    const isThrowIn = game.phase === 'chain';
    if (!card || !playable || (secretChoice && card.kind !== 'number') || (isThrowIn && (game.attacks.length >= MAX_ATTACKS || !canThrowIn(card, game.attacks, game.defenses)))) return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    const secretUsed: [boolean, boolean] = [...game.secretUsed];
    if (secretChoice) secretUsed[game.attacker] = true;
    players[game.attacker].hand = players[game.attacker].hand.filter((item) => item.id !== card.id);
    const attacks = [...game.attacks, card];
    const defender = 1 - game.attacker;

    if (!isThrowIn && card.kind === 'draw') {
      setGame({
        ...game,
        players,
        attacks,
        viewer: defender,
        phase: 'penalty',
        drawPenalty: 4,
        result: '¡+4 pendiente!',
        resultDetail: `${players[defender].name} debe robar 4 o responder con otro +4.`,
        pickedUp: false,
      });
      setSelected(null);
      setSecretChoice(false);
      setPassTo(defender);
      playTone('card', soundOn);
      return;
    }

    setGame({
      ...game,
      players,
      attacks,
      viewer: defender,
      phase: 'defend',
      defenseIndex: attacks.length - 1,
      secretAttack: isThrowIn ? false : secretChoice,
      secretUsed,
      result: '',
      resultDetail: '',
      pickedUp: false,
    });
    setSelected(null);
    setSecretChoice(false);
    setPassTo(defender);
    playTone('card', soundOn);
  };

  const finishAttack = () => {
    if (!game || game.phase !== 'chain') return;
    const defender = 1 - game.attacker;
    setGame({
      ...game,
      phase: 'result',
      nextAttacker: defender,
      pickedUp: false,
      result: '¡Mesa defendida!',
      resultDetail: `${game.players[defender].name} cubrió todo y toma el turno.`,
    });
    setSelected(null);
  };

  const pickUpTable = () => {
    if (!game || game.phase !== 'defend') return;
    const defender = 1 - game.attacker;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    const tableCards = [...game.attacks, ...game.defenses];
    players[defender].hand.push(...tableCards);
    setGame({
      ...game,
      players,
      phase: 'result',
      nextAttacker: game.attacker,
      pickedUp: true,
      secretAttack: false,
      result: `${players[defender].name} recoge ${tableCards.length}`,
      resultDetail: 'Todas las cartas de la mesa vuelven a su mano. El atacante conserva el turno.',
    });
    setSelected(null);
    triggerImpact('hit');
    playTone('hit', soundOn);
  };

  const resolveDefense = (defense: Card | null) => {
    const currentAttack = game?.attacks[game.defenseIndex];
    if (!game || !currentAttack || game.phase !== 'defend') return;
    if (!defense) {
      pickUpTable();
      return;
    }
    const defender = 1 - game.attacker;
    const blocked = canDefend(defense, currentAttack, game.trump);
    if (defense && !blocked && !game.secretAttack) return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    players[defender].hand = players[defender].hand.filter((item) => item.id !== defense.id);
    const defenses = [...game.defenses, defense];

    if (!blocked) {
      const tableCards = [...game.attacks, ...defenses];
      players[defender].hand.push(...tableCards);
      setGame({ ...game, players, defenses, phase: 'result', nextAttacker: game.attacker, pickedUp: true, secretAttack: false, result: 'La defensa falla', resultDetail: `${players[defender].name} recoge las ${tableCards.length} cartas de la mesa.` });
      setSelected(null);
      triggerImpact('hit');
      playTone('hit', soundOn);
      return;
    }

    if (defense.kind === 'king') {
      setGame({ ...game, players, defenses, phase: 'result', nextAttacker: defender, pickedUp: false, secretAttack: false, result: '¡El Rey cancela!', resultDetail: 'Todo el ataque termina y quien jugó el Rey toma el turno.' });
      setSelected(null);
      triggerImpact('block');
      playTone('block', soundOn);
      return;
    }

    if (defense.kind === 'pawn') {
      const previousAttacker = game.attacker;
      setGame({ ...game, players, defenses, attacker: defender, viewer: previousAttacker, secretAttack: false, result: '¡Peón: reversa!', resultDetail: `${players[previousAttacker].name} debe defender ahora el mismo ataque.` });
      setSelected(null);
      setPassTo(previousAttacker);
      triggerImpact('block');
      playTone('block', soundOn);
      return;
    }

    if (defense.kind === 'draw') {
      setGame({
        ...game,
        players,
        defenses,
        viewer: game.attacker,
        phase: 'penalty',
        drawPenalty: 4,
        secretAttack: false,
        pickedUp: false,
        result: '¡Defensa +4!',
        resultDetail: `${players[game.attacker].name} debe robar 4 o devolver otro +4.`,
      });
      setSelected(null);
      setPassTo(game.attacker);
      triggerImpact('block');
      playTone('block', soundOn);
      return;
    }

    triggerImpact('block');
    playTone('block', soundOn);
    if (game.attacks.length >= MAX_ATTACKS) {
      setGame({ ...game, players, defenses, phase: 'result', nextAttacker: defender, pickedUp: false, secretAttack: false, result: '¡Mesa defendida!', resultDetail: `Se alcanzó el límite de ${MAX_ATTACKS} ataques. ${players[defender].name} toma el turno.` });
      setSelected(null);
      return;
    }

    setGame({
      ...game,
      players,
      defenses,
      viewer: game.attacker,
      phase: 'chain',
      pickedUp: false,
      secretAttack: false,
      result: 'Carta defendida',
      resultDetail: 'El atacante puede añadir un número visible en la mesa o terminar el ataque.',
    });
    setSelected(null);
    setPassTo(game.attacker);
  };

  const stackDrawPenalty = () => {
    if (!game || game.phase !== 'penalty' || !selected) return;
    const target = game.viewer;
    const card = game.players[target].hand.find((item) => item.id === selected);
    if (!card || card.kind !== 'draw') return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    players[target].hand = players[target].hand.filter((item) => item.id !== card.id);
    const nextTarget = 1 - target;
    const drawPenalty = game.drawPenalty + 4;
    setGame({
      ...game,
      players,
      defenses: [...game.defenses, card],
      viewer: nextTarget,
      drawPenalty,
      result: `¡+${drawPenalty} acumulado!`,
      resultDetail: `${players[nextTarget].name} debe robar ${drawPenalty} o apilar otro +4.`,
    });
    setSelected(null);
    setPassTo(nextTarget);
    triggerImpact('block');
    playTone('block', soundOn);
  };

  const takeDrawPenalty = () => {
    if (!game || game.phase !== 'penalty') return;
    const target = game.viewer;
    const deck = [...game.deck];
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    let drawnCount = 0;
    while (drawnCount < game.drawPenalty && deck.length > 0) {
      const card = deck.shift();
      if (card) {
        players[target].hand.push(card);
        drawnCount += 1;
      }
    }
    setGame({
      ...game,
      deck,
      players,
      phase: 'result',
      nextAttacker: 1 - target,
      pickedUp: false,
      result: `${players[target].name} roba ${drawnCount}`,
      resultDetail: drawnCount === game.drawPenalty ? `Aceptó la penalización de +${game.drawPenalty}.` : `El mazo solo tenía ${drawnCount} cartas disponibles.`,
    });
    setSelected(null);
    triggerImpact('hit');
    playTone('hit', soundOn);
  };

  const continueAfterResult = () => {
    if (!game || game.phase !== 'result') return;
    if (game.winner !== null) {
      setScreen('winner');
      return;
    }
    const deck = [...game.deck];
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    const exchange = game.exchange + 1;
    const newRound = Math.floor(exchange / 4) + 1;
    const startsNewRound = exchange % 4 === 0;
    const trump = startsNewRound ? SUITS[(SUITS.indexOf(game.trump) + 1) % SUITS.length] : game.trump;
    players[game.nextAttacker].hand = drawToLimit(players[game.nextAttacker].hand, deck);
    players[1 - game.nextAttacker].hand = drawToLimit(players[1 - game.nextAttacker].hand, deck);
    let winner: number | null = null;
    if (deck.length === 0) {
      const emptyPlayers = players.map((player, index) => player.hand.length === 0 ? index : -1).filter((index) => index >= 0);
      if (emptyPlayers.length > 0) winner = emptyPlayers.includes(game.nextAttacker) ? game.nextAttacker : emptyPlayers[0];
    }
    const next: Game = {
      ...game,
      players,
      deck,
      trump,
      round: newRound,
      exchange,
      attacker: game.nextAttacker,
      viewer: game.nextAttacker,
      phase: 'attack',
      attacks: [],
      defenses: [],
      defenseIndex: 0,
      secretAttack: false,
      pickedUp: false,
      discardCount: game.discardCount + (game.pickedUp ? 0 : game.attacks.length + game.defenses.length),
      result: '',
      resultDetail: '',
      drawPenalty: 0,
      winner,
    };
    setGame(next);
    setSelected(null);
    setSecretChoice(false);
    if (winner !== null) setScreen('winner');
    else if (game.nextAttacker !== game.viewer) setPassTo(game.nextAttacker);
  };

  if (screen === 'menu') {
    return (
      <main className="game-shell menu-screen">
        <div className="menu-deck" aria-hidden="true">
          <CardFace card={{ id: 'menu-circle', kind: 'number', suit: 'circulo', value: 9, title: '9' }} />
          <CardFace card={{ id: 'menu-pawn', kind: 'pawn', suit: 'peon', value: 1, title: 'Peón' }} />
          <div className="versus-stamp">VS</div>
        </div>
        <p className="eyebrow">Duelo local para dos</p>
        <h1>PULSO</h1>
        <p className="tagline">Ataca. Encadena. Engaña. Pasa el dispositivo.</p>
        <div className="menu-actions">
          <button className="primary-button" onClick={begin}>Nueva partida</button>
          <button className="secondary-button" onClick={() => setRulesOpen(true)}>Cómo jugar</button>
        </div>
        <p className="menu-footnote">2 jugadores · 1 dispositivo · 5-10 minutos</p>
        {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      </main>
    );
  }

  if (!game) return null;
  const self = game.players[game.viewer];
  const opponent = game.players[1 - game.viewer];
  const visibleOpponentCards = opponent.hand.slice(0, 10);
  const selectedCard = self.hand.find((card) => card.id === selected) ?? null;
  const defending = game.phase === 'defend';
  const activeAttackIndex = defending || game.phase === 'result' ? Math.min(game.defenseIndex, game.attacks.length - 1) : game.attacks.length - 1;
  const currentAttack = game.attacks[activeAttackIndex] ?? null;
  const latestDefenseIsCurrent = game.phase === 'chain' || game.phase === 'penalty' || game.phase === 'result' || (game.phase === 'defend' && game.defenses.at(-1)?.kind === 'pawn');
  const currentDefense = latestDefenseIsCurrent ? game.defenses.at(-1) ?? null : null;
  const attackShadows = game.attacks.filter((_, index) => index !== activeAttackIndex);
  const defenseShadows = currentDefense ? game.defenses.slice(0, -1) : game.defenses;
  const selectedCanDefend = !!(selectedCard && currentAttack && (game.secretAttack || canDefend(selectedCard, currentAttack, game.trump)));
  const selectedIsAttack = !!selectedCard && isAttackCard(selectedCard);
  const canAttack = selectedIsAttack && (!secretChoice || selectedCard?.kind === 'number') && (game.phase !== 'chain' || (game.attacks.length < MAX_ATTACKS && !!selectedCard && canThrowIn(selectedCard, game.attacks, game.defenses)));
  const canStackPenalty = game.phase === 'penalty' && selectedCard?.kind === 'draw';

  if (screen === 'winner') {
    const winner = game.winner ?? 0;
    return (
      <main className="game-shell winner-screen">
        <div className="victory-rays" aria-hidden="true" />
        <div className="winner-avatar">{winner + 1}</div>
        <p className="eyebrow">Fin del duelo</p>
        <h1>{game.players[winner].name} gana</h1>
        <p>Vació su mano después de agotarse el mazo.</p>
        <div className="menu-actions">
          <button className="primary-button" onClick={begin}>Revancha</button>
          <button className="secondary-button" onClick={() => setScreen('menu')}>Menú</button>
        </div>
      </main>
    );
  }

  return (
    <main className={`game-shell battle-screen impact-${impact}`}>
      <header className="battle-topbar">
        <button className="icon-button" aria-label="Volver al menú" title="Volver al menú" onClick={() => setScreen('menu')}>×</button>
        <div className="round-label">
          <span>RONDA {game.round}</span>
          <b className={`trump trump-${game.trump}`}>{SUIT_DATA[game.trump].symbol} {SUIT_DATA[game.trump].label} domina</b>
          {game.deck.length === 0 && <strong className="death-chip">Mazo agotado</strong>}
        </div>
        <div className="top-actions">
          <button className="icon-button" aria-label={soundOn ? 'Desactivar sonido' : 'Activar sonido'} title={soundOn ? 'Desactivar sonido' : 'Activar sonido'} onClick={() => setSoundOn(!soundOn)}>{soundOn ? '♪' : '∅'}</button>
          <button className="icon-button" aria-label="Cómo jugar" title="Cómo jugar" onClick={() => setRulesOpen(true)}>?</button>
        </div>
      </header>

      <section className="opponent-zone">
        <PlayerStatus player={opponent} side="opponent" />
        <div className="hidden-hand" aria-label={`${opponent.hand.length} cartas ocultas del rival`}>
          {visibleOpponentCards.map((card, index) => <CardBack key={card.id} index={index} fanOffset={index - (visibleOpponentCards.length - 1) / 2} small />)}
        </div>
      </section>

      <section className="arena" aria-label="Arena de cartas">
        <div className="deck-stack" aria-label={`${game.deck.length} cartas en el mazo`}>
          {game.deck.length > 0 && <><CardBack /><span className="deck-layer layer-one" /><span className="deck-layer layer-two" /></>}
          <b>{game.deck.length}</b><small>{game.deck.length === 0 ? 'AGOTADO' : 'MAZO'}</small>
        </div>

        <div className="combat-slots">
          <div className="combat-slot attack-slot">
            {attackShadows.map((card, index) => <i className="chain-shadow attack-shadow" style={{ '--stack-index': index } as CSSProperties} key={card.id} />)}
            {currentAttack ? game.secretAttack && game.phase === 'defend' ? <div className="secret-table-card"><CardBack /><strong>?</strong></div> : <CardFace card={currentAttack} table /> : <span>ATAQUE</span>}
          </div>
          <div className={`clash-mark ${currentAttack ? 'active' : ''}`}>{game.attacks.length > 1 ? `×${game.attacks.length}` : 'VS'}</div>
          <div className="combat-slot defense-slot">
            {defenseShadows.map((card, index) => <i className="chain-shadow defense-shadow" style={{ '--stack-index': index } as CSSProperties} key={card.id} />)}
            {currentDefense ? <CardFace card={currentDefense} table /> : <span>DEFENSA</span>}
          </div>
        </div>

        <div className="discard-pile" aria-label={`${game.discardCount} cartas descartadas`}>
          {game.discardCount > 0 && <CardBack />}
          <b>{game.discardCount}</b><small>USADAS</small>
        </div>
      </section>

      <section className="turn-panel" aria-live="polite">
        {game.phase === 'attack' && <><b>Tu ataque</b><span>Juega una carta y pasa el dispositivo para que el rival responda.</span></>}
        {game.phase === 'chain' && <><b>¿Añades otra?</b><span>Lanza cualquier número que ya aparezca en un ataque o una defensa, sin importar la figura.</span></>}
        {game.phase === 'defend' && game.secretAttack && <><b>Ataque oculto</b><span>Prueba una defensa, responde con +4 o recoge todas las cartas de la mesa.</span></>}
        {game.phase === 'defend' && !game.secretAttack && <><b>Defensa {game.defenseIndex + 1}/{game.attacks.length}</b><span>Supera el número, usa {SUIT_DATA[game.trump].label}, Rey, Peón o responde con +4.</span></>}
        {game.phase === 'penalty' && <><b>+{game.drawPenalty} pendiente</b><span>Roba la penalización o selecciona otro +4 para devolverla aumentada.</span></>}
        {game.phase === 'result' && <><b>{game.result}</b><span>{game.resultDetail}</span></>}
      </section>

      <section className="player-zone">
        <PlayerStatus player={self} side="self" />
        <div
          className={`player-hand ${self.hand.length > 10 ? 'dense-hand' : ''} ${self.hand.length > 16 ? 'super-dense-hand' : ''}`}
          style={{ '--hand-size': Math.max(self.hand.length, 1) } as CSSProperties}
          aria-label={`Mano de ${self.name}`}
        >
          {self.hand.map((card, index) => {
            const invalidDefense = defending && !!currentAttack && !game.secretAttack && !canDefend(card, currentAttack, game.trump);
            const attackPhase = game.phase === 'attack' || game.phase === 'chain';
            const playableAttack = isAttackCard(card);
            const invalidAttack = attackPhase && (!playableAttack || (game.phase === 'chain' && (game.attacks.length >= MAX_ATTACKS || !canThrowIn(card, game.attacks, game.defenses))));
            const invalidPenaltyResponse = game.phase === 'penalty' && card.kind !== 'draw';
            return <CardFace card={card} key={card.id} index={index} fanOffset={index - (self.hand.length - 1) / 2} selected={selected === card.id} disabled={game.phase === 'result'} onClick={() => setSelected(selected === card.id ? null : card.id)} compact={invalidDefense || invalidAttack || invalidPenaltyResponse} />;
          })}
        </div>
        <div className="action-dock">
          {(game.phase === 'attack' || game.phase === 'chain') && <>
            {game.phase === 'chain' && <button className="take-hit-button retreat-button" onClick={finishAttack}>Terminar ataque</button>}
            {game.phase === 'attack' && <button className={`secret-button ${secretChoice ? 'active' : ''}`} disabled={game.secretUsed[game.attacker]} onClick={() => setSecretChoice(!secretChoice)} title="Oculta una carta una vez por partida">{game.secretUsed[game.attacker] ? 'Oculta usada' : secretChoice ? 'Oculta lista' : 'Jugada oculta'}</button>}
            <button className="play-button" disabled={!canAttack} onClick={playAttack}>{secretChoice ? 'Atacar oculta' : game.phase === 'chain' ? 'Añadir carta' : 'Atacar'}</button>
          </>}
          {game.phase === 'defend' && <>
            <button className="take-hit-button" onClick={() => resolveDefense(null)}>Recoger mesa</button>
            <button className="play-button defend-button" disabled={!selectedCanDefend} onClick={() => resolveDefense(selectedCard)}>Bloquear {game.defenseIndex + 1}/{game.attacks.length}</button>
          </>}
          {game.phase === 'penalty' && <>
            <button className="take-hit-button" onClick={takeDrawPenalty}>Robar +{game.drawPenalty}</button>
            <button className="play-button defend-button" disabled={!canStackPenalty} onClick={stackDrawPenalty}>Apilar +4</button>
          </>}
          {game.phase === 'result' && <button className="play-button" onClick={continueAfterResult}>{game.winner !== null ? 'Ver ganador' : game.nextAttacker === game.viewer ? 'Atacar ahora' : 'Pasar turno'}</button>}
        </div>
      </section>

      {passTo !== null && (
        <div className="pass-screen" role="dialog" aria-modal="true">
          <div className="pass-cards" aria-hidden="true"><CardBack /><CardBack /></div>
          <p className="eyebrow">Cartas ocultas</p>
          <h2>Pasa el dispositivo</h2>
          <p>Ahora juega <strong>{game.players[passTo].name}</strong>. No mires hasta que lo tenga.</p>
          <button className="primary-button" onClick={() => setPassTo(null)}>Ya lo tengo</button>
        </div>
      )}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <section className="rules-modal">
        <button className="modal-close" aria-label="Cerrar" onClick={onClose}>×</button>
        <p className="eyebrow">Reglas rápidas</p>
        <h2 id="rules-title">Ataca, pasa y responde</h2>
        <ol>
          <li><b>Roba hasta 8.</b><span>Mientras quede mazo, cada jugador completa su mano hasta tener ocho cartas.</span></li>
          <li><b>Ataca.</b><span>Empieza jugando una sola carta. El rival debe responder antes de que puedas añadir otra.</span></li>
          <li><b>Defiende.</b><span>Responde con la misma figura y un número mayor, o con la figura dominante.</span></li>
          <li><b>Encadena como en Durak.</b><span>Después de una defensa, puedes añadir cualquier número que ya se vea en la mesa. Si un 2 fue cubierto con un 5, puedes lanzar otro 2 u otro 5 de cualquier figura. Máximo seis ataques.</span></li>
          <li><b>Juega Rey.</b><span>Cancela de inmediato todo el ataque y te entrega el siguiente turno.</span></li>
          <li><b>Juega Peón.</b><span>Devuelve el ataque: quien lo lanzó pasa a ser quien debe defenderse.</span></li>
          <li><b>Responde con +4.</b><span>Puede cubrir cualquier ataque. El rival roba cuatro cartas o apila otro +4 para devolver una penalización de +8, +12 y así sucesivamente.</span></li>
          <li><b>Recoge.</b><span>Si no puedes defenderte, recoge todas las cartas que haya sobre la mesa. No existen vidas.</span></li>
          <li><b>Vacía tu mano.</b><span>Cuando el mazo se agote, gana el primer jugador que se quede sin cartas.</span></li>
        </ol>
        <p className="rules-win">Sin vidas: gana quien se quede sin cartas cuando el mazo esté vacío.</p>
        <button className="primary-button" onClick={onClose}>Entendido</button>
      </section>
    </div>
  );
}
