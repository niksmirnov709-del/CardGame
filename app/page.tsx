'use client';

import { useState, type CSSProperties } from 'react';

type Suit = 'fuego' | 'marea' | 'bosque' | 'rayo';
type Phase = 'attack' | 'defend' | 'result';
type EventId = 'low_power' | 'double_pulse' | 'bastion' | 'eclipse' | 'wide_hand';

type Card = {
  id: string;
  kind: 'strike' | 'shield';
  suit: Suit | 'guardia';
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
  event: EventId;
  round: number;
  exchange: number;
  attacker: number;
  viewer: number;
  phase: Phase;
  attackCard: Card | null;
  defenseCard: Card | null;
  attackBonus: number;
  secretAttack: boolean;
  secretUsed: [boolean, boolean];
  discardCount: number;
  nextAttacker: number;
  result: string;
  resultDetail: string;
  winner: number | null;
};

const SUITS: Suit[] = ['fuego', 'marea', 'bosque', 'rayo'];
const SUIT_DATA: Record<Suit | 'guardia', { label: string; symbol: string }> = {
  fuego: { label: 'Fuego', symbol: '▲' },
  marea: { label: 'Marea', symbol: '≈' },
  bosque: { label: 'Bosque', symbol: '✦' },
  rayo: { label: 'Rayo', symbol: 'ϟ' },
  guardia: { label: 'Guardia', symbol: '◆' },
};

const EVENTS: Record<EventId, { name: string; symbol: string; description: string }> = {
  low_power: { name: 'Rebelión menor', symbol: '↑', description: 'Las cartas de fuerza 2 a 5 reciben +2 de fuerza.' },
  double_pulse: { name: 'Sobrecarga', symbol: '×2', description: 'Cada defensa exitosa llena 2 puntos de Impulso.' },
  bastion: { name: 'Bastión vivo', symbol: '+', description: 'Cada defensa exitosa recupera 1 punto de vida.' },
  eclipse: { name: 'Eclipse', symbol: 'Ø', description: 'El símbolo dominante no sirve para defender esta ronda.' },
  wide_hand: { name: 'Marea de cartas', symbol: '7', description: 'Los jugadores roban hasta tener 7 cartas.' },
};

function pickEvent(except?: EventId) {
  const choices = (Object.keys(EVENTS) as EventId[]).filter((event) => event !== except);
  return choices[Math.floor(Math.random() * choices.length)];
}

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
    Array.from({ length: 9 }, (_, index) => {
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
  const shields: Card[] = Array.from({ length: 4 }, (_, index) => ({
    id: `guardia-${index}`,
    kind: 'shield',
    suit: 'guardia',
    value: 0,
    title: 'Escudo total',
  }));
  return shuffle([...strikes, ...shields]);
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
  const event = pickEvent();
  const handLimit = event === 'wide_hand' ? 7 : 6;
  const firstHand = drawToLimit([], deck, handLimit);
  const secondHand = drawToLimit([], deck, handLimit);
  return {
    players: [
      { name: 'Jugador 1', health: 20, hand: firstHand, pulse: 0 },
      { name: 'Jugador 2', health: 20, hand: secondHand, pulse: 0 },
    ],
    deck,
    trump: SUITS[Math.floor(Math.random() * SUITS.length)],
    event,
    round: 1,
    exchange: 0,
    attacker: 0,
    viewer: 0,
    phase: 'attack',
    attackCard: null,
    defenseCard: null,
    attackBonus: 0,
    secretAttack: false,
    secretUsed: [false, false],
    discardCount: 0,
    nextAttacker: 0,
    result: '',
    resultDetail: '',
    winner: null,
  };
}

function cardPower(card: Card, event: EventId) {
  return card.value + (event === 'low_power' && card.kind === 'strike' && card.value <= 5 ? 2 : 0);
}

function canDefend(card: Card, attack: Card, trump: Suit, event: EventId) {
  if (card.kind === 'shield') return true;
  if (card.kind !== 'strike' || attack.kind !== 'strike') return false;
  const cardValue = cardPower(card, event);
  const attackValue = cardPower(attack, event);
  const trumpEnabled = event !== 'eclipse';
  if (attack.suit === trump && trumpEnabled) return card.suit === trump && cardValue > attackValue;
  return (card.suit === attack.suit && cardValue > attackValue) || (trumpEnabled && card.suit === trump);
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
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`game-card card-${card.suit} ${compact ? 'compact-card' : ''} ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''} ${table ? 'table-card' : ''}`}
      style={{ '--card-index': index } as CSSProperties}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick ? selected : undefined}
      aria-label={`${card.title} de ${data.label}${card.kind === 'strike' ? `, fuerza ${card.value}` : ''}`}
    >
      <span className="card-edge" aria-hidden="true" />
      <span className="corner-value">{card.kind === 'shield' ? data.symbol : card.value}</span>
      <span className="card-art" aria-hidden="true"><i>{data.symbol}</i><em /></span>
      <span className="card-copy"><strong>{card.title}</strong><small>{data.label}</small></span>
      <span className="corner-value corner-bottom">{card.kind === 'shield' ? data.symbol : card.value}</span>
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
  const [eventReveal, setEventReveal] = useState(false);

  const begin = () => {
    const created = newGame();
    setGame(created);
    setScreen('game');
    setSelected(null);
    setSecretChoice(false);
    setPassTo(0);
    setEventReveal(true);
    playTone('start', soundOn);
  };

  const triggerImpact = (kind: 'hit' | 'block') => {
    setImpact(kind);
    window.setTimeout(() => setImpact(''), 520);
    if ('vibrate' in navigator) navigator.vibrate(kind === 'hit' ? [45, 35, 70] : 30);
  };

  const playAttack = () => {
    if (!game || game.phase !== 'attack' || !selected) return;
    const card = game.players[game.attacker].hand.find((item) => item.id === selected);
    if (!card || card.kind !== 'strike') return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    const bonus = players[game.attacker].pulse === 3 ? 2 : 0;
    if (bonus) players[game.attacker].pulse = 0;
    const secretUsed: [boolean, boolean] = [...game.secretUsed];
    if (secretChoice) secretUsed[game.attacker] = true;
    players[game.attacker].hand = players[game.attacker].hand.filter((item) => item.id !== card.id);
    const defender = 1 - game.attacker;
    setGame({ ...game, players, viewer: defender, phase: 'defend', attackCard: card, defenseCard: null, attackBonus: bonus, secretAttack: secretChoice, secretUsed });
    setSelected(null);
    setSecretChoice(false);
    setPassTo(defender);
    playTone('card', soundOn);
  };

  const resolveDefense = (defense: Card | null) => {
    if (!game || !game.attackCard || game.phase !== 'defend') return;
    const defender = 1 - game.attacker;
    const blocked = !!defense && canDefend(defense, game.attackCard, game.trump, game.event);
    if (defense && !blocked && !game.secretAttack) return;
    const players = game.players.map((player) => ({ ...player, hand: [...player.hand] })) as [Player, Player];
    let result = '';
    let resultDetail = '';
    let nextAttacker = game.attacker;
    let winner: number | null = null;

    if (defense) players[defender].hand = players[defender].hand.filter((item) => item.id !== defense.id);

    if (blocked) {
      const pulseGain = game.event === 'double_pulse' ? 2 : 1;
      players[defender].pulse = Math.min(3, players[defender].pulse + pulseGain);
      if (game.event === 'bastion') players[defender].health = Math.min(20, players[defender].health + 1);
      nextAttacker = defender;
      result = defense.kind === 'shield' ? '¡Escudo total!' : '¡Ataque bloqueado!';
      resultDetail = `${players[defender].name} gana el ataque${game.event === 'bastion' ? ' y recupera 1 de vida' : ''}.`;
      triggerImpact('block');
      playTone('block', soundOn);
    } else {
      const damage = Math.max(2, Math.ceil((cardPower(game.attackCard, game.event) + game.attackBonus) / 3));
      players[defender].health = Math.max(0, players[defender].health - damage);
      result = defense ? `Defensa rota: -${damage}` : `-${damage} de vida`;
      resultDetail = `${game.secretAttack ? `${game.attackCard.title} ${game.attackCard.value} revelado. ` : ''}${players[game.attacker].name} mantiene el ataque.`;
      if (players[defender].health === 0) winner = game.attacker;
      triggerImpact('hit');
      playTone('hit', soundOn);
    }

    setGame({
      ...game,
      players,
      phase: 'result',
      defenseCard: defense,
      nextAttacker,
      result,
      resultDetail,
      winner,
    });
    setSelected(null);
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
    const event = startsNewRound ? pickEvent(game.event) : game.event;
    const handLimit = event === 'wide_hand' ? 7 : 6;
    players[game.attacker].hand = drawToLimit(players[game.attacker].hand, deck, handLimit);
    players[1 - game.attacker].hand = drawToLimit(players[1 - game.attacker].hand, deck, handLimit);
    let winner: number | null = null;
    if (deck.length === 0 && players.every((player) => player.hand.length === 0)) {
      winner = players[0].health === players[1].health ? game.nextAttacker : players[0].health > players[1].health ? 0 : 1;
    }
    const next: Game = {
      ...game,
      players,
      deck,
      trump,
      event,
      round: newRound,
      exchange,
      attacker: game.nextAttacker,
      viewer: game.nextAttacker,
      phase: 'attack',
      attackCard: null,
      defenseCard: null,
      attackBonus: 0,
      secretAttack: false,
      discardCount: game.discardCount + 1 + (game.defenseCard ? 1 : 0),
      result: '',
      resultDetail: '',
      winner,
    };
    setGame(next);
    setSelected(null);
    setSecretChoice(false);
    if (startsNewRound) setEventReveal(true);
    if (winner !== null) setScreen('winner');
    else if (game.nextAttacker !== game.viewer) setPassTo(game.nextAttacker);
  };

  if (screen === 'menu') {
    return (
      <main className="game-shell menu-screen">
        <div className="menu-deck" aria-hidden="true">
          <CardFace card={{ id: 'menu-fire', kind: 'strike', suit: 'fuego', value: 9, title: 'Asalto' }} />
          <CardFace card={{ id: 'menu-tide', kind: 'strike', suit: 'marea', value: 7, title: 'Carga' }} />
          <div className="versus-stamp">VS</div>
        </div>
        <p className="eyebrow">Duelo local para dos</p>
        <h1>PULSO</h1>
        <p className="tagline">Una carta. Una respuesta. Pasa el dispositivo.</p>
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
  const selectedCanDefend = !!(selectedCard && game.attackCard && (game.secretAttack || canDefend(selectedCard, game.attackCard, game.trump, game.event)));
  const canAttack = selectedCard?.kind === 'strike';

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
          <button className="event-chip" onClick={() => setEventReveal(true)} title="Ver evento de ronda"><i>{EVENTS[game.event].symbol}</i>{EVENTS[game.event].name}</button>
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
          <b>{game.deck.length}</b><small>MAZO</small>
        </div>

        <div className="combat-slots">
          <div className="combat-slot attack-slot">
            {game.attackCard ? game.secretAttack && game.phase === 'defend' ? <div className="secret-table-card"><CardBack /><strong>?</strong></div> : <CardFace card={game.attackCard} table /> : <span>ATAQUE</span>}
            {game.attackBonus > 0 && <i className="bonus-tag">+{game.attackBonus}</i>}
          </div>
          <div className={`clash-mark ${game.attackCard ? 'active' : ''}`}>VS</div>
          <div className="combat-slot defense-slot">
            {game.defenseCard ? <CardFace card={game.defenseCard} table /> : <span>DEFENSA</span>}
          </div>
        </div>

        <div className="discard-pile" aria-label={`${game.discardCount} cartas descartadas`}>
          {game.discardCount > 0 && <CardBack />}
          <b>{game.discardCount}</b><small>USADAS</small>
        </div>
      </section>

      <section className="turn-panel" aria-live="polite">
        {game.phase === 'attack' && <><b>Tu ataque</b><span>Elige una carta. Las cartas altas golpean más, pero cuesta más defenderlas.</span></>}
        {game.phase === 'defend' && game.secretAttack && <><b>Ataque oculto</b><span>Arriesga cualquier carta para intentar bloquearlo o usa un escudo seguro.</span></>}
        {game.phase === 'defend' && !game.secretAttack && <><b>Tu defensa</b><span>Supera el valor con el mismo símbolo, usa {game.event === 'eclipse' ? 'el mismo símbolo' : SUIT_DATA[game.trump].label} o juega un escudo.</span></>}
        {game.phase === 'result' && <><b>{game.result}</b><span>{game.resultDetail}</span></>}
      </section>

      <section className="player-zone">
        <Health player={self} side="self" />
        <div className="player-hand" aria-label={`Mano de ${self.name}`}>
          {self.hand.map((card, index) => {
            const invalidDefense = defending && !!game.attackCard && !game.secretAttack && !canDefend(card, game.attackCard, game.trump, game.event);
            const invalidAttack = game.phase === 'attack' && card.kind !== 'strike';
            return <CardFace card={card} key={card.id} index={index} selected={selected === card.id} disabled={game.phase === 'result'} onClick={() => setSelected(selected === card.id ? null : card.id)} compact={invalidDefense || invalidAttack} />;
          })}
        </div>
        <div className="action-dock">
          {game.phase === 'attack' && <>
            <button className={`secret-button ${secretChoice ? 'active' : ''}`} disabled={game.secretUsed[game.attacker]} onClick={() => setSecretChoice(!secretChoice)} title="Oculta una carta una vez por partida">{game.secretUsed[game.attacker] ? 'Oculta usada' : secretChoice ? 'Oculta lista' : 'Jugada oculta'}</button>
            <button className="play-button" disabled={!canAttack} onClick={playAttack}>{secretChoice ? 'Jugar boca abajo' : game.players[game.attacker].pulse === 3 ? 'Atacar con +2' : 'Jugar ataque'}</button>
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
      {eventReveal && <EventModal event={game.event} round={game.round} onClose={() => setEventReveal(false)} />}
      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  );
}

function EventModal({ event, round, onClose }: { event: EventId; round: number; onClose: () => void }) {
  const data = EVENTS[event];
  return (
    <div className="event-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <section className={`event-modal event-${event}`}>
        <span className="event-symbol" aria-hidden="true">{data.symbol}</span>
        <p className="eyebrow">Evento de la ronda {round}</p>
        <h2 id="event-title">{data.name}</h2>
        <p>{data.description}</p>
        <button className="primary-button" onClick={onClose}>Entrar en la arena</button>
      </section>
    </div>
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
          <li><b>Lee el evento.</b><span>Cada cuatro duelos aparece una regla temporal que cambia la estrategia.</span></li>
          <li><b>Engaña.</b><span>Cada jugador puede lanzar una única carta boca abajo durante la partida.</span></li>
        </ol>
        <p className="rules-win">Gana quien deje al rival sin vida.</p>
        <button className="primary-button" onClick={onClose}>Entendido</button>
      </section>
    </div>
  );
}
