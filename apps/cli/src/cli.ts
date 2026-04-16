/**
 * KingdomOS CLI — program setup.
 */

import { Command } from 'commander';
import { registerModelsCommand } from './commands/models.js';
import { registerAgentsCommand } from './commands/agents.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('kingdom')
    .description('KingdomOS — AI agent orchestration CLI')
    .version('0.1.0');

  registerModelsCommand(program);
  registerAgentsCommand(program);

  return program;
}
