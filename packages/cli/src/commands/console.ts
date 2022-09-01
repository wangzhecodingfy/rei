import { logger } from '@rei-network/utils';
import { IpcClient } from '@rei-network/ipc';
import { startNode } from './start';

export function installConsoleCommand(program: any) {
  program
    .command('console')
    .description('Start an interactive JavaScript environment')
    .action(async () => {
      try {
        const opts = program.opts();
        await startNode(opts);
        const client = new IpcClient({ datadir: opts.datadir });
        client.start();
      } catch (err) {
        logger.error('Start error:', err);
        process.exit(1);
      }
    });
}
