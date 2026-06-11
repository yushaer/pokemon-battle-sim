// GSAP-powered battle effects. Each move plays a choreographed timeline of
// ephemeral DOM nodes spawned inside the battlefield container; everything is
// cleaned up when the timeline completes. Effects are keyed by move type
// (18 archetype mappings) and category (physical = strike, special = ranged).

import gsap from 'gsap';

// type -> { color, fx archetype }
const TYPE_FX = {
  normal: { color: '#a8a878', fx: 'impact' },
  fighting: { color: '#c03028', fx: 'impact' },
  fire: { color: '#f08030', fx: 'projectile', glow: '#fce373' },
  water: { color: '#6890f0', fx: 'projectile', glow: '#9ac1f5' },
  ice: { color: '#98d8d8', fx: 'shards' },
  electric: { color: '#f8d030', fx: 'bolt' },
  grass: { color: '#78c850', fx: 'leaves' },
  poison: { color: '#a040a0', fx: 'projectile', glow: '#c46ec4' },
  ground: { color: '#e0c068', fx: 'shards' },
  rock: { color: '#b8a038', fx: 'shards' },
  bug: { color: '#a8b820', fx: 'swarm' },
  ghost: { color: '#705898', fx: 'wisp' },
  psychic: { color: '#f85888', fx: 'beam' },
  dragon: { color: '#7038f8', fx: 'beam' },
  dark: { color: '#705848', fx: 'wisp' },
  steel: { color: '#b8b8d0', fx: 'shards' },
  flying: { color: '#a890f0', fx: 'wind' },
  fairy: { color: '#ee99ac', fx: 'sparkle' },
};

// ---------- low-level helpers ----------

function centerOf(el, container) {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
}

function spawn(container, styles = {}, tag = 'div') {
  const el = document.createElement(tag);
  el.style.position = 'absolute';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '25';
  el.style.willChange = 'transform, opacity';
  Object.assign(el.style, styles);
  container.appendChild(el);
  return el;
}

function px(n) {
  return `${n}px`;
}

// Run a timeline; resolve when done; remove all spawned nodes.
function play(buildFn) {
  return new Promise((resolve) => {
    const nodes = [];
    const tl = gsap.timeline({
      onComplete: () => {
        nodes.forEach((n) => n.remove());
        resolve();
      },
    });
    buildFn(tl, (container, styles, tag) => {
      const n = spawn(container, styles, tag);
      nodes.push(n);
      return n;
    });
    if (tl.duration() === 0) {
      nodes.forEach((n) => n.remove());
      resolve();
    }
  });
}

// ---------- shared pieces ----------

// Type-colored impact at a point: burst circle, expanding ring, radial sparks.
function addImpact(tl, mk, container, at, color, when = '>') {
  const burst = mk(container, {
    left: px(at.x - 30),
    top: px(at.y - 30),
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: `radial-gradient(circle, #fff 0%, ${color} 40%, transparent 70%)`,
    opacity: '0',
  });
  const ring = mk(container, {
    left: px(at.x - 24),
    top: px(at.y - 24),
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: `3px solid ${color}`,
    opacity: '0',
  });
  tl.fromTo(burst, { scale: 0.2, opacity: 0.95 }, { scale: 1.8, opacity: 0, duration: 0.4, ease: 'power2.out' }, when);
  tl.fromTo(ring, { scale: 0.3, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 0.45, ease: 'power1.out' }, '<');
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 45 + Math.random() * 35;
    const p = mk(container, {
      left: px(at.x - 4),
      top: px(at.y - 4),
      width: px(4 + Math.random() * 5),
      height: px(4 + Math.random() * 5),
      borderRadius: '50%',
      background: i % 3 === 0 ? '#ffffff' : color,
      opacity: '0',
    });
    tl.fromTo(
      p,
      { x: 0, y: 0, opacity: 1, scale: 1 },
      { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0, scale: 0.2, duration: 0.5, ease: 'power2.out' },
      '<',
    );
  }
}

// Brief full-field tint.
function addFlash(tl, mk, container, color, when = 0) {
  const flash = mk(container, { inset: '0', background: color, opacity: '0' });
  tl.to(flash, { opacity: 0.22, duration: 0.1 }, when).to(flash, { opacity: 0, duration: 0.3 }, '>');
}

// ---------- archetypes (special moves) ----------

function fxProjectile(tl, mk, container, from, to, info) {
  const orb = mk(container, {
    left: px(from.x - 11),
    top: px(from.y - 11),
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: `radial-gradient(circle, ${info.glow || '#fff'} 10%, ${info.color} 70%)`,
    boxShadow: `0 0 16px 6px ${info.color}`,
    opacity: '0',
  });
  // Arced flight: x linear, y dips via ease.
  tl.set(orb, { opacity: 1, scale: 0.6 });
  tl.to(orb, { x: to.x - from.x, duration: 0.45, ease: 'none' }, 0);
  tl.to(orb, { y: (to.y - from.y) * 0.5 - 60, duration: 0.22, ease: 'power1.out' }, 0);
  tl.to(orb, { y: to.y - from.y, duration: 0.23, ease: 'power1.in' }, 0.22);
  tl.to(orb, { scale: 1.1, duration: 0.45 }, 0);
  // small trail puffs
  for (let i = 1; i <= 4; i++) {
    const puff = mk(container, {
      left: px(from.x - 5),
      top: px(from.y - 5),
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: info.color,
      opacity: '0',
    });
    tl.fromTo(
      puff,
      { x: (to.x - from.x) * (i / 5), y: (to.y - from.y) * (i / 5) - 40 * Math.sin((i / 5) * Math.PI), opacity: 0.7, scale: 1 },
      { opacity: 0, scale: 0.2, duration: 0.3 },
      0.45 * (i / 5),
    );
  }
  tl.to(orb, { opacity: 0, scale: 1.6, duration: 0.1 }, 0.45);
  addImpact(tl, mk, container, to, info.color, 0.48);
}

function fxBolt(tl, mk, container, from, to, info) {
  // Zigzag lightning from above the target.
  const h = to.y + 10;
  const svg = mk(container, { left: px(to.x - 40), top: px(to.y - h), width: '80px', height: px(h) }, 'div');
  const seg = 6;
  let path = `M ${40 + (Math.random() * 10 - 5)} 0`;
  for (let i = 1; i <= seg; i++) {
    path += ` L ${40 + (i % 2 === 0 ? -1 : 1) * (8 + Math.random() * 14)} ${(h / seg) * i}`;
  }
  svg.innerHTML = `<svg width="80" height="${h}" style="overflow:visible">
    <path d="${path}" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" opacity="0.9"/>
    <path d="${path}" fill="none" stroke="${info.color}" stroke-width="3" stroke-linejoin="round"/>
  </svg>`;
  tl.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.06 }, 0.15);
  tl.to(svg, { opacity: 0, duration: 0.05 }, '>');
  tl.to(svg, { opacity: 1, duration: 0.05 }, '>');
  tl.to(svg, { opacity: 0, duration: 0.25 }, '>+0.1');
  addFlash(tl, mk, container, info.color, 0.15);
  addImpact(tl, mk, container, to, info.color, 0.35);
}

function fxBeam(tl, mk, container, from, to, info) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const beam = mk(container, {
    left: px(from.x),
    top: px(from.y - 7),
    width: px(len),
    height: '14px',
    borderRadius: '7px',
    background: `linear-gradient(90deg, transparent, ${info.color} 30%, #fff 50%, ${info.color} 70%, transparent)`,
    transformOrigin: 'left center',
    transform: `rotate(${ang}deg)`,
    boxShadow: `0 0 18px 4px ${info.color}`,
    opacity: '0',
  });
  tl.fromTo(beam, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.25, ease: 'power3.in' }, 0.1);
  tl.to(beam, { opacity: 0.4, duration: 0.08, repeat: 3, yoyo: true }, '>');
  tl.to(beam, { opacity: 0, scaleY: 0.2, duration: 0.2 }, '>');
  addImpact(tl, mk, container, to, info.color, 0.38);
}

function fxLeaves(tl, mk, container, from, to, info) {
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2;
    const r = 70;
    const leaf = mk(container, {
      left: px(to.x + Math.cos(ang) * r - 7),
      top: px(to.y + Math.sin(ang) * r - 4),
      width: '14px',
      height: '9px',
      borderRadius: '0 70% 0 70%',
      background: i % 2 ? info.color : '#a7db8d',
      opacity: '0',
    });
    tl.fromTo(
      leaf,
      { opacity: 1, rotation: ang * 57, scale: 1 },
      {
        x: -Math.cos(ang) * r,
        y: -Math.sin(ang) * r,
        rotation: `+=${260 + Math.random() * 160}`,
        scale: 0.5,
        opacity: 0.9,
        duration: 0.5,
        ease: 'power1.in',
        delay: (i % 3) * 0.07,
      },
      0.05,
    );
  }
  addImpact(tl, mk, container, to, info.color, 0.6);
}

function fxShards(tl, mk, container, from, to, info) {
  for (let i = 0; i < 6; i++) {
    const offX = -36 + i * 14 + Math.random() * 8;
    const shard = mk(container, {
      left: px(to.x + offX),
      top: px(to.y - 120 - Math.random() * 40),
      width: '12px',
      height: '18px',
      clipPath: 'polygon(50% 0, 100% 70%, 50% 100%, 0 70%)',
      background: `linear-gradient(180deg, #fff 0%, ${info.color} 60%)`,
      opacity: '0',
    });
    tl.fromTo(
      shard,
      { opacity: 1, y: 0, rotation: Math.random() * 40 - 20 },
      { y: 120 + Math.random() * 30, duration: 0.32, ease: 'power2.in', delay: i * 0.05 },
      0.1,
    ).to(shard, { opacity: 0, duration: 0.12 }, '>');
  }
  addImpact(tl, mk, container, to, info.color, 0.55);
}

function fxSwarm(tl, mk, container, from, to, info) {
  for (let i = 0; i < 12; i++) {
    const dot = mk(container, {
      left: px(from.x - 3),
      top: px(from.y - 3),
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: i % 2 ? info.color : '#d4e157',
      opacity: '0',
    });
    const wobble = (Math.random() - 0.5) * 90;
    tl.fromTo(
      dot,
      { opacity: 1, x: 0, y: 0 },
      {
        keyframes: [
          { x: (to.x - from.x) * 0.5 + wobble, y: (to.y - from.y) * 0.5 - Math.abs(wobble), duration: 0.25 },
          { x: to.x - from.x, y: to.y - from.y, duration: 0.25 },
        ],
        ease: 'power1.inOut',
        delay: i * 0.035,
      },
      0,
    ).to(dot, { opacity: 0, duration: 0.1 }, '>');
  }
  addImpact(tl, mk, container, to, info.color, 0.75);
}

function fxWisp(tl, mk, container, from, to, info) {
  for (let i = 0; i < 3; i++) {
    const orb = mk(container, {
      left: px(to.x - 9),
      top: px(to.y - 9),
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      background: `radial-gradient(circle, #fff 0%, ${info.color} 60%, transparent 80%)`,
      boxShadow: `0 0 14px 4px ${info.color}`,
      opacity: '0',
    });
    const start = (i / 3) * Math.PI * 2;
    tl.fromTo(orb, { opacity: 0.9, x: Math.cos(start) * 60, y: Math.sin(start) * 60 }, {
      duration: 0.55,
      ease: 'power1.in',
      x: 0,
      y: 0,
      rotation: 200,
      delay: i * 0.08,
    }, 0.05).to(orb, { opacity: 0, scale: 1.6, duration: 0.15 }, '>');
  }
  addFlash(tl, mk, container, info.color, 0.4);
  addImpact(tl, mk, container, to, info.color, 0.65);
}

function fxWind(tl, mk, container, from, to, info) {
  for (let i = 0; i < 3; i++) {
    const arc = mk(container, {
      left: px(to.x - 70),
      top: px(to.y - 30 + i * 22),
      width: '90px',
      height: '40px',
      border: 'none',
      borderTop: `4px solid ${info.color}`,
      borderRadius: '50%',
      opacity: '0',
    });
    tl.fromTo(
      arc,
      { x: -90, opacity: 0.9, scaleY: 0.7 },
      { x: 150, opacity: 0, duration: 0.45, ease: 'power1.in', delay: i * 0.09 },
      0.05,
    );
  }
  addImpact(tl, mk, container, to, info.color, 0.45);
}

function fxSparkle(tl, mk, container, from, to, info) {
  for (let i = 0; i < 12; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * 55;
    const star = mk(container, {
      left: px(to.x - 5),
      top: px(to.y - 5),
      width: '10px',
      height: '10px',
      clipPath: 'polygon(50% 0, 63% 38%, 100% 50%, 63% 62%, 50% 100%, 37% 62%, 0 50%, 37% 38%)',
      background: i % 3 === 0 ? '#fff' : info.color,
      opacity: '0',
    });
    tl.fromTo(
      star,
      { opacity: 0, x: Math.cos(ang) * r, y: Math.sin(ang) * r, scale: 0.3 },
      { opacity: 1, scale: 1.25, duration: 0.18, delay: i * 0.04 },
      0,
    )
      .to(star, { x: 0, y: 0, scale: 0.3, opacity: 0.9, duration: 0.25, ease: 'power2.in' }, '>')
      .to(star, { opacity: 0, duration: 0.08 }, '>');
  }
  addImpact(tl, mk, container, to, info.color, 0.7);
}

// Physical strike: dash blur, X-slash at the target.
function fxStrike(tl, mk, container, from, to, info) {
  for (const rot of [-38, 38]) {
    const slash = mk(container, {
      left: px(to.x - 45),
      top: px(to.y - 4),
      width: '90px',
      height: '8px',
      borderRadius: '4px',
      background: `linear-gradient(90deg, transparent, #fff 35%, ${info.color} 60%, transparent)`,
      transform: `rotate(${rot}deg)`,
      transformOrigin: 'center',
      opacity: '0',
    });
    tl.fromTo(
      slash,
      { scaleX: 0, opacity: 1 },
      { scaleX: 1.4, opacity: 0, duration: 0.3, ease: 'power3.out', delay: rot > 0 ? 0.12 : 0 },
      0.15,
    );
  }
  addImpact(tl, mk, container, to, info.color, 0.3);
}

// ---------- public API ----------

export function playMoveFx({ container, attackerEl, targetEl, moveType, category }) {
  if (!container || !attackerEl || !targetEl) return Promise.resolve();
  const info = TYPE_FX[moveType] || { color: '#cccccc', fx: 'impact' };
  const from = centerOf(attackerEl, container);
  const to = centerOf(targetEl, container);

  return play((tl, mk) => {
    addFlash(tl, mk, container, info.color, 0);
    if (category === 'physical') {
      fxStrike(tl, mk, container, from, to, info);
      return;
    }
    switch (info.fx) {
      case 'projectile': fxProjectile(tl, mk, container, from, to, info); break;
      case 'bolt': fxBolt(tl, mk, container, from, to, info); break;
      case 'beam': fxBeam(tl, mk, container, from, to, info); break;
      case 'leaves': fxLeaves(tl, mk, container, from, to, info); break;
      case 'shards': fxShards(tl, mk, container, from, to, info); break;
      case 'swarm': fxSwarm(tl, mk, container, from, to, info); break;
      case 'wisp': fxWisp(tl, mk, container, from, to, info); break;
      case 'wind': fxWind(tl, mk, container, from, to, info); break;
      case 'sparkle': fxSparkle(tl, mk, container, from, to, info); break;
      default: addImpact(tl, mk, container, to, info.color, 0.2);
    }
  });
}

// Pulsing ring on the user for status moves (Swords Dance, Recover...).
export function playStatusFx(container, userEl, moveType) {
  if (!container || !userEl) return Promise.resolve();
  const info = TYPE_FX[moveType] || { color: '#9ca3af' };
  const at = centerOf(userEl, container);
  return play((tl, mk) => {
    for (let i = 0; i < 2; i++) {
      const ring = mk(container, {
        left: px(at.x - 40),
        top: px(at.y - 40),
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        border: `3px solid ${info.color}`,
        boxShadow: `0 0 12px 2px ${info.color}`,
        opacity: '0',
      });
      tl.fromTo(
        ring,
        { scale: 1.6, opacity: 0 },
        { scale: 0.45, opacity: 0.9, duration: 0.45, ease: 'power2.in', delay: i * 0.2 },
        0,
      ).to(ring, { opacity: 0, duration: 0.15 }, '>');
    }
  });
}

// Camera shake on impact; harder on crits. Fire-and-forget.
export function playImpactShake(container, crit = false) {
  if (!container) return;
  const amp = crit ? 9 : 4;
  gsap.fromTo(
    container,
    { x: -amp },
    { x: amp, duration: 0.05, repeat: crit ? 7 : 5, yoyo: true, clearProps: 'x', ease: 'none' },
  );
}

// Dissolve particles when a Pokemon faints. Fire-and-forget.
export function playFaintFx(container, targetEl) {
  if (!container || !targetEl) return;
  const at = centerOf(targetEl, container);
  play((tl, mk) => {
    for (let i = 0; i < 14; i++) {
      const p = mk(container, {
        left: px(at.x - 30 + Math.random() * 60),
        top: px(at.y - 20 + Math.random() * 40),
        width: px(4 + Math.random() * 6),
        height: px(4 + Math.random() * 6),
        borderRadius: '50%',
        background: i % 2 ? '#94a3b8' : '#e2e8f0',
        opacity: '0',
      });
      tl.fromTo(
        p,
        { opacity: 0.9, y: 0 },
        { y: -(35 + Math.random() * 45), opacity: 0, duration: 0.7, ease: 'power1.out', delay: Math.random() * 0.25 },
        0,
      );
    }
  });
}

// Bounce-in when a Pokemon is sent out. Fire-and-forget.
export function playSwitchInFx(spriteEl) {
  if (!spriteEl) return;
  gsap.fromTo(
    spriteEl,
    { scale: 0.2, y: 28, opacity: 0 },
    { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: 'back.out(2.2)', clearProps: 'scale,y,opacity' },
  );
}
