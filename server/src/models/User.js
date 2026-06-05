import mongoose from 'mongoose';

// A single team-slot config (light: just what's needed to rebuild from PokeAPI).
const SlotSchema = new mongoose.Schema(
  {
    species: { type: String, required: true },
    nature: { type: String, default: 'hardy' },
    evs: { type: Object, default: {} },
    ivs: { type: Object, default: {} },
    moves: { type: [String], default: [] },
  },
  { _id: false },
);

const TeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slots: { type: [SlotSchema], default: [] },
  },
  { timestamps: true },
);

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-zA-Z0-9_]+$/,
    },
    usernameLower: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    teams: { type: [TeamSchema], default: [] },
  },
  { timestamps: true },
);

// Never leak the password hash to the client.
UserSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    username: this.username,
    teams: this.teams.map((t) => ({
      id: t._id.toString(),
      name: t.name,
      slots: t.slots,
      updatedAt: t.updatedAt,
    })),
  };
};

export const User = mongoose.model('User', UserSchema);
