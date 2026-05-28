// Tailwind background classes per Pokemon type, for type badges.
export const TYPE_COLORS = {
  normal: 'bg-stone-400',
  fire: 'bg-orange-500',
  water: 'bg-blue-500',
  electric: 'bg-yellow-400 text-black',
  grass: 'bg-green-500',
  ice: 'bg-cyan-300 text-black',
  fighting: 'bg-red-700',
  poison: 'bg-purple-600',
  ground: 'bg-amber-700',
  flying: 'bg-indigo-300 text-black',
  psychic: 'bg-pink-500',
  bug: 'bg-lime-600',
  rock: 'bg-yellow-700',
  ghost: 'bg-purple-800',
  dragon: 'bg-indigo-700',
  dark: 'bg-gray-800',
  steel: 'bg-slate-400 text-black',
  fairy: 'bg-pink-300 text-black',
};

export function typeBadge(type) {
  return TYPE_COLORS[type] || 'bg-gray-500';
}
