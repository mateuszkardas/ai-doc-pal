/**
 * Vector Database Module
 * 
 * Handles SQLite + sqlite-vec operations for storing and querying
 * document embeddings.
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface DocumentMetadata {
  filePath: string;
  title: string;
  lastModified: number;
  fileHash: string;
}

export interface ChunkData {
  id?: number;
  documentId: number;
  content: string;
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  heading?: string;
}

export interface SearchResult {
  chunkId: number;
  documentId: number;
  filePath: string;
  content: string;
  lineStart: number;
  lineEnd: number;
  heading: string | null;
  distance: number;
  score: number;
}

export interface DatabaseInfo {
  name: string;
  provider: string;
  model: string;
  embeddingDimension: number;
  docsPath: string;
  createdAt: number;
  lastUpdated: number;
}

export class VectorDatabase {
  private db: DatabaseType;
  private embeddingDimension: number;

  constructor(dbPath: string, embeddingDimension: number = 768) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.embeddingDimension = embeddingDimension;
    
    // Load sqlite-vec extension
    sqliteVec.load(this.db);
    
    // Initialize schema
    this.initSchema();
  }

  private initSchema(): void {
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');

    // Metadata table for the database itself
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS db_info (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        title TEXT,
        last_modified INTEGER NOT NULL,
        file_hash TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );
      
      CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
      CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash);
    `);

    // Chunks table (text chunks from documents)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        heading TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
    `);

    // Vector embeddings table using vec0
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding float[${this.embeddingDimension}]
      );
    `);
  }

  /**
   * Store database metadata
   */
  setInfo(key: string, value: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO db_info (key, value) VALUES (?, ?)
    `).run(key, value);
  }

  /**
   * Get database metadata
   */
  getInfo(key: string): string | null {
    const row = this.db.prepare(`
      SELECT value FROM db_info WHERE key = ?
    `).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /**
   * Get all database info
   */
  getAllInfo(): DatabaseInfo | null {
    const info: Record<string, string> = {};
    const rows = this.db.prepare('SELECT key, value FROM db_info').all() as { key: string; value: string }[];
    
    for (const row of rows) {
      info[row.key] = row.value;
    }

    if (!info.name) return null;

    return {
      name: info.name,
      provider: info.provider || 'unknown',
      model: info.model || 'unknown',
      embeddingDimension: parseInt(info.embeddingDimension || '768', 10),
      docsPath: info.docsPath || '',
      createdAt: parseInt(info.createdAt || '0', 10),
      lastUpdated: parseInt(info.lastUpdated || '0', 10),
    };
  }

  /**
   * Add or update a document
   */
  upsertDocument(meta: DocumentMetadata): number {
    const existing = this.db.prepare(`
      SELECT id, file_hash FROM documents WHERE file_path = ?
    `).get(meta.filePath) as { id: number; file_hash: string } | undefined;

    if (existing) {
      // Update existing document
      this.db.prepare(`
        UPDATE documents 
        SET title = ?, last_modified = ?, file_hash = ?, updated_at = unixepoch()
        WHERE id = ?
      `).run(meta.title, meta.lastModified, meta.fileHash, existing.id);
      return existing.id;
    } else {
      // Insert new document
      const result = this.db.prepare(`
        INSERT INTO documents (file_path, title, last_modified, file_hash)
        VALUES (?, ?, ?, ?)
      `).run(meta.filePath, meta.title, meta.lastModified, meta.fileHash);
      return Number(result.lastInsertRowid);
    }
  }

  /**
   * Check if document needs re-embedding
   */
  documentNeedsUpdate(filePath: string, fileHash: string): boolean {
    const existing = this.db.prepare(`
      SELECT file_hash FROM documents WHERE file_path = ?
    `).get(filePath) as { file_hash: string } | undefined;

    return !existing || existing.file_hash !== fileHash;
  }

  /**
   * Get document by file path
   */
  getDocumentByPath(filePath: string): (DocumentMetadata & { id: number }) | null {
    const row = this.db.prepare(`
      SELECT id, file_path, title, last_modified, file_hash
      FROM documents WHERE file_path = ?
    `).get(filePath) as any;

    if (!row) return null;

    return {
      id: row.id,
      filePath: row.file_path,
      title: row.title,
      lastModified: row.last_modified,
      fileHash: row.file_hash,
    };
  }

  /**
   * Delete chunks and embeddings for a document
   */
  deleteDocumentChunks(documentId: number): void {
    // Get chunk IDs first
    const chunkIds = this.db.prepare(`
      SELECT id FROM chunks WHERE document_id = ?
    `).all(documentId) as { id: number }[];

    // Delete embeddings - vec0 requires BigInt
    const deleteEmbedding = this.db.prepare(`
      DELETE FROM embeddings WHERE chunk_id = ?
    `);

    for (const { id } of chunkIds) {
      deleteEmbedding.run(BigInt(id));
    }

    // Delete chunks
    this.db.prepare(`
      DELETE FROM chunks WHERE document_id = ?
    `).run(documentId);
  }

  /**
   * Add a chunk with its embedding
   */
  addChunk(chunk: ChunkData, embedding: Float32Array): number {
    // Insert chunk
    const result = this.db.prepare(`
      INSERT INTO chunks (document_id, content, chunk_index, line_start, line_end, heading)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      chunk.documentId,
      chunk.content,
      chunk.chunkIndex,
      chunk.lineStart,
      chunk.lineEnd,
      chunk.heading ?? null
    );

    const chunkId = Number(result.lastInsertRowid);

    // Insert embedding - vec0 requires BigInt for primary key
    const embeddingBuffer = Buffer.from(embedding.buffer);
    this.db.prepare(`
      INSERT INTO embeddings (chunk_id, embedding)
      VALUES (?, ?)
    `).run(BigInt(chunkId), embeddingBuffer);

    return chunkId;
  }

  /**
   * Search for similar chunks using vector similarity
   */
  search(queryEmbedding: Float32Array, limit: number = 5): SearchResult[] {
    const queryBuffer = Buffer.from(queryEmbedding.buffer);

    // vec0 requires 'k = ?' constraint instead of LIMIT for KNN queries
    const results = this.db.prepare(`
      SELECT 
        e.chunk_id,
        e.distance,
        c.document_id,
        c.content,
        c.line_start,
        c.line_end,
        c.heading,
        d.file_path
      FROM embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE e.embedding MATCH ? AND e.k = ?
      ORDER BY e.distance
    `).all(queryBuffer, limit) as any[];

    return results.map(row => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      filePath: row.file_path,
      content: row.content,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      heading: row.heading,
      distance: row.distance,
      // Convert distance to similarity score (0-1, higher is better)
      score: 1 / (1 + row.distance),
    }));
  }

  /**
   * Get full document content by file path
   */
  getDocumentContent(filePath: string): string | null {
    const doc = this.getDocumentByPath(filePath);
    if (!doc) return null;

    // Read actual file content
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.getInfo('docsPath') || '', filePath);

    if (!fs.existsSync(fullPath)) return null;
    
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Get all documents
   */
  getAllDocuments(): (DocumentMetadata & { id: number })[] {
    const rows = this.db.prepare(`
      SELECT id, file_path, title, last_modified, file_hash FROM documents
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      filePath: row.file_path,
      title: row.title,
      lastModified: row.last_modified,
      fileHash: row.file_hash,
    }));
  }

  /**
   * Get statistics
   */
  getStats(): { documents: number; chunks: number; embeddings: number } {
    const docs = this.db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    const chunks = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    const embeddings = this.db.prepare('SELECT COUNT(*) as count FROM embeddings').get() as { count: number };

    return {
      documents: docs.count,
      chunks: chunks.count,
      embeddings: embeddings.count,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
