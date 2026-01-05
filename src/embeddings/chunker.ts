/**
 * Markdown Chunking Module
 * 
 * Splits markdown documents into chunks suitable for embedding.
 * Respects markdown structure (headings, code blocks, lists).
 */

export interface Chunk {
  content: string;
  index: number;
  lineStart: number;
  lineEnd: number;
  heading: string | null;
}

export interface ChunkingOptions {
  maxChunkSize: number;       // Maximum characters per chunk
  chunkOverlap: number;       // Overlap between chunks
  respectHeadings: boolean;   // Try to keep content under same heading together
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  maxChunkSize: 1000,
  chunkOverlap: 100,
  respectHeadings: true,
};

/**
 * Extract title from markdown content (first # heading or filename)
 */
export function extractTitle(content: string, fallbackFilename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  // Use filename without extension as fallback
  return fallbackFilename.replace(/\.(md|mdx)$/i, '');
}

/**
 * Remove MDX components (JSX) from markdown
 */
export function stripMdxComponents(content: string): string {
  // Remove import statements
  let result = content.replace(/^import\s+.*$/gm, '');
  
  // Remove export statements
  result = result.replace(/^export\s+.*$/gm, '');
  
  // Remove self-closing JSX components: <Component prop="value" />
  result = result.replace(/<[A-Z][a-zA-Z0-9]*[^>]*\/>/g, '');
  
  // Remove JSX component blocks: <Component>...</Component>
  // This is a simplified approach - handles single-level nesting
  result = result.replace(/<([A-Z][a-zA-Z0-9]*)[^>]*>[\s\S]*?<\/\1>/g, '');
  
  // Remove remaining opening/closing JSX tags
  result = result.replace(/<\/?[A-Z][a-zA-Z0-9]*[^>]*>/g, '');
  
  // Clean up multiple empty lines
  result = result.replace(/\n{3,}/g, '\n\n');
  
  return result.trim();
}

/**
 * Parse markdown into sections based on headings
 */
interface Section {
  heading: string | null;
  headingLevel: number;
  content: string;
  lineStart: number;
  lineEnd: number;
}

function parseIntoSections(content: string): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  
  let currentSection: Section = {
    heading: null,
    headingLevel: 0,
    content: '',
    lineStart: 1,
    lineEnd: 1,
  };
  
  let currentLineNumber = 1;
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      // Save current section if it has content
      if (currentSection.content.trim()) {
        currentSection.lineEnd = currentLineNumber - 1;
        sections.push({ ...currentSection });
      }
      
      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        headingLevel: headingMatch[1].length,
        content: line + '\n',
        lineStart: currentLineNumber,
        lineEnd: currentLineNumber,
      };
    } else {
      currentSection.content += line + '\n';
    }
    
    currentLineNumber++;
  }
  
  // Don't forget the last section
  if (currentSection.content.trim()) {
    currentSection.lineEnd = currentLineNumber - 1;
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Split a section into smaller chunks if it exceeds maxChunkSize
 */
function splitSection(
  section: Section,
  maxChunkSize: number,
  chunkOverlap: number
): Chunk[] {
  const chunks: Chunk[] = [];
  const content = section.content.trim();
  
  if (content.length <= maxChunkSize) {
    // Section fits in one chunk
    return [{
      content,
      index: 0,
      lineStart: section.lineStart,
      lineEnd: section.lineEnd,
      heading: section.heading,
    }];
  }
  
  // Split into paragraphs first
  const paragraphs = content.split(/\n\n+/);
  
  let currentChunk = '';
  let chunkStart = section.lineStart;
  let currentLine = section.lineStart;
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphLines = paragraph.split('\n').length;
    
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        lineStart: chunkStart,
        lineEnd: currentLine - 1,
        heading: section.heading,
      });
      
      // Start new chunk with overlap
      const overlapText = currentChunk.slice(-chunkOverlap);
      currentChunk = overlapText + '\n\n' + paragraph;
      chunkStart = currentLine;
    } else {
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }
    }
    
    currentLine += paragraphLines + 1; // +1 for the empty line between paragraphs
  }
  
  // Don't forget last chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      lineStart: chunkStart,
      lineEnd: section.lineEnd,
      heading: section.heading,
    });
  }
  
  return chunks;
}

/**
 * Chunk a markdown document
 */
export function chunkMarkdown(
  content: string,
  options: Partial<ChunkingOptions> = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Strip MDX components first
  const cleanContent = stripMdxComponents(content);
  
  if (opts.respectHeadings) {
    // Parse into sections and chunk each section
    const sections = parseIntoSections(cleanContent);
    const allChunks: Chunk[] = [];
    
    let globalIndex = 0;
    for (const section of sections) {
      const sectionChunks = splitSection(section, opts.maxChunkSize, opts.chunkOverlap);
      for (const chunk of sectionChunks) {
        allChunks.push({
          ...chunk,
          index: globalIndex++,
        });
      }
    }
    
    return allChunks;
  } else {
    // Simple character-based chunking
    const chunks: Chunk[] = [];
    const lines = cleanContent.split('\n');
    
    let currentChunk = '';
    let chunkStart = 1;
    let currentLine = 1;
    let chunkIndex = 0;
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > opts.maxChunkSize && currentChunk) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
          lineStart: chunkStart,
          lineEnd: currentLine - 1,
          heading: null,
        });
        
        // Start new chunk with overlap
        const overlapText = currentChunk.slice(-opts.chunkOverlap);
        currentChunk = overlapText + '\n' + line;
        chunkStart = currentLine;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
      
      currentLine++;
    }
    
    // Last chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        lineStart: chunkStart,
        lineEnd: currentLine - 1,
        heading: null,
      });
    }
    
    return chunks;
  }
}
