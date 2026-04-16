/**
 * `kingdom models` command group.
 *
 * Subcommands:
 *   kingdom models list           — list all registered models
 *   kingdom models find           — find models matching capability requirements
 */

import { Command } from 'commander';
import { registry, PolicyEngine } from '@kingdomos/core';
import { LMStudioProvider } from '@kingdomos/providers';

export function registerModelsCommand(program: Command): void {
  const cmd = program.command('models').description('Manage model registry');

  cmd
    .command('list')
    .description('List all registered models')
    .option('--enabled-only', 'Only show enabled models', false)
    .action(async (opts: { enabledOnly: boolean }) => {
      await bootstrapRegistry();
      const models = opts.enabledOnly ? registry.listEnabled() : registry.listAll();

      if (models.length === 0) {
        console.log('No models registered. Start LM Studio and try again.');
        return;
      }

      console.log(`\n${'ID'.padEnd(50)} ${'PROVIDER'.padEnd(14)} ${'CTX'.padEnd(8)} TOOLS  STREAM  ENABLED`);
      console.log('─'.repeat(100));
      for (const m of models) {
        const c = m.capabilities;
        console.log(
          `${m.id.padEnd(50)} ${m.providerId.padEnd(14)} ${String(c.contextWindow).padEnd(8)} ${(c.toolCalling ? '✓' : '✗').padEnd(7)}${(c.streaming ? '✓' : '✗').padEnd(8)} ${m.enabled ? '✓' : '✗'}`
        );
      }
      console.log();
    });

  cmd
    .command('find')
    .description('Find models that satisfy given requirements')
    .option('--tools', 'Requires tool calling', false)
    .option('--structured', 'Requires structured output', false)
    .option('--multimodal', 'Requires multimodal input', false)
    .option('--min-ctx <tokens>', 'Minimum context window', parseInt)
    .option('--sort <by>', 'Sort by: reliability | latency | cost', 'reliability')
    .action(async (opts: {
      tools: boolean;
      structured: boolean;
      multimodal: boolean;
      minCtx?: number;
      sort: string;
    }) => {
      await bootstrapRegistry();
      const engine = new PolicyEngine(registry);
      const candidates = engine.getCandidates(
        {
          requiresToolCalling: opts.tools || undefined,
          requiresStructuredOutput: opts.structured || undefined,
          requiresMultimodal: opts.multimodal || undefined,
          minContextWindow: opts.minCtx,
        },
        (opts.sort as 'reliability' | 'latency' | 'cost')
      );

      if (candidates.length === 0) {
        console.log('\nNo models match the given requirements.\n');
        return;
      }

      console.log(`\nMatching models (sorted by ${opts.sort}):\n`);
      for (const c of candidates) {
        const m = c.modelEntry;
        console.log(`  ${m.id} (${m.providerId}) — reliability ${m.capabilities.reliability}, latency ~${m.capabilities.latencyP50Ms}ms`);
      }
      console.log();
    });
}

async function bootstrapRegistry(): Promise<void> {
  const lmStudio = new LMStudioProvider();
  const isUp = await lmStudio.isAvailable();

  if (isUp) {
    registry.registerProvider(lmStudio);
    const models = await lmStudio.listModels();
    for (const modelId of models) {
      const caps = await lmStudio.getCapabilities(modelId);
      if (!caps) continue;
      const entryId = `lm-studio/${modelId}`;
      if (!registry.getEntry(entryId)) {
        registry.register({
          id: entryId,
          displayName: modelId,
          providerId: 'lm-studio',
          providerModelId: modelId,
          capabilities: caps,
          featureFlags: {},
          enabled: true,
        });
      }
    }
  } else {
    console.warn('⚠  LM Studio is not reachable at http://localhost:1234. Model list may be empty.');
  }
}
