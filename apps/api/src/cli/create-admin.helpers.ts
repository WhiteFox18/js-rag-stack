import { parseArgs } from 'node:util';
import type { CreateAdminArgs } from './create-admin.types';

const USAGE = 'Usage: admin:create --email <email> [--name <name>]';

export function parseCreateAdminArgs(argv: string[]): CreateAdminArgs {
  const { values } = parseArgs({
    args: argv.filter((arg) => arg !== '--'),
    options: { email: { type: 'string' }, name: { type: 'string' } },
    strict: true,
  });
  if (!values.email) throw new Error(USAGE);
  return { email: values.email, name: values.name ?? null };
}

// Reads a line without echoing; supports pasted input and backspace.
export function promptHidden(question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) {
    return Promise.reject(
      new Error('admin:create needs an interactive terminal.'),
    );
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdout.write(question);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
