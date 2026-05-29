let raw = '';
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  const input = JSON.parse(raw);
  const event = input.context.currentEvent;
  const session = input.context.session;
  process.stdout.write(
    JSON.stringify({
      text: [
        `Echo from ${session.sessionKey}.`,
        `Current Slack surface: ${event.surface.kind}.`,
        `Latest message: ${event.text}`,
      ].join('\n'),
    }),
  );
});
