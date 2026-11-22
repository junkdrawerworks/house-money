// Craps' rules, with nothing on screen. The whole table is one plain object (state), saved after every roll so bets
// left on the layout and the point survive a reload.
//
// The bets, by spot:
//   pass, dontPass            the line, bet on the come-out (don't pass bars 12)
//   passOdds, dontOdds        odds behind the line once there's a point (true odds; 3-4-5x, lay up to 6x)
//   come, dontCome            the boxes, bet while a point is on; they travel to the next number rolled
//   come4…come10, dcome4…     come and don't come bets that have travelled to a number
//   comeOdds4…, dcomeOdds4…   odds on those (come odds are off on the come-out; lay odds always work)
//   place4…place10            place bets (off on the come-out)
//   field                     one roll: 3, 4, 9, 10, 11 even money, 2 double, 12 triple
//   hard4…hard10              the hardways (off on the come-out)
//   any7, anyCraps, yo, aces, aceDeuce, boxcars    one-roll bets in the middle
//
// Winning bets that a dealer would leave up stay on the layout (line, place, field, hardways, props); the winnings go
// to the rack. Odds, and come bets that travelled, come back to the rack with their winnings.
//
// Odds pay true odds exactly: an amount that doesn't pay whole chips (5 behind a 5 is owed 7½) pays the whole chips
// now and keeps the fraction (carry, in thirtieths of a chip, which every odds price divides) toward the next odds win.
// Place bets are paid down to whole chips, the way a dealer pays them.

export const POINTS = [4, 5, 6, 8, 9, 10];
export const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// winnings per chip staked, as [to, for]
const TRUE_ODDS = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
const LAY_ODDS = { 4: [1, 2], 10: [1, 2], 5: [2, 3], 9: [2, 3], 6: [5, 6], 8: [5, 6] };
const PLACE = { 4: [9, 5], 10: [9, 5], 5: [7, 5], 9: [7, 5], 6: [7, 6], 8: [7, 6] };
export const ODDS_MULT = { 4: 3, 10: 3, 5: 4, 9: 4, 6: 5, 8: 5 };
export const LAY_MULT = 6;
const HARD = { 4: [7, 1], 10: [7, 1], 6: [9, 1], 8: [9, 1] };
export const PROPS = {
  any7: { name: 'Any seven', pays: [4, 1], hits: (t) => t === 7 },
  anyCraps: { name: 'Any craps', pays: [7, 1], hits: (t) => t === 2 || t === 3 || t === 12 },
  aces: { name: 'Aces', pays: [30, 1], hits: (t) => t === 2 },
  aceDeuce: { name: 'Ace-deuce', pays: [15, 1], hits: (t) => t === 3 },
  yo: { name: 'Yo', pays: [15, 1], hits: (t) => t === 11 },
  boxcars: { name: 'Boxcars', pays: [30, 1], hits: (t) => t === 12 },
};

// Paid down to whole chips, the way a dealer pays an odd amount.
const pay = (stake, [to, fr]) => Math.floor(stake * to / fr);
export const CARRY = 30;   // the carry's unit: a thirtieth of a chip

export const LINE = ['pass', 'dontPass', 'come', 'dontCome'];

// Does this much on a spot pay in whole chips if it wins? For the bets whose price has a fraction in it (place bets,
// odds and lay odds; point: the number odds behind the line are on):
//   { whole, pays, owed: [chips, fraction as [n, d]] , better: { amount, pays } | null, kept }
// A place bet is paid down, so better is the next amount up that pays whole. Odds keep their fraction (kept: true).
// null for a bet that always pays whole, or with no number to price it.
export function paysWhole(spot, amount, point = 0) {
  let m, price, kept = false;
  if ((m = /^place(\d+)$/.exec(spot))) price = PLACE[m[1]];
  else if ((m = /^comeOdds(\d+)$/.exec(spot))) { price = TRUE_ODDS[m[1]]; kept = true; }
  else if ((m = /^dcomeOdds(\d+)$/.exec(spot))) { price = LAY_ODDS[m[1]]; kept = true; }
  else if (spot === 'passOdds' && POINTS.includes(point)) { price = TRUE_ODDS[point]; kept = true; }
  else if (spot === 'dontOdds' && POINTS.includes(point)) { price = LAY_ODDS[point]; kept = true; }
  if (!price || !(amount > 0)) return null;
  const [to, fr] = price;
  const num = amount * to, chips = Math.floor(num / fr), rest = num % fr, g = gcd(rest, fr);
  const whole = rest === 0;
  const up = Math.ceil(amount / fr) * fr;
  return { whole, pays: chips, owed: [chips, whole ? [0, 1] : [rest / g, fr / g]], kept,
    better: whole || kept ? null : { amount: up, pays: up * to / fr } };
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export const NAMES = {
  pass: 'Pass line', dontPass: "Don't pass", passOdds: 'Pass line odds', dontOdds: "Don't pass odds",
  come: 'Come', dontCome: "Don't come", field: 'Field',
};
for (const n of POINTS) {
  NAMES[`place${n}`] = `Place ${n}`; NAMES[`come${n}`] = `Come on ${n}`; NAMES[`dcome${n}`] = `Don't come on ${n}`;
  NAMES[`comeOdds${n}`] = `Odds on the ${n}`; NAMES[`dcomeOdds${n}`] = `Lay odds on the ${n}`;
}
for (const n of [4, 6, 8, 10]) NAMES[`hard${n}`] = `Hard ${n}`;
for (const [k, p] of Object.entries(PROPS)) NAMES[k] = p.name;

export const fresh = () => ({ point: 0, bets: {}, history: [], handRolls: 0, pending: 0, felt: 0, carry: 0 });

export const onFelt = s => Object.values(s.bets).reduce((a, v) => a + (v > 0 ? v : 0), 0);

// Can a chip go on this spot now, and how much more fits? { ok, why, room }
export function can(s, spot, max = Infinity) {
  const b = s.bets, has = k => (b[k] || 0) > 0, cur = b[spot] || 0;
  const no = why => ({ ok: false, why, room: 0 });
  const room = lim => (lim - cur > 0 ? { ok: true, room: lim - cur } : no('That bet is as big as it can be.'));
  let m;
  if (spot === 'pass' || spot === 'dontPass') {
    if (s.point) return no(`The line takes bets on the come-out. With the point on, bet Come${spot === 'dontPass' ? "/Don't come" : ''} instead.`);
    return room(max);
  }
  if (spot === 'come' || spot === 'dontCome') {
    if (!s.point) return no(`${NAMES[spot]} opens once there's a point. On the come-out, bet the line.`);
    return room(max);
  }
  if (spot === 'passOdds') {
    if (!s.point || !has('pass')) return no('Odds go behind a pass line bet once there’s a point.');
    return room(b.pass * ODDS_MULT[s.point]);
  }
  if (spot === 'dontOdds') {
    if (!s.point || !has('dontPass')) return no('Lay odds go behind a don’t pass bet once there’s a point.');
    return room(b.dontPass * LAY_MULT);
  }
  if ((m = /^comeOdds(\d+)$/.exec(spot))) {
    const n = +m[1];
    if (!has(`come${n}`)) return no(`Odds go on a come bet that's travelled to the ${n}.`);
    return room(b[`come${n}`] * ODDS_MULT[n]);
  }
  if ((m = /^dcomeOdds(\d+)$/.exec(spot))) {
    const n = +m[1];
    if (!has(`dcome${n}`)) return no(`Lay odds go on a don't come bet that's travelled to the ${n}.`);
    return room(b[`dcome${n}`] * LAY_MULT);
  }
  if (/^(come|dcome)\d+$/.test(spot)) return no('Come bets get here by travelling from the Come box.');
  if (/^place\d+$/.test(spot) || /^hard\d+$/.test(spot) || spot === 'field' || PROPS[spot]) return room(max);
  return no('Not a bet.');
}

// Can a bet come back off the layout? Pass and come bets can't once they have a point; everything else can.
export function removable(s, spot) {
  if (spot === 'pass') return !s.point;
  if (/^come\d+$/.test(spot)) return false;
  return true;
}

// Bets that won't count on this roll: place bets, hardways and come odds are off on the come-out.
export function working(s, spot) {
  if (s.point) return true;
  return !(/^place\d+$/.test(spot) || /^hard\d+$/.test(spot) || /^comeOdds\d+$/.test(spot) || spot === 'passOdds');
}

// One roll of the dice. Changes the state and returns what happened:
//   { total, hard, events: [{ spot, outcome: 'win'|'lose'|'push'|'return'|'move', stake, win, to }],
//     toRack, wagered, back, call, point: { was, now, made, sevenOut }, carry: { was, now } }
// toRack: chips going back to the rack. wagered/back: what was decided on this roll, for the records. carry: the
// fraction of a chip kept from odds wins, before and after.
export function roll(s, d1, d2) {
  const t = d1 + d2, hard = d1 === d2;
  const b = s.bets, was = s.point;
  const events = [];
  let toRack = 0, wagered = 0, back = 0;
  const carryWas = s.carry || 0;
  let carry = carryWas;
  // true or lay odds, exactly: the whole chips now, the fraction kept
  const odds = (stake, [to, fr]) => { const owed = stake * to * (CARRY / fr) + carry; carry = owed % CARRY; return Math.floor(owed / CARRY); };
  const has = k => (b[k] || 0) > 0;
  // a bet that wins: winnings to the rack, and the bet stays up unless `off` (then it comes back too)
  const win = (spot, amount, off) => {
    const stake = b[spot];
    events.push({ spot, outcome: 'win', stake, win: amount });
    toRack += amount + (off ? stake : 0);
    wagered += stake; back += stake + amount;
    if (off) delete b[spot];
  };
  const lose = spot => { events.push({ spot, outcome: 'lose', stake: b[spot], win: 0 }); wagered += b[spot]; delete b[spot]; };
  const ret = spot => { events.push({ spot, outcome: 'return', stake: b[spot], win: 0 }); toRack += b[spot]; delete b[spot]; };

  // one-roll bets
  if (has('field')) {
    if (t === 2) win('field', b.field * 2);
    else if (t === 12) win('field', b.field * 3);
    else if ([3, 4, 9, 10, 11].includes(t)) win('field', b.field);
    else lose('field');
  }
  for (const [k, p] of Object.entries(PROPS)) if (has(k)) { if (p.hits(t)) win(k, pay(b[k], p.pays)); else lose(k); }

  // hardways (off on the come-out)
  if (was) for (const n of [4, 6, 8, 10]) {
    const k = `hard${n}`;
    if (!has(k)) continue;
    if (t === n && hard) win(k, pay(b[k], HARD[n]));
    else if (t === n || t === 7) lose(k);
  }

  // place bets (off on the come-out)
  if (was) for (const n of POINTS) {
    const k = `place${n}`;
    if (!has(k)) continue;
    if (t === n) win(k, pay(b[k], PLACE[n]));
    else if (t === 7) lose(k);
  }

  // come and don't come bets that have travelled: settled before the boxes move, so a new come bet can land where
  // an old one just won
  for (const n of POINTS) {
    const c = `come${n}`, co = `comeOdds${n}`, d = `dcome${n}`, dO = `dcomeOdds${n}`;
    if (has(c) || has(co)) {
      if (t === n) {
        if (has(c)) win(c, b[c], true);
        if (has(co)) { if (was) win(co, odds(b[co], TRUE_ODDS[n]), true); else ret(co); }
      } else if (t === 7) {
        if (has(c)) lose(c);
        if (has(co)) { if (was) lose(co); else ret(co); }
      }
    }
    if (has(d) || has(dO)) {
      if (t === 7) {
        if (has(d)) win(d, b[d], true);
        if (has(dO)) win(dO, odds(b[dO], LAY_ODDS[n]), true);
      } else if (t === n) {
        if (has(d)) lose(d);
        if (has(dO)) lose(dO);
      }
    }
  }

  // the Come and Don't Come boxes
  if (was) {
    if (has('come')) {
      // a 7 that wins the come box is also the seven out: the bet comes back, as there's no come box on a come-out
      if (t === 7) win('come', b.come, true);
      else if (t === 11) win('come', b.come);
      else if (t === 2 || t === 3 || t === 12) lose('come');
      else { b[`come${t}`] = (b[`come${t}`] || 0) + b.come; events.push({ spot: 'come', outcome: 'move', stake: b.come, win: 0, to: `come${t}` }); delete b.come; }
    }
    if (has('dontCome')) {
      if (t === 2 || t === 3) win('dontCome', b.dontCome);
      else if (t === 12) events.push({ spot: 'dontCome', outcome: 'push', stake: b.dontCome, win: 0 });
      else if (t === 7 || t === 11) lose('dontCome');
      else { b[`dcome${t}`] = (b[`dcome${t}`] || 0) + b.dontCome; events.push({ spot: 'dontCome', outcome: 'move', stake: b.dontCome, win: 0, to: `dcome${t}` }); delete b.dontCome; }
    }
  }

  // the line
  let made = false, sevenOut = false;
  if (!was) {
    if (has('pass')) { if (t === 7 || t === 11) win('pass', b.pass); else if (t === 2 || t === 3 || t === 12) lose('pass'); }
    if (has('dontPass')) {
      if (t === 2 || t === 3) win('dontPass', b.dontPass);
      else if (t === 12) events.push({ spot: 'dontPass', outcome: 'push', stake: b.dontPass, win: 0 });
      else if (t === 7 || t === 11) lose('dontPass');
    }
    if (POINTS.includes(t)) s.point = t;
  } else if (t === was) {
    made = true;
    if (has('pass')) win('pass', b.pass);
    if (has('passOdds')) win('passOdds', odds(b.passOdds, TRUE_ODDS[was]), true);
    if (has('dontPass')) lose('dontPass');
    if (has('dontOdds')) lose('dontOdds');
    s.point = 0;
  } else if (t === 7) {
    sevenOut = true;
    if (has('pass')) lose('pass');
    if (has('passOdds')) lose('passOdds');
    if (has('dontPass')) win('dontPass', b.dontPass);
    if (has('dontOdds')) win('dontOdds', odds(b.dontOdds, LAY_ODDS[was]), true);
    s.point = 0;
  }

  s.history = [{ d: [d1, d2], t }, ...(s.history || [])].slice(0, 14);
  s.handRolls = sevenOut ? 0 : (s.handRolls || 0) + 1;
  s.felt = onFelt(s);
  s.carry = carry;
  return { total: t, hard, events, toRack, wagered, back, call: call(t, hard, was), point: { was, now: s.point, made, sevenOut },
    carry: { was: carryWas, now: carry } };
}

const WORDS = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };
const cap = w => w[0].toUpperCase() + w.slice(1);

// What the stickman calls.
export function call(t, hard, was) {
  const W = cap(WORDS[t]);
  const way = [4, 6, 8, 10].includes(t) ? (hard ? `, the hard way` : `, easy ${WORDS[t]}`) : '';
  if (!was) {
    if (t === 7) return 'Seven! Front line winner.';
    if (t === 11) return 'Yo-leven! Front line winner.';
    if (t === 2) return 'Craps, aces. Line away.';
    if (t === 3) return 'Craps three, ace-deuce. Line away.';
    if (t === 12) return 'Craps, boxcars. Bar the don’ts.';
    return `${W}${way}. The point is ${t}, mark it.`;
  }
  if (t === 7) return 'Seven out, line away.';
  if (t === was) return `${W}${way}! Winner, the point is made.`;
  if (t === 11) return 'Yo-leven!';
  if (t === 2) return 'Aces, craps two.';
  if (t === 3) return 'Ace-deuce, craps three.';
  if (t === 12) return 'Boxcars, midnight. Craps twelve.';
  if (t === 9) return 'Nine, center field nine.';
  if (t === 5) return 'Five, no field five.';
  return `${W}${way}.`;
}

// Fair dice, from crypto when there is some.
export function die(rng) {
  if (rng) return 1 + Math.floor(rng() * 6);
  const a = new Uint32Array(1);
  // rejection sampling so each face is exactly 1 in 6
  do { crypto.getRandomValues(a); } while (a[0] >= 4294967292);
  return 1 + (a[0] % 6);
}
