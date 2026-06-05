// Asset-free, type-keyed move animation overlay. Rendered inside the battle
// field's relative container; `fx` carries the move's type/category, who's
// attacking, and who's being hit. Keyframes live in index.css.

const TYPE_FX = {
  normal: '#a8a878',
  fire: '#f08030',
  water: '#6890f0',
  electric: '#f8d030',
  grass: '#78c850',
  ice: '#98d8d8',
  fighting: '#c03028',
  poison: '#a040a0',
  ground: '#e0c068',
  flying: '#a890f0',
  psychic: '#f85888',
  bug: '#a8b820',
  rock: '#b8a038',
  ghost: '#705898',
  dragon: '#7038f8',
  dark: '#705848',
  steel: '#b8b8d0',
  fairy: '#ee99ac',
};

const PARTICLE_COUNT = 8;
const PARTICLE_DIST = 64;

export default function MoveEffect({ fx }) {
  if (!fx) return null;
  const color = TYPE_FX[fx.type] || '#cccccc';
  const isSpecial = fx.category === 'special';
  // Special moves "fire" a projectile, so delay the impact until it lands.
  const impactDelay = isSpecial ? '0.32s' : '0s';

  // Target sprite box (matches the sprite placement in BattleScreen).
  const boxPos =
    fx.target === 'opp'
      ? 'top-10 right-6 w-32 h-32 sm:top-12 sm:right-10 sm:w-36 sm:h-36'
      : 'bottom-8 left-6 w-36 h-36 sm:bottom-10 sm:left-10 sm:w-44 sm:h-44';

  // Projectile starts from the attacker's corner direction.
  const sx = fx.attacker === 'you' ? '-130px' : '130px';
  const sy = fx.attacker === 'you' ? '130px' : '-130px';

  return (
    <>
      {/* Whole-field type-colored flash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: color, animation: 'fx-flash 0.6s ease-out forwards' }}
      />

      {/* Localized effect over the target */}
      <div className={`absolute ${boxPos} pointer-events-none flex items-center justify-center`}>
        {/* Special: traveling projectile orb */}
        {isSpecial && (
          <div
            className="absolute rounded-full"
            style={{
              width: 26,
              height: 26,
              background: color,
              boxShadow: `0 0 18px 6px ${color}`,
              '--sx': sx,
              '--sy': sy,
              animation: 'fx-projectile 0.36s ease-in forwards',
            }}
          />
        )}

        {/* Impact burst */}
        <div
          className="absolute rounded-full"
          style={{
            width: 56,
            height: 56,
            background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
            animation: `fx-burst 0.5s ease-out ${impactDelay} forwards`,
            opacity: 0,
          }}
        />
        {/* Expanding ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 40,
            height: 40,
            border: `3px solid ${color}`,
            animation: `fx-ring 0.5s ease-out ${impactDelay} forwards`,
            opacity: 0,
          }}
        />
        {/* Physical: slash mark */}
        {fx.category === 'physical' && (
          <div
            className="absolute"
            style={{
              width: 80,
              height: 6,
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              borderRadius: 3,
              animation: `fx-slash 0.45s ease-out ${impactDelay} forwards`,
              opacity: 0,
            }}
          />
        )}
        {/* Scattering particles */}
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 8,
                height: 8,
                background: color,
                '--dx': `${Math.cos(angle) * PARTICLE_DIST}px`,
                '--dy': `${Math.sin(angle) * PARTICLE_DIST}px`,
                animation: `fx-particle 0.55s ease-out ${impactDelay} forwards`,
              }}
            />
          );
        })}
      </div>
    </>
  );
}
