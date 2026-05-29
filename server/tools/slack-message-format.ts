const MARKDOWN_TEXT_LIMIT = 12_000;
const FALLBACK_TEXT_BYTE_LIMIT = 3500;

export interface SlackMarkdownBlock {
  text: string;
  type: 'markdown';
}

export type SlackMessageBlock = SlackMarkdownBlock;

export interface SlackMessageContent {
  blockCount: number;
  blocks: SlackMessageBlock[];
  format: 'markdown';
  text: string;
}

export function slackMessageContentForText(text: string): SlackMessageContent {
  const length = Array.from(text).length;
  if (length > MARKDOWN_TEXT_LIMIT) {
    throw new Error(`message is too long for Slack markdown block: ${length} characters, Slack allows ${MARKDOWN_TEXT_LIMIT}; send a file instead`);
  }
  return {
    blockCount: 1,
    blocks: [{ type: 'markdown', text }],
    format: 'markdown',
    text: fallbackText(text),
  };
}

function fallbackText(text: string): string {
  if (Buffer.byteLength(text, 'utf8') <= FALLBACK_TEXT_BYTE_LIMIT) return text;
  let end = 0;
  let bytes = Buffer.byteLength('…', 'utf8');
  for (const char of text) {
    const nextBytes = bytes + Buffer.byteLength(char, 'utf8');
    if (nextBytes > FALLBACK_TEXT_BYTE_LIMIT) break;
    bytes = nextBytes;
    end += char.length;
  }
  return `${text.slice(0, end)}…`;
}
