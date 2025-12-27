import mongoose from 'mongoose';
import { logger } from '../utils/logger';

// Don't read the env variable at module load time - read it when the function is called

export const connectDatabase = async (): Promise<void> => {
  try {
    // Read the environment variable when the function is called, not at module load time
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/learnx';
    
    // Detect if it's MongoDB Atlas (cloud) or local
    const isAtlas = MONGODB_URI.includes('mongodb.net') || MONGODB_URI.includes('mongodb+srv');
    
    const options: mongoose.ConnectOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: true, // Changed to true to allow queries before connection completes
      // SSL/TLS only for Atlas
      ...(isAtlas && {
        ssl: true,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
      }),
    };

    await mongoose.connect(MONGODB_URI, options);
    
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
    throw error;
  }
};
