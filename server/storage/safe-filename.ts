export function safeFilename(name: string): string {
  const stripped = name.replace(/[/\\\0]/g, '_').trim();
  return stripped.length > 0 ? stripped : 'file';
}
