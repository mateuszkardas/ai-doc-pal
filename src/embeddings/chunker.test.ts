/**
 * Tests for markdown chunker
 */

import { describe, it, expect } from 'vitest';
import { 
  chunkMarkdown, 
  extractTitle, 
  stripMdxComponents 
} from './chunker.js';

describe('extractTitle', () => {
  it('should extract title from H1 heading', () => {
    const content = '# My Documentation\n\nSome content here';
    expect(extractTitle(content, 'fallback.md')).toBe('My Documentation');
  });

  it('should use filename as fallback when no heading', () => {
    const content = 'Just some content without heading';
    expect(extractTitle(content, 'my-docs.md')).toBe('my-docs');
  });

  it('should handle mdx extension', () => {
    const content = 'No heading';
    expect(extractTitle(content, 'component.mdx')).toBe('component');
  });
});

describe('stripMdxComponents', () => {
  it('should remove import statements', () => {
    const content = `import { Button } from './components';\n\n# Hello`;
    expect(stripMdxComponents(content)).toBe('# Hello');
  });

  it('should remove self-closing JSX components', () => {
    const content = `# Hello\n\n<MyComponent prop="value" />\n\nMore text`;
    expect(stripMdxComponents(content)).toBe('# Hello\n\nMore text');
  });

  it('should remove JSX component blocks', () => {
    const content = `# Hello\n\n<Card>\n  Some content\n</Card>\n\nMore text`;
    const result = stripMdxComponents(content);
    expect(result).not.toContain('<Card>');
    expect(result).not.toContain('</Card>');
    expect(result).toContain('# Hello');
    expect(result).toContain('More text');
  });

  it('should keep regular markdown', () => {
    const content = `# Hello\n\nThis is **bold** and *italic*.\n\n- List item`;
    expect(stripMdxComponents(content)).toBe(content);
  });
});

describe('chunkMarkdown', () => {
  it('should create chunks from simple content', () => {
    const content = `# Getting Started\n\nThis is the introduction.\n\n## Installation\n\nRun npm install.`;
    const chunks = chunkMarkdown(content);
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toContain('Getting Started');
  });

  it('should respect maxChunkSize', () => {
    const content = 'A'.repeat(500) + '\n\n' + 'B'.repeat(500) + '\n\n' + 'C'.repeat(500);
    const chunks = chunkMarkdown(content, { maxChunkSize: 600 });
    
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeLessThanOrEqual(700); // Some tolerance for overlap
    });
  });

  it('should preserve heading information', () => {
    const content = `# Main Title\n\nIntro\n\n## Section One\n\nContent one\n\n## Section Two\n\nContent two`;
    const chunks = chunkMarkdown(content, { respectHeadings: true });
    
    const sectionOneChunk = chunks.find(c => c.content.includes('Content one'));
    expect(sectionOneChunk?.heading).toBe('Section One');
  });

  it('should track line numbers', () => {
    const content = `Line 1\n\nLine 3\n\nLine 5`;
    const chunks = chunkMarkdown(content);
    
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty content', () => {
    const content = '';
    const chunks = chunkMarkdown(content);
    expect(chunks.length).toBe(0);
  });

  it('should strip MDX before chunking', () => {
    const content = `import X from 'y';\n\n# Title\n\n<Component />\n\nReal content here`;
    const chunks = chunkMarkdown(content);
    
    const hasImport = chunks.some(c => c.content.includes('import'));
    const hasComponent = chunks.some(c => c.content.includes('<Component'));
    
    expect(hasImport).toBe(false);
    expect(hasComponent).toBe(false);
  });
});
