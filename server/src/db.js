// MongoDB Atlas connection via Mongoose.
import mongoose from 'mongoose';

export async function connectDb() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error(
      'MONGO_URI is not set. Create server/.env with your MongoDB Atlas connection string ' +
        '(see server/.env.example).',
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    // Atlas-friendly defaults; serverSelectionTimeout fails fast on bad URIs.
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`🗄️  Connected to MongoDB (${mongoose.connection.name})`);
  return mongoose.connection;
}
