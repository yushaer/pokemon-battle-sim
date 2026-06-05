// CRUD for a user's saved teams. All routes require authentication.
import { Router } from 'express';
import { User } from './models/User.js';
import { requireAuth } from './auth.js';

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

// Basic shape validation for an incoming team payload.
function sanitizeTeam(body) {
  const name = String(body?.name || '').trim().slice(0, 40) || 'Untitled Team';
  const slots = Array.isArray(body?.slots) ? body.slots.slice(0, 6) : [];
  const cleanSlots = slots
    .filter((s) => s && s.species)
    .map((s) => ({
      species: String(s.species),
      nature: String(s.nature || 'hardy'),
      evs: s.evs && typeof s.evs === 'object' ? s.evs : {},
      ivs: s.ivs && typeof s.ivs === 'object' ? s.ivs : {},
      moves: Array.isArray(s.moves) ? s.moves.filter(Boolean).slice(0, 4) : [],
    }));
  return { name, slots: cleanSlots };
}

// List my teams.
teamsRouter.get('/', async (req, res) => {
  const user = await User.findById(req.auth.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ teams: user.toPublic().teams });
});

// Create a new team.
teamsRouter.post('/', async (req, res) => {
  const user = await User.findById(req.auth.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.teams.length >= 20) {
    return res.status(400).json({ error: 'Team limit reached (20).' });
  }
  user.teams.push(sanitizeTeam(req.body));
  await user.save();
  res.status(201).json({ teams: user.toPublic().teams });
});

// Update an existing team.
teamsRouter.put('/:teamId', async (req, res) => {
  const user = await User.findById(req.auth.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const team = user.teams.id(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  const clean = sanitizeTeam(req.body);
  team.name = clean.name;
  team.slots = clean.slots;
  await user.save();
  res.json({ teams: user.toPublic().teams });
});

// Delete a team.
teamsRouter.delete('/:teamId', async (req, res) => {
  const user = await User.findById(req.auth.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const team = user.teams.id(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  team.deleteOne();
  await user.save();
  res.json({ teams: user.toPublic().teams });
});
