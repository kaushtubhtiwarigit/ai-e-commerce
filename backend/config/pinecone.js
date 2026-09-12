import { Pinecone } from '@pinecone-database/pinecone';
import { logger } from '../utils/logger.js';

let pineconeClient = null;
let pineconeIndex = null;

export const initializePinecone = async () => {
  try {
    if (!process.env.PINECONE_API_KEY) {
      logger.warn('Pinecone API key not found. Vector search will be disabled.');
      return null;
    }

    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    // List indexes to verify connection
    const indexList = await pineconeClient.listIndexes();
    logger.info('Available Pinecone indexes:', indexList.indexes?.map(idx => idx.name));

    const indexName = process.env.PINECONE_INDEX_NAME;
    
    // Check if index exists
    const indexExists = indexList.indexes?.some(idx => idx.name === indexName);
    
    if (!indexExists) {
      logger.warn(`Pinecone index '${indexName}' not found. Creating new index...`);
      
      // Create index with OpenAI embedding dimensions (1536 for text-embedding-ada-002)
      await pineconeClient.createIndex({
        name: indexName,
        dimension: 1536,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });

      logger.info(`Created Pinecone index: ${indexName}`);
      
      // Wait a moment for index to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    pineconeIndex = pineconeClient.index(indexName);
    logger.info(`Connected to Pinecone index: ${indexName}`);
    
    return pineconeIndex;
  } catch (error) {
    logger.error('Failed to initialize Pinecone:', error);
    return null;
  }
};

export const getPineconeIndex = () => {
  return pineconeIndex;
};

export const getPineconeClient = () => {
  return pineconeClient;
};