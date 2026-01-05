/**
 * Tests for VectorDatabase
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { VectorDatabase } from './vector-db.js';

describe('VectorDatabase', () => {
  let db: VectorDatabase;
  let testDbPath: string;

  beforeEach(() => {
    // Create temp database
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-doc-pal-test-'));
    testDbPath = path.join(tempDir, 'test.sqlite');
    db = new VectorDatabase(testDbPath, 4); // Small dimension for testing
  });

  afterEach(() => {
    db.close();
    // Cleanup
    const dir = path.dirname(testDbPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  });

  describe('metadata', () => {
    it('should store and retrieve info', () => {
      db.setInfo('test_key', 'test_value');
      expect(db.getInfo('test_key')).toBe('test_value');
    });

    it('should return null for missing keys', () => {
      expect(db.getInfo('nonexistent')).toBeNull();
    });

    it('should overwrite existing keys', () => {
      db.setInfo('key', 'value1');
      db.setInfo('key', 'value2');
      expect(db.getInfo('key')).toBe('value2');
    });
  });

  describe('documents', () => {
    it('should insert a new document', () => {
      const docId = db.upsertDocument({
        filePath: 'test.md',
        title: 'Test Doc',
        lastModified: Date.now(),
        fileHash: 'abc123',
      });

      expect(docId).toBeGreaterThan(0);
    });

    it('should update existing document', () => {
      const id1 = db.upsertDocument({
        filePath: 'test.md',
        title: 'Test Doc',
        lastModified: Date.now(),
        fileHash: 'abc123',
      });

      const id2 = db.upsertDocument({
        filePath: 'test.md',
        title: 'Updated Title',
        lastModified: Date.now(),
        fileHash: 'def456',
      });

      expect(id1).toBe(id2);
    });

    it('should detect when document needs update', () => {
      db.upsertDocument({
        filePath: 'test.md',
        title: 'Test',
        lastModified: Date.now(),
        fileHash: 'original',
      });

      expect(db.documentNeedsUpdate('test.md', 'original')).toBe(false);
      expect(db.documentNeedsUpdate('test.md', 'changed')).toBe(true);
      expect(db.documentNeedsUpdate('new.md', 'any')).toBe(true);
    });

    it('should get document by path', () => {
      db.upsertDocument({
        filePath: 'docs/test.md',
        title: 'My Title',
        lastModified: 12345,
        fileHash: 'hash',
      });

      const doc = db.getDocumentByPath('docs/test.md');
      expect(doc).not.toBeNull();
      expect(doc?.title).toBe('My Title');
      expect(doc?.filePath).toBe('docs/test.md');
    });
  });

  describe('chunks and embeddings', () => {
    it('should add chunk with embedding', () => {
      const docId = db.upsertDocument({
        filePath: 'test.md',
        title: 'Test',
        lastModified: Date.now(),
        fileHash: 'hash',
      });

      const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      
      const chunkId = db.addChunk(
        {
          documentId: docId,
          content: 'Test content',
          chunkIndex: 0,
          lineStart: 1,
          lineEnd: 5,
          heading: 'Test Section',
        },
        embedding
      );

      expect(chunkId).toBeGreaterThan(0);
    });

    it('should search for similar chunks', () => {
      const docId = db.upsertDocument({
        filePath: 'test.md',
        title: 'Test',
        lastModified: Date.now(),
        fileHash: 'hash',
      });

      // Add multiple chunks with different embeddings
      db.addChunk(
        { documentId: docId, content: 'JavaScript info', chunkIndex: 0, lineStart: 1, lineEnd: 5 },
        new Float32Array([1, 0, 0, 0])
      );
      db.addChunk(
        { documentId: docId, content: 'Python info', chunkIndex: 1, lineStart: 6, lineEnd: 10 },
        new Float32Array([0, 1, 0, 0])
      );
      db.addChunk(
        { documentId: docId, content: 'Rust info', chunkIndex: 2, lineStart: 11, lineEnd: 15 },
        new Float32Array([0, 0, 1, 0])
      );

      // Search for something similar to JavaScript
      const query = new Float32Array([0.9, 0.1, 0, 0]);
      const results = db.search(query, 2);

      expect(results.length).toBe(2);
      expect(results[0].content).toBe('JavaScript info');
    });

    it('should delete document chunks', () => {
      const docId = db.upsertDocument({
        filePath: 'test.md',
        title: 'Test',
        lastModified: Date.now(),
        fileHash: 'hash',
      });

      db.addChunk(
        { documentId: docId, content: 'Chunk 1', chunkIndex: 0, lineStart: 1, lineEnd: 5 },
        new Float32Array([1, 0, 0, 0])
      );
      db.addChunk(
        { documentId: docId, content: 'Chunk 2', chunkIndex: 1, lineStart: 6, lineEnd: 10 },
        new Float32Array([0, 1, 0, 0])
      );

      const statsBefore = db.getStats();
      expect(statsBefore.chunks).toBe(2);

      db.deleteDocumentChunks(docId);

      const statsAfter = db.getStats();
      expect(statsAfter.chunks).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      const doc1 = db.upsertDocument({ filePath: 'a.md', title: 'A', lastModified: 1, fileHash: 'a' });
      const doc2 = db.upsertDocument({ filePath: 'b.md', title: 'B', lastModified: 1, fileHash: 'b' });

      db.addChunk(
        { documentId: doc1, content: 'C1', chunkIndex: 0, lineStart: 1, lineEnd: 1 },
        new Float32Array([1, 0, 0, 0])
      );
      db.addChunk(
        { documentId: doc1, content: 'C2', chunkIndex: 1, lineStart: 2, lineEnd: 2 },
        new Float32Array([0, 1, 0, 0])
      );
      db.addChunk(
        { documentId: doc2, content: 'C3', chunkIndex: 0, lineStart: 1, lineEnd: 1 },
        new Float32Array([0, 0, 1, 0])
      );

      const stats = db.getStats();
      expect(stats.documents).toBe(2);
      expect(stats.chunks).toBe(3);
      expect(stats.embeddings).toBe(3);
    });
  });
});
