'use client';

import { useState, type CSSProperties } from 'react';

type Suit = 'circulo' | 'triangulo' | 'cuadrado' | 'rombo';
type Phase = 'attack' | 'defend' | 'chain' | 'result';
type CardKind = 'strike' | 'shield' | 'prism' | 'breaker' | 'mirror';

type Card = {
  id: string;
  kind: CardKind;
  suit: Suit | 'guardia' | 'prisma' | 'ruptura' | 'espejo';
  value: number;
  title: string;
};

type Player = {
  name: string;
  health: number;
  hand: Card[];
  pulse: number;
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
  attackBonus: number;
  secretAttack: boolean;
  secretUsed: [boolean, boolean];
  suddenDeath: boolean;
  discardCount: number;
  nextAttacker: number;
  result: string;
  resultDetail: string;
  winner: number | null;
};

const SUITS: Suit[] = ['circulo', 'triangulo', 'cuadrado', 'rombo'];
const SUIT_DATA: Record<Card['suit'], { label: string; symbol: string }> = {
  circulo: { label: 'Círculo', symbol: '●' },
  triangulo: { label: 'Triángulo', symbol: '▲' },
  cuadrado: { label: 'Cuadrado', symbol: '■' },
  rombo: { label: 'Rombo', symbol: '◆' },
  guardia: { label: 'Guardia', symbol: '◆' },
  prisma: { label: 'Prisma', symbol: '✦' },
  ruptura: { label: 'Ruptura', symbol: '!' },
  espejo: { label: 'Espejo', symbol: '↔' },
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
  const strikes = SUITS.flatMap((suit) =>
    Array.from({ length: 8 }, (_, index) => {
      const value = index + 2;
      return {
        id: `${suit}-${value}`,
        kind: 'strike' as const,
        suit,
        value,
        title: value >= 8 ? 'Asalto' : value >= 5 ? 'Carga' : 'Golpe',
      };
    }),
  );
  const shields: Card[] = Array.from({ length: 3 }, (_, index) => ({
    id: `guardia-${index}`,
    kind: 'shield',
    suit: 'guardia',
    value: 0,
    title: 'Escudo total',
  }));
  const specials: Card[] = [
    ...Array.from({ length: 2 }, (_, index) => ({ id: `prisma-${index}`, kind: 'prism' as const, suit: 'prisma' as const, value: 9, title: 'Prisma' })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `ruptura-${index}`, kind: 'breaker' as const, suit: 'ruptura' as const, value: 7, title: 'Ruptura' })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `espejo-${index}`, kind: 'mirror' as const, suit: 'espejo' as const, value: 0, title: 'Espejo' })),
  ];
  return shuffle([...strikes, ...shields, ...specials]);
}

function drawToLimit(hand: Card[], deck: Card[], limit = 6) {
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
      { name: 'Jugador 1', health: 20, hand: firstHand, pulse: 0 },
      { name: 'Jugador 2', health: 20, hand: secondHand, pulse: 0 },
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
    attackBonus: 0,
    secretAttack: false,
    secretUsed: [false, false],
    suddenDeath: false,
    discardCount: 0,
    nextAttacker: 0,
    result: '',
    resultDetail: '',
    winner: null,
  };
}

function attackPower(card: Card, suddenDeath: boolean) {
  return (card.kind === 'shield' || card.kind === 'mirror') && suddenDeath ? 2 : card.value;
}

function isAttackCard(card: Card, suddenDeath: boolean) {
  return ['strike', 'prism', 'breaker'].includes(card.kind) || suddenDeath;
}

function canDefend(card: Card, attack: Card, trump: Suit, suddenDeath: boolean) {
  if (card.kind === 'shield' || card.kind === 'mirror') return true;
  if (card.kind === 'prism') return attack.kind !== 'prism' && card.value > attackPower(attack, suddenDeath);
  if (card.kind !== 'strike') return false;
  if (attack.kind === 'breaker') return card.suit === trump;
  if (attack.kind === 'prism') return false;
  if (attack.kind === 'shield' || attack.kind === 'mirror') return suddenDeath && (card.value > 2 || card.suit === trump);
  if (attack.suit === trump) return card.suit === trump && card.value > attack.value;
  return (card.suit === attack.suit && card.value > attack.value) || card.suit === trump;
}

function canChain(card: Card, previous: Card, suddenDeath: boolean) {
  const playable = isAttackCard(card, suddenDeath);
  return playable && (card.kind === 'prism' || previous.kind === 'prism' || card.suit === previous.suit || attackPower(card, suddenDeath) === attackPower(previous, suddenDeath));
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

function CardFace({ card, compact = false, selected = false, disabled = false, index = 0, onClick, table = false }: {
  card: Card;
  compact?: boolean;
  selected?: boolean;
  disabled?: boolean;
  index?: number;
  onClick?: () => void;
  table?: boolean;
}) {
  const data = SUIT_DATA[card.suit];
  const ability = card.kind === 'prism' ? 'Combina con todo' : card.kind === 'breaker' ? 'Solo dominante' : card.kind === 'mirror' ? 'Refleja 2' : null;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`game-card card-${card.suit} ${compact ? 'compact-card' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''} ${table ? 'table-card' : ''}`}
      style={{ '--card-index': index } as CSSProperties}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick ? selected : undefined}
      aria-label={`${card.title} de ${data.label}${['strike', 'prism', 'breaker'].includes(card.kind) ? `, fuerza ${card.value}` : ''}`}
    >
      <span className="card-edge" aria-hidden="true" />
      <span className="corner-value">{['shield', 'mirror'].includes(card.kind) ? data.symbol : card.value}</span>
      <span className="card-art" aria-hidden="true"><i>{data.symbol}</i><em /></span>
      <span className="card-copy"><strong>{card.title}</strong><small>{ability ?? data.label}</small></span>
      <span className="corner-value corner-bottom">{['shield', 'mirror'].includes(card.kind) ? data.symbol : card.value}</span>
    </Tag>
  );
}

function CardBack({ index = 0, small = false }: { index?: number; small?: boolean }) {
  return (
    <span className={`card-back ${small ? 'small-back' : ''}`} style={{ '--card-index': index } as CSSProperties}>
      <i>P</i>
    </span>
  );
}

function Health({ player, side }: { player: Player; side: 'self' | 'opponent' }) {
  return (
    <div className={`player-badge ${side}`}>
      <div className="avatar" aria-hidden="true"><span>{player.name.slice(-1)}</span></div>
      <div className="player-stats">
        <div className="name-row"><strong>{side === 'self' ? 'TÚ' : 'RIVAL'}</strong><span>{player.health}/20</span></div>
        <div className="health-bar"><span style={{ width: `${Math.max(0, player.health) * 5}%` }} /></div>
        <div className="pulse-row" aria-label={`Impulso ${player.pulse} de 3`}>
          <small>IMPULSO</small>
          {[0, 1, 2].map((dot) => <i className={dot < player.pulse ? 'filled' : ''} key={dot} />)}
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
    const playable = card && isAttackCard(card, game.suddenDeath);
    const previous = game.attacks.at(-1);
    if (!card || !playable || (game.phase === 'chain' && previous && !canChain(card, previous, game.suddenDeath))) return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    const bonus = players[game.attacker].pulse === 3 ? 2 : 0;
    if (bonus) players[game.attacker].pulse = 0;
    const secretUsed: [boolean, boolean] = [...game.secretUsed];
    if (secretChoice) secretUsed[game.attacker] = true;
    players[game.attacker].hand = players[game.attacker].hand.filter((item) => item.id !== card.id);
    const defender = 1 - game.attacker;
    setGame({ ...game, players, viewer: defender, phase: 'defend', attacks: [...game.attacks, card], attackBonus: bonus, secretAttack: secretChoice, secretUsed });
    setSelected(null);
    setSecretChoice(false);
    setPassTo(defender);
    playTone('card', soundOn);
  };

  const resolveDefense = (defense: Card | null) => {
    const currentAttack = game?.attacks.at(-1);
    if (!game || !currentAttack || game.phase !== 'defend') return;
    const defender = 1 - game.attacker;
    const blocked = !!defense && canDefend(defense, currentAttack, game.trump, game.suddenDeath);
    if (defense && !blocked && !game.secretAttack) return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    let result = '';
    let resultDetail = '';
    let nextAttacker = game.attacker;
    let winner: number | null = null;

    if (defense) players[defender].hand = players[defender].hand.filter((item) => item.id !== defense.id);

    const defenses = defense ? [...game.defenses, defense] : game.defenses;

    if (blocked) {
      players[defender].pulse = Math.min(3, players[defender].pulse + 1);
      nextAttacker = defender;
      result = defense.kind === 'mirror' ? '¡Espejo!' : defense.kind === 'shield' ? '¡Escudo total!' : defense.kind === 'prism' ? '¡Prisma perfecto!' : '¡Ataque bloqueado!';
      resultDetail = game.attacks.length < 3 ? 'El atacante puede retirarse o redoblar.' : 'Cadena máxima detenida. El defensor gana el ataque.';
      triggerImpact('block');
      playTone('block', soundOn);

      if (defense.kind === 'mirror') {
        players[game.attacker].health = Math.max(0, players[game.attacker].health - 2);
        if (players[game.attacker].health === 0) winner = defender;
        setGame({
          ...game,
          players,
          defenses,
          phase: 'result',
          nextAttacker: defender,
          result: '¡Espejo! -2 al atacante',
          resultDetail: 'La cadena termina inmediatamente y el defensor gana el ataque.',
          winner,
          secretAttack: false,
        });
        setSelected(null);
        setSecretChoice(false);
        return;
      }

      if (game.attacks.length < 3) {
        setGame({ ...game, players, defenses, viewer: game.attacker, phase: 'chain', nextAttacker, result, resultDetail, secretAttack: false });
        setSelected(null);
        setSecretChoice(false);
        setPassTo(game.attacker);
        return;
      }
    } else {
      const chainBonus = game.attacks.length - 1;
      const ruptureBonus = currentAttack.kind === 'breaker' ? 2 : 0;
      const damage = Math.max(2, Math.ceil((attackPower(currentAttack, game.suddenDeath) + game.attackBonus) / 3)) + chainBonus + ruptureBonus;
      players[defender].health = Math.max(0, players[defender].health - damage);
      result = game.attacks.length > 1 ? `¡Cadena rota! -${damage}` : defense ? `Defensa rota: -${damage}` : `-${damage} de vida`;
      resultDetail = `${game.secretAttack ? `${currentAttack.title} ${attackPower(currentAttack, game.suddenDeath)} revelado. ` : ''}${players[game.attacker].name} mantiene el ataque.`;
      if (players[defender].health === 0) winner = game.attacker;
      triggerImpact('hit');
      playTone('hit', soundOn);
    }

    setGame({
      ...game,
      players,
      phase: 'result',
      defenses,
      nextAttacker,
      result,
      resultDetail,
      winner,
    });
    setSelected(null);
  };

  const retreatFromChain = () => {
    if (!game || game.phase !== 'chain') return;
    const defender = 1 - game.attacker;
    setGame({
      ...game,
      phase: 'result',
      nextAttacker: defender,
      result: 'Retirada táctica',
      resultDetail: `${game.players[defender].name} detuvo la cadena y gana el ataque.`,
    });
    setSelected(null);
    setSecretChoice(false);
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
    players[game.attacker].hand = drawToLimit(players[game.attacker].hand, deck);
    players[1 - game.attacker].hand = drawToLimit(players[1 - game.attacker].hand, deck);
    const suddenDeath = deck.length === 0;
    let winner: number | null = null;
    if (suddenDeath && players.every((player) => player.hand.length === 0)) {
      winner = players[0].health === players[1].health ? game.nextAttacker : players[0].health > players[1].health ? 0 : 1;
    } else if (suddenDeath && players[game.nextAttacker].hand.length === 0) {
      winner = 1 - game.nextAttacker;
    }
    const next: Game = {
      ...game,
      players,
      deck,
      trump,
      suddenDeath,
      round: newRound,
      exchange,
      attacker: game.nextAttacker,
      viewer: game.nextAttacker,
      phase: 'attack',
      attacks: [],
      defenses: [],
      attackBonus: 0,
      secretAttack: false,
      discardCount: game.discardCount + game.attacks.length + game.defenses.length,
      result: '',
      resultDetail: '',
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
          <CardFace card={{ id: 'menu-circle', kind: 'strike', suit: 'circulo', value: 9, title: 'Círculo' }} />
          <CardFace card={{ id: 'menu-prism', kind: 'prism', suit: 'prisma', value: 9, title: 'Prisma' }} />
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
  const selectedCard = self.hand.find((card) => card.id === selected) ?? null;
  const defending = game.phase === 'defend';
  const currentAttack = game.attacks.at(-1) ?? null;
  const currentDefense = game.defenses.length === game.attacks.length ? game.defenses.at(-1) ?? null : null;
  const selectedCanDefend = !!(selectedCard && currentAttack && (game.secretAttack || canDefend(selectedCard, currentAttack, game.trump, game.suddenDeath)));
  const selectedIsAttack = !!selectedCard && isAttackCard(selectedCard, game.suddenDeath);
  const canAttack = selectedIsAttack && (game.phase !== 'chain' || !currentAttack || canChain(selectedCard, currentAttack, game.suddenDeath));

  if (screen === 'winner') {
    const winner = game.winner ?? 0;
    return (
      <main className="game-shell winner-screen">
        <div className="victory-rays" aria-hidden="true" />
        <div className="winner-avatar">{winner + 1}</div>
        <p className="eyebrow">Fin del duelo</p>
        <h1>{game.players[winner].name} gana</h1>
        <p>Terminó con {game.players[winner].health} puntos de vida.</p>
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
          {game.suddenDeath && <strong className="death-chip">Muerte súbita</strong>}
        </div>
        <div className="top-actions">
          <button className="icon-button" aria-label={soundOn ? 'Desactivar sonido' : 'Activar sonido'} title={soundOn ? 'Desactivar sonido' : 'Activar sonido'} onClick={() => setSoundOn(!soundOn)}>{soundOn ? '♪' : '∅'}</button>
          <button className="icon-button" aria-label="Cómo jugar" title="Cómo jugar" onClick={() => setRulesOpen(true)}>?</button>
        </div>
      </header>

      <section className="opponent-zone">
        <Health player={opponent} side="opponent" />
        <div className="hidden-hand" aria-label={`${opponent.hand.length} cartas ocultas del rival`}>
          {opponent.hand.map((card, index) => <CardBack key={card.id} index={index} small />)}
        </div>
      </section>

      <section className="arena" aria-label="Arena de cartas">
        <div className="deck-stack" aria-label={`${game.deck.length} cartas en el mazo`}>
          {game.deck.length > 0 && <><CardBack /><span className="deck-layer layer-one" /><span className="deck-layer layer-two" /></>}
          <b>{game.deck.length}</b><small>{game.suddenDeath ? 'AGOTADO' : 'MAZO'}</small>
        </div>

        <div className="combat-slots">
          <div className="combat-slot attack-slot">
            {game.attacks.slice(0, -1).map((card, index) => <i className="chain-shadow attack-shadow" style={{ '--stack-index': index } as CSSProperties} key={card.id} />)}
            {currentAttack ? game.secretAttack && game.phase === 'defend' ? <div className="secret-table-card"><CardBack /><strong>?</strong></div> : <CardFace card={currentAttack} table /> : <span>ATAQUE</span>}
            {game.attackBonus > 0 && <i className="bonus-tag">+{game.attackBonus}</i>}
          </div>
          <div className={`clash-mark ${currentAttack ? 'active' : ''}`}>{game.attacks.length > 1 ? `×${game.attacks.length}` : 'VS'}</div>
          <div className="combat-slot defense-slot">
            {game.defenses.slice(0, currentDefense ? -1 : undefined).map((card, index) => <i className="chain-shadow defense-shadow" style={{ '--stack-index': index } as CSSProperties} key={card.id} />)}
            {currentDefense ? <CardFace card={currentDefense} table /> : <span>DEFENSA</span>}
          </div>
        </div>

        <div className="discard-pile" aria-label={`${game.discardCount} cartas descartadas`}>
          {game.discardCount > 0 && <CardBack />}
          <b>{game.discardCount}</b><small>USADAS</small>
        </div>
      </section>

      <section className="turn-panel" aria-live="polite">
        {game.phase === 'attack' && <><b>Tu ataque</b><span>Elige una carta. Las cartas altas golpean más, pero cuesta más defenderlas.</span></>}
        {game.phase === 'chain' && <><b>Cadena ×{game.attacks.length}</b><span>Retírate o redobla con el mismo símbolo o el mismo valor. Máximo tres ataques.</span></>}
        {game.phase === 'defend' && game.secretAttack && <><b>Ataque oculto</b><span>Arriesga cualquier carta para intentar bloquearlo o usa un escudo seguro.</span></>}
        {game.phase === 'defend' && !game.secretAttack && <><b>Tu defensa</b><span>Supera el valor con el mismo símbolo, usa {SUIT_DATA[game.trump].label} o juega un escudo.</span></>}
        {game.phase === 'result' && <><b>{game.result}</b><span>{game.resultDetail}</span></>}
      </section>

      <section className="player-zone">
        <Health player={self} side="self" />
        <div className="player-hand" aria-label={`Mano de ${self.name}`}>
          {self.hand.map((card, index) => {
            const invalidDefense = defending && !!currentAttack && !game.secretAttack && !canDefend(card, currentAttack, game.trump, game.suddenDeath);
            const attackPhase = game.phase === 'attack' || game.phase === 'chain';
            const playableAttack = isAttackCard(card, game.suddenDeath);
            const invalidAttack = attackPhase && (!playableAttack || (game.phase === 'chain' && !!currentAttack && !canChain(card, currentAttack, game.suddenDeath)));
            return <CardFace card={card} key={card.id} index={index} selected={selected === card.id} disabled={game.phase === 'result'} onClick={() => setSelected(selected === card.id ? null : card.id)} compact={invalidDefense || invalidAttack} />;
          })}
        </div>
        <div className="action-dock">
          {(game.phase === 'attack' || game.phase === 'chain') && <>
            {game.phase === 'chain' && <button className="take-hit-button retreat-button" onClick={retreatFromChain}>Retirarse</button>}
            <button className={`secret-button ${secretChoice ? 'active' : ''}`} disabled={game.secretUsed[game.attacker]} onClick={() => setSecretChoice(!secretChoice)} title="Oculta una carta una vez por partida">{game.secretUsed[game.attacker] ? 'Oculta usada' : secretChoice ? 'Oculta lista' : 'Jugada oculta'}</button>
            <button className="play-button" disabled={!canAttack} onClick={playAttack}>{secretChoice ? 'Jugar boca abajo' : game.phase === 'chain' ? `Redoblar ×${game.attacks.length + 1}` : game.players[game.attacker].pulse === 3 ? 'Atacar con +2' : game.suddenDeath && selectedCard && !isAttackCard(selectedCard, false) ? 'Embestida 2' : 'Jugar ataque'}</button>
          </>}
          {game.phase === 'defend' && <>
            <button className="take-hit-button" onClick={() => resolveDefense(null)}>Recibir golpe</button>
            <button className="play-button defend-button" disabled={!selectedCanDefend} onClick={() => resolveDefense(selectedCard)}>Bloquear</button>
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
          <li><b>Ataca.</b><span>Juega una carta y pasa el dispositivo.</span></li>
          <li><b>Defiende.</b><span>Usa el mismo símbolo con mayor valor, el símbolo dominante o un escudo.</span></li>
          <li><b>Cambia el control.</b><span>Si bloqueas, tú atacas. Si recibes el golpe, el rival repite.</span></li>
          <li><b>Llena Impulso.</b><span>Tres defensas exitosas dan +2 al siguiente ataque.</span></li>
          <li><b>Encadena.</b><span>Tras un bloqueo, retírate o añade una carta del mismo símbolo o valor. Puedes llegar a tres ataques.</span></li>
          <li><b>Engaña.</b><span>Cada jugador puede lanzar una única carta boca abajo durante la partida.</span></li>
          <li><b>Usa especiales.</b><span>Prisma combina con cualquier figura, Ruptura atraviesa defensas normales y Espejo devuelve 2 de daño.</span></li>
          <li><b>Sobrevive.</b><span>Al agotarse el mazo empieza la muerte súbita y los escudos atacan con fuerza 2.</span></li>
        </ol>
        <p className="rules-win">Gana quien deje al rival sin vida.</p>
        <button className="primary-button" onClick={onClose}>Entendido</button>
      </section>
    </div>
  );
}
